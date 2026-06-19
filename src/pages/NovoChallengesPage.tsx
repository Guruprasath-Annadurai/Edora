// ═══════════════════════════════════════════════════════════════
// Edora — NovoChallengesPage
// Daily boss-level problems: one per subject per day. Timed. 2× XP.
// Route: /challenges
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Zap, Clock, Lightbulb,
  Trophy, RotateCcw, ChevronDown, ChevronUp, AlertCircle,
  Calculator, FlaskConical, Leaf, BookOpen, BookText, BarChart3, Code,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Challenge {
  id: string;
  subject: string;
  topic: string;
  problem: string;
  hints: string[];
  xp_reward: number;
  xp_multiplier: number;
  time_limit_secs: number;
  answer_type: 'mcq' | 'text';
  options?: string[];
}

interface Attempt {
  status: string;
  score: number;
  xp_earned: number;
  answer: string;
}

interface Result {
  score: number;
  xp_earned: number;
  feedback: string;
  correct_answer: string;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  time_taken_secs: number;
  xp_earned: number;
  is_me: boolean;
}

interface HistoryEntry {
  id: string;
  challenge_date: string;
  subject: string;
  score: number;
  xp_earned: number;
  status: string;
  daily_challenges: { topic: string; xp_multiplier: number };
}

type Screen = 'picker' | 'challenge' | 'results';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English',
  'Economics', 'Computer Science',
];

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Mathematics: Calculator, Physics: Zap, Chemistry: FlaskConical, Biology: Leaf,
  History: BookOpen, English: BookText, Economics: BarChart3, 'Computer Science': Code,
};

