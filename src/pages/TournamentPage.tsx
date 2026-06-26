import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Zap, ChevronRight, ArrowLeft, CheckCircle, XCircle, Trophy, Calendar, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'list' | 'quiz' | 'results' | 'leaderboard';

interface Tournament {
  id: string;
  name: string;
  subject: string;
  week_start: string;
  week_end: string;
  question_count: number;
  time_limit_secs: number;
  xp_1st: number;
  xp_2nd: number;
  xp_3rd: number;
  participant_count: number;
  my_participation: { score: number; rank: number; completed_at: string } | null;
}

interface Question {
  question: string;
  options: string[];
  explanation: string;
  points: number;
}

interface Answer {
  q_idx: number;
  chosen_idx: number;
}

interface GradedAnswer {
  q_idx: number;
  chosen_idx: number;
  correct: boolean;
  correct_idx: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar_url: string | null;
  score: number;
  max_score: number;
  time_taken_ms: number;
  is_me: boolean;
}

interface GetActiveResponse {
  tournaments: Tournament[];
  week_start: string;
  week_end: string;
}

interface JoinResponse {
  participant: { id: string };
  questions: Question[];
  time_limit_secs: number;
}

interface SubmitResponse {
  score: number;
  max_score: number;
  rank: number;
  xp_earned: number;
  graded_answers: GradedAnswer[];
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

interface GetQuestionsResponse {
  questions: Question[];
  time_limit_secs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekDates(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `Week of ${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatMs(ms: number): string {
  return formatTime(Math.floor(ms / 1000));
}

function rankLabel(rank: number): { text: string; color: string } {
  if (rank === 1) return { text: '1st', color: '#FFD700' };
  if (rank === 2) return { text: '2nd', color: '#C0C0C0' };
  if (rank === 3) return { text: '3rd', color: '#CD7F32' };
  return { text: `#${rank}`, color: 'rgba(255,255,255,0.4)' };
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

const AVATAR_COLORS = [
  'bg-purple-400', 'bg-blue-400', 'bg-green-400', 'bg-pink-400',
  'bg-amber-400', 'bg-red-400', 'bg-teal-400', 'bg-indigo-400',
] as const;

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti() {
  const COLORS = ['#5B6AF5', '#8B5CF6', '#F59E0B', '#10B981', '#F43F5E', '#3B82F6'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            backgroundColor: COLORS[i % COLORS.length],
            left: `${5 + (i * 5.5) % 90}%`,
            top: '-10%',
          }}
          animate={{
            y: ['0%', '110vh'],
            rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 2.5 + (i % 5) * 0.3,
            delay: (i % 6) * 0.15,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}

// ─── Weekly Schedule Banner ────────────────────────────────────────────────────

function WeeklyScheduleBanner() {
  const dow = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  // Phase: Mon(1)=brackets open, Tue-Thu(2-4)=competing, Fri(5)=finals, Sat(6)=tallying, Sun(0)=certificates
  const phases = [
    { label: 'Mon', desc: 'Brackets Open', active: dow === 1, icon: Users,    color: '#5B6AF5' },
    { label: 'Tue–Thu', desc: 'Competing',   active: dow >= 2 && dow <= 4, icon: Zap,    color: '#F59E0B' },
    { label: 'Fri', desc: 'Finals',      active: dow === 5, icon: Trophy,   color: '#EF4444' },
    { label: 'Sun', desc: 'Certificates', active: dow === 0, icon: Award,    color: '#10B981' },
  ] as const;

  return (
    <div className="mx-4 mb-3 px-4 py-3 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Weekly Schedule</p>
      <div className="flex items-center gap-1">
        {phases.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={p.label} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: p.active ? `${p.color}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${p.active ? p.color + '44' : 'rgba(255,255,255,0.06)'}` }}>
                  <Icon size={14} style={{ color: p.active ? p.color : 'rgba(255,255,255,0.2)' }} />
                </div>
                <p className="text-[9px] font-bold text-center leading-tight"
                  style={{ color: p.active ? p.color : 'rgba(255,255,255,0.25)' }}>
                  {p.label}
                </p>
                <p className="text-[8px] text-center leading-tight"
                  style={{ color: p.active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)' }}>
                  {p.desc}
                </p>
              </div>
              {i < phases.length - 1 && (
                <div className="w-4 h-px mb-4 shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Screen: Tournament List ───────────────────────────────────────────────────

interface ListScreenProps {
  tournaments: Tournament[];
  weekStart: string;
  weekEnd: string;
  loading: boolean;
  onEnter: (t: Tournament) => void;
  onViewResults: (t: Tournament) => void;
}

function ListScreen({ tournaments, weekStart, weekEnd, loading, onEnter, onViewResults }: ListScreenProps) {
  const navigate = useNavigate();
  return (
    <div className="h-full overflow-y-auto pb-nav">
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <Trophy size={18} style={{ color: '#FBBF24' }} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-white">Weekly Tournaments</h1>
          {weekStart && weekEnd && (
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatWeekDates(weekStart, weekEnd)}</p>
          )}
        </div>
      </div>

      <WeeklyScheduleBanner />

      {loading && (
        <div className="flex flex-col gap-4 px-4 mt-2">
          {[1, 2].map(i => (
            <div key={i} className="rounded-3xl p-5 animate-pulse"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="h-5 rounded w-2/3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-4 rounded w-1/3 mb-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-10 rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && tournaments.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center px-8 mt-20 text-center"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}>
            <Calendar size={28} style={{ color: '#8B9BFA' }} />
          </div>
          <p className="font-heading text-lg font-semibold text-white">No tournaments yet</p>
          <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Tournaments generate every Monday. Check back soon.</p>
        </motion.div>
      )}

      <div className="flex flex-col gap-4 px-4 mt-2">
        {tournaments.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-3xl p-5"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-start justify-between mb-2">
              <h2 className="font-heading text-base font-bold text-white flex-1 mr-2">{t.name}</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)', color: '#8B9BFA' }}>
                {t.subject}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {Math.floor(t.time_limit_secs / 60)}m · {t.question_count}Q
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} />
                {t.participant_count} students competing
              </span>
            </div>

            <div className="flex gap-2 mb-4">
              {([{ text: '1st', color: '#FFD700' }, { text: '2nd', color: '#C0C0C0' }, { text: '3rd', color: '#CD7F32' }]).map((rl, idx) => {
                const xp = idx === 0 ? t.xp_1st : idx === 1 ? t.xp_2nd : t.xp_3rd;
                return (
                  <div key={rl.text} className="flex items-center gap-1 rounded-xl px-2 py-1"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-xs font-bold" style={{ color: rl.color }}>{rl.text}</span>
                    <span className="text-xs font-bold text-white">{xp} XP</span>
                  </div>
                );
              })}
            </div>

            {t.my_participation === null ? (
              <button
                onClick={() => onEnter(t)}
                className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
              >
                Enter Tournament
                <ChevronRight size={16} />
              </button>
            ) : t.my_participation.rank === 0 ? (
              <button
                onClick={() => onEnter(t)}
                className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2"
                style={{ background: 'rgba(245,158,11,0.8)' }}
              >
                Continue Attempt
                <ChevronRight size={16} />
              </button>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const rl = rankLabel(t.my_participation.rank);
                    return <span className="text-lg font-bold" style={{ color: rl.color }}>{rl.text}</span>;
                  })()}
                  <div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Your score</p>
                    <p className="font-bold text-sm text-white">
                      {t.question_count > 0
                        ? Math.round((t.my_participation.score / (t.question_count * 10)) * 100)
                        : 0}%
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {t.my_participation.rank <= 3 && new Date().getDay() === 0 && (
                    <button
                      onClick={() => navigate('/certifications')}
                      className="py-2 px-3 rounded-2xl font-semibold text-xs flex items-center gap-1"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
                    >
                      <Award size={12} />
                      Certificate
                    </button>
                  )}
                  <button
                    onClick={() => onViewResults(t)}
                    className="py-2 px-4 rounded-2xl font-semibold text-sm"
                    style={{ border: '1px solid rgba(91,106,245,0.4)', color: '#8B9BFA' }}
                  >
                    Results
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen: Quiz ─────────────────────────────────────────────────────────────

interface QuizScreenProps {
  tournament: Tournament;
  questions: Question[];
  timeLimitSecs: number;
  onSubmit: (answers: Answer[], timeTakenMs: number) => Promise<void>;
  submitting: boolean;
}

function QuizScreen({ tournament, questions, timeLimitSecs, onSubmit, submitting }: QuizScreenProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [timeLeft, setTimeLeft] = useState(timeLimitSecs);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalStartRef = useRef<number>(Date.now());
  const hasSubmittedRef = useRef(false);

  const doSubmit = useCallback((finalAnswers: Answer[]) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    void onSubmit(finalAnswers, Date.now() - totalStartRef.current);
  }, [onSubmit]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0) {
      doSubmit(answers);
    }
  }, [timeLeft, answers, doSubmit]);

  // Reset selection when question changes
  useEffect(() => {
    setSelectedIdx(null);
  }, [currentIdx]);

  function handleNext() {
    const newAnswer: Answer = { q_idx: currentIdx, chosen_idx: selectedIdx ?? 0 };
    const updated = [...answers.filter(a => a.q_idx !== currentIdx), newAnswer];
    setAnswers(updated);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(idx => idx + 1);
    } else {
      doSubmit(updated);
    }
  }

  const q = questions[currentIdx];
  const isLast = currentIdx === questions.length - 1;
  const isRed = timeLeft < 60;

  return (
    <div className="fixed inset-0 bg-gradient-page flex flex-col z-50">
      <div className="flex items-center justify-between px-4 pt-12 pb-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium truncate max-w-[180px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{tournament.name}</span>
          <span className="text-sm font-bold text-white">
            Question {currentIdx + 1} / {questions.length}
          </span>
        </div>
        <motion.div
          animate={{ scale: isRed && timeLeft % 2 === 0 ? [1, 1.08, 1] : 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-bold text-sm"
          style={isRed
            ? { background: 'rgba(239,68,68,0.15)', color: '#F87171' }
            : { background: 'rgba(91,106,245,0.15)', color: '#8B9BFA' }
          }
        >
          <Clock size={14} />
          {formatTime(timeLeft)}
        </motion.div>
      </div>

      <div className="mx-4 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
          animate={{ width: `${(currentIdx / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            <div className="rounded-3xl p-5 mb-4"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#8B9BFA' }}>{q.points} pts</p>
              <p className="font-heading text-base font-semibold text-white leading-snug">{q.question}</p>
            </div>

            <div className="flex flex-col gap-3">
              {q.options.map((opt, i) => {
                const isSelected = selectedIdx === i;
                return (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedIdx(i)}
                    className="w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-colors"
                    style={isSelected
                      ? { background: 'rgba(91,106,245,0.15)', border: '2px solid #5B6AF5' }
                      : { background: 'rgba(15,20,45,0.75)', border: '2px solid rgba(255,255,255,0.08)' }
                    }
                  >
                    <span
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={isSelected
                        ? { background: '#5B6AF5', color: 'white' }
                        : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }
                      }
                    >
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="text-sm text-white leading-snug">{opt}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-4 pb-8 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          disabled={submitting}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          {submitting ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isLast ? (
            'Submit Tournament'
          ) : (
            <>Next <ChevronRight size={18} /></>
          )}
        </motion.button>
      </div>
    </div>
  );
}

// ─── Screen: Results ──────────────────────────────────────────────────────────

interface ResultsScreenProps {
  questions: Question[];
  submitResult: SubmitResponse;
  onViewLeaderboard: () => void;
  onBack: () => void;
}

function ResultsScreen({ questions, submitResult, onViewLeaderboard, onBack }: ResultsScreenProps) {
  const { score, max_score, rank, xp_earned, graded_answers } = submitResult;
  const isTop3 = rank >= 1 && rank <= 3;
  const pct = max_score > 0 ? Math.round((score / max_score) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto pb-nav relative">
      {isTop3 && <Confetti />}

      <div className="px-4 pt-12 pb-4">
        <h1 className="font-heading text-2xl font-bold text-white text-center">
          Tournament Submitted!
        </h1>
      </div>

      <div className="mx-4 mb-4">
        <div className="rounded-3xl p-6 text-center"
          style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {isTop3 && (
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="mb-3"
            >
              {(() => {
                const rl = rankLabel(rank);
                return <span className="text-5xl font-bold font-heading" style={{ color: rl.color }}>{rl.text}</span>;
              })()}
            </motion.div>
          )}
          <p className="text-4xl font-bold text-white font-heading">
            {score} <span className="text-2xl font-normal" style={{ color: 'rgba(255,255,255,0.5)' }}>/ {max_score}</span>
          </p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{pct}% accuracy</p>
          {!isTop3 && <p className="font-semibold text-white mt-2">Rank #{rank}</p>}

          {xp_earned > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-2xl font-bold text-sm"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
              <Zap size={16} />
              {xp_earned} XP earned
            </div>
          )}
        </div>
      </div>

      {graded_answers.length > 0 && (
        <div className="px-4 mb-4">
          <h2 className="font-heading text-base font-semibold text-white mb-3">Answer Review</h2>
          <div className="flex flex-col gap-3">
            {questions.map((q, qIdx) => {
              const ga = graded_answers.find(g => g.q_idx === qIdx);
              if (!ga) return null;
              return (
                <div key={qIdx} className="rounded-2xl p-4"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-sm font-semibold text-white mb-2">
                    {qIdx + 1}. {q.question}
                  </p>
                  <div className="flex items-start gap-2 mb-1" style={{ color: ga.correct ? '#34D399' : '#F87171' }}>
                    {ga.correct
                      ? <CheckCircle size={15} className="mt-0.5 flex-shrink-0" />
                      : <XCircle size={15} className="mt-0.5 flex-shrink-0" />}
                    <span className="text-xs">
                      Your answer: {OPTION_LABELS[ga.chosen_idx]}. {q.options[ga.chosen_idx]}
                    </span>
                  </div>
                  {!ga.correct && (
                    <div className="flex items-start gap-2 mb-1" style={{ color: '#34D399' }}>
                      <CheckCircle size={15} className="mt-0.5 flex-shrink-0" />
                      <span className="text-xs">
                        Correct: {OPTION_LABELS[ga.correct_idx]}. {q.options[ga.correct_idx]}
                      </span>
                    </div>
                  )}
                  {q.explanation && (
                    <p className="text-xs mt-1.5 pt-1.5" style={{ color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {q.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 flex flex-col gap-3">
        <button
          onClick={onViewLeaderboard}
          className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
        >
          <Trophy size={16} /> View Leaderboard
        </button>
        <button
          onClick={onBack}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
        >
          Back to Tournaments
        </button>
      </div>
    </div>
  );
}

// ─── Screen: Leaderboard ──────────────────────────────────────────────────────

interface LeaderboardScreenProps {
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  onBack: () => void;
}

function LeaderboardScreen({ leaderboard, loading, onBack }: LeaderboardScreenProps) {
  return (
    <div className="h-full overflow-y-auto pb-nav">
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-white"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-heading text-xl font-bold text-white">Leaderboard</h1>
      </div>

      {loading && (
        <div className="flex flex-col gap-3 px-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl p-4 flex items-center gap-3 animate-pulse"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-10 h-10 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex-1">
                <div className="h-3 rounded w-1/2 mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="h-3 rounded w-1/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-2 px-4">
          {leaderboard.map((entry, i) => {
            const initial = entry.name.charAt(0).toUpperCase();
            const isMe = entry.is_me;
            return (
              <motion.div
                key={entry.rank}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-4 flex items-center gap-3"
                style={isMe
                  ? { background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.4)' }
                  : { background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                <div className="w-8 text-center flex-shrink-0">
                  {(() => {
                    const rl = rankLabel(entry.rank);
                    return <span className="text-sm font-bold" style={{ color: rl.color }}>{rl.text}</span>;
                  })()}
                </div>

                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${avatarColor(entry.name)}`}
                >
                  {initial}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: isMe ? '#8B9BFA' : 'white' }}>
                    {entry.name}{isMe && <span className="text-xs font-normal ml-1" style={{ color: 'rgba(139,155,250,0.7)' }}>(YOU)</span>}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatMs(entry.time_taken_ms)}</p>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-white">
                    {entry.score}
                    <span className="font-normal text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>/{entry.max_score}</span>
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {entry.max_score > 0 ? Math.round((entry.score / entry.max_score) * 100) : 0}%
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="px-4 mt-6">
        <button
          onClick={onBack}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
        >
          Back to Tournaments
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TournamentPage() {
  useAuth();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>('list');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [timeLimitSecs, setTimeLimitSecs] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fetchTournaments = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<GetActiveResponse>('tournament', {
        body: { action: 'get_active' },
      });
      if (fnErr) throw fnErr;
      if (!data) throw new Error('No data returned');
      setTournaments(data.tournaments ?? []);
      setWeekStart(data.week_start ?? '');
      setWeekEnd(data.week_end ?? '');
    } catch (err) {
      console.error('[TournamentPage] fetchTournaments error:', err);
      setError('Failed to load tournaments. Please try again.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTournaments();
  }, [fetchTournaments]);

  async function handleEnter(t: Tournament) {
    setActiveTournament(t);
    setQuizLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<JoinResponse>('tournament', {
        body: { action: 'join', tournament_id: t.id },
      });
      if (fnErr) throw fnErr;
      if (!data) throw new Error('No data returned');
      setQuestions(data.questions ?? []);
      setTimeLimitSecs(data.time_limit_secs ?? t.time_limit_secs);
      setScreen('quiz');
    } catch (err) {
      console.error('[TournamentPage] join error:', err);
      setError('Failed to start tournament. Please try again.');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleViewResults(t: Tournament) {
    if (!t.my_participation) return;
    setActiveTournament(t);
    setError(null);
    try {
      const { data: qData, error: qErr } = await supabase.functions.invoke<GetQuestionsResponse>('tournament', {
        body: { action: 'get_questions', tournament_id: t.id },
      });
      if (qErr) throw qErr;
      if (!qData) throw new Error('No data returned');
      setQuestions(qData.questions ?? []);

      setSubmitResult({
        score: t.my_participation.score,
        max_score: t.question_count * 10,
        rank: t.my_participation.rank,
        xp_earned: 0,
        graded_answers: [],
      });
      setScreen('results');
    } catch (err) {
      console.error('[TournamentPage] viewResults error:', err);
      setError('Failed to load results. Please try again.');
    }
  }

  async function handleSubmit(answers: Answer[], timeTakenMs: number) {
    if (!activeTournament) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<SubmitResponse>('tournament', {
        body: {
          action: 'submit',
          tournament_id: activeTournament.id,
          answers,
          time_taken_ms: timeTakenMs,
        },
      });
      if (fnErr) throw fnErr;
      if (!data) throw new Error('No data returned');
      setSubmitResult(data);
      setScreen('results');
    } catch (err) {
      console.error('[TournamentPage] submit error:', err);
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleViewLeaderboard() {
    if (!activeTournament) return;
    setLeaderboardLoading(true);
    setScreen('leaderboard');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<LeaderboardResponse>('tournament', {
        body: { action: 'get_leaderboard', tournament_id: activeTournament.id },
      });
      if (fnErr) throw fnErr;
      if (!data) throw new Error('No data returned');
      setLeaderboard(data.leaderboard ?? []);
    } catch (err) {
      console.error('[TournamentPage] leaderboard error:', err);
      setError('Failed to load leaderboard.');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  function handleBackToList() {
    setScreen('list');
    setActiveTournament(null);
    setQuestions([]);
    setSubmitResult(null);
    setLeaderboard([]);
    void fetchTournaments();
  }

  // suppress unused warning — navigate kept for potential future back
  void navigate;

  if (quizLoading) {
    return (
      <div className="fixed inset-0 bg-gradient-page flex flex-col items-center justify-center z-50">
        <span className="w-10 h-10 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading tournament…</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 text-sm rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}>
          <span className="flex-1">{error}</span>
          {/* Retry lets users recover without navigating away */}
          <button
            onClick={() => { setError(null); void fetchTournaments(); }}
            className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            Retry
          </button>
          <button onClick={() => setError(null)} className="shrink-0 font-bold text-red-400 active:opacity-70">
            <XCircle size={16} />
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {screen === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ListScreen
              tournaments={tournaments}
              weekStart={weekStart}
              weekEnd={weekEnd}
              loading={listLoading}
              onEnter={handleEnter}
              onViewResults={handleViewResults}
            />
          </motion.div>
        )}

        {screen === 'quiz' && activeTournament && questions.length > 0 && (
          <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <QuizScreen
              tournament={activeTournament}
              questions={questions}
              timeLimitSecs={timeLimitSecs}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          </motion.div>
        )}

        {screen === 'results' && submitResult !== null && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResultsScreen
              questions={questions}
              submitResult={submitResult}
              onViewLeaderboard={handleViewLeaderboard}
              onBack={handleBackToList}
            />
          </motion.div>
        )}

        {screen === 'leaderboard' && (
          <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LeaderboardScreen
              leaderboard={leaderboard}
              loading={leaderboardLoading}
              onBack={handleBackToList}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
