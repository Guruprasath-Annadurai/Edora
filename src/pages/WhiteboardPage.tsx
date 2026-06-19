// ═══════════════════════════════════════════════════════════════
// Edora — WhiteboardPage
// Canvas drawing → Novo AI vision analysis.
// Students draw equations/diagrams, Novo spots errors and explains.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Trash2, Eraser, CheckCircle2,
  AlertTriangle, Loader2, Send, BookOpen, X, Edit3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'pen' | 'eraser';

interface StrokeColor {
  label: string;
  value: string;
}

interface StrokeWidth {
  label: string;
  px:    number;
}

interface AnalysisError {
  location?:   string;
  error:       string;
  correction:  string;
}

interface AnalysisResult {
  description:  string;
  errors_found: boolean;
  errors?:      AnalysisError[];
  explanation:  string;
  next_steps:   string;
}

interface FollowUp {
  question: string;
  answer:   string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS: StrokeColor[] = [
  { label: 'Black', value: '#111111' },
  { label: 'Red',   value: '#EF4444' },
  { label: 'Blue',  value: '#3B82F6' },
  { label: 'Green', value: '#22C55E' },
];

const WIDTHS: StrokeWidth[] = [
  { label: 'Thin',   px: 2 },
  { label: 'Medium', px: 4 },
  { label: 'Thick',  px: 8 },
];

// ── Loading overlay ───────────────────────────────────────────────────────────

function AnalysingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center z-20"
      style={{ background: 'rgba(15,15,26,0.82)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        className="w-14 h-14 rounded-full border-4 mb-5"
        style={{
          borderColor: 'rgba(139,92,246,0.2)',
          borderTopColor: '#8B5CF6',
        }}
      />
      <p className="text-white font-bold text-base">Novo is analysing…</p>
      <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Reading your drawing
      </p>
    </motion.div>
  );
}

// ── Result bottom sheet ───────────────────────────────────────────────────────

interface ResultSheetProps {
  result:      AnalysisResult;
  imageBase64: string;
  subject:     string;
  onClose:     () => void;
  onSaved:     () => void;
}

function ResultSheet({ result, imageBase64, subject, onClose, onSaved }: ResultSheetProps) {
  const { user } = useAuth();
  const [followUpText,    setFollowUpText]    = useState('');
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [localFollowUps,  setLocalFollowUps]  = useState<FollowUp[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const sendFollowUp = useCallback(async () => {
    const q = followUpText.trim();
    if (!q || loadingFollowUp) return;
    setFollowUpText('');
    setLoadingFollowUp(true);

    try {
      const { data, error } = await supabase.functions.invoke('gemini-vision', {
        body: {
          action:       'analyze_image',
          image_base64: imageBase64,
          mime_type:    'image/jpeg',
          prompt:       q,
        },
      });
      if (error) throw new Error(error.message);
      const answer =
        (data as { explanation?: string; description?: string })?.explanation ??
        (data as { description?: string })?.description ??
        'No response.';
      if (mountedRef.current) {
        setLocalFollowUps(prev => [...prev, { question: q, answer }]);
      }
    } catch (err) {
      console.error('[Whiteboard] follow-up error:', err);
      if (mountedRef.current) {
        setLocalFollowUps(prev => [
          ...prev,
          { question: q, answer: 'Sorry, I could not answer that. Please try again.' },
        ]);
      }
    } finally {
      if (mountedRef.current) setLoadingFollowUp(false);
    }
  }, [followUpText, imageBase64, loadingFollowUp]);

  const handleSave = useCallback(async () => {
    if (!user || saving || saved) return;
    setSaving(true);
    try {
      await supabase.from('whiteboard_analyses').insert({
        user_id:      user.id,
        subject,
        description:  result.description,
        errors_found: result.errors_found,
        errors:       result.errors ?? [],
        explanation:  result.explanation,
        next_steps:   result.next_steps,
        follow_ups:   localFollowUps,
      });
      if (mountedRef.current) {
        setSaved(true);
        onSaved();
      }
    } catch (err) {
      console.error('[Whiteboard] save error:', err);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [user, saving, saved, subject, result, localFollowUps, onSaved]);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #13102a, #0f0f1a)',
        border: '1px solid rgba(255,255,255,0.1)',
        maxHeight: '80vh',
      }}
    >
      {/* Handle + close */}
      <div className="relative flex items-center justify-center px-5 py-4 shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-3 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          <X size={14} className="text-white" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-nav px-5" style={{ WebkitOverflowScrolling: 'touch' }}>

        {/* What Novo sees */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={13} style={{ color: 'rgba(255,255,255,0.45)' }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
              What Novo sees
            </p>
          </div>
          <p className="text-sm text-white leading-relaxed">{result.description}</p>
        </div>

        {/* Error/correct badge */}
        {result.errors_found ? (
          <div
            className="px-4 py-4 rounded-2xl mb-4"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-red-400 shrink-0" />
              <p className="text-sm font-bold text-red-400">Errors Found</p>
            </div>
            {(result.errors ?? []).map((err, i) => (
              <div
                key={i}
                className="mb-3 last:mb-0 pl-3"
                style={{ borderLeft: '2px solid rgba(239,68,68,0.5)' }}
              >
                {err.location && (
                  <p className="text-[11px] font-bold mb-0.5" style={{ color: 'rgba(239,68,68,0.7)' }}>
                    {err.location}
                  </p>
                )}
                <p className="text-xs text-red-300 mb-1">{err.error}</p>
                <p className="text-xs font-semibold text-green-400">{err.correction}</p>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl mb-4"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <CheckCircle2 size={18} className="text-green-400 shrink-0" />
            <p className="text-sm font-bold text-green-400">Looks Correct!</p>
          </div>
        )}

        {/* Explanation */}
        <div
          className="px-4 py-4 rounded-2xl mb-4"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
        >
          <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: '#a78bfa' }}>
            Explanation
          </p>
          <p className="text-sm text-white leading-relaxed">{result.explanation}</p>
        </div>

        {/* Next steps */}
        {result.next_steps && (
          <div
            className="px-4 py-4 rounded-2xl mb-5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Next Steps
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {result.next_steps}
            </p>
          </div>
        )}

        {/* Follow-up answers */}
        {localFollowUps.map((fu, i) => (
          <div key={i} className="mb-4">
            <p className="text-xs font-bold mb-1.5 px-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Q: {fu.question}
            </p>
            <div
              className="px-4 py-3 rounded-xl"
              style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}
            >
              <p className="text-sm text-white leading-relaxed">{fu.answer}</p>
            </div>
          </div>
        ))}

        {/* Follow-up input */}
        <div className="flex gap-2 mb-4">
          <input
            value={followUpText}
            onChange={e => setFollowUpText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void sendFollowUp(); }}
            placeholder="Ask a follow-up question…"
            disabled={loadingFollowUp}
            className="flex-1 px-4 py-3 rounded-2xl text-sm text-white outline-none placeholder:opacity-30 disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <button
            onClick={() => void sendFollowUp()}
            disabled={!followUpText.trim() || loadingFollowUp}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          >
            {loadingFollowUp
              ? <Loader2 size={16} className="text-white animate-spin" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>

        {/* Save / Done buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            Done
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || saved}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: saved ? '#10B981' : 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <><CheckCircle2 size={14} /> Saved</>
            ) : (
              'Save Analysis'
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({
  message, type, onDismiss,
}: {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -40, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: -40, x: '-50%' }}
      className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2"
      style={{ background: type === 'success' ? '#10B981' : '#EF4444' }}
    >
      {type === 'success'
        ? <CheckCircle2 size={14} className="text-white" />
        : <AlertTriangle size={14} className="text-white" />
      }
      <span className="text-sm font-semibold text-white">{message}</span>
    </motion.div>
  );
}

// ── Sparkles icon (inline — avoids lucide version mismatch) ──────────────────

function SparklesIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
      <path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WhiteboardPage() {
  const navigate = useNavigate();

  // ── Tool state ──
  const [activeTool,  setActiveTool]  = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState<string>(COLORS[0].value);
  const [activeWidth, setActiveWidth] = useState<number>(WIDTHS[1].px);

  // ── Canvas refs ──
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const ctxRef       = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const lastXRef     = useRef(0);
  const lastYRef     = useRef(0);

  // ── UI state ──
  const [hasDrawing,  setHasDrawing]  = useState(false);
  const [subject,     setSubject]     = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [analysing,   setAnalysing]   = useState(false);
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [imageBase64, setImageBase64] = useState('');
  const [showSheet,   setShowSheet]   = useState(false);
  const [toast,       setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Canvas initialisation ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      // Preserve existing drawing on resize; skip on first init (no ctx yet)
      const imgData = ctxRef.current ? canvas.toDataURL() : null;

      canvas.width  = r.width  * dpr;
      canvas.height = r.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;

      if (imgData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = imgData;
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── Drawing helpers ──
  function clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const applyToolStyle = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    if (activeTool === 'eraser') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = activeWidth * 6;
    } else {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth   = activeWidth;
    }
  }, [activeTool, activeColor, activeWidth]);

  const startDraw = useCallback((x: number, y: number) => {
    if (!ctxRef.current) return;
    isDrawingRef.current = true;
    lastXRef.current = x;
    lastYRef.current = y;
    applyToolStyle();
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
  }, [applyToolStyle]);

  const continueDraw = useCallback((x: number, y: number) => {
    if (!isDrawingRef.current || !ctxRef.current) return;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(lastXRef.current, lastYRef.current);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    lastXRef.current = x;
    lastYRef.current = y;
    setHasDrawing(true);
  }, []);

  const endDraw = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    startDraw(x, y);
  }, [startDraw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    continueDraw(x, y);
  }, [continueDraw]);

  const handleMouseUp = useCallback(() => endDraw(), [endDraw]);

  // ── Touch handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!e.touches[0]) return;
    const { x, y } = clientToCanvas(e.touches[0].clientX, e.touches[0].clientY);
    startDraw(x, y);
  }, [startDraw]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!e.touches[0]) return;
    const { x, y } = clientToCanvas(e.touches[0].clientX, e.touches[0].clientY);
    continueDraw(x, y);
  }, [continueDraw]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    endDraw();
  }, [endDraw]);

  // ── Clear ──
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = ctxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawing(false);
    setResult(null);
    setShowSheet(false);
  }, []);

  // ── Analyse ──
  const handleAnalyse = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawing || analysing) return;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64  = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    setImageBase64(base64);
    setAnalysing(true);
    setShowSheet(false);

    try {
      const { data, error } = await supabase.functions.invoke('gemini-vision', {
        body: {
          action:       'analyze_drawing',
          image_base64: base64,
          mime_type:    'image/jpeg',
          prompt:       userQuestion.trim() ||
            'Analyse this mathematical drawing or equation. Identify what it shows, spot any errors, and explain the concepts clearly.',
          subject: subject.trim() || undefined,
        },
      });

      if (error) throw new Error(error.message);

      if (mountedRef.current) {
        setResult(data as AnalysisResult);
        setShowSheet(true);
      }
    } catch (err) {
      console.error('[Whiteboard] analyse error:', err);
      if (mountedRef.current) {
        setToast({ message: 'Analysis failed — please try again.', type: 'error' });
      }
    } finally {
      if (mountedRef.current) setAnalysing(false);
    }
  }, [hasDrawing, analysing, userQuestion, subject]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'linear-gradient(160deg, #0f0f1a 0%, #13102a 100%)' }}
    >
      {/* Toast */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <AnimatePresence>
          {toast && (
            <Toast
              key="toast"
              message={toast.message}
              type={toast.type}
              onDismiss={() => setToast(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 pt-10 pb-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="font-heading text-xl font-bold text-white">Whiteboard</h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Draw, then ask Novo
          </p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Colors */}
        <div className="flex items-center gap-1.5 shrink-0">
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => { setActiveColor(c.value); setActiveTool('pen'); }}
              title={c.label}
              className="w-8 h-8 rounded-full transition-all active:scale-90"
              style={{
                background: c.value,
                border: (activeTool === 'pen' && activeColor === c.value)
                  ? '3px solid white'
                  : '2px solid rgba(255,255,255,0.15)',
                boxShadow: (activeTool === 'pen' && activeColor === c.value)
                  ? `0 0 0 2px ${c.value}`
                  : 'none',
              }}
            />
          ))}
        </div>

        <div className="w-px h-6 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Widths */}
        <div className="flex items-center gap-1.5 shrink-0">
          {WIDTHS.map(w => (
            <button
              key={w.px}
              onClick={() => { setActiveWidth(w.px); setActiveTool('pen'); }}
              title={w.label}
              className="w-9 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{
                background: (activeTool === 'pen' && activeWidth === w.px)
                  ? 'rgba(91,106,245,0.3)'
                  : 'rgba(255,255,255,0.06)',
                border: (activeTool === 'pen' && activeWidth === w.px)
                  ? '1px solid rgba(91,106,245,0.6)'
                  : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                className="rounded-full bg-white"
                style={{ width: Math.max(3, w.px), height: Math.max(3, w.px) }}
              />
            </button>
          ))}
        </div>

        <div className="w-px h-6 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Eraser */}
        <button
          onClick={() => setActiveTool('eraser')}
          title="Eraser"
          className="w-9 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 shrink-0"
          style={{
            background: activeTool === 'eraser' ? 'rgba(91,106,245,0.3)' : 'rgba(255,255,255,0.06)',
            border: activeTool === 'eraser'
              ? '1px solid rgba(91,106,245,0.6)'
              : '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Eraser size={15} className="text-white" />
        </button>

        {/* Clear */}
        <button
          onClick={handleClear}
          title="Clear"
          className="w-9 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 shrink-0"
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
        >
          <Trash2 size={15} className="text-red-400" />
        </button>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 relative overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none block"
          style={{ cursor: activeTool === 'eraser' ? 'cell' : 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Empty state hint */}
        {!hasDrawing && !analysing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Edit3 size={36} className="mb-2 mx-auto" style={{ color: 'rgba(0,0,0,0.18)' }} />
              <p className="text-sm font-semibold" style={{ color: 'rgba(0,0,0,0.2)' }}>
                Draw an equation or diagram
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.12)' }}>
                Novo will analyse it for you
              </p>
            </div>
          </div>
        )}

        {/* Analysing overlay */}
        <AnimatePresence>
          {analysing && <AnalysingOverlay />}
        </AnimatePresence>

        {/* Result sheet */}
        <AnimatePresence>
          {showSheet && result && (
            <ResultSheet
              result={result}
              imageBase64={imageBase64}
              subject={subject}
              onClose={() => setShowSheet(false)}
              onSaved={() => setToast({ message: 'Analysis saved!', type: 'success' })}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom panel ── */}
      <div
        className="shrink-0 px-4 py-4"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(160deg, #0f0f1a, #13102a)',
        }}
      >
        <div className="flex gap-2 mb-2.5">
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-white outline-none placeholder:opacity-30"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
        </div>
        <div className="mb-3">
          <input
            value={userQuestion}
            onChange={e => setUserQuestion(e.target.value)}
            placeholder="e.g. Check my equation / What's wrong here?"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none placeholder:opacity-30"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
        </div>

        <button
          onClick={() => void handleAnalyse()}
          disabled={!hasDrawing || analysing}
          className="w-full py-4 rounded-2xl text-base font-bold text-white transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          {analysing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <SparklesIcon size={18} />
              Analyse with Novo
            </>
          )}
        </button>
      </div>
    </div>
  );
}
