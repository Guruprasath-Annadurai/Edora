// ═══════════════════════════════════════════════════════════════
// Edora — SpacedRepetitionPage
// SM-2 spaced repetition review interface with card flip experience.
// Dashboard mode → Review session → Session complete.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, CheckCircle2, AlertTriangle, Trophy, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchDueCards,
  fetchAllCards,
  fetchStats,
  submitReview,
  retentionLabel,
  retentionColor,
  daysUntilDue,
  sm2,
  type SRCard,
  type SRStats,
} from '@/lib/spacedRepetition';

// ── Types ─────────────────────────────────────────────────────────────────────

type PageMode = 'dashboard' | 'review' | 'complete';

interface SessionResult {
  total:      number;
  correct:    number;
  mastered:   number;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastState { id: number; message: string; type: 'success' | 'info' | 'error' }

function Toast({ message, type, onDismiss }: ToastState & { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#5B6AF5';

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

// ── Skeleton shimmer ──────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--ink-050)', borderColor: 'var(--ink-100)' }}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-1/2 rounded bg-white/10 animate-pulse" />
          <div className="ml-auto h-5 w-16 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="h-3 w-1/3 rounded bg-white/10 animate-pulse" />
      </div>
    </motion.div>
  );
}

// ── Stat Chip ─────────────────────────────────────────────────────────────────

interface StatChipProps {
  label: string;
  value: string | number;
  accent?: string;
}

function StatChip({ label, value, accent }: StatChipProps) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-2xl"
      style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-100)' }}
    >
      <span
        className="text-lg font-bold leading-none mb-1"
        style={{ color: accent ?? '#FFFFFF' }}
      >
        {value}
      </span>
      <span className="text-xs font-semibold text-white/50 uppercase tracking-wide text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── Card List Item ────────────────────────────────────────────────────────────

function CardListItem({ card, index }: { card: SRCard; index: number }) {
  const label = retentionLabel(card);
  const color = retentionColor(card);
  const days  = daysUntilDue(card);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.24 }}
      className="flex items-center gap-3 py-3 px-4 rounded-2xl"
      style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)' }}
    >
      {/* Colored dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />

      {/* Front text */}
      <p className="flex-1 text-sm text-white/90 font-medium truncate leading-snug">
        {card.front}
      </p>

      {/* Retention badge */}
      <span
        className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
        style={{
          background: `${color}22`,
          color,
          border: `1px solid ${color}44`,
        }}
      >
        {label}
      </span>

      {/* Due info */}
      <span className="shrink-0 text-xs text-white/40 font-medium min-w-[48px] text-right">
        {days === 0 ? 'due' : `${days}d`}
      </span>
    </motion.div>
  );
}

// ── Flip Card ─────────────────────────────────────────────────────────────────

interface FlipCardProps {
  card:      SRCard;
  isFlipped: boolean;
}