function getSubjectIcon(subject: string): LucideIcon {
  return SUBJECT_ICONS[subject] ?? BookOpen;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function msToMidnight(): { hours: number; minutes: number } {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function MedalBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm font-bold" style={{ color: '#F59E0B' }}>1st</span>;
  if (rank === 2) return <span className="text-sm font-bold" style={{ color: '#94A3B8' }}>2nd</span>;
  if (rank === 3) return <span className="text-sm font-bold" style={{ color: '#CD7F32' }}>3rd</span>;
  return <span className="text-xs font-bold text-muted-foreground">#{rank}</span>;
}

// ── ScoreCircle ───────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const color = scoreColor(score);

  return (
    <div className="relative w-36 h-36 flex items-center justify-center mx-auto">
      <svg className="w-36 h-36 -rotate-90 absolute inset-0">
        <circle cx="72" cy="72" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
        <motion.circle
          cx="72" cy="72" r={radius}
          stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <motion.div
        className="flex flex-col items-center justify-center z-10"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
      >
        <span className="font-heading text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NovoChallengesPage() {
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>('picker');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answer, setAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [timerActive, setTimerActive] = useState(false);
  const [hintsUsed, setHintsUsed] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [countdown, setCountdown] = useState(msToMidnight());

  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const challengeRef = useRef<Challenge | null>(null);
  const answerRef = useRef('');
  const selectedOptionRef = useRef<number | null>(null);

  // Keep refs in sync for stale-closure safety
  useEffect(() => { challengeRef.current = challenge; }, [challenge]);
  useEffect(() => { answerRef.current = answer; }, [answer]);
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);

  // Midnight countdown ticker
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(msToMidnight()), 60_000);
    return () => clearInterval(countdownRef.current);
  }, []);

  // Timer
  const handleTimerExpire = useCallback(async () => {
    const ch = challengeRef.current;
    if (!ch) return;
    const ans = answerRef.current ||
      (selectedOptionRef.current !== null
        ? ch.options?.[selectedOptionRef.current] ?? String(selectedOptionRef.current)
        : '');
    if (!ans) return;
    await doSubmit(ch, ans, ch.time_limit_secs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimerExpireRef = useRef(handleTimerExpire);
  useEffect(() => { handleTimerExpireRef.current = handleTimerExpire; }, [handleTimerExpire]);

  useEffect(() => {
    if (!timerActive) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          setTimerActive(false);
          handleTimerExpireRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timerActive]);

  // Load history on mount
  useEffect(() => {
    (async () => {
      const { data, error: fnErr } = await supabase.functions.invoke('novo-challenges', {
        body: { action: 'get_history' },
      });
      if (!fnErr && data?.history) setHistory((data.history as HistoryEntry[]).slice(0, 5));
    })();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleSelectSubject(subject: string) {
    setSelectedSubject(subject);
    setLoading(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('novo-challenges', {
        body: { action: 'get_today', subject },
      });
      if (fnErr) throw new Error(fnErr.message);
      const ch = data.challenge as Challenge;
      setChallenge(ch);
      const att = (data.attempt ?? null) as Attempt | null;
      setAttempt(att);
      setTimeLeft(ch.time_limit_secs ?? 300);
      if (att) {
        setResult({ score: att.score, xp_earned: att.xp_earned, feedback: '', correct_answer: '' });
        await loadLeaderboard(ch.id);
        setScreen('results');
      } else {
        setScreen('challenge');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenge');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartChallenge() {
    if (!challenge) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase.functions.invoke('novo-challenges', {
        body: { action: 'start_attempt', challenge_id: challenge.id, challenge_date: today, subject: selectedSubject },
      });
    } catch (err) {
      console.error('[NovoChallengesPage] start_attempt:', err);
    } finally {
      setLoading(false);
      setTimerActive(true);
    }
  }

  async function handleGetHint() {
    if (!challenge) return;
    const hintIndex = hintsUsed.length;
    if (hintIndex >= (challenge.hints?.length ?? 3)) return;
    setLoadingHint(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('novo-challenges', {
        body: { action: 'get_hint', challenge_id: challenge.id, hint_index: hintIndex },
      });
      if (fnErr) throw new Error(fnErr.message);
      setHintsUsed(prev => [...prev, data.hint as string]);
    } catch (err) {
      console.error('[NovoChallengesPage] get_hint:', err);
    } finally {
      setLoadingHint(false);
    }
  }

  async function handleSubmit() {
    if (!challenge) return;
    const ans = challenge.answer_type === 'mcq'
      ? (selectedOption !== null ? challenge.options?.[selectedOption] ?? String(selectedOption) : '')
      : answer;
    if (!ans.trim()) return;
    const timeTaken = challenge.time_limit_secs - timeLeft;
    setTimerActive(false);
    await doSubmit(challenge, ans, timeTaken);
  }

  async function doSubmit(ch: Challenge, ans: string, timeTaken: number) {
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('novo-challenges', {
        body: { action: 'submit_answer', challenge_id: ch.id, answer: ans, time_taken_secs: timeTaken },
      });
      if (fnErr) throw new Error(fnErr.message);
      setResult(data as Result);
      await loadLeaderboard(ch.id);
      setScreen('results');
    } catch (err) {
      console.error('[NovoChallengesPage] submit_answer:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadLeaderboard(challengeId: string) {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('novo-challenges', {
        body: { action: 'get_leaderboard', challenge_id: challengeId },
      });
      if (!fnErr && data?.leaderboard) setLeaderboard(data.leaderboard as LeaderboardEntry[]);
    } catch (err) {
      console.error('[NovoChallengesPage] leaderboard:', err);
    }
  }

  function resetToSubjectPicker() {
    setScreen('picker');
    setSelectedSubject('');
    setChallenge(null);
    setAttempt(null);
    setAnswer('');
    setSelectedOption(null);
    setHintsUsed([]);
    setResult(null);
    setLeaderboard([]);
    setTimerActive(false);
    clearInterval(intervalRef.current);
    setShowLeaderboard(false);
    setShowCorrectAnswer(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 120 ? '#F59E0B' : '#10B981';
  const timerPct = challenge ? (timeLeft / challenge.time_limit_secs) * 100 : 100;
  const canSubmit = challenge?.answer_type === 'mcq' ? selectedOption !== null : answer.trim().length > 0;
  const maxHints = challenge?.hints?.length ?? 3;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* Sticky header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-20"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <button
          onClick={() => screen !== 'picker' ? resetToSubjectPicker() : navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', WebkitTapHighlightColor: 'transparent' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-white text-base leading-tight">Boss Challenges</h1>
          <p className="text-xs text-muted-foreground">Daily · 2× XP Multiplier</p>
        </div>
        <motion.div
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))', border: '1px solid rgba(245,158,11,0.35)' }}
        >
          <Zap size={13} className="text-amber-500" />
          <span className="text-xs font-bold text-amber-400">2× XP</span>
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll pb-nav">
        <AnimatePresence mode="wait">

          {/* ═══════════ SCREEN 1: Subject Picker ═══════════ */}
          {screen === 'picker' && (
            <motion.div key="picker"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="px-4 py-4 flex flex-col gap-5">

              {/* Daily reset countdown */}
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #5B6AF522, #8B5CF622)' }}>
                  <Clock size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Daily reset in</p>
                  <p className="font-heading font-bold text-white">
                    {countdown.hours}h {countdown.minutes}m
                  </p>
                </div>
                <span className="text-xs bg-primary/8 text-primary px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: 'rgba(91,106,245,0.08)' }}>
                  New daily
                </span>
              </div>

              {/* Subject grid */}
              <div>
                <p className="text-sm font-semibold text-white mb-3">Choose a Subject</p>
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <Zap size={28} className="text-primary" />
                    </motion.div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {SUBJECTS.map(s => {
                      const SubjectIcon = getSubjectIcon(s);
                      return (
                        <motion.button key={s}
                          onClick={() => handleSelectSubject(s)}
                          whileTap={{ scale: 0.97 }}
                          className="p-4 rounded-2xl text-left flex items-center gap-3 transition-all"
                          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <SubjectIcon size={20} className="text-primary shrink-0" />
                          <span className="text-sm font-semibold text-white leading-snug">{s}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Recent history */}
              {history.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white mb-2.5">Recent Challenges</p>
                  <div className="rounded-2xl p-4 flex flex-col gap-3"
                    style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {history.map(h => {
                      const HistoryIcon = getSubjectIcon(h.subject);
                      return (
                        <div key={h.id} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(91,106,245,0.15)' }}>
                            <HistoryIcon size={17} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{h.subject}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.challenge_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: `${scoreColor(h.score)}18`, color: scoreColor(h.score) }}>
                            {h.score}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════ SCREEN 2: Challenge ═══════════ */}
          {screen === 'challenge' && challenge && (
            <motion.div key="challenge"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              className="px-4 py-4 flex flex-col gap-4">

              {/* Hero badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                  <Zap size={13} className="text-white" />
                  <span className="text-white text-xs font-bold tracking-wide">Boss Challenge</span>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.07, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                  <Zap size={12} className="text-white" />
                  <span className="text-white text-xs font-bold">{challenge.xp_multiplier}× XP</span>
                </motion.div>
                <span className="text-xs px-2.5 py-1 rounded-full text-muted-foreground"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {selectedSubject} · {challenge.topic}
                </span>
              </div>

              {/* Timer bar */}
              <div className="rounded-2xl p-3.5"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Clock size={15} style={{ color: timerColor }} />
                    <span className="font-heading text-lg font-bold leading-none" style={{ color: timerColor }}>
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                  {!timerActive && !attempt && (
                    <Button size="sm" onClick={handleStartChallenge} disabled={loading}>
                      {loading ? 'Loading…' : 'Start Challenge'}
                    </Button>
                  )}
                  {timerActive && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: timerColor }} />
                      <span className="text-xs font-semibold" style={{ color: timerColor }}>Active</span>
                    </span>
                  )}
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <motion.div
                    className="h-full rounded-full transition-colors"
                    style={{ background: timerColor }}
                    animate={{ width: `${timerPct}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                  />
                </div>
              </div>

              {/* Problem statement */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex">
                  <div className="w-1 shrink-0" style={{ background: 'linear-gradient(180deg, #5B6AF5, #8B5CF6)' }} />
                  <div className="p-4 flex-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">Problem</p>
                    <p className="text-sm font-medium text-white/85 leading-relaxed">{challenge.problem}</p>
                  </div>
                </div>
              </div>

              {/* MCQ options */}
              {challenge.answer_type === 'mcq' && challenge.options && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Choose your answer</p>
                  {challenge.options.map((opt, i) => (
                    <motion.button
                      key={i}
                      onClick={() => timerActive && setSelectedOption(i)}
                      whileTap={{ scale: 0.98 }}
                      className="w-full text-left p-4 rounded-2xl border-2 transition-all text-sm font-medium"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        background: selectedOption === i
                          ? 'rgba(91,106,245,0.15)'
                          : 'rgba(15,20,45,0.7)',
                        borderColor: selectedOption === i ? '#5B6AF5' : 'rgba(255,255,255,0.08)',
                        color: '#FFFFFF',
                        opacity: timerActive ? 1 : 0.55,
                      }}
                    >
                      <span className="font-bold mr-2.5" style={{ color: selectedOption === i ? '#5B6AF5' : '#9CA3AF' }}>
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Text answer */}
              {challenge.answer_type === 'text' && (
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Your Answer</p>
                  <textarea
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    disabled={!timerActive}
                    placeholder={timerActive ? 'Type your answer here…' : 'Press "Start Challenge" to begin'}
                    rows={5}
                    className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 resize-none outline-none transition-colors disabled:opacity-55"
                    style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                </div>
              )}

              {/* Hints */}
              {timerActive && (
                <div className="flex flex-col gap-2.5">
                  <AnimatePresence>
                    {hintsUsed.map((hint, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-2.5 p-3.5 rounded-xl"
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        <Lightbulb size={15} className="text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">Hint {i + 1}</p>
                          <p className="text-sm text-amber-300">{hint}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {hintsUsed.length < maxHints && (
                    <button
                      onClick={handleGetHint}
                      disabled={loadingHint}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all active:scale-95 w-fit"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Lightbulb size={15} />
                      {loadingHint ? 'Getting hint…' : `Hint ${hintsUsed.length + 1} of ${maxHints}`}
                    </button>
                  )}
                </div>
              )}

              {/* Submit */}
              {timerActive && (
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="w-full"
                >
                  {submitting ? 'Submitting…' : 'Submit Answer'}
                  {!submitting && <Zap size={18} />}
                </Button>
              )}
            </motion.div>
          )}

          {/* ═══════════ SCREEN 3: Results ═══════════ */}
          {screen === 'results' && result && (
            <motion.div key="results"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="px-4 py-4 flex flex-col gap-4">

              {/* Score card */}
              <div className="rounded-3xl p-6 flex flex-col items-center gap-4"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Your Score</p>
                <ScoreCircle score={result.score} />

                {/* XP badge */}
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7, type: 'spring', stiffness: 300 }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                  style={{
                    background: result.score >= 70
                      ? 'linear-gradient(135deg, #F59E0B, #EF4444)'
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: result.score >= 70 ? '0 0 20px rgba(245,158,11,0.35)' : undefined,
                  }}
                >
                  <Zap size={16} style={{ color: result.score >= 70 ? '#fff' : '#9CA3AF' }} />
                  <span className="font-bold text-sm" style={{ color: result.score >= 70 ? '#fff' : '#6B7280' }}>
                    {result.xp_earned} XP earned
                  </span>
                </motion.div>

                <p className="text-sm font-semibold" style={{ color: scoreColor(result.score) }}>
                  {result.score >= 70 ? 'Excellent work!' : result.score >= 40 ? 'Good effort!' : 'Keep practising!'}
                </p>
              </div>

              {/* AI Feedback */}
              {result.feedback && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">
                    Novo's Feedback
                  </p>
                  <p className="text-sm text-white/85 leading-relaxed">{result.feedback}</p>
                </div>
              )}

              {/* Correct answer (expandable) */}
              {result.correct_answer && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <button
                    onClick={() => setShowCorrectAnswer(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-white"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span>Correct Answer</span>
                    {showCorrectAnswer ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </button>
                  <AnimatePresence>
                    {showCorrectAnswer && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <div className="p-3.5 rounded-xl"
                            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
                            <p className="text-sm text-green-300 font-medium">{result.correct_answer}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Leaderboard */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <button
                  onClick={() => setShowLeaderboard(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="flex items-center gap-2.5">
                    <Trophy size={17} className="text-amber-500" />
                    <span className="text-sm font-semibold text-white">Leaderboard</span>
                    {leaderboard.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#FCD34D' }}>
                        {leaderboard.length}
                      </span>
                    )}
                  </div>
                  {showLeaderboard
                    ? <ChevronUp size={16} className="text-muted-foreground" />
                    : <ChevronDown size={16} className="text-muted-foreground" />}
                </button>

                <AnimatePresence>
                  {showLeaderboard && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 flex flex-col gap-2">
                        {leaderboard.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">No entries yet</p>
                        ) : leaderboard.map(entry => (
                          <div key={entry.rank}
                            className="flex items-center gap-3 p-2.5 rounded-xl"
                            style={{
                              background: entry.is_me ? 'rgba(91,106,245,0.12)' : 'rgba(255,255,255,0.04)',
                              border: entry.is_me ? '1.5px solid rgba(91,106,245,0.2)' : '1.5px solid transparent',
                            }}>
                            <span className="w-8 text-center shrink-0 flex items-center justify-center">
                              <MedalBadge rank={entry.rank} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {entry.name}
                                {entry.is_me && <span className="text-primary text-xs ml-1">(you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {Math.floor(entry.time_taken_secs / 60)}m {entry.time_taken_secs % 60}s
                              </p>
                            </div>
                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                              <span className="text-sm font-bold" style={{ color: scoreColor(entry.score) }}>
                                {entry.score}
                              </span>
                              <span className="text-xs text-amber-400 font-semibold">+{entry.xp_earned} XP</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* CTA */}
              <Button variant="secondary" onClick={resetToSubjectPicker} className="w-full">
                <RotateCcw size={16} />
                Try a Different Subject
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
