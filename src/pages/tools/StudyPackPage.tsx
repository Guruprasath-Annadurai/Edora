// ═══════════════════════════════════════════════════════════════
// Edora — StudyPackPage
// PDF → AI-generated study pack (summary, flashcards, quiz, key terms).
//
// Extraction pipeline (automatic, user sees nothing):
//   1. pdf.js digital text extraction (fast, free)
//   2. If text < 100 chars → Cloud Vision OCR on each rendered page
//      (handles scanned textbooks, photographed slides, printed papers)
//
// Generation: queued into document_jobs, processed in the background by
//             the process-document-jobs edge function (Gemini JSON mode) —
//             see that function for the retry+validate generation logic.
// Storage:    Supabase Storage "study-pdfs" bucket (best-effort)
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, FileText, Upload, ChevronRight, Trash2,
  BookOpen, HelpCircle, List, AlignLeft, RotateCcw,
  CheckCircle, XCircle, Sparkles, AlertCircle, Trophy, Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import { track } from '@/lib/analytics';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';

// Use the local worker bundled by Vite — no CDN dependency
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Flashcard  { front: string; back: string }
interface QuizQ      { question: string; options: string[]; correct_answer: number; explanation: string }
interface KeyTerm    { term: string; definition: string }

interface StudyPack {
  id: string;
  user_id: string;
  file_name: string;
  pdf_path: string | null;
  summary: string;
  flashcards: Flashcard[];
  quiz: QuizQ[];
  key_terms: KeyTerm[];
  page_count: number | null;
  char_count: number | null;
  created_at: string;
}

type Tab      = 'summary' | 'flashcards' | 'quiz' | 'terms';
type Phase    = 'list' | 'generating' | 'viewing';
type GenStep  = 0 | 1;

// Generation itself (step 2 previously) now happens in the background via
// the document_jobs queue + process-document-jobs worker — a synchronous
// call here used to block the user on a "generating" screen for up to
// ~135s (3 retry attempts x 45s Gemini timeout), and lost the whole upload
// if they backgrounded the app mid-wait. Now the user gets control back as
// soon as the file is queued.
const GEN_STEPS = [
  { label: 'Reading your PDF',  detail: 'Extracting text from all pages…' },
  { label: 'Queuing for Novo',  detail: 'Uploading and handing off to the background worker…' },
];

interface DocumentJob {
  id: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
}

const MAX_PDF_BYTES  = 10 * 1024 * 1024; // 10 MB
const MAX_OCR_PAGES  = 8;                // Cloud Vision cost/speed limit
const OCR_SCALE      = 1.8;             // render scale — higher = better OCR quality
const OCR_JPEG_Q     = 0.88;            // JPEG quality for OCR images
const MIN_TEXT_CHARS = 100;             // threshold below which we fall back to OCR

// ── Digital text extraction via pdf.js ───────────────────────────────────────
async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const buffer = await file.arrayBuffer();
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const str = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (str) pages.push(str);
    if (i >= 25) break; // cap at 25 pages; edge fn truncates anyway
  }

  return { text: pages.join('\n\n'), pageCount: pdf.numPages };
}

// ── Render one PDF page to a base64 JPEG (for OCR) ───────────────────────────
async function renderPageToBase64(page: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy['getPage']>>): Promise<string> {
  const viewport = page.getViewport({ scale: OCR_SCALE });
  // HTMLCanvasElement is fully supported in Capacitor's Android/iOS WebView.
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported in this WebView');
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport, canvas }).promise;
  // Strip the data:image/jpeg;base64, prefix — Vision API wants raw base64
  return canvas.toDataURL('image/jpeg', OCR_JPEG_Q).split(',')[1];
}

// ── Cloud Vision OCR for one page ────────────────────────────────────────────
async function ocrPageBase64(base64: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ocr', {
    body: { image_base64: base64, detection_type: 'DOCUMENT_TEXT_DETECTION' },
  });
  if (error) {
    console.warn('[StudyPack] OCR page error:', (error as { message?: string }).message);
    return ''; // non-fatal — skip this page
  }
  return (data as { full_text?: string })?.full_text?.trim() ?? '';
}

