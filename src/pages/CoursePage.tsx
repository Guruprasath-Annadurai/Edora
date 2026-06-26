// ─────────────────────────────────────────────────────────────────────────────
// Edora v3.5.0 — CoursePage
// Subject → Chapter → Lesson hierarchy with progress tracking
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, CheckCircle, Lock, BookOpen, Clock,
  Star, Trophy, Zap, Target, ChevronRight, PlayCircle,
  RotateCcw, ArrowRight, Lightbulb, GraduationCap,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { SyncQueue } from '@/lib/syncQueue';
import { PageErrorState } from '@/components/ui/PageErrorState';
import { ListPageSkeleton } from '@/components/ui/skeleton';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  COURSES, getSubject, getChapter,
  type Subject, type Chapter, type Lesson, LESSON_TYPE_META,
} from '@/data/courseData';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'classes' | 'subjects' | 'chapters' | 'lessons' | 'lesson';

interface LessonProgress {
  lesson_id: string;
  completed: boolean;
  xp_earned: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useLessonProgress(userId: string | undefined) {
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setError(false);
    try {
      const { data, error: dbErr } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed, xp_earned')
        .eq('user_id', userId);
      if (dbErr) throw dbErr;
      if (data) {
        const map: Record<string, LessonProgress> = {};
        data.forEach(r => { map[r.lesson_id] = r; });
        setProgress(map);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const markComplete = useCallback(async (lessonId: string, xp: number) => {
    if (!userId) return;
    const completedAt = new Date().toISOString();

    // Optimistic update first — UI responds instantly
    setProgress(prev => ({ ...prev, [lessonId]: { lesson_id: lessonId, completed: true, xp_earned: xp } }));

    // Write-ahead to sync queue so progress survives network failure
    await SyncQueue.enqueue({ type: 'lesson_complete', payload: { user_id: userId, lesson_id: lessonId, xp_earned: xp, completed_at: completedAt } });
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: userId, amount: xp, reason: `lesson:${lessonId}` } });

    // Attempt live write; SyncQueue handles failure
    const { error } = await supabase.from('lesson_progress').upsert(
      { user_id: userId, lesson_id: lessonId, completed: true, xp_earned: xp, completed_at: completedAt },
      { onConflict: 'user_id,lesson_id' }
    );
    if (!error) {
      SyncQueue.flush().catch(console.warn);
    }
  }, [userId]);

  return { progress, loading, error, markComplete, reload: load };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ClassSelector({ onSelect }: { onSelect: (classNum: number) => void }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <GraduationCap size={20} className="text-white" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-bold text-white">My Courses</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Select your class to begin</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {COURSES.map((c, i) => (
          <motion.button
            key={c.classNum}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onSelect(c.classNum)}
            className="relative p-4 rounded-3xl text-left overflow-hidden"
            style={{
              background: 'rgba(15,17,23,0.7)',
              border: '1.5px solid rgba(255,255,255,0.07)',
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(91,106,245,0.15), transparent 70%)', transform: 'translate(30%, -30%)' }} />
            <span className="text-2xl mb-2 block">{c.classNum >= 11 ? '🎯' : '📗'}</span>
            <p className="font-heading font-bold text-white text-sm leading-tight">{c.label}</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {c.subjects.length} subjects
            </p>
            <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)', position: 'absolute', right: 12, bottom: 16 }} />
          </motion.button>
        ))}
      </div>

      {/* Radtech banner */}
      <div className="mt-2 rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(91,106,245,0.15)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(91,106,245,0.2)' }}>
          <Star size={14} style={{ color: '#A0AEFF' }} />
        </div>
        <div>
          <p className="text-xs font-semibold" style={{ color: '#A0AEFF' }}>Free for Everyone</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>NCERT-aligned · Classes 9–12</p>
        </div>
      </div>
    </div>
  );
}

