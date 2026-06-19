// ═══════════════════════════════════════════════════════════════
// Edora — CurriculumDetailPage
// Shows the topic tree for a board + subject; handles enroll &
// per-topic progress, flashcard generation, and tutoring nav.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronDown, ChevronRight,
  Lock, CheckCircle2, PlayCircle, Clock,
  Star, BookOpen, Zap, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamBoard {
  id: string;
  code: string;
  name: string;
  country: string;
  region: string;
  level: string;
  description: string;
}

interface TopicProgress {
  topic_id: string;
  status: 'locked' | 'available' | 'in_progress' | 'complete';
  mastery_score: number;
}

interface TopicNode {
  id: string;
  title: string;
  description: string;
  depth: number;
  position: number;
  difficulty: number;
  estimated_hours: number;
  children: TopicNode[];
}

interface Curriculum {
  id: string;
  status: string;
  topic_count: number;
}

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DifficultyStars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={10}
          className={i < value ? 'text-amber-400' : 'text-white/15'}
          fill={i < value ? '#FBBF24' : 'none'}
        />
      ))}
    </span>
  );
}

function topicStatusIcon(status: TopicProgress['status']) {
  switch (status) {
    case 'locked':      return <Lock      size={13} className="text-white/30" />;
    case 'complete':    return <CheckCircle2 size={13} className="text-emerald-400" />;
    case 'in_progress': return <PlayCircle size={13} className="text-blue-400" />;
    case 'available':   return <PlayCircle size={13} className="text-indigo-400" />;
  }
}

function topicStatusLabel(status: TopicProgress['status']) {
  switch (status) {
    case 'locked':      return 'Locked';
    case 'complete':    return 'Complete';
    case 'in_progress': return 'In Progress';
    case 'available':   return 'Available';
  }
}

function topicStatusColor(status: TopicProgress['status']): string {
  switch (status) {
    case 'locked':      return 'rgba(255,255,255,0.15)';
    case 'complete':    return 'rgba(16,185,129,0.2)';
    case 'in_progress': return 'rgba(59,130,246,0.2)';
    case 'available':   return 'rgba(91,106,245,0.2)';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: ToastState['type']; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
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
      className="fixed top-4 left-1/2 z-[60] px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2"
      style={{ background: bg, minWidth: 200, maxWidth: 320 }}
    >
      {type === 'success' && <CheckCircle2 size={14} className="text-white shrink-0" />}
      {type === 'error'   && <AlertTriangle size={14} className="text-white shrink-0" />}
      {type === 'info'    && <Zap           size={14} className="text-white shrink-0" />}
      <span className="text-sm font-semibold text-white">{message}</span>
    </motion.div>
  );
}

// ── Generating shimmer ────────────────────────────────────────────────────────

function GeneratingBanner() {
  return (
    <div
      className="mx-4 mb-3 px-4 py-3 rounded-2xl flex items-center gap-2.5 overflow-hidden relative"
      style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)' }}
    >
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(91,106,245,0.4), transparent)' }}
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
      />
      <RefreshCw size={14} className="text-indigo-400 animate-spin shrink-0 relative z-10" />
      <p className="text-indigo-300 text-sm font-semibold relative z-10">Generating curriculum…</p>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Topic Sheet ───────────────────────────────────────────────────────────────

interface TopicSheetProps {
  topic: TopicNode;
  status: TopicProgress['status'];
  subject: string;
  onClose: () => void;
  onComplete: (topicId: string) => Promise<void>;
  onGenerateCards: (topicId: string) => Promise<void>;
  completing: boolean;
  generatingCards: boolean;
}