// ── Full OCR pipeline: render PDF pages → Vision API → concatenate ────────────
async function extractPdfTextViaOCR(
  file: File,
  onPageDone: (current: number, total: number) => void,
): Promise<{ text: string; pageCount: number }> {
  const buffer  = await file.arrayBuffer();
  const pdf     = await pdfjsLib.getDocument({ data: buffer }).promise;
  const total   = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const texts: string[] = [];

  for (let i = 1; i <= total; i++) {
    const page   = await pdf.getPage(i);
    const base64 = await renderPageToBase64(page);
    const text   = await ocrPageBase64(base64);
    if (text) texts.push(text);
    onPageDone(i, total);
  }

  return { text: texts.join('\n\n'), pageCount: pdf.numPages };
}

// ── Flashcard component (tap to flip) ─────────────────────────────────────────
function FlashcardItem({ card, index, total }: { card: Flashcard; index: number; total: number }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-muted-foreground font-medium">
        Card {index + 1} of {total} · {flipped ? 'Back' : 'Front'}
      </p>
      <motion.div
        className="w-full cursor-pointer"
        style={{ perspective: 1200 }}
        onClick={() => setFlipped(f => !f)}>
        <motion.div
          style={{ transformStyle: 'preserve-3d', minHeight: 160 }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          className="relative w-full">

          {/* Front */}
          <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', position: 'absolute', inset: 0 }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.08), rgba(139,92,246,0.08))', border: '1.5px solid rgba(91,106,245,0.2)', borderRadius: 24, padding: 24, width: '100%', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p className="text-white font-semibold text-base leading-relaxed text-center">{card.front}</p>
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0"
            style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.08))', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 24, padding: 24, width: '100%', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p className="text-white/85 text-sm leading-relaxed text-center">{card.back}</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <p className="text-xs text-muted-foreground">Tap card to flip</p>
    </div>
  );
}

