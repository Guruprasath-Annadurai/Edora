// ═══════════════════════════════════════════════════════════════
// Edora — PhotoSolverPage
// Student snaps a photo of a problem → Novo solves it step-by-step
// and explains the underlying concept.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Image as ImageIcon, ArrowLeft, Loader2, CheckCircle2, BookOpen,
  Lightbulb, AlertCircle, Plus, ChevronDown, ChevronUp, RotateCcw, Brain,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppMode = 'solve' | 'scan';  // solve = full step-by-step solve; scan = OCR→instant flashcard
type Phase = 'idle' | 'captured' | 'solving' | 'result' | 'error';

type Subject =
  | 'auto'
  | 'Mathematics'
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Other';

interface SolveStep {
  step_number: number;
  title: string;
  explanation: string;
}

interface SolveResult {
  subject_detected: string;
  problem_statement: string;
  steps: SolveStep[];
  final_answer: string;
  concept_summary: string;
  common_mistakes: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resizeImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Failed to load image for resizing'));
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width); width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height); height = maxDim;
      }
      // OffscreenCanvas is not available in all WebViews — use HTMLCanvasElement
      // which is fully supported in Capacitor's Android/iOS WebView.
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl.split(',')[1] ?? dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.src = dataUrl;
  });
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
    toast.type === 'error'   ? '#EF4444' : '#5B6AF5';

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
      {toast.type === 'error' && <AlertCircle size={15} className="text-white shrink-0" />}
      <span className="text-sm font-semibold text-white">{toast.message}</span>
    </motion.div>
  );
}

// ── Subject chips ─────────────────────────────────────────────────────────────

