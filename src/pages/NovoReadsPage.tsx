// ═══════════════════════════════════════════════════════════════
// Edora — NovoReadsPage
// Student pastes any text → Novo reads along, annotates each
// paragraph with explanations, inserts comprehension questions
// every 3 paragraphs.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, ArrowLeft, ChevronRight, CheckCircle2, XCircle,
  Loader2, MessageSquare, Brain, FileText, Lightbulb, Play, RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { geminiJSON } from '@/lib/gemini';
import { indexUserItem } from '@/lib/userContentIndex';
import { getFeatureTheme } from '@/lib/featureTheme';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'input' | 'processing' | 'reading' | 'complete';

interface KeyTerm {
  term: string;
  definition: string;
}

interface Question {
  q: string;
  options: string[];
  correct_idx: number;
}

interface ParagraphData {
  index: number;
  text: string;
  annotation: string;
  key_terms: KeyTerm[];
  question?: Question | null;
}

interface KeyConcept {
  concept: string;
  explanation: string;
}

interface SessionData {
  paragraphs: ParagraphData[];
  key_concepts: KeyConcept[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitIntoParagraphs(text: string): string[] {
  const doubleNewlineParts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (doubleNewlineParts.length >= 2) return doubleNewlineParts;

  // Fallback: split every ~150 words
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 150) {
    chunks.push(words.slice(i, i + 150).join(' '));
  }
  return chunks.filter((c) => c.length > 0);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastMsg {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let _toastId = 0;

function ToastItem({ toast, onDismiss }: { toast: ToastMsg; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg =
    toast.type === 'success' ? '#10B981' :
    toast.type === 'error' ? '#EF4444' : '#5B6AF5';

  return (
    <motion.div
      initial={{ opacity: 0, y: -48, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: -48, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2"
      style={{ background: bg, minWidth: 200, maxWidth: 320 }}
    >
      {toast.type === 'success' && <CheckCircle2 size={15} className="text-white shrink-0" />}
      {toast.type === 'error' && <XCircle size={15} className="text-white shrink-0" />}
      <span className="text-sm font-semibold text-white">{toast.message}</span>
    </motion.div>
  );
}

// ── Key Term Chip ─────────────────────────────────────────────────────────────

function KeyTermChip({ term, definition }: KeyTerm) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition-all active:scale-95"
        style={
          open
            ? {
                background: 'rgba(91,106,245,0.2)',
                borderColor: '#5B6AF5',
                color: '#8B9FFF',
              }
            : {
                background: 'var(--ink-060)',
                borderColor: 'var(--ink-120)',
                color: 'var(--muted-foreground)',
              }
        }
      >
        {term}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 z-20 w-56 rounded-2xl p-3 shadow-xl"
            style={{
              background: 'var(--surface-scrim)',
              border: '1px solid rgba(91,106,245,0.3)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <p className="text-xs font-bold text-white mb-1">{term}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{definition}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Comprehension Check ───────────────────────────────────────────────────────

function ComprehensionCheck({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
    onAnswer(idx === question.correct_idx);
  }

  const OPTION_LABELS = ['A', 'B', 'C', 'D'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={15} className="text-amber-400" />
        <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Quick Check</p>
      </div>
      <p className="text-sm font-semibold text-white leading-snug mb-3">{question.q}</p>
      <div className="flex flex-col gap-2">
        {question.options.map((opt, idx) => {
          const isCorrect = idx === question.correct_idx;
          const isSelected = idx === selected;

          let bg = 'var(--ink-050)';
          let border = 'var(--ink-100)';
          let textColor = 'var(--ink-850)';

          if (answered) {
            if (isCorrect) {
              bg = 'rgba(16,185,129,0.15)';
              border = 'rgba(16,185,129,0.4)';
              textColor = '#10B981';
            } else if (isSelected) {
              bg = 'rgba(239,68,68,0.12)';
              border = 'rgba(239,68,68,0.3)';
              textColor = '#EF4444';
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={answered}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all active:scale-98 disabled:cursor-default"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: answered && isCorrect
                    ? 'rgba(16,185,129,0.25)'
                    : answered && isSelected
                    ? 'rgba(239,68,68,0.2)'
                    : 'var(--ink-080)',
                  color: textColor,
                }}
              >
                {answered && isCorrect ? (
                  <CheckCircle2 size={12} />
                ) : answered && isSelected ? (
                  <XCircle size={12} />
                ) : (
                  OPTION_LABELS[idx]
                )}
              </span>
              <span className="text-sm leading-snug" style={{ color: textColor }}>
                {opt}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Paragraph Card ────────────────────────────────────────────────────────────

function ParagraphCard({
  para,
  paraNumber,
  total,
  onAnswerQuestion,
  answeredQuestions,
}: {
  para: ParagraphData;
  paraNumber: number;
  total: number;
  onAnswerQuestion: (idx: number, correct: boolean) => void;
  answeredQuestions: Map<number, boolean>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3"
    >
      {/* Paragraph label */}
      <div className="flex items-center gap-2">
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
          style={{
            background: 'rgba(91,106,245,0.15)',
            border: '1px solid rgba(91,106,245,0.25)',
            color: '#8B9FFF',
          }}
        >
          Paragraph {paraNumber} of {total}
        </span>
      </div>

      {/* Original text */}
      <p className="text-sm text-white/80 leading-relaxed">{para.text}</p>

      {/* Novo's take */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Brain size={13} style={{ color: '#818CF8' }} />
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#818CF8' }}>
            Novo's Take
          </p>
        </div>
        <p className="text-sm text-white/90 leading-relaxed">{para.annotation}</p>
      </div>

      {/* Key terms */}
      {para.key_terms && para.key_terms.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 native-scroll-x">
          {para.key_terms.map((kt, i) => (
            <KeyTermChip key={i} term={kt.term} definition={kt.definition} />
          ))}
        </div>
      )}

      {/* Comprehension question */}
      {para.question && !answeredQuestions.has(para.index) && (
        <ComprehensionCheck
          question={para.question}
          onAnswer={(correct) => onAnswerQuestion(para.index, correct)}
        />
      )}
      {para.question && answeredQuestions.has(para.index) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: answeredQuestions.get(para.index)
              ? 'rgba(16,185,129,0.1)'
              : 'rgba(239,68,68,0.1)',
            border: answeredQuestions.get(para.index)
              ? '1px solid rgba(16,185,129,0.25)'
              : '1px solid rgba(239,68,68,0.25)',
          }}
        >
          {answeredQuestions.get(para.index) ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : (
            <XCircle size={14} className="text-red-400" />
          )}
          <p className="text-xs font-semibold" style={{
            color: answeredQuestions.get(para.index) ? '#10B981' : '#EF4444',
          }}>
            {answeredQuestions.get(para.index) ? 'Correct!' : 'Incorrect — keep going!'}
          </p>
        </motion.div>
      )}

      {/* Divider */}
      <div className="h-px" style={{ background: 'var(--ink-060)' }} />
    </motion.div>
  );
}

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({ correct, total }: { correct: number; total: number }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const pct = total === 0 ? 0 : correct / total;
  const dash = circ * pct;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--ink-080)" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5B6AF5" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <p className="font-heading font-bold text-white text-lg leading-none">{correct}/{total}</p>
        <p className="text-xs text-muted-foreground mt-0.5">correct</p>
      </div>
    </div>
  );
}

// ── Processing substep messages ───────────────────────────────────────────────

const PROCESSING_MSGS = [
  'Breaking into paragraphs…',
  'Understanding context…',
  'Generating annotations…',
  'Preparing comprehension checks…',
];

function ProcessingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % PROCESSING_MSGS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center gap-8 px-8 py-16 text-center"
    >
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
      >
        <Brain size={36} className="text-white" />
      </div>

      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
      </div>

      <div>
        <h3 className="font-heading text-lg font-bold text-white mb-2">
          Novo is preparing your reading session…
        </h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-muted-foreground"
          >
            {PROCESSING_MSGS[msgIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NovoReadsPage() {
  const ft = getFeatureTheme('reads');
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('input');
  const [inputText, setInputText] = useState('');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Map<number, boolean>>(new Map());
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const wordCount = countWords(inputText);
  const canStart = wordCount >= 50;

  // ── Toast helpers ──
  const showToast = useCallback((message: string, type: ToastMsg['type'] = 'success') => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Reset ──
  function resetAll() {
    setPhase('input');
    setInputText('');
    setSubject('');
    setTitle('');
    setSession(null);
    setCurrentParagraphIdx(0);
    setAnsweredQuestions(new Map());
    setError('');
    setSavingNote(false);
  }

  // ── Start reading session ──
  async function startSession() {
    if (!canStart || !user) return;
    setPhase('processing');
    setError('');

    try {
      const paragraphs = splitIntoParagraphs(inputText);

      const prompt = `Analyse this academic text and for each paragraph, provide: 1) a simplified annotation (what this paragraph says in plain language), 2) 2-3 key terms with definitions. Also, for every 3rd paragraph (0-based index 2, 5, 8...), generate 1 comprehension question with 4 MCQ options and the correct answer index (0-based).

Text paragraphs:
${paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n')}

Return ONLY valid JSON (no markdown, no code fences):
{
  "paragraphs": [
    {
      "index": 0,
      "text": "original paragraph text",
      "annotation": "simplified plain-language explanation",
      "key_terms": [{"term": "string", "definition": "string"}],
      "question": null
    }
  ],
  "key_concepts": [{"concept": "string", "explanation": "string"}]
}

For paragraphs at 0-based index 2, 5, 8 etc., set question to: {"q": "question text", "options": ["A text", "B text", "C text", "D text"], "correct_idx": 0}
For all other paragraphs set question to null.`;

      const raw = await geminiJSON<SessionData>(prompt);

      if (!mountedRef.current) return;

      if (!raw || !Array.isArray(raw.paragraphs)) {
        throw new Error('Novo returned an unexpected response. Please try again.');
      }

      // Ensure paragraph texts match originals
      const sessionData: SessionData = {
        ...raw,
        paragraphs: raw.paragraphs.map((p, i) => ({
          ...p,
          text: paragraphs[i] ?? p.text,
        })),
      };

      // Save to DB
      const derivedTitle =
        title.trim() ||
        inputText.slice(0, 50).replace(/\n/g, ' ').trim() + (inputText.length > 50 ? '…' : '');

      const { error: insertError } = await supabase
        .from('reading_sessions')
        .insert({
          user_id: user.id,
          title: derivedTitle,
          subject: subject.trim() || null,
          raw_text: inputText,
          paragraphs_data: sessionData.paragraphs,
          key_concepts: sessionData.key_concepts,
          paragraph_count: paragraphs.length,
        });

      if (insertError) {
        console.warn('[NovoReads] DB insert error:', insertError.message);
        // Non-fatal — continue with the session
      }

      if (!mountedRef.current) return;

      setSession(sessionData);
      setCurrentParagraphIdx(0);
      setPhase('reading');
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message ?? 'Something went wrong. Please try again.');
      setPhase('input');
    }
  }

  // ── Answer a comprehension question ──
  function handleAnswer(paraIndex: number, correct: boolean) {
    setAnsweredQuestions((prev) => {
      const next = new Map(prev);
      next.set(paraIndex, correct);
      return next;
    });
  }

  // ── Advance to next paragraph ──
  function advanceParagraph() {
    if (!session) return;
    const currentPara = session.paragraphs[currentParagraphIdx];
    const hasUnanswered =
      currentPara?.question && !answeredQuestions.has(currentPara.index);
    if (hasUnanswered) return;

    if (currentParagraphIdx >= session.paragraphs.length - 1) {
      setPhase('complete');
    } else {
      setCurrentParagraphIdx((i) => i + 1);
    }
  }

  // ── Check if current paragraph blocks advancement ──
  const currentParaHasUnansweredQ = (() => {
    if (!session) return false;
    const p = session.paragraphs[currentParagraphIdx];
    return !!p?.question && !answeredQuestions.has(p.index);
  })();

  // ── Save as note ──
  async function saveAsNote() {
    if (!user || !session || savingNote) return;
    setSavingNote(true);
    try {
      const noteContent = session.paragraphs
        .map((p) => `${p.text}\n\n[Novo's annotation]: ${p.annotation}`)
        .join('\n\n---\n\n');

      const keyConcepts = session.key_concepts
        .map((kc) => `• ${kc.concept}: ${kc.explanation}`)
        .join('\n');

      const { data: noteData, error: insertError } = await supabase.from('study_notes').insert({
        user_id: user.id,
        title: title || 'Novo Reading Session',
        content: `${noteContent}\n\n## Key Concepts\n${keyConcepts}`,
        subject: subject || null,
      }).select('id').single();

      if (insertError) throw new Error(insertError.message);
      if (noteData?.id) indexUserItem('study_note', noteData.id).catch(() => {});
      if (!mountedRef.current) return;
      showToast('Saved to Study Notes!', 'success');
    } catch (err) {
      if (!mountedRef.current) return;
      showToast((err as Error).message ?? 'Failed to save note.', 'error');
    } finally {
      if (mountedRef.current) setSavingNote(false);
    }
  }

  // ── Stats ──
  const totalQuestions = session
    ? session.paragraphs.filter((p) => !!p.question).length
    : 0;
  const correctAnswers = Array.from(answeredQuestions.values()).filter(Boolean).length;
  const totalKeyTerms = session
    ? session.paragraphs.reduce((acc, p) => acc + (p.key_terms?.length ?? 0), 0)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page"
      data-feature="reads"
      style={{ backgroundImage: ft.meshGradient, backgroundAttachment: 'fixed' }}>

      {/* Toasts */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div
        className="page-hero shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{
          backdropFilter: 'blur(20px)',
          borderColor: 'var(--ink-080)',
        }}
      >
        <Link aria-label="Go back"
          to="/tools"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: ft.gradient, boxShadow: `0 4px 14px ${ft.glowRgba}` }}
        >
          <BookOpen size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-white text-sm leading-tight">Novo Reads</h1>
          <p className="text-xs text-muted-foreground">Paste any text — Novo reads with you</p>
        </div>
        {phase !== 'input' && (
          <button onClick={resetAll} className="w-9 h-9 flex items-center justify-center">
            <RotateCcw size={17} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav">
        <AnimatePresence mode="wait">

          {/* ── INPUT ── */}
          {phase === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-5 px-4 py-6"
            >
              {/* Feature chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 native-scroll-x">
                {[
                  { icon: FileText, label: 'Paragraph summaries' },
                  { icon: MessageSquare, label: 'Check questions' },
                  { icon: Lightbulb, label: 'Key terms' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border"
                    style={{
                      background: 'rgba(91,106,245,0.08)',
                      borderColor: 'rgba(91,106,245,0.2)',
                      color: '#8B9FFF',
                    }}
                  >
                    <Icon size={11} />
                    {label}
                  </div>
                ))}
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your textbook passage, article, or notes here…"
                  className="w-full rounded-2xl px-4 py-4 bg-transparent text-white text-sm outline-none leading-relaxed placeholder:text-muted-foreground/60 border"
                  style={{
                    minHeight: 200,
                    resize: 'vertical',
                    background: 'var(--v2-card)',
                    borderColor: 'var(--v2-border)',
                    color: 'var(--v2-text-1)',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }}
                />
                <div
                  className="absolute bottom-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-lg"
                  style={{
                    background: 'var(--surface-scrim)',
                    color: wordCount >= 50 ? '#10B981' : 'var(--muted-foreground)',
                  }}
                >
                  {wordCount} words
                </div>
              </div>

              {/* Optional fields */}
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Subject context (optional)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-2xl px-4 h-11 bg-transparent text-white placeholder:text-muted-foreground/60 text-sm outline-none border"
                  style={{
                    background: 'var(--v2-card)',
                    borderColor: 'var(--v2-border)',
                    color: 'var(--v2-text-1)',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }}
                />
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-2xl px-4 h-11 bg-transparent text-white placeholder:text-muted-foreground/60 text-sm outline-none border"
                  style={{
                    background: 'var(--v2-card)',
                    borderColor: 'var(--v2-border)',
                    color: 'var(--v2-text-1)',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Start button */}
              <button
                onClick={startSession}
                disabled={!canStart}
                className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
              >
                <Play size={18} />
                {canStart
                  ? 'Start Reading Session'
                  : `Start Reading Session (${50 - wordCount} more words needed)`}
              </button>
            </motion.div>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && <ProcessingScreen key="processing" />}

          {/* ── READING ── */}
          {phase === 'reading' && session && (
            <motion.div
              key="reading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
              style={{ minHeight: '100%' }}
            >
              {/* Progress bar */}
              <div className="shrink-0 px-4 pt-4 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Paragraph {currentParagraphIdx + 1} of {session.paragraphs.length}
                    </span>
                    {subject && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          background: 'rgba(91,106,245,0.15)',
                          border: '1px solid rgba(91,106,245,0.2)',
                          color: '#8B9FFF',
                        }}
                      >
                        {subject}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(((currentParagraphIdx + 1) / session.paragraphs.length) * 100)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--v2-border)' }}>
                  <motion.div
                    className="h-1.5 rounded-full"
                    style={{ background: 'var(--v2-primary)' }}
                    animate={{
                      width: `${((currentParagraphIdx + 1) / session.paragraphs.length) * 100}%`,
                    }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Paragraphs (shown progressively) */}
              <div className="flex-1 px-4 py-4">
                <div className="flex flex-col gap-6">
                  {session.paragraphs
                    .slice(0, currentParagraphIdx + 1)
                    .map((para, i) => (
                      <ParagraphCard
                        key={para.index}
                        para={para}
                        paraNumber={i + 1}
                        total={session.paragraphs.length}
                        onAnswerQuestion={handleAnswer}
                        answeredQuestions={answeredQuestions}
                      />
                    ))}
                </div>
                <div className="h-24" />
              </div>

              {/* Continue / Finish button — sticky bottom */}
              <div
                className="sticky bottom-0 px-4 py-4 border-t"
                style={{
                  background: 'var(--surface-scrim)',
                  backdropFilter: 'blur(16px)',
                  borderColor: 'var(--ink-060)',
                }}
              >
                <button
                  onClick={advanceParagraph}
                  disabled={currentParaHasUnansweredQ}
                  className="w-full rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed v2-btn-primary"
                  style={{ height: 52 }}
                >
                  {currentParagraphIdx >= session.paragraphs.length - 1 ? (
                    <>
                      <CheckCircle2 size={16} />
                      Reading Complete
                    </>
                  ) : (
                    <>
                      Continue Reading
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
                {currentParaHasUnansweredQ && (
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Answer the comprehension question to continue
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── COMPLETE ── */}
          {phase === 'complete' && session && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-6 px-4 py-6"
            >
              {/* Heading */}
              <div className="text-center">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'var(--v2-primary)' }}
                >
                  <BookOpen size={36} className="text-white" />
                </div>
                <h2 className="font-heading text-2xl font-bold text-white">Reading Complete</h2>
                <p className="text-sm text-muted-foreground mt-1">Great work finishing the session.</p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: session.paragraphs.length, label: 'Paragraphs' },
                  { value: totalKeyTerms, label: 'Key Terms' },
                  { value: totalQuestions, label: 'Comprehension Checks' },
                ].map(({ value, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl p-3 text-center v2-card"
                  >
                    <p className="font-heading font-bold text-white text-xl leading-none v2-tnum">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Comprehension score */}
              {totalQuestions > 0 && (
                <div
                  className="rounded-2xl p-5 flex flex-col items-center gap-3"
                  style={{
                    background: 'rgba(91,106,245,0.08)',
                    border: '1px solid rgba(91,106,245,0.2)',
                  }}
                >
                  <p className="text-sm font-bold text-white">Comprehension Score</p>
                  <ProgressRing correct={correctAnswers} total={totalQuestions} />
                  <p className="text-xs text-muted-foreground">
                    {correctAnswers === totalQuestions
                      ? 'Perfect score!'
                      : `${Math.round((correctAnswers / totalQuestions) * 100)}% correct`}
                  </p>
                </div>
              )}

              {/* Key Concepts */}
              {session.key_concepts && session.key_concepts.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    Key Concepts
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {session.key_concepts.map((kc, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="rounded-2xl p-3.5"
                        style={{
                          background: 'rgba(139,92,246,0.08)',
                          border: '1px solid rgba(139,92,246,0.2)',
                        }}
                      >
                        <p className="text-sm font-bold text-white mb-1">{kc.concept}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{kc.explanation}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={saveAsNote}
                  disabled={savingNote}
                  className="w-full rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white transition-all active:scale-98 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', height: 52 }}
                >
                  {savingNote ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <FileText size={16} />
                  )}
                  Save to Notes
                </button>

                <button
                  onClick={resetAll}
                  className="w-full rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold border transition-all active:scale-98"
                  style={{
                    height: 52,
                    borderColor: 'var(--ink-120)',
                    color: 'var(--muted-foreground)',
                    background: 'var(--ink-040)',
                  }}
                >
                  <RotateCcw size={16} />
                  Start New Reading
                </button>
              </div>

              <div className="h-6" />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