// ── Quiz component ────────────────────────────────────────────────────────────
function QuizView({ questions }: { questions: QuizQ[] }) {
  const [current,  setCurrent]  = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score,    setScore]    = useState(0);
  const [done,     setDone]     = useState(false);

  function pick(idx: number) {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    if (idx === questions[current].correct_answer) setScore(s => s + 1);
  }

  function next() {
    if (current + 1 >= questions.length) { setDone(true); return; }
    setCurrent(c => c + 1);
    setSelected(null);
    setRevealed(false);
  }

  function restart() {
    setCurrent(0); setSelected(null); setRevealed(false); setScore(0); setDone(false);
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: pct >= 80 ? 'rgba(16,185,129,0.15)' : pct >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)' }}>
          {pct >= 80
            ? <Trophy size={36} style={{ color: '#34D399' }} />
            : pct >= 50
              ? <Star size={36} style={{ color: '#FBBF24' }} />
              : <BookOpen size={36} style={{ color: '#F87171' }} />}
        </div>
        <div>
          <p className="font-heading text-2xl font-bold text-white">{score}/{questions.length}</p>
          <p className="text-muted-foreground text-sm mt-1">
            {pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort — keep studying!' : 'Keep reviewing and try again!'}
          </p>
        </div>
        <button onClick={restart}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <RotateCcw size={15} /> Try Again
        </button>
      </motion.div>
    );
  }

  const q = questions[current];
  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {current + 1} of {questions.length}</span>
        <span>Score: {score}/{current + (revealed ? 1 : 0)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' }}
          animate={{ width: `${((current + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
          transition={{ duration: 0.4 }} />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={current}
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className="flex flex-col gap-3">
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-070)' }}>
            <p className="text-white font-semibold text-sm leading-relaxed">{q.question}</p>
          </div>

          {/* Options */}
          {q.options.map((opt, i) => {
            const isCorrect  = i === q.correct_answer;
            const isSelected = i === selected;
            let optBg = 'var(--ink-055)';
            let optBorder = 'var(--ink-080)';
            let textColor = 'var(--ink-850)';
            if (revealed) {
              if (isCorrect)       { optBg = 'rgba(16,185,129,0.12)'; optBorder = 'rgba(16,185,129,0.35)'; textColor = '#34D399'; }
              else if (isSelected) { optBg = 'rgba(239,68,68,0.12)';  optBorder = 'rgba(239,68,68,0.35)'; textColor = '#F87171'; }
            } else if (isSelected) {
              optBg = 'rgba(91,106,245,0.15)'; optBorder = 'rgba(91,106,245,0.5)'; textColor = '#818CF8';
            }
            return (
              <button key={i} onClick={() => pick(i)}
                disabled={revealed}
                className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 ${!revealed ? 'active:scale-98' : ''}`}
                style={{ background: optBg, border: `1px solid ${optBorder}` }}>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0"
                  style={{ background: 'var(--ink-080)', color: textColor }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span style={{ color: textColor }}>{opt}</span>
                {revealed && isCorrect  && <CheckCircle size={16} style={{ color: '#34D399' }} className="ml-auto shrink-0" />}
                {revealed && isSelected && !isCorrect && <XCircle size={16} style={{ color: '#F87171' }} className="ml-auto shrink-0" />}
              </button>
            );
          })}

          {/* Explanation */}
          {revealed && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 text-xs text-muted-foreground leading-relaxed"
              style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
              <span className="font-semibold text-primary">Explanation: </span>
              {q.explanation}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {revealed && (
        <motion.button
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          onClick={next}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          {current + 1 >= questions.length ? 'See Results' : 'Next Question →'}
        </motion.button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudyPackPage() {
  const { user }  = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase,       setPhase]       = useState<Phase>('list');
  const [packs,       setPacks]       = useState<StudyPack[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [genStep,     setGenStep]     = useState<GenStep>(0);
  const [genError,    setGenError]    = useState('');
  const [viewing,     setViewing]     = useState<StudyPack | null>(null);
  const [activeTab,   setActiveTab]   = useState<Tab>('summary');
  const [cardIndex,   setCardIndex]   = useState(0);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [jobs,        setJobs]        = useState<DocumentJob[]>([]);
  // OCR fallback state
  const [isOcrMode,   setIsOcrMode]   = useState(false);
  const [ocrPage,     setOcrPage]     = useState(0);   // current page being OCR'd
  const [ocrTotal,    setOcrTotal]    = useState(0);   // total pages to OCR

  // Load saved packs on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('study_packs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.error('[StudyPack] load error:', error.message);
      setPacks((data as StudyPack[]) ?? []);
      setLoadingList(false);
    })();
  }, [user]);

  // Load any jobs still in flight (pending/processing) so a queued upload
  // shows up as "processing" if the user left and came back, and subscribe
  // to status changes so completion/failure surfaces without polling.
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data } = await supabase
        .from('document_jobs')
        .select('id, file_name, status, error')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });
      setJobs((data as DocumentJob[]) ?? []);
    })();

    const channel = supabase
      .channel(`document_jobs_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'document_jobs', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const job = payload.new as { id: string; status: string; file_name: string; study_pack_id: string | null; error: string | null };

          if (job.status === 'completed' && job.study_pack_id) {
            const { data: pack } = await supabase.from('study_packs').select('*').eq('id', job.study_pack_id).single();
            if (pack) {
              setPacks(prev => [pack as StudyPack, ...prev]);
              showToast(`"${job.file_name}" is ready!`);
            }
            setJobs(prev => prev.filter(j => j.id !== job.id));
          } else if (job.status === 'failed') {
            showToast(`Couldn't generate a study pack for "${job.file_name}" — please try again.`);
            setJobs(prev => prev.filter(j => j.id !== job.id));
          } else {
            setJobs(prev => prev.map(j => j.id === job.id ? { id: job.id, file_name: job.file_name, status: job.status as DocumentJob['status'], error: job.error } : j));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── PDF upload & generation pipeline ───────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!user) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      await showToast('Please select a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      await showToast('File is too large. Maximum size is 10 MB.');
      return;
    }

    setGenError('');
    setIsOcrMode(false);
    setOcrPage(0);
    setOcrTotal(0);
    setPhase('generating');
    setGenStep(0);
    track('study_pack_generate_start', { file_name: file.name, file_size: file.size });

    try {
      // ── Step 0: Extract text — digital first, OCR fallback ─────
      let extractedText = '';
      let pageCount     = 0;

      // Attempt 1: fast digital text layer via pdf.js
      try {
        const r = await extractPdfText(file);
        extractedText = r.text;
        pageCount     = r.pageCount;
      } catch (e) {
        console.warn('[StudyPack] digital extraction failed, will try OCR:', e);
      }

      // Attempt 2: scanned PDF → Cloud Vision OCR per page
      if (extractedText.trim().length < MIN_TEXT_CHARS) {
        setIsOcrMode(true);
        try {
          const r = await extractPdfTextViaOCR(file, (cur, tot) => {
            setOcrPage(cur);
            setOcrTotal(tot);
          });
          extractedText = r.text;
          pageCount     = r.pageCount;
          track('study_pack_ocr_used', { file_name: file.name, page_count: pageCount });
        } catch (ocrErr) {
          console.error('[StudyPack] OCR extraction error:', ocrErr);
          throw new Error('Could not extract text from this PDF. The file may be corrupted or password-protected.');
        }
      }

      if (extractedText.trim().length < 50) {
        throw new Error('No readable text found in this PDF. Make sure the PDF contains actual text or a clear scan.');
      }

      setGenStep(1);

      // ── Step 1: Upload PDF to Storage (best-effort, non-blocking) ──
      let pdfPath: string | null = null;
      try {
        const ext      = file.name.split('.').pop() ?? 'pdf';
        const packId   = crypto.randomUUID();
        const filePath = `${user.id}/${packId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('study-pdfs')
          .upload(filePath, file, { contentType: 'application/pdf', upsert: false });
        if (uploadErr) console.warn('[StudyPack] PDF upload failed (non-fatal):', uploadErr.message);
        else           pdfPath = filePath;
      } catch (uploadErr) {
        console.warn('[StudyPack] PDF upload exception (non-fatal):', uploadErr);
      }

      // ── Step 1b: Queue the job — generation runs in the background ──
      // (see process-document-jobs edge function + document_jobs table).
      // We hand off here instead of waiting on Gemini synchronously.
      const { data: job, error: jobErr } = await supabase
        .from('document_jobs')
        .insert({
          user_id:        user.id,
          file_name:      file.name,
          pdf_path:       pdfPath,
          extracted_text: extractedText,
          char_count:     extractedText.length,
          page_count:     pageCount || null,
        })
        .select('id, file_name, status, error')
        .single();

      if (jobErr || !job) throw new Error('Failed to queue your PDF. Please try again.');

      track('study_pack_generate_queued', { file_name: file.name, page_count: pageCount });

      setJobs(prev => [job as DocumentJob, ...prev]);
      setPhase('list');
      await showToast(`"${file.name}" is queued — we'll notify you when it's ready (usually under a minute).`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      console.error('[StudyPack] generation error:', msg);
      setGenError(msg);
      track('study_pack_generate_error', { error: msg });
    }
  }, [user]);

  function openPack(pack: StudyPack) {
    setViewing(pack);
    setActiveTab('summary');
    setCardIndex(0);
    setPhase('viewing');
  }

  async function deletePack(pack: StudyPack) {
    if (!user) return;
    setDeleting(pack.id);
    try {
      // Delete from Storage (non-fatal)
      if (pack.pdf_path) {
        await supabase.storage.from('study-pdfs').remove([pack.pdf_path]).catch(() => {});
      }
      const { error } = await supabase.from('study_packs').delete().eq('id', pack.id).eq('user_id', user.id);
      if (error) throw error;
      setPacks(prev => prev.filter(p => p.id !== pack.id));
      if (viewing?.id === pack.id) { setViewing(null); setPhase('list'); }
      track('study_pack_delete', { pack_id: pack.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      await showToast(msg);
    } finally {
      setDeleting(null);
    }
  }

  async function showToast(text: string) {
    if (Capacitor.isNativePlatform()) await Toast.show({ text, duration: 'short', position: 'bottom' });
    else alert(text);
  }

  // ── Render: Generating ────────────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <Header title="Generating Pack" />
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          {genError ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 text-center max-w-xs">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)' }}>
                <AlertCircle size={36} className="text-red-400" />
              </div>
              <div>
                <p className="font-heading text-lg font-bold text-white mb-2">Generation Failed</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{genError}</p>
              </div>
              <button
                onClick={() => { setPhase('list'); setGenError(''); }}
                className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                Try Another PDF
              </button>
            </motion.div>
          ) : (
            <>
              {/* Animated orb */}
              <motion.div className="relative flex items-center justify-center">
                {[1, 2, 3].map(i => (
                  <motion.div key={i} className="absolute rounded-full border border-primary/20"
                    style={{ width: 80 + i * 36, height: 80 + i * 36 }}
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.08, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }} />
                ))}
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-4xl z-10"
                  style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.15), rgba(139,92,246,0.15))', border: '1.5px solid rgba(91,106,245,0.25)' }}>
                  <Sparkles size={36} style={{ color: '#5B6AF5' }} />
                </div>
              </motion.div>

              {/* Steps */}
              <div className="flex flex-col gap-4 w-full max-w-xs">
                {GEN_STEPS.map((step, i) => {
                  const done   = genStep > i;
                  const active = genStep === i;

                  // Dynamic detail for step 0: show OCR progress when applicable
                  let detail = step.detail;
                  if (i === 0 && active && isOcrMode) {
                    detail = ocrTotal > 0
                      ? `Scanning page ${ocrPage} of ${ocrTotal} with OCR…`
                      : 'Preparing OCR pipeline…';
                  }

                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(91,106,245,0.15)' : 'rgba(148,163,184,0.1)',
                        }}>
                        {done
                          ? <CheckCircle size={16} className="text-green-500" />
                          : active
                            ? <motion.div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent"
                                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                            : <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-muted-foreground'}`}>
                          {i === 0 && active && isOcrMode ? 'Scanning with OCR' : step.label}
                        </p>
                        {active && (
                          <motion.p key={detail} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="text-xs text-muted-foreground mt-0.5">{detail}</motion.p>
                        )}
                        {/* OCR page progress bar */}
                        {i === 0 && active && isOcrMode && ocrTotal > 0 && (
                          <div className="mt-2 h-1 rounded-full bg-primary/10 overflow-hidden">
                            <motion.div className="h-full rounded-full bg-primary"
                              animate={{ width: `${(ocrPage / ocrTotal) * 100}%` }}
                              transition={{ duration: 0.3 }} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {isOcrMode ? 'Scanned PDF detected — OCR takes 30–60 seconds' : 'This takes about 20–40 seconds'}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Viewing a pack ────────────────────────────────────────────────
  if (phase === 'viewing' && viewing) {
    const tabs: Array<{ id: Tab; label: string; icon: typeof BookOpen }> = [
      { id: 'summary',    label: 'Summary',    icon: AlignLeft },
      { id: 'flashcards', label: 'Cards',      icon: BookOpen },
      { id: 'quiz',       label: 'Quiz',       icon: HelpCircle },
      { id: 'terms',      label: 'Terms',      icon: List },
    ];

    return (
      <div className="flex flex-col h-full bg-gradient-page">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button aria-label="Go back" onClick={() => setPhase('list')}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
          </button>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
            <FileText size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-bold text-white text-sm truncate">{viewing.file_name}</h2>
            <p className="text-xs text-muted-foreground">
              {viewing.flashcards.length} cards · {viewing.quiz.length} questions · {viewing.key_terms.length} terms
              {viewing.page_count ? ` · ${viewing.page_count} pages` : ''}
            </p>
          </div>
          <button onClick={() => deletePack(viewing)}
            disabled={deleting === viewing.id}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
            style={{ background: 'rgba(239,68,68,0.08)' }}>
            {deleting === viewing.id
              ? <motion.div className="w-4 h-4 rounded-full border-2 border-red-400 border-t-transparent"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              : <Trash2 size={16} className="text-red-400" />}
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 shrink-0"
          style={{ background: 'var(--hdr-a-880)', borderBottom: '1px solid var(--ink-060)' }}>
          <div className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setActiveTab(id); setCardIndex(0); }}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
                }`}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 native-scroll pb-nav px-4 py-5">
          <AnimatePresence mode="wait">
            {/* Summary */}
            {activeTab === 'summary' && (
              <motion.div key="summary"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="rounded-3xl p-5"
                  style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(91,106,245,0.15)' }}>
                      <AlignLeft size={16} style={{ color: '#818CF8' }} />
                    </div>
                    <h3 className="font-heading font-bold text-white text-sm">Summary</h3>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{viewing.summary}</p>
                </div>
              </motion.div>
            )}

            {/* Flashcards */}
            {activeTab === 'flashcards' && (
              <motion.div key="flashcards"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-5">
                <FlashcardItem
                  card={viewing.flashcards[cardIndex]}
                  index={cardIndex}
                  total={viewing.flashcards.length} />

                {/* Navigation */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setCardIndex(i => Math.max(0, i - 1))}
                    disabled={cardIndex === 0}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white/70 disabled:opacity-30 transition-all active:scale-95"
                    style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                    ← Previous
                  </button>
                  <button
                    onClick={() => setCardIndex(i => Math.min(viewing.flashcards.length - 1, i + 1))}
                    disabled={cardIndex === viewing.flashcards.length - 1}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-30 transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                    Next →
                  </button>
                </div>

                {/* Dots */}
                <div className="flex justify-center gap-1.5">
                  {viewing.flashcards.map((_, i) => (
                    <button key={i} onClick={() => setCardIndex(i)}
                      className="w-2 h-2 rounded-full transition-all"
                      style={{ background: i === cardIndex ? '#5B6AF5' : 'var(--ink-150)', transform: i === cardIndex ? 'scale(1.3)' : 'scale(1)' }} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Quiz */}
            {activeTab === 'quiz' && (
              <motion.div key="quiz"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <QuizView questions={viewing.quiz} />
              </motion.div>
            )}

            {/* Key Terms */}
            {activeTab === 'terms' && (
              <motion.div key="terms"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-3">
                {viewing.key_terms.map((term, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl p-4"
                    style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                    <p className="font-semibold text-white text-sm mb-1">{term.term}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{term.definition}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="h-8" />
        </div>
      </div>
    );
  }

  // ── Render: List ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">
      <Header title="PDF Study Packs" />

      {/* Hidden file input */}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) { handleFile(file); e.target.value = ''; }
        }}
      />

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-4">
        {/* Upload CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => fileInput.current?.click()}
          className="w-full rounded-3xl p-5 flex items-center gap-4 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.1), rgba(245,158,11,0.1))', border: '2px dashed rgba(91,106,245,0.3)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
            <Upload size={24} className="text-white" />
          </div>
          <div className="text-left">
            <p className="font-heading font-bold text-white text-base">Upload a PDF</p>
            <p className="text-xs text-muted-foreground mt-0.5">Digital or scanned — any PDF works</p>
            <p className="text-xs text-muted-foreground">Max 10 MB · Up to 8 pages for scanned PDFs</p>
          </div>
        </motion.button>

        {/* What you get */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { Icon: AlignLeft, label: 'AI Summary',      desc: '3–4 paragraph overview',   color: '#818CF8' },
            { Icon: BookOpen,  label: '10 Flashcards',   desc: 'Key concepts to review',    color: '#34D399' },
            { Icon: HelpCircle,label: '5-Question Quiz', desc: 'Test your understanding',   color: '#60A5FA' },
            { Icon: List,      label: '10 Key Terms',    desc: 'Definitions & vocabulary',  color: '#FBBF24' },
          ].map(({ Icon, label, desc, color }) => (
            <div key={label} className="rounded-2xl p-3 flex items-center gap-2"
              style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
              <Icon size={18} style={{ color }} className="shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Jobs still processing in the background */}
        {jobs.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Processing
            </p>
            {jobs.map(job => (
              <div key={job.id}
                className="w-full rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(91,106,245,0.15)' }}>
                  <motion.div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{job.file_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Novo is building your study pack…
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Saved packs */}
        {!loadingList && packs.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Your Study Packs
            </p>
            {packs.map((pack, i) => (
              <motion.div key={pack.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}>
                <button onClick={() => openPack(pack)}
                  className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
                  style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <FileText size={20} style={{ color: '#FBBF24' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{pack.file_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pack.flashcards.length} cards · {pack.quiz.length} questions · {pack.key_terms.length} terms
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(pack.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loadingList && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loadingList && packs.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.12)' }}>
              <FileText size={32} style={{ color: '#FBBF24' }} strokeWidth={1.5} />
            </div>
            <p className="font-heading font-semibold text-white">No study packs yet</p>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              Upload any PDF and Novo will generate your complete study pack in seconds
            </p>
          </motion.div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────
function Header({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3 shrink-0"
      style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
      <Link aria-label="Go back" to="/tools"
        className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
        style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
        <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
      </Link>
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
        <FileText size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <h2 className="font-heading font-bold text-white text-sm">{title}</h2>
        <p className="text-xs text-muted-foreground">PDF → AI Study Pack</p>
      </div>
    </div>
  );
}
