// ═══════════════════════════════════════════════════════════════
// Edora — StreakChallengePage
// Personalised 7-day streak challenges based on weak areas.
// Route: /streaks
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Zap, ChevronRight, CheckCircle2,
  AlertCircle, X, ChevronDown, ChevronUp, Lightbulb, Plus, Flame, Scroll,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StreakDay {
  day_number: number;
  task_date: string;
}

interface StreakChallenge {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  daily_task: string;
  target_days: number;
  current_streak: number;
  longest_streak: number;
  daily_xp: number;
  bonus_xp: number;
  target_end_date: string;
  days: StreakDay[];
  completed_today: boolean;
}

interface TodayTask {
  task: string;
  hint: string;
  example_answer: string;
}

interface CompleteResult {
  day_number: number;
  current_streak: number;
  is_complete: boolean;
  xp_earned: number;
  days_remaining: number;
}

type Tab = 'active' | 'history';

const TARGET_DAYS_OPTIONS = [3, 7, 14, 21] as const;

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English',
  'Economics', 'Computer Science',
];

const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: '#5B6AF5', Physics: '#8B5CF6', Chemistry: '#EC4899',
  Biology: '#10B981', History: '#F59E0B', English: '#3B82F6',
  Economics: '#F97316', 'Computer Science': '#6366F1',
};

function getSubjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? '#5B6AF5';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function isDayCompleted(days: StreakDay[], dayNum: number): boolean {
  const today = todayIso();
  const day = days.find(d => d.day_number === dayNum);
  if (!day) return false;
  return day.task_date <= today;
}

function isDayToday(days: StreakDay[], dayNum: number): boolean {
  const today = todayIso();
  const day = days.find(d => d.day_number === dayNum);
  return day?.task_date === today;
}

// ── StreakDots ────────────────────────────────────────────────────────────────

