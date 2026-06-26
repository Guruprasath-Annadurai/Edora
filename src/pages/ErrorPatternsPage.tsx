// ═══════════════════════════════════════════════════════════════
// Edora — ErrorPatternsPage
// Shows recurring mistake patterns detected by Novo AI.
// Lets users scan for new patterns, drill on them, or resolve them.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Zap, RotateCcw, CheckCheck,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  scanAndPersistPatterns,
  loadErrorPatterns,
  resolvePattern,
  recordDrillStart,
  type ErrorPattern,
} from '@/lib/errorPatterns';
import { track } from '@/lib/analytics';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function patternColor(patternType: string): string {
  switch (patternType) {
    case 'sign_error':
    case 'calculation_error':
      return '#EF4444';
    case 'formula_recall':
    case 'definition_gap':
      return '#F59E0B';
    case 'conceptual_gap':
    case 'unit_conversion':
      return '#F97316';
    default:
      return '#5B6AF5';
  }
}

function patternBg(patternType: string): string {
  switch (patternType) {
    case 'sign_error':
    case 'calculation_error':
      return 'rgba(239,68,68,0.1)';
    case 'formula_recall':
    case 'definition_gap':
      return 'rgba(245,158,11,0.1)';
    case 'conceptual_gap':
    case 'unit_conversion':
      return 'rgba(249,115,22,0.1)';
    default:
      return 'rgba(91,106,245,0.1)';
  }
}

function OccurrenceBadge({ count }: { count: number }) {
  if (count >= 4) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold animate-pulse"
        style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}
      >
        {count}×+
      </span>
    );
  }
  if (count >= 2) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}
      >
        {count}×
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
    >
      1×
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: 'success' | 'info' | 'error';
  onDismiss: () => void;
}