function FlipCard({ card, isFlipped }: FlipCardProps) {
  return (
    <div style={{ perspective: '1000px' }} className="w-full">
      <div
        className="relative w-full"
        style={{
          minHeight: 220,
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Front face */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 rounded-3xl"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            background: 'var(--ink-070)',
            border: '1px solid var(--ink-150)',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">
            Question
          </p>
          <p className="text-center text-lg font-bold text-white leading-snug">
            {card.front}
          </p>
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6 rounded-3xl"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'rgba(91,106,245,0.12)',
            border: '1px solid rgba(91,106,245,0.3)',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-300/60 mb-4">
            Answer
          </p>
          <p className="text-center text-lg font-bold text-white leading-snug">
            {card.back}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Rating Button ─────────────────────────────────────────────────────────────

interface RatingButtonProps {
  label:      string;
  sublabel:   string;
  bg:         string;
  border:     string;
  textColor:  string;
  onClick:    () => void;
  disabled?:  boolean;
}

function RatingButton({ label, sublabel, bg, border, textColor, onClick, disabled }: RatingButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center justify-center py-3 px-1 rounded-2xl active:scale-95 transition-all disabled:opacity-40"
      style={{ background: bg, border: `1.5px solid ${border}` }}
    >
      <span className="text-sm font-bold" style={{ color: textColor }}>{label}</span>
      <span className="text-xs mt-0.5 font-medium" style={{ color: `${textColor}99` }}>
        {sublabel}
      </span>
    </button>
  );
}

// ── Helper: interval preview label ───────────────────────────────────────────

function intervalLabel(days: number): string {
  if (days <= 1) return 'Tomorrow';
  if (days < 7)  return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpacedRepetitionPage() {
  const { user } = useAuth();
  const mountedRef = useRef(true);

  // ── Data state
  const [stats,        setStats]        = useState<SRStats | null>(null);
  const [allCards,     setAllCards]     = useState<SRCard[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // ── UI state
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [toasts,        setToasts]        = useState<ToastState[]>([]);
  const toastCounter = useRef(0);

  // ── Review session state
  const [mode,          setMode]          = useState<PageMode>('dashboard');
  const [reviewQueue,   setReviewQueue]   = useState<SRCard[]>([]);
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [isFlipped,     setIsFlipped]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  // Accumulate session results
  const sessionCorrectRef = useRef(0);
  const sessionMasteredRef = useRef(0);

  // ── Unmount guard
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Toast helper
  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Load data
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [s, cards] = await Promise.all([
        fetchStats(user.id),
        fetchAllCards(user.id),
      ]);
      if (!mountedRef.current) return;
      setStats(s);
      setAllCards(cards);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[SR] load:', err);
      setError('Failed to load your cards. Check your connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data
  const allSubjects = Array.from(new Set(allCards.map(c => c.subject))).filter(Boolean);

  const filteredCards = activeSubject
    ? allCards.filter(c => c.subject === activeSubject)
    : allCards;

  // Group by subject for the dashboard list
  const cardsBySubject = filteredCards.reduce<Record<string, SRCard[]>>((acc, card) => {
    const sub = card.subject || 'General';
    if (!acc[sub]) acc[sub] = [];
    acc[sub].push(card);
    return acc;
  }, {});

  // Next due date (for "all caught up" message)
  const nextDueDate = allCards
    .filter(c => c.next_review_date > new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.next_review_date.localeCompare(b.next_review_date))[0]?.next_review_date ?? null;

  // ── Start review session
  const handleStartReview = useCallback(async () => {
    if (!user || !stats || stats.due_today === 0) return;
    setLoading(true);
    try {
      const cards = await fetchDueCards(user.id, activeSubject, 50);
      if (!mountedRef.current) return;
      if (!cards.length) {
        showToast('No due cards found.', 'info');
        setLoading(false);
        return;
      }
      sessionCorrectRef.current  = 0;
      sessionMasteredRef.current = 0;
      setReviewQueue(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionResult(null);
      setMode('review');
    } catch (err) {
      console.error('[SR] start review:', err);
      showToast('Could not load review cards.', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, stats, activeSubject, showToast]);

  // ── Handle rating
  const handleRate = useCallback(async (difficulty: 'easy' | 'good' | 'hard' | 'again') => {
    if (submitting || !reviewQueue.length) return;
    const card = reviewQueue[currentIndex];
    setSubmitting(true);
    try {
      const result = await submitReview(card, difficulty);
      if (!mountedRef.current) return;

      if (result.was_correct) sessionCorrectRef.current++;
      if (result.interval >= 21) sessionMasteredRef.current++;

      const isLast = currentIndex >= reviewQueue.length - 1;
      if (isLast) {
        setSessionResult({
          total:   reviewQueue.length,
          correct: sessionCorrectRef.current,
          mastered: sessionMasteredRef.current,
        });
        setMode('complete');
        // Reload stats in background
        if (user) {
          fetchStats(user.id).then(s => { if (mountedRef.current) setStats(s); }).catch(() => {});
          fetchAllCards(user.id).then(c => { if (mountedRef.current) setAllCards(c); }).catch(() => {});
        }
      } else {
        setCurrentIndex(i => i + 1);
        setIsFlipped(false);
      }
    } catch (err) {
      console.error('[SR] submit review:', err);
      showToast('Failed to save — please try again.', 'error');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [submitting, reviewQueue, currentIndex, user, showToast]);

  // ── Exit review
  const handleExitReview = useCallback(() => {
    setMode('dashboard');
    setReviewQueue([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    // Reload data
    loadData();
  }, [loadData]);

  // ── Current review card
  const currentCard = reviewQueue[currentIndex] ?? null;

  // ── SM-2 interval previews for rating buttons
  function previewInterval(difficulty: 'easy' | 'good' | 'hard' | 'again'): string {
    if (!currentCard) return '';
    const qualityMap = { easy: 5, good: 4, hard: 3, again: 1 } as const;
    const q = qualityMap[difficulty];
    const { interval } = sm2(q, currentCard.easiness_factor, currentCard.interval_days, currentCard.repetitions);
    return intervalLabel(interval);
  }

  // ── Render: Review Mode ───────────────────────────────────────────────────────
  if (mode === 'review' && currentCard) {
    const progress = currentIndex / reviewQueue.length;

    return (
      <div
        className="flex flex-col h-full"
        style={{ background: 'transparent' }}
      >
        {/* Toasts */}
        <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
          <AnimatePresence>
            {toasts.map(t => (
              <Toast key={t.id} {...t} onDismiss={() => dismissToast(t.id)} />
            ))}
          </AnimatePresence>
        </div>

        {/* Top bar */}
        <div className="shrink-0 px-4 pt-4 pb-2 flex items-center gap-3">
          <button
            onClick={handleExitReview}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-120)' }}
          >
            <X size={17} className="text-white" />
          </button>

          {/* Progress bar */}
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--ink-100)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Counter */}
          <span className="shrink-0 text-xs font-bold text-white/50">
            {reviewQueue.length - currentIndex} left
          </span>
        </div>

        {/* Subject / topic label */}
        <div className="px-4 pt-1 pb-2 shrink-0">
          <p className="text-xs font-bold uppercase tracking-widest text-white/30 text-center">
            {currentCard.subject}
            {currentCard.topic ? ` · ${currentCard.topic}` : ''}
          </p>
        </div>

        {/* Scrollable area with card + buttons */}
        <div className="flex-1 overflow-y-auto pb-nav px-4 flex flex-col items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="w-full max-w-sm flex flex-col items-center gap-5 pt-2 pb-8"
            >
              {/* Flip card */}
              <div className="w-full" style={{ minHeight: 220 }}>
                <FlipCard card={currentCard} isFlipped={isFlipped} />
              </div>

              {!isFlipped ? (
                /* Show Answer button */
                <button
                  onClick={() => setIsFlipped(true)}
                  className="w-full py-4 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                >
                  Show Answer
                </button>
              ) : (
                /* Rating buttons */
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="w-full flex flex-col gap-3"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                    How did you do?
                  </p>
                  <div className="flex gap-2">
                    <RatingButton
                      label="Again"
                      sublabel={previewInterval('again')}
                      bg="rgba(239,68,68,0.15)"
                      border="#EF444466"
                      textColor="#EF4444"
                      onClick={() => handleRate('again')}
                      disabled={submitting}
                    />
                    <RatingButton
                      label="Hard"
                      sublabel={previewInterval('hard')}
                      bg="rgba(249,115,22,0.15)"
                      border="#F9731666"
                      textColor="#F97316"
                      onClick={() => handleRate('hard')}
                      disabled={submitting}
                    />
                    <RatingButton
                      label="Good"
                      sublabel={previewInterval('good')}
                      bg="rgba(59,130,246,0.15)"
                      border="#3B82F666"
                      textColor="#3B82F6"
                      onClick={() => handleRate('good')}
                      disabled={submitting}
                    />
                    <RatingButton
                      label="Easy"
                      sublabel={previewInterval('easy')}
                      bg="rgba(16,185,129,0.15)"
                      border="#10B98166"
                      textColor="#10B981"
                      onClick={() => handleRate('easy')}
                      disabled={submitting}
                    />
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Render: Session Complete ──────────────────────────────────────────────────
  if (mode === 'complete' && sessionResult) {
    const accuracy = sessionResult.total > 0
      ? Math.round((sessionResult.correct / sessionResult.total) * 100)
      : 0;

    return (
      <div
        className="flex flex-col h-full items-center justify-center px-6"
        style={{ background: 'transparent' }}
      >
        {/* Toasts */}
        <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
          <AnimatePresence>
            {toasts.map(t => (
              <Toast key={t.id} {...t} onDismiss={() => dismissToast(t.id)} />
            ))}
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="w-full max-w-sm flex flex-col items-center"
        >
          {/* Trophy */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.25), rgba(139,92,246,0.25))', border: '1px solid rgba(91,106,245,0.3)' }}
          >
            <Trophy size={40} className="text-white" />
          </div>

          <h2 className="font-heading text-2xl font-bold text-white mb-1 text-center">
            Session Complete!
          </h2>
          <p className="text-sm text-white/50 mb-7 text-center">
            Great work — your memory is getting stronger.
          </p>

          {/* Stats grid */}
          <div
            className="w-full rounded-2xl p-5 mb-6"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{sessionResult.total}</span>
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide mt-1">
                  Reviewed
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold" style={{ color: '#10B981' }}>{accuracy}%</span>
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide mt-1">
                  Accuracy
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold" style={{ color: '#5B6AF5' }}>{sessionResult.mastered}</span>
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide mt-1">
                  Mastered
                </span>
              </div>
            </div>

            {/* Correct count sub-line */}
            <div
              className="mt-4 pt-4 flex items-center justify-center gap-1.5"
              style={{ borderTop: '1px solid var(--ink-080)' }}
            >
              <CheckCircle2 size={14} style={{ color: '#10B981' }} />
              <span className="text-xs font-semibold text-white/60">
                {sessionResult.correct} of {sessionResult.total} remembered correctly
              </span>
            </div>
          </div>

          {/* Back to dashboard */}
          <button
            onClick={handleExitReview}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Render: Dashboard ─────────────────────────────────────────────────────────
  const isDueToday = (stats?.due_today ?? 0) > 0;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'transparent' }}
    >
      {/* Toasts */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} {...t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header */}
      <div
        className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--ink-070)' }}
      >
        <Link
          to="/home"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-120)' }}
        >
          <ArrowLeft size={17} className="text-white" />
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-lg font-bold text-white leading-tight">
            Spaced Review
          </h1>
          <p className="text-xs text-white/40 font-medium">
            Science-backed memory training
          </p>
        </div>
      </div>

      {/* ── Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div
              className="mx-4 mt-3 px-4 py-3 rounded-2xl flex items-start gap-2.5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <AlertTriangle size={15} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-red-400">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable body */}
      <div className="flex-1 overflow-y-auto pb-nav px-4 py-4 flex flex-col gap-4">

        {/* Stats chips */}
        {loading ? (
          <div className="flex gap-2">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="flex-1 h-16 rounded-2xl animate-pulse"
                style={{ background: 'var(--ink-070)' }}
              />
            ))}
          </div>
        ) : stats ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <StatChip
              label="Due Today"
              value={stats.due_today}
              accent={stats.due_today > 0 ? '#F59E0B' : '#10B981'}
            />
            <StatChip
              label="Total Cards"
              value={stats.total}
            />
            <StatChip
              label="Mastered"
              value={stats.mastered}
              accent="#10B981"
            />
            <StatChip
              label="Accuracy"
              value={`${Math.round(stats.accuracy * 100)}%`}
            />
          </motion.div>
        ) : null}

        {/* Subject filter chips */}
        {!loading && allSubjects.length > 0 && (
          <div className="overflow-x-auto -mx-4 px-4 native-scroll-x">
            <div className="flex gap-2 w-max">
              <button
                onClick={() => setActiveSubject(null)}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95"
                style={
                  activeSubject === null
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#FFF', border: '1px solid transparent' }
                    : { background: 'var(--ink-080)', color: 'var(--ink-600)', border: '1px solid var(--ink-120)' }
                }
              >
                All
              </button>
              {allSubjects.map(subject => (
                <button
                  key={subject}
                  onClick={() => setActiveSubject(subject)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95"
                  style={
                    activeSubject === subject
                      ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: '#FFF', border: '1px solid transparent' }
                      : { background: 'var(--ink-080)', color: 'var(--ink-600)', border: '1px solid var(--ink-120)' }
                  }
                >
                  {subject}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Start Review button */}
        {!loading && stats && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={handleStartReview}
            disabled={!isDueToday}
            className="w-full py-4 rounded-2xl text-base font-bold text-white active:scale-95 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          >
            {isDueToday
              ? `Start Review  ·  ${activeSubject ? (stats.by_subject[activeSubject]?.due ?? 0) : stats.due_today} cards`
              : 'No cards due today'}
          </motion.button>
        )}

        {/* Empty state — all caught up */}
        {!loading && stats && stats.due_today === 0 && allCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-6 px-4 rounded-2xl"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <CheckCircle2 size={32} className="mb-2" style={{ color: '#34D399' }} />
            <p className="font-heading text-base font-bold text-white mb-1">All caught up!</p>
            <p className="text-xs text-white/50 mb-1">No cards due for review today.</p>
            {nextDueDate && (
              <p className="text-xs text-white/30 font-medium">
                Next review: {new Date(nextDueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            )}
          </motion.div>
        )}

        {/* Empty state — no cards at all */}
        {!loading && stats && stats.total === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-8 px-4"
          >
            <Layers size={40} className="mb-3 text-white/30" />
            <p className="font-heading text-base font-bold text-white mb-2">No flashcards yet</p>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs">
              Flashcards are created automatically when you complete tutoring sessions or quizzes.
            </p>
          </motion.div>
        )}

        {/* Cards list — grouped by subject */}
        {!loading && filteredCards.length > 0 && (
          <div className="flex flex-col gap-5">
            {Object.entries(cardsBySubject).map(([subject, cards]) => (
              <div key={subject}>
                {/* Subject heading */}
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                    {subject}
                  </p>
                  <div className="flex-1 h-px" style={{ background: 'var(--ink-070)' }} />
                  <p className="text-xs font-semibold text-white/30">
                    {cards.length} card{cards.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {/* Card items */}
                <div className="flex flex-col gap-1.5">
                  {cards.map((card, i) => (
                    <CardListItem key={card.id} card={card} index={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeletons for card list */}
        {loading && (
          <div className="flex flex-col gap-2 mt-2">
            {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} index={i} />)}
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  );
}