function TopicSheet({
  topic, status, subject, onClose, onComplete, onGenerateCards,
  completing, generatingCards,
}: TopicSheetProps) {
  const navigate = useNavigate();
  const canInteract = status === 'available' || status === 'in_progress' || status === 'complete';

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-10"
        style={{
          background: 'linear-gradient(180deg, #1E2440 0%, #141829 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5">
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: topicStatusColor(status), color: 'rgba(255,255,255,0.8)' }}
            >
              {topicStatusLabel(status)}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-white font-bold text-lg leading-snug mb-2">{topic.title}</h2>

          {/* Description */}
          {topic.description && (
            <p className="text-white/60 text-sm leading-relaxed mb-4">{topic.description}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex items-center gap-1.5 text-white/50 text-xs">
              <Clock size={12} />
              <span>{topic.estimated_hours}h estimated</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/50 text-xs">
              <span>Difficulty:</span>
              <DifficultyStars value={topic.difficulty} />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            {/* Start Tutoring */}
            {(status === 'available' || status === 'in_progress') && (
              <button
                onClick={() => {
                  onClose();
                  navigate(`/tutoring?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic.title)}`);
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
              >
                <PlayCircle size={16} />
                Start Tutoring
              </button>
            )}

            {/* Mark Complete */}
            {canInteract && status !== 'complete' && (
              <button
                onClick={() => onComplete(topic.id)}
                disabled={completing}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white/80 active:scale-95 transition-all disabled:opacity-60"
                style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                {completing
                  ? <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  : <CheckCircle2 size={16} className="text-emerald-400" />
                }
                {completing ? 'Saving…' : 'Mark Complete'}
              </button>
            )}

            {/* Generate Flashcards (completed only) */}
            {status === 'complete' && (
              <button
                onClick={() => onGenerateCards(topic.id)}
                disabled={generatingCards}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white/80 active:scale-95 transition-all disabled:opacity-60"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                {generatingCards
                  ? <div className="w-4 h-4 border-2 border-amber-400/60 border-t-transparent rounded-full animate-spin" />
                  : <Zap size={16} className="text-amber-400" />
                }
                {generatingCards ? 'Generating…' : 'Generate Flashcards'}
              </button>
            )}

            {/* Locked state info */}
            {status === 'locked' && (
              <div
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <Lock size={15} className="text-white/30" />
                <span className="text-sm text-white/40">Complete previous topics to unlock</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Topic Row ─────────────────────────────────────────────────────────────────

interface TopicRowProps {
  topic: TopicNode;
  progressMap: Map<string, TopicProgress>;
  onSelect: (topic: TopicNode) => void;
  depth?: number;
}

function TopicRow({ topic, progressMap, onSelect, depth = 0 }: TopicRowProps) {
  const progress = progressMap.get(topic.id);
  const status   = progress?.status ?? 'locked';
  const hasChildren = topic.children && topic.children.length > 0;
  const [expanded, setExpanded] = useState(false);

  const isChapter   = depth === 0;
  const isSection   = depth === 1;
  const isLeaf      = depth >= 2 || !hasChildren;

  function handleClick() {
    if (isChapter && hasChildren) {
      setExpanded(v => !v);
    } else {
      onSelect(topic);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full text-left transition-all active:scale-[0.99]"
        style={{
          paddingLeft: isLeaf ? `${depth * 16 + 16}px` : `${depth * 16 + 16}px`,
        }}
      >
        <div
          className={`flex items-center gap-2.5 py-3 pr-4 ${
            isChapter ? 'border-b' : isSection ? 'border-b' : ''
          }`}
          style={{
            borderColor: isChapter ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
          }}
        >
          {/* Status icon */}
          <div className="shrink-0">
            {isChapter
              ? <BookOpen size={14} className="text-white/40" />
              : topicStatusIcon(status)
            }
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <p
              className={`leading-snug truncate ${
                isChapter  ? 'text-sm font-bold text-white/90' :
                isSection  ? 'text-sm font-semibold text-white/75' :
                             'text-xs text-white/60'
              }`}
            >
              {topic.title}
            </p>

            {/* Sub-meta */}
            {!isChapter && (
              <div className="flex items-center gap-2.5 mt-0.5">
                <span className="text-[10px] text-white/35 flex items-center gap-1">
                  <Clock size={9} />{topic.estimated_hours}h
                </span>
                <DifficultyStars value={topic.difficulty} />
              </div>
            )}
          </div>

          {/* Chapter meta / chevron */}
          {isChapter && (
            <div className="flex items-center gap-2 shrink-0">
              {topic.estimated_hours > 0 && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                >
                  <Clock size={9} />{topic.estimated_hours}h
                </span>
              )}
              <DifficultyStars value={topic.difficulty} />
              {hasChildren && (
                <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={15} className="text-white/40" />
                </motion.div>
              )}
              {!hasChildren && (
                <ChevronRight size={15} className="text-white/30" />
              )}
            </div>
          )}

          {/* Leaf status text */}
          {!isChapter && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: topicStatusColor(status), color: 'rgba(255,255,255,0.7)' }}
            >
              {status === 'complete' ? 'Done' : status === 'in_progress' ? 'Active' : status === 'available' ? 'Start' : 'Locked'}
            </span>
          )}
        </div>
      </button>

      {/* Children */}
      {hasChildren && (
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', marginLeft: `${depth * 16 + 28}px` }}
            >
              {topic.children.map(child => (
                <TopicRow
                  key={child.id}
                  topic={child}
                  progressMap={progressMap}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CurriculumDetailPage() {
  const { boardCode, subject } = useParams<{ boardCode: string; subject: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mountedRef = useRef(true);
  const toastCounter = useRef(0);

  const decodedSubject = subject ? decodeURIComponent(subject) : '';

  // ── State ──
  const [board,          setBoard]          = useState<ExamBoard | null>(null);
  const [curriculum,     setCurriculum]     = useState<Curriculum | null>(null);
  const [topics,         setTopics]         = useState<TopicNode[]>([]);
  const [progressMap,    setProgressMap]    = useState<Map<string, TopicProgress>>(new Map());
  const [enrolled,       setEnrolled]       = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const [loading,         setLoading]         = useState(true);
  const [enrolling,       setEnrolling]       = useState(false);
  const [completingId,    setCompletingId]    = useState<string | null>(null);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const [selectedTopic,  setSelectedTopic]  = useState<TopicNode | null>(null);
  const [toasts,         setToasts]         = useState<ToastState[]>([]);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Toast helpers ──
  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Flatten topic tree to list for progress lookup ──
  function flattenTopics(nodes: TopicNode[]): TopicNode[] {
    return nodes.flatMap(n => [n, ...flattenTopics(n.children ?? [])]);
  }

  // ── Load progress ──
  const loadProgress = useCallback(async (curriculumId: string) => {
    try {
      const { data } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'get_user_progress', curriculum_id: curriculumId },
      });
      if (!mountedRef.current) return;
      const progresses: TopicProgress[] = data?.progress ?? [];
      const map = new Map<string, TopicProgress>();
      for (const p of progresses) map.set(p.topic_id, p);
      setProgressMap(map);
      setEnrolled(true);
      setCompletedCount(progresses.filter(p => p.status === 'complete').length);
    } catch (err) {
      console.warn('[CurriculumDetail] loadProgress:', err);
    }
  }, []);

  // ── Main data load ──
  const loadData = useCallback(async () => {
    if (!boardCode || !decodedSubject) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Get board list and find the one matching boardCode
      const { data: boardData, error: boardErr } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'list_boards' },
      });
      if (boardErr) throw boardErr;
      const boards: ExamBoard[] = boardData?.boards ?? [];
      const foundBoard = boards.find(b => b.code === boardCode);
      if (!mountedRef.current) return;
      if (foundBoard) setBoard(foundBoard);

      // 2. Get or generate curriculum
      const { data: currData, error: currErr } = await supabase.functions.invoke('curriculum-builder', {
        body: {
          action: 'get_or_generate',
          exam_board_id: foundBoard?.id ?? boardCode,
          subject: decodedSubject,
        },
      });
      if (currErr) throw currErr;
      if (!mountedRef.current) return;

      const curr: Curriculum = currData?.curriculum ?? currData;
      const topicTree: TopicNode[] = currData?.topics ?? [];
      setCurriculum(curr);
      setTopics(topicTree);

      // 3. Check enrollment & load progress
      if (curr?.id && user) {
        await loadProgress(curr.id);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[CurriculumDetail] loadData:', err);
      setError('Failed to load curriculum. Check your connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [boardCode, decodedSubject, user, loadProgress]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Enroll ──
  const handleEnroll = useCallback(async () => {
    if (!curriculum || enrolling) return;
    setEnrolling(true);
    try {
      const { error: err } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'enroll', curriculum_id: curriculum.id },
      });
      if (err) throw err;
      if (!mountedRef.current) return;
      await loadProgress(curriculum.id);
      showToast('Enrolled! Start learning.', 'success');
    } catch (err) {
      console.error('[CurriculumDetail] enroll:', err);
      showToast('Failed to enroll. Try again.', 'error');
    } finally {
      if (mountedRef.current) setEnrolling(false);
    }
  }, [curriculum, enrolling, loadProgress, showToast]);

  // ── Complete topic ──
  const handleCompleteTopic = useCallback(async (topicId: string) => {
    setCompletingId(topicId);
    try {
      const { error: err } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'complete_topic', topic_id: topicId, mastery_score: 0.8 },
      });
      if (err) throw err;
      if (!mountedRef.current) return;
      // Optimistic update
      setProgressMap(prev => {
        const next = new Map(prev);
        next.set(topicId, { topic_id: topicId, status: 'complete', mastery_score: 0.8 });
        return next;
      });
      setCompletedCount(c => c + 1);
      setSelectedTopic(null);
      showToast('Topic marked complete!', 'success');
      if (curriculum) await loadProgress(curriculum.id);
    } catch (err) {
      console.error('[CurriculumDetail] completeTopic:', err);
      showToast('Failed to update. Try again.', 'error');
    } finally {
      if (mountedRef.current) setCompletingId(null);
    }
  }, [curriculum, loadProgress, showToast]);

  // ── Generate flashcards ──
  const handleGenerateCards = useCallback(async (topicId: string) => {
    setGeneratingCards(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('curriculum-builder', {
        body: { action: 'generate_sr_cards', topic_id: topicId, subject: decodedSubject },
      });
      if (err) throw err;
      if (!mountedRef.current) return;
      const count: number = data?.count ?? data?.cards?.length ?? 0;
      showToast(`${count} flashcard${count !== 1 ? 's' : ''} added to your review queue`, 'success');
      setSelectedTopic(null);
    } catch (err) {
      console.error('[CurriculumDetail] generateCards:', err);
      showToast('Failed to generate flashcards.', 'error');
    } finally {
      if (mountedRef.current) setGeneratingCards(false);
    }
  }, [decodedSubject, showToast]);

  // ── Derived ──
  const totalTopics   = curriculum?.topic_count ?? flattenTopics(topics).length;
  const progressRatio = totalTopics > 0 ? completedCount / totalTopics : 0;
  const isGenerating  = curriculum?.status === 'generating' || curriculum?.status === 'pending';

  const selectedProgress = selectedTopic
    ? (progressMap.get(selectedTopic.id) ?? { topic_id: selectedTopic.id, status: 'locked' as const, mastery_score: 0 })
    : null;

  // ── Skeleton ──
  function TopicSkeleton() {
    return (
      <div className="space-y-1 animate-pulse px-4 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1 h-3.5 rounded bg-white/10" style={{ width: `${65 + i * 7}%` }} />
            <div className="w-12 h-5 rounded-full bg-white/08" />
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'linear-gradient(160deg, #0F1221 0%, #161A30 60%, #0F1221 100%)' }}
    >
      {/* ── Toasts ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => dismissToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header ── */}
      <div
        className="shrink-0 px-4 pt-4 pb-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ArrowLeft size={17} className="text-white/80" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-xs font-mono mb-0.5">{boardCode}</p>
            <h1 className="font-bold text-white text-lg leading-tight truncate">{decodedSubject}</h1>
            {board && (
              <p className="text-white/50 text-xs mt-0.5 truncate">{board.name} · {board.level}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto pb-nav" style={{ scrollbarWidth: 'none' }}>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 px-4 py-3 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm flex-1">{error}</p>
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Generating banner */}
        {!loading && isGenerating && (
          <div className="mt-4">
            <GeneratingBanner />
          </div>
        )}

        {/* Enroll / Progress card */}
        {!loading && curriculum && (
          <div className="mx-4 mt-4">
            {!enrolled ? (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(91,106,245,0.15), rgba(139,92,246,0.12))',
                  border: '1px solid rgba(91,106,245,0.25)',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <BookOpen size={20} className="text-indigo-400" />
                  <div>
                    <p className="text-white font-semibold text-sm">Ready to start?</p>
                    <p className="text-white/50 text-xs">{totalTopics} topics to master</p>
                  </div>
                </div>
                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                >
                  {enrolling
                    ? <><div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> Enrolling…</>
                    : <><PlayCircle size={16} /> Enroll &amp; Start Learning</>
                  }
                </button>
              </div>
            ) : (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-white/80 text-sm font-semibold">Your Progress</p>
                  <span className="text-white/60 text-xs font-mono">
                    {completedCount}/{totalTopics} topics
                  </span>
                </div>
                <ProgressBar value={progressRatio} />
                <p className="text-white/40 text-xs mt-1.5">
                  {Math.round(progressRatio * 100)}% complete
                </p>
              </div>
            )}
          </div>
        )}

        {/* Status badge — ready */}
        {!loading && curriculum && !isGenerating && (
          <div className="flex items-center gap-2 mx-4 mt-3 mb-1">
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
            >
              <CheckCircle2 size={10} />
              Ready
            </span>
            {curriculum.topic_count > 0 && (
              <span className="text-white/30 text-xs">{curriculum.topic_count} topics</span>
            )}
          </div>
        )}

        {/* Topic tree */}
        <div className="mt-3">
          {loading ? (
            <TopicSkeleton />
          ) : topics.length > 0 ? (
            <div
              className="mx-4 rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {topics.map(chapter => (
                <TopicRow
                  key={chapter.id}
                  topic={chapter}
                  progressMap={progressMap}
                  onSelect={setSelectedTopic}
                  depth={0}
                />
              ))}
            </div>
          ) : !isGenerating && !loading && !error ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center py-16 px-4"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.25)' }}
              >
                <BookOpen size={24} style={{ color: '#818CF8' }} />
              </div>
              <p className="text-white/60 font-semibold text-sm">No topics yet</p>
              <p className="text-white/30 text-xs mt-1">
                {isGenerating ? 'Curriculum is generating…' : 'Check back soon'}
              </p>
            </motion.div>
          ) : null}
        </div>
      </div>

      {/* ── Topic Sheet ── */}
      <AnimatePresence>
        {selectedTopic && selectedProgress && (
          <TopicSheet
            topic={selectedTopic}
            status={selectedProgress.status}
            subject={decodedSubject}
            onClose={() => setSelectedTopic(null)}
            onComplete={handleCompleteTopic}
            onGenerateCards={handleGenerateCards}
            completing={completingId === selectedTopic.id}
            generatingCards={generatingCards}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