function SubjectGrid({
  classNum, subjects, progress, onSelect,
}: {
  classNum: number;
  subjects: Subject[];
  progress: Record<string, LessonProgress>;
  onSelect: (subject: Subject) => void;
}) {
  function completedFor(subject: Subject) {
    let total = 0, done = 0;
    subject.chapters.forEach(ch => ch.lessons.forEach(l => {
      total++;
      if (progress[l.id]?.completed) done++;
    }));
    return { total, done };
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4 pt-2">
      {subjects.map((s, i) => {
        const { total, done } = completedFor(s);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onSelect(s)}
            className="relative p-4 rounded-3xl text-left overflow-hidden"
            style={{
              background: 'rgba(15,17,23,0.7)',
              border: `1.5px solid ${pct > 0 ? s.color + '30' : 'rgba(255,255,255,0.07)'}`,
            }}
            whileTap={{ scale: 0.96 }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 80% 20%, ${s.glowColor}, transparent 65%)` }} />
            <span className="text-3xl mb-3 block">{s.emoji}</span>
            <p className="font-heading font-bold text-white text-sm">{s.name}</p>
            <p className="text-xs mt-0.5 mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {s.chapters.length} chapters
            </p>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: s.color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.06 + 0.2, ease: 'easeOut' }}
              />
            </div>
            <p className="text-xs mt-1.5 font-semibold" style={{ color: s.color }}>
              {pct > 0 ? `${pct}% complete` : 'Not started'}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
}

function ChapterList({
  subject, progress, onSelect,
}: {
  subject: Subject;
  progress: Record<string, LessonProgress>;
  onSelect: (chapter: Chapter) => void;
}) {
  function chapterStats(ch: Chapter) {
    const total = ch.lessons.length;
    const done = ch.lessons.filter(l => progress[l.id]?.completed).length;
    return { total, done, pct: Math.round((done / total) * 100) };
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-2">
      {subject.chapters.map((ch, i) => {
        const { total, done, pct } = chapterStats(ch);
        const isComplete = done === total;
        const isStarted = done > 0;
        return (
          <motion.button
            key={ch.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onSelect(ch)}
            className="w-full p-4 rounded-3xl text-left relative overflow-hidden"
            style={{
              background: isComplete
                ? `linear-gradient(135deg, ${subject.color}18, ${subject.color}08)`
                : 'rgba(15,17,23,0.7)',
              border: isComplete
                ? `1.5px solid ${subject.color}40`
                : isStarted
                  ? `1.5px solid ${subject.color}20`
                  : '1.5px solid rgba(255,255,255,0.07)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-start gap-3">
              {/* Chapter number badge */}
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: isComplete ? subject.color : subject.iconBg,
                  border: `1px solid ${subject.color}30`,
                }}>
                {isComplete
                  ? <CheckCircle size={18} className="text-white" />
                  : <span className="text-xs font-bold" style={{ color: subject.color }}>{ch.num}</span>
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-heading font-semibold text-white text-sm leading-tight pr-6">{ch.title}</p>
                  <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                </div>
                <p className="text-xs mt-1 line-clamp-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{ch.description}</p>

                {/* Progress row */}
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: subject.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 + 0.15, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-xs font-medium flex-shrink-0" style={{ color: isStarted ? subject.color : 'rgba(255,255,255,0.2)' }}>
                    {done}/{total}
                  </span>
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function LessonList({
  chapter, subject, progress, onSelect,
}: {
  chapter: Chapter;
  subject: Subject;
  progress: Record<string, LessonProgress>;
  onSelect: (lesson: Lesson, index: number) => void;
}) {
  function isUnlocked(index: number): boolean {
    if (index === 0) return true;
    return !!progress[chapter.lessons[index - 1].id]?.completed;
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
      {/* Chapter header card */}
      <div className="p-4 rounded-3xl mb-1"
        style={{ background: `linear-gradient(135deg, ${subject.color}18, ${subject.color}06)`, border: `1px solid ${subject.color}25` }}>
        <p className="text-xs font-semibold mb-0.5" style={{ color: subject.color }}>Chapter {chapter.num}</p>
        <h3 className="font-heading font-bold text-white text-base leading-tight">{chapter.title}</h3>
        <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{chapter.description}</p>
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <BookOpen size={12} /> {chapter.lessons.length} lessons
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Clock size={12} /> {chapter.lessons.reduce((a, l) => a + l.duration, 0)} min
          </span>
        </div>
      </div>

      {chapter.lessons.map((lesson, i) => {
        const isDone = !!progress[lesson.id]?.completed;
        const unlocked = isUnlocked(i);
        const meta = LESSON_TYPE_META[lesson.type];
        return (
          <motion.button
            key={lesson.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => unlocked && onSelect(lesson, i)}
            className="w-full p-4 rounded-3xl text-left relative"
            style={{
              background: isDone
                ? `linear-gradient(135deg, ${subject.color}14, ${subject.color}06)`
                : 'rgba(15,17,23,0.7)',
              border: isDone
                ? `1.5px solid ${subject.color}35`
                : '1.5px solid rgba(255,255,255,0.07)',
              opacity: unlocked ? 1 : 0.5,
            }}
            whileTap={unlocked ? { scale: 0.97 } : {}}
          >
            <div className="flex items-center gap-3">
              {/* Status icon */}
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: isDone ? subject.color : unlocked ? subject.iconBg : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isDone ? 'transparent' : subject.color + '25'}`,
                }}>
                {isDone
                  ? <CheckCircle size={20} className="text-white" />
                  : unlocked
                    ? <PlayCircle size={20} style={{ color: subject.color }} />
                    : <Lock size={16} style={{ color: 'rgba(255,255,255,0.2)' }} />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {/* Lesson type badge */}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                  {isDone && <span className="text-xs font-semibold" style={{ color: '#FBBF24' }}>+{lesson.duration * 2} XP</span>}
                </div>
                <p className="font-heading font-semibold text-sm text-white leading-tight">{lesson.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <Clock size={10} /> {lesson.duration} min
                  </span>
                  {!unlocked && (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      Complete lesson {i} to unlock
                    </span>
                  )}
                </div>
              </div>

              {unlocked && !isDone && (
                <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function LessonViewer({
  lesson, subject, chapter, isComplete, onComplete, onBack,
}: {
  lesson: Lesson;
  subject: Subject;
  chapter: Chapter;
  isComplete: boolean;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const meta = LESSON_TYPE_META[lesson.type];

  async function handleComplete() {
    if (isComplete || completing) return;
    setCompleting(true);
    await onComplete();
    setShowSuccess(true);
    setCompleting(false);
  }

  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full px-8 text-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
          style={{ background: `radial-gradient(circle, ${subject.color}30, ${subject.color}10)`, border: `2px solid ${subject.color}50` }}
        >
          <Trophy size={40} style={{ color: subject.color }} />
        </motion.div>
        <h2 className="font-heading text-2xl font-bold text-white mb-2">Lesson Complete!</h2>
        <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{lesson.title}</p>
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl mb-8"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <Zap size={16} style={{ color: '#FBBF24' }} />
          <span className="text-sm font-bold" style={{ color: '#FBBF24' }}>+{lesson.duration * 2} XP earned</span>
        </div>
        <button
          onClick={onBack}
          className="w-full py-4 rounded-2xl font-heading font-semibold text-white"
          style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}CC)` }}
        >
          Continue Learning
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Lesson header */}
      <div className="px-4 pt-2 pb-4 flex-shrink-0"
        style={{ background: `linear-gradient(180deg, ${subject.color}15 0%, transparent 100%)` }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
          <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <Clock size={10} /> {lesson.duration} min
          </span>
          {isComplete && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#4ADE80' }}>
              <CheckCircle size={10} /> Done
            </span>
          )}
        </div>
        <h1 className="font-heading text-xl font-bold text-white leading-tight">{lesson.title}</h1>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {subject.name} · Chapter {chapter.num}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 space-y-4 pb-6">
        {/* Summary */}
        <div className="p-4 rounded-3xl" style={{ background: 'rgba(15,17,23,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: subject.color }}>Summary</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>{lesson.summary}</p>
        </div>

        {/* Key Points */}
        <div className="p-4 rounded-3xl" style={{ background: 'rgba(15,17,23,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: subject.color }}>Key Points</h3>
          <div className="space-y-2.5">
            {lesson.keyPoints.map((pt, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 + 0.1 }}
                className="flex items-start gap-2.5"
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: subject.iconBg, border: `1px solid ${subject.color}30` }}>
                  <span className="text-xs font-bold" style={{ color: subject.color }}>{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{pt}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Exam Tip */}
        {lesson.examTip && (
          <motion.div
            className="p-4 rounded-3xl cursor-pointer"
            style={{
              background: showTip ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.04)',
              border: `1px solid ${showTip ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.12)'}`,
            }}
            onClick={() => setShowTip(v => !v)}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Target size={14} style={{ color: '#FBBF24' }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#FBBF24' }}>
                Exam Tip {showTip ? '▲' : '▼ (tap to reveal)'}
              </h3>
            </div>
            <AnimatePresence>
              {showTip && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm leading-relaxed"
                  style={{ color: 'rgba(251,191,36,0.9)' }}
                >
                  {lesson.examTip}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Lightbulb tip for practice */}
        {lesson.type === 'practice' && (
          <div className="p-4 rounded-3xl flex items-start gap-3"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
            <Lightbulb size={16} style={{ color: '#60A5FA', flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              This is a practice session. Work through each point carefully, attempt the questions on paper, then verify. Rushed practice builds false confidence.
            </p>
          </div>
        )}
      </div>

      {/* Complete button */}
      <div className="px-4 pb-6 pt-2 flex-shrink-0">
        <motion.button
          onClick={handleComplete}
          disabled={completing}
          className="w-full py-4 rounded-2xl font-heading font-semibold text-white flex items-center justify-center gap-2"
          style={{
            background: isComplete
              ? 'rgba(74,222,128,0.15)'
              : `linear-gradient(135deg, ${subject.color}, ${subject.color}CC)`,
            border: isComplete ? '1.5px solid rgba(74,222,128,0.3)' : 'none',
          }}
          whileTap={{ scale: 0.97 }}
        >
          {isComplete ? (
            <>
              <CheckCircle size={18} style={{ color: '#4ADE80' }} />
              <span style={{ color: '#4ADE80' }}>Completed</span>
            </>
          ) : completing ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <>
              <span>Mark as Complete</span>
              <ArrowRight size={16} />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

// ── Page header ────────────────────────────────────────────────────────────────

function PageHeader({
  phase, classNum, subject, chapter,
  onBackClass, onBackSubject, onBackChapter,
}: {
  phase: Phase;
  classNum: number;
  subject: Subject | null;
  chapter: Chapter | null;
  onBackClass: () => void;
  onBackSubject: () => void;
  onBackChapter: () => void;
}) {
  const navigate = useNavigate();

  function handleBack() {
    if (phase === 'classes') { navigate(-1); return; }
    if (phase === 'subjects') { onBackClass(); return; }
    if (phase === 'chapters') { onBackSubject(); return; }
    if (phase === 'lessons')  { onBackChapter(); return; }
    if (phase === 'lesson')   { onBackChapter(); return; }
  }

  function title() {
    if (phase === 'classes') return 'Courses';
    if (phase === 'subjects') return `Class ${classNum}`;
    if (phase === 'chapters') return subject?.name ?? 'Chapters';
    if (phase === 'lessons' || phase === 'lesson') return chapter?.title ?? 'Lessons';
    return 'Courses';
  }

  function subtitle() {
    if (phase === 'subjects') return 'Select a subject';
    if (phase === 'chapters') return `${subject?.emoji ?? ''} ${subject?.chapters.length} chapters`;
    if (phase === 'lessons') return `Chapter ${chapter?.num} · ${chapter?.lessons.length} lessons`;
    return '';
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.button
        onClick={handleBack}
        className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        whileTap={{ scale: 0.9 }}
      >
        <ChevronLeft size={18} className="text-white" />
      </motion.button>

      <div className="flex-1 min-w-0">
        <h1 className="font-heading font-bold text-white text-base leading-tight truncate">{title()}</h1>
        {subtitle() && (
          <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{subtitle()}</p>
        )}
      </div>

      {(phase === 'subjects' || phase === 'chapters') && subject && (
        <span className="text-xl flex-shrink-0">{subject.emoji}</span>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CoursePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [phase, setPhase] = useState<Phase>('classes');
  const [classNum, setClassNum] = useState<number>(10);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  const isOnline = useOnlineStatus();
  const { progress, loading: progressLoading, error: progressError, markComplete, reload: reloadProgress } = useLessonProgress(user?.id);

  // Restore state from URL params (deep link support)
  useEffect(() => {
    const cl = searchParams.get('class');
    const sub = searchParams.get('subject');
    const ch = searchParams.get('chapter');
    if (cl) {
      const cn = Number(cl);
      setClassNum(cn);
      if (sub) {
        const s = getSubject(cn, sub);
        if (s) {
          setActiveSubject(s);
          setPhase('chapters');
          if (ch) {
            const c = getChapter(cn, sub, ch);
            if (c) {
              setActiveChapter(c);
              setPhase('lessons');
            }
          } else {
            setPhase('chapters');
          }
        }
      } else {
        setPhase('subjects');
      }
    }
  }, []);

  function selectClass(cn: number) {
    setClassNum(cn);
    setPhase('subjects');
    setSearchParams({ class: String(cn) });
  }

  function selectSubject(s: Subject) {
    setActiveSubject(s);
    setPhase('chapters');
    setSearchParams({ class: String(classNum), subject: s.id });
  }

  function selectChapter(ch: Chapter) {
    setActiveChapter(ch);
    setPhase('lessons');
    setSearchParams({ class: String(classNum), subject: activeSubject!.id, chapter: ch.id });
  }

  function selectLesson(lesson: Lesson) {
    setActiveLesson(lesson);
    setPhase('lesson');
  }

  function backToClasses() {
    setPhase('classes');
    setActiveSubject(null);
    setActiveChapter(null);
    setActiveLesson(null);
    setSearchParams({});
  }

  function backToSubjects() {
    setPhase('subjects');
    setActiveChapter(null);
    setActiveLesson(null);
    setSearchParams({ class: String(classNum) });
  }

  function backToChapters() {
    setPhase('chapters');
    setActiveLesson(null);
    setSearchParams({ class: String(classNum), subject: activeSubject!.id });
  }

  async function handleLessonComplete() {
    if (!activeLesson) return;
    const xp = activeLesson.duration * 2;
    await markComplete(activeLesson.id, xp);
  }

  const currentClass = COURSES.find(c => c.classNum === classNum);

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ background: 'transparent' }}>

      <PageHeader
        phase={phase}
        classNum={classNum}
        subject={activeSubject}
        chapter={activeChapter}
        onBackClass={backToClasses}
        onBackSubject={backToSubjects}
        onBackChapter={backToChapters}
      />

      <div className="flex-1 overflow-y-auto pb-nav">
        {progressLoading ? (
          <ListPageSkeleton count={5} />
        ) : progressError ? (
          <PageErrorState
            offline={!isOnline}
            message={!isOnline ? 'Your progress will load once you\'re back online.' : 'Couldn\'t load your progress. Tap to retry.'}
            onRetry={reloadProgress}
          />
        ) : (
        <AnimatePresence mode="wait">
          {phase === 'classes' && (
            <motion.div key="classes"
              initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
              <ClassSelector onSelect={selectClass} />
            </motion.div>
          )}

          {phase === 'subjects' && currentClass && (
            <motion.div key="subjects"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
              <SubjectGrid
                classNum={classNum}
                subjects={currentClass.subjects}
                progress={progress}
                onSelect={selectSubject}
              />
            </motion.div>
          )}

          {phase === 'chapters' && activeSubject && (
            <motion.div key="chapters"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
              <ChapterList
                subject={activeSubject}
                progress={progress}
                onSelect={selectChapter}
              />
            </motion.div>
          )}

          {phase === 'lessons' && activeChapter && activeSubject && (
            <motion.div key="lessons"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
              <LessonList
                chapter={activeChapter}
                subject={activeSubject}
                progress={progress}
                onSelect={selectLesson}
              />
            </motion.div>
          )}

          {phase === 'lesson' && activeLesson && activeSubject && activeChapter && (
            <motion.div key={activeLesson.id}
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
              className="h-full">
              <LessonViewer
                lesson={activeLesson}
                subject={activeSubject}
                chapter={activeChapter}
                isComplete={!!progress[activeLesson.id]?.completed}
                onComplete={handleLessonComplete}
                onBack={backToChapters}
              />
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}