const SUBJECTS: Subject[] = ['auto', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Other'];
const SUBJECT_LABELS: Record<Subject, string> = {
  auto: 'Auto-detect',
  Mathematics: 'Mathematics',
  Physics: 'Physics',
  Chemistry: 'Chemistry',
  Biology: 'Biology',
  Other: 'Other',
};

function SubjectChips({
  selected,
  onChange,
}: {
  selected: Subject;
  onChange: (s: Subject) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 native-scroll-x">
      {SUBJECTS.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all active:scale-95 shrink-0"
          style={
            selected === s
              ? {
                  background: 'linear-gradient(135deg, rgba(91,106,245,0.2), rgba(139,92,246,0.2))',
                  borderColor: '#5B6AF5',
                  color: '#5B6AF5',
                }
              : {
                  background: 'var(--ink-060)',
                  borderColor: 'var(--ink-120)',
                  color: 'var(--muted-foreground)',
                }
          }
        >
          {SUBJECT_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

// ── Step Card ─────────────────────────────────────────────────────────────────

function StepCard({ step, index }: { step: SolveStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-100)' }}
    >
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Step number badge */}
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          {step.step_number}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-snug">{step.title}</p>
          <AnimatePresence>
            {expanded && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-muted-foreground mt-1.5 leading-relaxed overflow-hidden"
              >
                {step.explanation}
              </motion.p>
            )}
          </AnimatePresence>
          {!expanded && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {step.explanation}
            </p>
          )}
        </div>
        <div className="shrink-0 mt-0.5 text-muted-foreground">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PhotoSolverPage() {
  const { user } = useAuth();

  const [appMode, setAppMode] = useState<AppMode>('solve');
  const [phase, setPhase] = useState<Phase>('idle');
  const [subject, setSubject] = useState<Subject>('auto');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solveId, setSolveId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const [cardAdded, setCardAdded] = useState(false);
  const [scanCardAdded, setScanCardAdded] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [showCameraRationale, setShowCameraRationale] = useState(false);
  const pendingSourceRef  = useRef<CameraSource | null>(null);
  const skipRationaleRef  = useRef(false);

  // ── Toast helper ──
  const showToast = useCallback((message: string, type: ToastMsg['type'] = 'success') => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Reset ──
  function reset() {
    setPhase('idle');
    setPreviewUrl(null);
    setResult(null);
    setSolveId(null);
    setErrorMsg('');
    setMistakesOpen(false);
    setPreviewExpanded(false);
    setCardAdded(false);
    setAddingCard(false);
  }

  // ── Capture image ──
  async function captureImage(source: CameraSource) {
    try {
      setErrorMsg('');

      if (!Capacitor.isNativePlatform()) {
        // Web fallback: file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/heic,image/heif';
        if (source === CameraSource.Camera) input.capture = 'environment';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            setErrorMsg('Please select an image file (JPEG, PNG, WebP, etc.).');
            return;
          }
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            setPreviewUrl(dataUrl);
            setPhase('captured');
          };
          reader.readAsDataURL(file);
        };
        input.click();
        return;
      }

      // Show in-app rationale before the system permission dialog
      if (!skipRationaleRef.current) {
        const perms = await CapCamera.checkPermissions();
        const perm  = source === CameraSource.Camera ? perms.camera : perms.photos;
        if (perm === 'denied') {
          setErrorMsg('Camera access is disabled. Go to Settings → Apps → Edora → Permissions to enable it.');
          return;
        }
        if (perm !== 'granted') {
          pendingSourceRef.current = source;
          setShowCameraRationale(true);
          return;
        }
      }
      skipRationaleRef.current = false;

      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source,
        quality: 85,
        allowEditing: false,
        correctOrientation: true,
      });

      if (!photo.dataUrl) return;
      setPreviewUrl(photo.dataUrl);
      setPhase('captured');
    } catch (err) {
      const msg: string = ((err as Error)?.message ?? '').toLowerCase();
      if (msg.includes('cancel')) return; // user dismissed — no error shown
      if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
        setErrorMsg('Camera access denied. Enable it in Settings → Apps → Edora → Permissions.');
      } else if (msg.includes('in use') || msg.includes('busy') || msg.includes('already')) {
        setErrorMsg('Camera is in use by another app. Close it and try again.');
      } else if (msg.includes('no camera') || msg.includes('not available') || msg.includes('unavailable')) {
        setErrorMsg('No camera found on this device.');
      } else {
        setErrorMsg('Could not open camera. Please try again.');
      }
    }
  }

  async function proceedWithCamera() {
    const source = pendingSourceRef.current;
    if (source === null) return;
    pendingSourceRef.current  = null;
    skipRationaleRef.current  = true;
    setShowCameraRationale(false);
    await captureImage(source);
  }

  // ── Solve (full step-by-step) ──
  async function solveProblem() {
    if (!user || !previewUrl) return;
    setPhase('solving');
    try {
      const base64 = await resizeImage(previewUrl, 1024);
      const subjectArg = subject === 'auto' ? undefined : subject;

      const { data, error: fnError } = await supabase.functions.invoke('gemini-vision', {
        body: {
          action: 'solve_problem',
          image_base64: base64,
          mime_type: 'image/jpeg',
          subject: subjectArg,
        },
      });

      if (fnError) throw new Error(fnError.message ?? 'Solve failed');
      if (!data) throw new Error('No response from Novo');

      // Validate shape before trusting the edge function response.
      // If the function schema changes, this throws a clear error instead of a silent crash.
      if (
        typeof data !== 'object' || data === null ||
        typeof (data as Record<string, unknown>).subject_detected !== 'string' ||
        typeof (data as Record<string, unknown>).final_answer !== 'string' ||
        !Array.isArray((data as Record<string, unknown>).steps)
      ) {
        throw new Error('Unexpected response shape from gemini-vision — please try again');
      }

      const solveResult = data as SolveResult;

      // Save to photo_solves (existing) + user_snapshots (for later review)
      const [photoRes] = await Promise.all([
        supabase.from('photo_solves').insert({
          user_id: user.id,
          subject: solveResult.subject_detected,
          solution: solveResult.final_answer,
          concept_summary: solveResult.concept_summary,
          steps: solveResult.steps,
        }).select('id').single(),
        supabase.from('user_snapshots').insert({
          user_id: user.id,
          subject: solveResult.subject_detected,
          topic: solveResult.problem_statement?.slice(0, 100),
          solve_result: solveResult as unknown as Record<string, unknown>,
          source: 'photo_solver',
        }),
      ]);

      if (!mountedRef.current) return;
      if (!photoRes.error && photoRes.data?.id) setSolveId(photoRes.data.id);

      setResult(solveResult);
      setPhase('result');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg((err as Error).message ?? 'Novo couldn\'t analyse this image. Please try again.');
      setPhase('error');
    }
  }

  // ── Textbook Scan → instant flashcard ──
  async function scanToFlashcard() {
    if (!user || !previewUrl) return;
    setPhase('solving');
    try {
      const base64 = await resizeImage(previewUrl, 1024);

      const { data, error: fnError } = await supabase.functions.invoke('gemini-vision', {
        body: {
          action: 'ocr_flashcard',
          image_base64: base64,
          mime_type: 'image/jpeg',
        },
      });

      if (fnError) throw new Error(fnError.message ?? 'OCR failed');
      if (!data) throw new Error('No response from Novo');

      const { front, back, subject: det_subject, ocr_text } = data as {
        front: string; back: string; subject: string; ocr_text: string;
      };
      setOcrText(ocr_text);

      // Create flashcard directly
      const { error: cardErr } = await supabase.from('sr_cards').insert({
        user_id: user.id,
        front,
        back,
        subject: det_subject || 'General',
        ease_factor: 2.5,
        interval: 1,
        repetitions: 0,
        next_review: new Date().toISOString(),
      });
      if (cardErr) throw new Error(cardErr.message);

      // Save snapshot
      await supabase.from('user_snapshots').insert({
        user_id: user.id,
        ocr_text,
        subject: det_subject,
        source: 'textbook_scan',
      });

      if (!mountedRef.current) return;
      setScanCardAdded(true);
      setPhase('result');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg((err as Error).message ?? 'Scan failed. Please try again.');
      setPhase('error');
    }
  }

  // ── Add to flashcards ──
  async function addToFlashcards() {
    if (!user || !result || addingCard || cardAdded) return;
    setAddingCard(true);
    try {
      const { error: insertError } = await supabase.from('sr_cards').insert({
        user_id: user.id,
        front: result.problem_statement,
        back: `${result.final_answer}\n\n${result.concept_summary}`,
        subject: result.subject_detected,
        ease_factor: 2.5,
        interval: 1,
        repetitions: 0,
        next_review: new Date().toISOString(),
      });

      if (insertError) throw new Error(insertError.message);

      if (solveId) {
        await supabase
          .from('photo_solves')
          .update({ sr_card_added: true })
          .eq('id', solveId);
      }

      if (!mountedRef.current) return;
      setCardAdded(true);
      showToast('Flashcard added!', 'success');
    } catch (err) {
      if (!mountedRef.current) return;
      showToast((err as Error).message ?? 'Failed to add flashcard.', 'error');
    } finally {
      if (mountedRef.current) setAddingCard(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* Camera permission rationale — shown before system dialog on native */}
      <AnimatePresence>
        {showCameraRationale && (
          <motion.div className="fixed inset-0 z-50 flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCameraRationale(false)} />
            <motion.div className="relative w-full rounded-t-3xl p-6 pb-10"
              style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--ink-200)' }} />
              <div className="flex items-start gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}>
                  <Camera size={22} style={{ color: '#8B9BFA' }} />
                </div>
                <div>
                  <p className="font-bold text-white text-base">Allow camera access?</p>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--ink-550)' }}>
                    Edora needs your camera to photograph problems so Novo can solve them step-by-step.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCameraRationale(false)}>Not Now</Button>
                <Button className="flex-1" onClick={proceedWithCamera}>Continue</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{
          background: 'var(--surface-scrim)',
          backdropFilter: 'blur(20px)',
          borderColor: 'var(--ink-080)',
        }}
      >
        <Link aria-label="Go back" to="/tools" className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center shrink-0">
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <Camera size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-white text-sm leading-tight">
            {appMode === 'solve' ? 'Photo Solver' : 'Textbook Scanner'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {appMode === 'solve' ? 'Snap a problem, get a solution' : 'Scan text → instant flashcard'}
          </p>
        </div>
        {phase !== 'idle' ? (
          <button onClick={reset} className="w-9 h-9 flex items-center justify-center">
            <RotateCcw size={17} className="text-muted-foreground" />
          </button>
        ) : null}
      </div>

      {/* Mode toggle */}
      {phase === 'idle' && (
        <div className="px-4 pt-1 pb-2 flex gap-2">
          {(['solve', 'scan'] as const).map(m => (
            <button key={m}
              onClick={() => { setAppMode(m); setScanCardAdded(false); setOcrText(null); }}
              className="flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all"
              style={appMode === m ? {
                background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                color: 'var(--ink-950)',
                boxShadow: '0 4px 12px rgba(91,106,245,0.3)',
              } : {
                background: 'var(--ink-050)',
                color: 'var(--ink-450)',
                border: '1px solid var(--ink-090)',
              }}>
              {m === 'solve' ? 'Solve Problem' : 'Scan to Flashcard'}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav">
        <AnimatePresence mode="wait">

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-5 px-4 py-6"
            >
              {/* Illustration area */}
              <div
                className="flex flex-col items-center justify-center rounded-3xl py-12 gap-4"
                style={{
                  border: '2px dashed rgba(91,106,245,0.35)',
                  background: 'rgba(91,106,245,0.05)',
                }}
              >
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center"
                  style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.25)' }}
                >
                  <Camera size={36} style={{ color: '#5B6AF5' }} />
                </div>
                <div className="text-center px-6">
                  <p className="font-heading font-bold text-white text-lg">Take a photo</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Point your camera at any handwritten or printed problem
                  </p>
                </div>
              </div>

              {/* Subject selector */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                  Subject
                </p>
                <SubjectChips selected={subject} onChange={setSubject} />
              </div>

              {/* Error */}
              {errorMsg && (
                <div
                  className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </div>
              )}

              {/* Action buttons — native */}
              {Capacitor.isNativePlatform() ? (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => captureImage(CameraSource.Camera)}
                    className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white active:scale-98 transition-all"
                    style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                  >
                    <Camera size={18} />
                    Take Photo
                  </button>
                  <button
                    onClick={() => captureImage(CameraSource.Photos)}
                    className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold border active:scale-98 transition-all"
                    style={{
                      borderColor: 'rgba(91,106,245,0.4)',
                      color: '#5B6AF5',
                      background: 'rgba(91,106,245,0.06)',
                    }}
                  >
                    <ImageIcon size={18} />
                    From Gallery
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => captureImage(CameraSource.Photos)}
                  className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white active:scale-98 transition-all"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                >
                  <ImageIcon size={18} />
                  Choose Image
                </button>
              )}

              {/* Tip */}
              <div
                className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}
              >
                <Lightbulb size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300/80 leading-relaxed">
                  Hold camera still and ensure the problem is well-lit for best results.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── CAPTURED ── */}
          {(phase === 'captured' || phase === 'solving') && previewUrl && (
            <motion.div
              key="captured"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-5 px-4 py-5"
            >
              {/* Image preview */}
              <div className="relative rounded-3xl overflow-hidden w-full" style={{ minHeight: 220 }}>
                <img
                  src={previewUrl}
                  alt="Captured problem"
                  className="w-full object-cover rounded-3xl"
                  style={{ maxHeight: 340 }}
                />
                {/* Retake button */}
                {phase === 'captured' && (
                  <button
                    onClick={reset}
                    className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border"
                    style={{
                      background: 'var(--surface-scrim)',
                      backdropFilter: 'blur(12px)',
                      borderColor: 'var(--ink-150)',
                      color: 'var(--ink-950)',
                    }}
                  >
                    <RotateCcw size={12} />
                    Retake
                  </button>
                )}
                {/* Solving overlay */}
                {phase === 'solving' && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl"
                    style={{ background: 'var(--surface-scrim)', backdropFilter: 'blur(4px)' }}
                  >
                    <Loader2 size={32} className="text-white animate-spin" />
                    <p className="text-white text-sm font-semibold">
                      {appMode === 'scan' ? 'Scanning and creating flashcard…' : 'Novo is analysing your problem…'}
                    </p>
                  </div>
                )}
              </div>

              {/* Subject confirmation */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                  Subject
                </p>
                <SubjectChips selected={subject} onChange={setSubject} />
              </div>

              {/* Solve / Scan button */}
              {phase === 'captured' && (
                <button
                  onClick={appMode === 'solve' ? solveProblem : scanToFlashcard}
                  className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white active:scale-98 transition-all"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                >
                  <Brain size={18} />
                  {appMode === 'solve' ? 'Solve with Novo' : 'Scan to Flashcard'}
                </button>
              )}
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {/* ── SCAN RESULT ── */}
          {phase === 'result' && appMode === 'scan' && scanCardAdded && (
            <motion.div key="scan-result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center gap-6 px-6 py-16">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.3)' }}>
                <CheckCircle2 size={36} style={{ color: '#34D399' }} />
              </div>
              <div className="text-center">
                <h2 className="font-heading text-2xl font-bold text-white">Flashcard Created!</h2>
                <p className="text-sm mt-2" style={{ color: 'var(--ink-500)' }}>
                  Your textbook content has been saved to Spaced Review.
                </p>
                {ocrText && (
                  <div className="mt-4 rounded-2xl p-4 text-left"
                    style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--ink-500)' }}>Scanned text</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-600)' }}>
                      {ocrText.slice(0, 200)}{ocrText.length > 200 ? '…' : ''}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={reset}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm v2-card"
                  style={{ color: 'var(--v2-text-1)' }}>
                  Scan Another
                </button>
                <Link to="/flashcard"
                  className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-center v2-btn-primary">
                  Review Cards
                </Link>
              </div>
            </motion.div>
          )}

          {phase === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4 px-4 py-5"
            >
              {/* Small image preview */}
              {previewUrl && (
                <div>
                  <motion.div
                    className="relative rounded-2xl overflow-hidden cursor-pointer"
                    style={{ height: previewExpanded ? 'auto' : 120 }}
                    onClick={() => setPreviewExpanded((v) => !v)}
                  >
                    <img
                      src={previewUrl}
                      alt="Problem"
                      className="w-full object-cover"
                      style={{ maxHeight: previewExpanded ? 400 : 120 }}
                    />
                    <div
                      className="absolute bottom-2 right-2 px-2 py-1 rounded-lg text-xs font-bold"
                      style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--ink-950)' }}
                    >
                      {previewExpanded ? 'Collapse' : 'Expand'}
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Subject detected badge */}
              <div className="flex items-center gap-2">
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(91,106,245,0.2), rgba(139,92,246,0.2))',
                    border: '1px solid rgba(91,106,245,0.35)',
                    color: '#8B9FFF',
                  }}
                >
                  {result.subject_detected}
                </span>
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs text-muted-foreground">Solved</span>
              </div>

              {/* Problem statement */}
              <div
                className="rounded-2xl p-4 v2-card"
              >
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                  Problem
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--v2-text-1)' }}>{result.problem_statement}</p>
              </div>

              {/* Steps */}
              {result.steps && result.steps.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
                    Step-by-step Solution
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {result.steps.map((step, i) => (
                      <StepCard key={i} step={step} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Final Answer */}
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Final Answer</p>
                </div>
                <p className="text-base font-bold text-white leading-snug">{result.final_answer}</p>
              </div>

              {/* Concept Summary */}
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.25)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen size={15} style={{ color: '#A78BFA' }} />
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#A78BFA' }}>
                    Concept Summary
                  </p>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-800)' }}>{result.concept_summary}</p>
              </div>

              {/* Common Mistakes (collapsible) */}
              {result.common_mistakes && result.common_mistakes.length > 0 && (
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  <button
                    onClick={() => setMistakesOpen((v) => !v)}
                    className="w-full flex items-center gap-2.5 px-4 py-3"
                  >
                    <AlertCircle size={15} className="text-amber-400 shrink-0" />
                    <span className="text-sm font-bold text-amber-300 flex-1 text-left">
                      Common Mistakes
                    </span>
                    {mistakesOpen ? (
                      <ChevronUp size={14} className="text-amber-400" />
                    ) : (
                      <ChevronDown size={14} className="text-amber-400" />
                    )}
                  </button>
                  <AnimatePresence>
                    {mistakesOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 flex flex-col gap-2">
                          {result.common_mistakes.map((m, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                                style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}
                              >
                                {i + 1}
                              </span>
                              <p className="text-sm text-amber-200/80 leading-relaxed">{m}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3 pt-1">
                <button
                  onClick={addToFlashcards}
                  disabled={addingCard || cardAdded}
                  className="w-full h-13 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold text-white active:scale-98 transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', height: 52 }}
                >
                  {addingCard ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : cardAdded ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {cardAdded ? 'Added to Flashcards' : 'Add to Flashcards'}
                </button>

                <button
                  onClick={reset}
                  className="w-full rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold border active:scale-98 transition-all"
                  style={{
                    height: 52,
                    borderColor: 'var(--ink-150)',
                    color: 'var(--muted-foreground)',
                    background: 'var(--ink-040)',
                  }}
                >
                  <Camera size={16} />
                  Solve Another
                </button>
              </div>

              <div className="h-6" />
            </motion.div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center gap-6 px-6 py-16 text-center"
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle size={36} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-bold text-white mb-2">
                  Novo couldn't read this image
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {errorMsg || 'The image may be blurry or the problem unclear. Try again with better lighting.'}
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => { setPhase('captured'); setErrorMsg(''); }}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-white active:scale-98 transition-all"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                >
                  <RotateCcw size={16} />
                  Try Again
                </button>
                <button
                  onClick={reset}
                  className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold border active:scale-98 transition-all"
                  style={{ borderColor: 'var(--ink-120)', color: 'var(--muted-foreground)' }}
                >
                  Take New Photo
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