function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg =
    type === 'success' ? '#10B981' :
    type === 'error'   ? '#EF4444' :
    '#5B6AF5';

  return (
    <motion.div
      initial={{ opacity: 0, y: -48, x: '-50%' }}
      animate={{ opacity: 1, y: 0,   x: '-50%' }}
      exit={{    opacity: 0, y: -48, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2"
      style={{ background: bg, minWidth: 200, maxWidth: 320 }}
    >
      {type === 'success' && <CheckCircle2 size={15} className="text-white shrink-0" />}
      {type === 'error'   && <AlertTriangle size={15} className="text-white shrink-0" />}
      <span className="text-sm font-semibold text-white">{message}</span>
    </motion.div>
  );
}

// ── Pattern Card ──────────────────────────────────────────────────────────────

interface PatternCardProps {
  pattern: ErrorPattern;
  index: number;
  isResolved?: boolean;
  onDrill?: (pattern: ErrorPattern) => void;
  onResolve?: (pattern: ErrorPattern) => void;
  onReopen?: (pattern: ErrorPattern) => void;
  resolving?: boolean;
}

function PatternCard({
  pattern,
  index,
  isResolved = false,
  onDrill,
  onResolve,
  onReopen,
  resolving = false,
}: PatternCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = patternColor(pattern.pattern_type);
  const bg    = patternBg(pattern.pattern_type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.22 } }}
      transition={{ delay: index * 0.05, duration: 0.28 }}
      className="rounded-2xl overflow-hidden"
      style={isResolved ? { opacity: 0.65, background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' } : { background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Card top strip */}
      <div className="h-1 w-full" style={{ background: color }} />

      <div className="p-4">
        {/* Row 1: icon + subject chip */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: bg }}
          >
            <AlertTriangle size={15} style={{ color }} />
          </div>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
            style={{ background: bg, color }}
          >
            {pattern.subject}
          </span>
          {isResolved && (
            <span
              className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
            >
              Resolved
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm font-bold text-white leading-snug mb-2.5">
          {pattern.description}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <OccurrenceBadge count={pattern.occurrence_count} />
          <span className="text-muted-foreground text-xs">•</span>
          <span className="text-xs text-muted-foreground">
            Last seen: {relativeTime(pattern.last_detected_at)}
          </span>
        </div>

        {/* Example errors (collapsible) */}
        {pattern.example_errors && pattern.example_errors.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold mb-1.5"
              style={{ color }}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Hide example' : 'Show example error'}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {pattern.example_errors.slice(0, 1).map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3 text-xs space-y-1"
                      style={{ background: bg }}
                    >
                      <p className="text-white/80">
                        <span className="font-bold text-muted-foreground">Q:</span>{' '}
                        {ex.question}
                      </p>
                      <p className="text-white/80">
                        <span className="font-bold" style={{ color }}>Your answer:</span>{' '}
                        {ex.student_answer}
                      </p>
                      <p className="text-white/80">
                        <span className="font-bold" style={{ color: '#34D399' }}>Correct:</span>{' '}
                        {ex.correct_answer}
                      </p>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Action buttons */}
        {!isResolved ? (
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => onDrill?.(pattern)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            >
              <Zap size={13} />
              Start Drill
            </button>
            <button
              onClick={() => onResolve?.(pattern)}
              disabled={resolving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-muted-foreground active:scale-95 transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {resolving ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCheck size={13} />
              )}
              Mark Resolved
            </button>
          </div>
        ) : (
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => onReopen?.(pattern)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-muted-foreground active:scale-95 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <RotateCcw size={13} />
              Re-open
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="h-1 w-full animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="h-5 w-20 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>
        <div className="h-4 w-3/4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="flex gap-2">
          <div className="flex-1 h-9 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex-1 h-9 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center px-6 pt-8 pb-4"
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
      >
        <CheckCircle2 size={36} style={{ color: '#34D399' }} />
      </div>

      <h2 className="font-heading text-xl font-bold text-white mb-2">
        No patterns detected
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-xs">
        You haven't made enough repeated mistakes for Novo to detect patterns yet —
        or you've resolved them all! Keep studying.
      </p>

      <button
        onClick={onScan}
        disabled={scanning}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white mb-6 active:scale-95 transition-all disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
      >
        {scanning ? (
          <RefreshCw size={15} className="animate-spin" />
        ) : (
          <RefreshCw size={15} />
        )}
        {scanning ? 'Scanning…' : 'Scan Now'}
      </button>

      <div
        className="rounded-2xl p-4 text-left w-full max-w-xs"
        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <p className="text-xs font-bold mb-1" style={{ color: '#FBBF24' }}>How it works</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Novo needs at least 2 wrong answers in the same area to detect a pattern.
          Complete a few quizzes first.
        </p>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function ErrorPatternsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  const [patterns,         setPatterns]         = useState<ErrorPattern[]>([]);
  const [resolvedPatterns, setResolvedPatterns] = useState<ErrorPattern[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [scanning,         setScanning]         = useState(false);
  const [activeSubject,    setActiveSubject]    = useState<string | null>(null);
  const [showResolved,     setShowResolved]     = useState(false);
  const [toasts,           setToasts]           = useState<ToastState[]>([]);
  const [resolvingId,      setResolvingId]      = useState<string | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const toastCounter = useRef(0);

  // ── Unmount guard ──
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Toast helper ──
  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Load on mount ──
  const loadPatterns = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [active, allResolved] = await Promise.all([
        loadErrorPatterns(user.id, null, false),
        loadErrorPatterns(user.id, null, true).then(all => all.filter(p => p.is_resolved)),
      ]);
      if (!mountedRef.current) return;
      setPatterns(active);
      setResolvedPatterns(allResolved);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[ErrorPatterns] load:', err);
      setError('Failed to load patterns. Check your connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  // ── Derived: subjects ──
  const allSubjects = Array.from(
    new Set([...patterns, ...resolvedPatterns].map(p => p.subject))
  ).filter(Boolean);

  const filteredPatterns = activeSubject
    ? patterns.filter(p => p.subject === activeSubject)
    : patterns;

  const filteredResolved = activeSubject
    ? resolvedPatterns.filter(p => p.subject === activeSubject)
    : resolvedPatterns;

  // ── Scan ──
  const handleScan = useCallback(async () => {
    if (!user || scanning) return;
    setScanning(true);
    setError(null);
    track('error_pattern_scan');
    try {
      const result = await scanAndPersistPatterns(user.id, null);
      if (!mountedRef.current) return;

      // Reload full lists
      const [active, allResolved] = await Promise.all([
        loadErrorPatterns(user.id, null, false),
        loadErrorPatterns(user.id, null, true).then(all => all.filter(p => p.is_resolved)),
      ]);
      if (!mountedRef.current) return;
      setPatterns(active);
      setResolvedPatterns(allResolved);

      if (result.newCount > 0) {
        showToast(
          `${result.newCount} new pattern${result.newCount === 1 ? '' : 's'} found`,
          'info',
        );
      } else {
        showToast('No new patterns — you\'re improving!', 'success');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[ErrorPatterns] scan:', err);
      setError('Scan failed — check your connection.');
      showToast('Scan failed — check your connection.', 'error');
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, [user, scanning, showToast]);

  // ── Drill ──
  const handleDrill = useCallback(async (pattern: ErrorPattern) => {
    if (!user) return;
    track('error_pattern_drill_started', { subject: pattern.subject });
    try {
      await recordDrillStart(pattern.id);
    } catch (err) {
      console.warn('[ErrorPatterns] recordDrillStart:', err);
    }
    const params = new URLSearchParams({
      subject:           pattern.subject,
      topic:             pattern.description,
      mode:              'drill',
      drill_pattern_id:  pattern.id,
      drill_description: pattern.description,
    });
    navigate(`/tutoring?${params.toString()}`);
  }, [user, navigate]);

  // ── Resolve ──
  const handleResolve = useCallback(async (pattern: ErrorPattern) => {
    if (!user || resolvingId) return;
    setResolvingId(pattern.id);
    track('error_pattern_resolved', { subject: pattern.subject });
    try {
      await resolvePattern(pattern.id);
      if (!mountedRef.current) return;
      setPatterns(prev => prev.filter(p => p.id !== pattern.id));
      setResolvedPatterns(prev => [{ ...pattern, is_resolved: true }, ...prev]);
      showToast('✓ Pattern resolved', 'success');
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[ErrorPatterns] resolve:', err);
      showToast('Failed to resolve pattern.', 'error');
    } finally {
      if (mountedRef.current) setResolvingId(null);
    }
  }, [user, resolvingId, showToast]);

  // ── Re-open ──
  const handleReopen = useCallback(async (pattern: ErrorPattern) => {
    if (!user) return;
    try {
      await resolvePattern(pattern.id); // sets is_resolved=true currently; we need the inverse
      // Actually we need to un-resolve, so update directly via supabase:
      // The lib doesn't expose an unresolve helper, so we'll just reload
      const [active, allResolved] = await Promise.all([
        loadErrorPatterns(user.id, null, false),
        loadErrorPatterns(user.id, null, true).then(all => all.filter(p => p.is_resolved)),
      ]);
      if (!mountedRef.current) return;
      setPatterns(active);
      setResolvedPatterns(allResolved);
      showToast('Pattern re-opened', 'info');
    } catch (err) {
      console.error('[ErrorPatterns] reopen:', err);
      showToast('Failed to re-open pattern.', 'error');
    }
  }, [user, showToast]);

  // ── Re-open via direct supabase (lib has no unresolve) ──
  // Override handleReopen to do the right thing
  const handleReopenImpl = useCallback(async (pattern: ErrorPattern) => {
    if (!user) return;
    try {
      // Import supabase inline to avoid exporting a separate helper
      const { supabase } = await import('@/lib/supabase');
      await supabase
        .from('error_patterns')
        .update({ is_resolved: false })
        .eq('id', pattern.id);
      if (!mountedRef.current) return;
      setResolvedPatterns(prev => prev.filter(p => p.id !== pattern.id));
      setPatterns(prev => [{ ...pattern, is_resolved: false }, ...prev]);
      showToast('Pattern re-opened', 'info');
    } catch (err) {
      console.error('[ErrorPatterns] reopen:', err);
      showToast('Failed to re-open pattern.', 'error');
    }
  }, [user, showToast]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Toasts ── */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast
              key={t.id}
              message={t.message}
              type={t.type}
              onDismiss={() => dismissToast(t.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header ── */}
      <div
        className="px-4 py-3 shrink-0 flex items-center gap-3"
        style={{ background: 'rgba(8,6,20,0.82)', borderBottom: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}
      >
        <Link
          to="/home"
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <h1 className="font-heading text-lg font-bold text-white flex-1">
          Error Patterns
        </h1>
        <button
          onClick={handleScan}
          disabled={scanning || loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="mx-4 mt-3 px-4 py-3 rounded-2xl flex items-start gap-2.5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={15} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-red-400">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Subject filter pills ── */}
      {!loading && (patterns.length > 0 || resolvedPatterns.length > 0) && (
        <div className="shrink-0 px-4 py-3 overflow-x-auto native-scroll-x">
          <div className="flex gap-2 w-max">
            {/* All */}
            <button
              onClick={() => setActiveSubject(null)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all active:scale-95"
              style={
                activeSubject === null
                  ? {
                      background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
                      border: '1px solid rgba(91,106,245,0.5)',
                      color: '#fff',
                    }
                  : { background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
              }
            >
              All Subjects
            </button>

            {allSubjects.map(subject => (
              <button
                key={subject}
                onClick={() => setActiveSubject(subject)}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all active:scale-95"
                style={
                  activeSubject === subject
                    ? {
                        background: 'linear-gradient(135deg, #EEF1FF, #E5E8FF)',
                        borderColor: '#5B6AF5',
                        color: '#5B6AF5',
                      }
                    : { background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                }
              >
                {subject}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-3 flex flex-col gap-3">

        {/* Loading skeletons */}
        {loading && (
          <>
            {[0, 1, 2].map(i => <SkeletonCard key={i} index={i} />)}
          </>
        )}

        {/* Empty state */}
        {!loading && filteredPatterns.length === 0 && filteredResolved.length === 0 && (
          <EmptyState onScan={handleScan} scanning={scanning} />
        )}

        {/* Scanning overlay shimmer */}
        {scanning && !loading && filteredPatterns.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2.5 px-4 py-3 rounded-2xl mb-1"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}
          >
            <RefreshCw size={15} className="text-primary animate-spin shrink-0" />
            <p className="text-xs font-semibold text-primary">
              Scanning your recent answers for new patterns…
            </p>
          </motion.div>
        )}

        {/* Active pattern cards */}
        {!loading && (
          <AnimatePresence mode="popLayout">
            {filteredPatterns.map((pattern, i) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                index={i}
                onDrill={handleDrill}
                onResolve={handleResolve}
                resolving={resolvingId === pattern.id}
              />
            ))}
          </AnimatePresence>
        )}

        {/* No active patterns but have resolved → subtle message */}
        {!loading && filteredPatterns.length === 0 && filteredResolved.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-6 px-4"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <CheckCircle2 size={26} style={{ color: '#34D399' }} />
            </div>
            <p className="text-sm font-bold text-white mb-1">All caught up!</p>
            <p className="text-xs text-muted-foreground">
              No active patterns
              {activeSubject ? ` in ${activeSubject}` : ''}.
              See resolved ones below.
            </p>
          </motion.div>
        )}

        {/* ── Resolved section ── */}
        {!loading && filteredResolved.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowResolved(v => !v)}
              className="w-full flex items-center gap-2 px-1 py-2 text-left"
            >
              <div className="flex-1 flex items-center gap-2">
                <CheckCheck size={15} className="text-muted-foreground" />
                <span className="text-sm font-bold text-muted-foreground">
                  Resolved ({filteredResolved.length})
                </span>
              </div>
              <motion.div animate={{ rotate: showResolved ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={15} className="text-muted-foreground" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showResolved && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24 }}
                  className="overflow-hidden flex flex-col gap-3 mt-1"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredResolved.map((pattern, i) => (
                      <PatternCard
                        key={pattern.id}
                        pattern={pattern}
                        index={i}
                        isResolved
                        onReopen={handleReopenImpl}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  );
}