function StreakDots({
  challenge,
}: {
  challenge: StreakChallenge;
}) {
  const color = getSubjectColor(challenge.subject);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: challenge.target_days }, (_, i) => {
        const dayNum = i + 1;
        const completed = isDayCompleted(challenge.days, dayNum);
        const isToday = isDayToday(challenge.days, dayNum);

        if (completed) {
          return (
            <motion.div
              key={dayNum}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: color }}
            >
              <span className="text-white text-xs font-bold">{dayNum}</span>
            </motion.div>
          );
        }

        if (isToday) {
          return (
            <motion.div
              key={dayNum}
              animate={{ boxShadow: [`0 0 0 0 ${color}55`, `0 0 0 6px ${color}00`] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
              style={{ borderColor: color, background: `${color}18` }}
            >
              <span className="text-xs font-bold" style={{ color }}>{dayNum}</span>
            </motion.div>
          );
        }

        return (
          <div
            key={dayNum}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ border: '1px solid var(--ink-120)', background: 'var(--ink-040)' }}
          >
            <span className="text-xs text-muted-foreground">{dayNum}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── GenerateSheet ─────────────────────────────────────────────────────────────

interface GenerateSheetProps {
  onClose: () => void;
  onGenerated: (challenge: StreakChallenge) => void;
}

function GenerateSheet({ onClose, onGenerated }: GenerateSheetProps) {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [targetDays, setTargetDays] = useState<7 | 3 | 14 | 21>(7);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const body: Record<string, unknown> = { action: 'generate', target_days: targetDays };
      if (subject) body.subject = subject;
      if (topic.trim()) body.topic = topic.trim();
      const { data, error: fnErr } = await supabase.functions.invoke('streak-challenges', { body });
      if (fnErr) throw new Error(fnErr.message);
      onGenerated(data.challenge as StreakChallenge);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate challenge');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="rounded-t-3xl px-4 pt-5 pb-8 flex flex-col gap-5"
        style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto -mt-1" style={{ background: 'var(--ink-200)' }} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-white text-lg">New Streak Challenge</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Novo will personalise it for you</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ink-080)', WebkitTapHighlightColor: 'transparent' }}>
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Subject grid */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Subject (optional)</p>
          <div className="grid grid-cols-3 gap-2">
            {SUBJECTS.map(s => (
              <button
                key={s}
                onClick={() => setSubject(prev => prev === s ? '' : s)}
                className="py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  background: subject === s ? `${getSubjectColor(s)}20` : 'var(--ink-040)',
                  borderColor: subject === s ? getSubjectColor(s) : 'var(--ink-080)',
                  color: subject === s ? getSubjectColor(s) : 'var(--ink-500)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Topic input */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Topic (optional)</p>
          <input
            type="text"
            placeholder="e.g. Algebra, World War II…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full rounded-2xl px-4 h-11 text-sm text-white placeholder:text-muted-foreground outline-none transition-colors"
            style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }}
          />
        </div>

        {/* Days selector */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Duration</p>
          <div className="flex gap-2">
            {TARGET_DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setTargetDays(d as 7 | 3 | 14 | 21)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  background: targetDays === d ? 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' : 'var(--ink-040)',
                  borderColor: targetDays === d ? '#5B6AF5' : 'var(--ink-080)',
                  color: targetDays === d ? '#fff' : 'var(--ink-500)',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Generate button */}
        <Button size="lg" onClick={handleGenerate} disabled={generating} className="w-full">
          {generating ? (
            <>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <Zap size={18} />
              </motion.span>
              Generating…
            </>
          ) : (
            <>Generate Challenge <Zap size={18} /></>
          )}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── TaskSheet ─────────────────────────────────────────────────────────────────

interface TaskSheetProps {
  challenge: StreakChallenge;
  onClose: () => void;
  onCompleted: (result: CompleteResult) => void;
}

function TaskSheet({ challenge, onClose, onCompleted }: TaskSheetProps) {
  const [todayTask, setTodayTask] = useState<TodayTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CompleteResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setTaskLoading(true);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('streak-challenges', {
          body: { action: 'get_today_task', challenge_id: challenge.id },
        });
        if (fnErr) throw new Error(fnErr.message);
        setTodayTask(data.task as TodayTask);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setTaskLoading(false);
      }
    })();
  }, [challenge.id]);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('streak-challenges', {
        body: { action: 'complete_day', challenge_id: challenge.id, answer },
      });
      if (fnErr) throw new Error(fnErr.message);
      const result = data as CompleteResult;
      setSuccess(result);
      setTimeout(() => {
        onCompleted(result);
      }, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  }

  const color = getSubjectColor(challenge.subject);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="rounded-t-3xl px-4 pt-5 pb-8 flex flex-col gap-4 max-h-[88vh] overflow-y-auto"
        style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto -mt-1 shrink-0" style={{ background: 'var(--ink-200)' }} />

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold flex items-center gap-1" style={{ color }}>
                <Flame size={14} style={{ color }} /> Day Task
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: `${color}15`, color }}>
                {challenge.subject}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{challenge.title}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--ink-080)', WebkitTapHighlightColor: 'transparent' }}>
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Success overlay */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], rotate: [0, -15, 15, 0] }}
                transition={{ duration: 0.7 }}
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
              >
                <Flame size={36} className="text-white" />
              </motion.div>
              <div className="text-center">
                <p className="font-heading font-bold text-white text-2xl">
                  {success.current_streak} day streak!
                </p>
                {success.is_complete ? (
                  <p className="text-sm font-semibold mt-1" style={{ color: '#34D399' }}>Challenge complete!</p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    {success.days_remaining} day{success.days_remaining !== 1 ? 's' : ''} remaining
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                <Zap size={15} className="text-white" />
                <span className="text-white font-bold text-sm">+{success.xp_earned} XP</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task content */}
        {!success && (
          <>
            {taskLoading ? (
              <div className="flex items-center justify-center py-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Zap size={24} className="text-primary" />
                </motion.div>
              </div>
            ) : todayTask ? (
              <>
                {/* Task */}
                <div className="rounded-2xl p-4"
                  style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Today's Task</p>
                  <p className="text-sm text-white font-medium leading-relaxed">{todayTask.task}</p>
                </div>

                {/* Hint toggle */}
                {todayTask.hint && (
                  <div>
                    <button
                      onClick={() => setShowHint(v => !v)}
                      className="flex items-center gap-2 text-sm font-semibold"
                      style={{ color: '#FBBF24', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Lightbulb size={15} />
                      {showHint ? 'Hide hint' : 'Show hint'}
                      {showHint ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <AnimatePresence>
                      {showHint && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 p-3.5 rounded-xl"
                            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                            <p className="text-sm" style={{ color: '#FBBF24' }}>{todayTask.hint}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Answer input */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Your Answer</p>
                  <textarea
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Write your response here…"
                    rows={4}
                    className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground resize-none outline-none transition-colors"
                    style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <AlertCircle size={15} className="text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!answer.trim() || submitting}
                  className="w-full"
                >
                  {submitting ? 'Submitting…' : `Submit & Earn ${challenge.daily_xp} XP`}
                  {!submitting && <Zap size={18} />}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertCircle size={15} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error || 'Could not load task'}</p>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Challenge Card ────────────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge: StreakChallenge;
  onOpenTask: (challenge: StreakChallenge) => void;
  onAbandon: (id: string) => void;
  index: number;
}

function ChallengeCard({ challenge, onOpenTask, onAbandon, index }: ChallengeCardProps) {
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const color = getSubjectColor(challenge.subject);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ delay: index * 0.06, duration: 0.28 }}
      className="rounded-3xl overflow-hidden"
      style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
    >
      {/* Color strip */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />

      <div className="p-4 flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-white text-sm leading-snug line-clamp-2">
              {challenge.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{challenge.description}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold shrink-0"
            style={{ background: `${color}15`, color }}>
            {challenge.subject}
          </span>
        </div>

        {/* Progress row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Flame size={16} style={{ color }} />
            <span className="font-heading font-bold text-white text-base">{challenge.current_streak}</span>
            <span className="text-xs text-muted-foreground">day streak</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${(challenge.current_streak / challenge.target_days) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground shrink-0">
            Day {challenge.current_streak}/{challenge.target_days}
          </span>
        </div>

        {/* Day dots */}
        <StreakDots challenge={challenge} />

        {/* CTA */}
        {challenge.completed_today ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <CheckCircle2 size={16} className="shrink-0" style={{ color: '#34D399' }} />
            <p className="text-sm font-semibold" style={{ color: '#34D399' }}>Come back tomorrow!</p>
          </div>
        ) : (
          <Button onClick={() => onOpenTask(challenge)} className="w-full">
            Complete Today's Task
            <ChevronRight size={16} />
          </Button>
        )}

        {/* XP info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            {challenge.daily_xp} XP/day
          </span>
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            +{challenge.bonus_xp} XP bonus
          </span>
        </div>

        {/* Abandon */}
        {!showAbandonConfirm ? (
          <button
            onClick={() => setShowAbandonConfirm(true)}
            className="text-xs text-muted-foreground underline text-center py-1"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Abandon challenge
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xs text-red-400 flex-1">Are you sure? Streak will be lost.</p>
            <button onClick={() => setShowAbandonConfirm(false)}
              className="text-xs text-muted-foreground px-2 py-1"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              Cancel
            </button>
            <button onClick={() => onAbandon(challenge.id)}
              className="text-xs text-red-600 font-semibold px-2 py-1"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              Abandon
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StreakChallengePage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('active');
  const [activeChallenges, setActiveChallenges] = useState<StreakChallenge[]>([]);
  const [historyChallenges, setHistoryChallenges] = useState<StreakChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateSheet, setShowGenerateSheet] = useState(false);
  const [taskChallenge, setTaskChallenge] = useState<StreakChallenge | null>(null);
  const [error, setError] = useState('');

  const loadCalled = useRef(false);

  useEffect(() => {
    if (loadCalled.current) return;
    loadCalled.current = true;
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [activeRes, historyRes] = await Promise.all([
        supabase.functions.invoke('streak-challenges', { body: { action: 'get_active' } }),
        supabase.functions.invoke('streak-challenges', { body: { action: 'list_history' } }),
      ]);
      if (activeRes.error) throw new Error(activeRes.error.message);
      setActiveChallenges((activeRes.data?.challenges ?? []) as StreakChallenge[]);
      if (!historyRes.error) {
        setHistoryChallenges((historyRes.data?.challenges ?? []) as StreakChallenge[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }

  function handleGenerated(challenge: StreakChallenge) {
    setActiveChallenges(prev => [challenge, ...prev]);
    setShowGenerateSheet(false);
  }

  async function handleAbandon(id: string) {
    try {
      await supabase.functions.invoke('streak-challenges', {
        body: { action: 'abandon', challenge_id: id },
      });
      const abandoned = activeChallenges.find(c => c.id === id);
      setActiveChallenges(prev => prev.filter(c => c.id !== id));
      if (abandoned) setHistoryChallenges(prev => [abandoned, ...prev]);
    } catch (err) {
      console.error('[StreakChallengePage] abandon:', err);
    }
  }

  function handleTaskCompleted(challengeId: string, result: CompleteResult) {
    setActiveChallenges(prev => prev.map(c => {
      if (c.id !== challengeId) return c;
      return {
        ...c,
        current_streak: result.current_streak,
        completed_today: true,
      };
    }));
    setTaskChallenge(null);
  }

  const maxActive = 3;
  const canGenerate = activeChallenges.length < maxActive && !loading;

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* Sticky header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-20"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <button aria-label="Go back"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-colors"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)', WebkitTapHighlightColor: 'transparent' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-white text-base leading-tight">Streak Challenges</h1>
          <p className="text-xs text-muted-foreground">Personalised by Novo</p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Flame size={18} style={{ color: '#F87171' }} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 pt-2 pb-0 flex gap-0 shrink-0"
        style={{ background: 'var(--hdr-a-880)', borderBottom: '1px solid var(--ink-060)' }}>
        {(['active', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-sm font-semibold capitalize relative transition-colors"
            style={{
              WebkitTapHighlightColor: 'transparent',
              color: tab === t ? '#5B6AF5' : 'hsl(var(--muted-foreground))',
            }}
          >
            {t}
            {tab === t && (
              <motion.div
                layoutId="streak-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: '#5B6AF5' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-4">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1].map(i => (
              <div key={i} className="rounded-3xl h-44 animate-pulse"
                style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }} />
            ))}
          </div>
        )}

        {/* Active tab */}
        {!loading && tab === 'active' && (
          <>
            {/* Generate button */}
            <Button
              onClick={() => setShowGenerateSheet(true)}
              disabled={!canGenerate}
              className="w-full"
              size="lg"
            >
              <Plus size={18} />
              Get New Challenge from Novo
              {!canGenerate && activeChallenges.length >= maxActive && (
                <span className="text-xs opacity-75 ml-1">(max {maxActive} active)</span>
              )}
            </Button>

            {/* Active challenges */}
            <AnimatePresence mode="popLayout">
              {activeChallenges.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-3 py-12 text-center"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <Flame size={28} style={{ color: '#F87171' }} />
                  </div>
                  <p className="font-heading font-bold text-white text-lg">No active streaks</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Generate a personalised challenge and build a daily habit!
                  </p>
                </motion.div>
              ) : (
                activeChallenges.map((ch, i) => (
                  <ChallengeCard
                    key={ch.id}
                    challenge={ch}
                    index={i}
                    onOpenTask={setTaskChallenge}
                    onAbandon={handleAbandon}
                  />
                ))
              )}
            </AnimatePresence>
          </>
        )}

        {/* History tab */}
        {!loading && tab === 'history' && (
          <AnimatePresence mode="popLayout">
            {historyChallenges.length === 0 ? (
              <motion.div
                key="history-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-12 text-center"
              >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-100)' }}>
                    <Scroll size={28} style={{ color: 'var(--ink-400)' }} />
                  </div>
                <p className="font-heading font-bold text-white text-lg">No history yet</p>
                <p className="text-sm text-muted-foreground">
                  Complete or abandon a challenge to see it here.
                </p>
              </motion.div>
            ) : (
              historyChallenges.map((ch, i) => {
                const color = getSubjectColor(ch.subject);
                return (
                  <motion.div
                    key={ch.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl p-4 flex gap-3"
                    style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}
                  >
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Flame size={18} style={{ color: '#F87171' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{ch.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold" style={{ color }}>{ch.subject}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {ch.current_streak}/{ch.target_days} days
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-bold"
                        style={{ color: ch.current_streak >= ch.target_days ? '#10B981' : '#9CA3AF' }}>
                        {ch.current_streak >= ch.target_days ? 'Complete' : 'Abandoned'}
                      </span>
                      {ch.current_streak >= ch.target_days && (
                        <span className="text-xs flex items-center gap-0.5" style={{ color: '#FBBF24' }}>
                          <Zap size={10} />+{ch.bonus_xp} XP
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {showGenerateSheet && (
          <GenerateSheet
            key="generate-sheet"
            onClose={() => setShowGenerateSheet(false)}
            onGenerated={handleGenerated}
          />
        )}
        {taskChallenge && (
          <TaskSheet
            key={`task-sheet-${taskChallenge.id}`}
            challenge={taskChallenge}
            onClose={() => setTaskChallenge(null)}
            onCompleted={result => handleTaskCompleted(taskChallenge.id, result)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
