// ═══════════════════════════════════════════════════════════════
// Edora — NovoInsightsPage
// Full view of the weekly AI-generated performance report.
// Shows weaknesses, strengths, streak insight, 3-day recovery plan.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown,
  Calendar, Zap, Target, BookOpen, CheckCircle2,
  Trophy, AlertCircle, Flame, RefreshCw, Lightbulb,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeakSubject {
  subject: string;
  score_pct: number;
  reason: string;
  study_tip: string;
}

interface StrongSubject {
  subject: string;
  score_pct: number;
  reason: string;
}

interface RecoveryDay {
  day: string;
  focus: string;
  tasks: string[];
}

interface NovoInsight {
  id: string;
  user_id: string;
  week_start: string;
  headline: string;
  weakest_subjects: WeakSubject[];
  strongest_subjects: StrongSubject[];
  streak_insight: string;
  recovery_plan: RecoveryDay[];
  motivation: string;
  xp_this_week: number;
  quizzes_taken: number;
  sprints_completed: number;
  mistakes_logged: number;
  generated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end   = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function ScoreArc({ pct, size = 56 }: { pct: number; size?: number }) {
  const stroke = 5;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0"
        style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
      </svg>
      <span className="text-[11px] font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

const DAY_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  Monday:    { bg: 'rgba(91,106,245,0.1)',  border: 'rgba(91,106,245,0.25)',  icon: '#818CF8' },
  Tuesday:   { bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.25)',  icon: '#F472B6' },
  Wednesday: { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)',  icon: '#34D399' },
};

function DayCard({ day, focus, tasks, index }: RecoveryDay & { index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const [checked, setChecked]   = useState<boolean[]>(tasks.map(() => false));
  const colors = DAY_COLORS[day] ?? DAY_COLORS['Monday'];
  const doneCount = checked.filter(Boolean).length;

  function toggleTask(i: number) {
    setChecked(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-2xl overflow-hidden border"
      style={{ background: colors.bg, borderColor: colors.border }}>

      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: colors.icon + '20' }}>
          <Calendar size={15} style={{ color: colors.icon }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide"
            style={{ color: colors.icon }}>{day}</p>
          <p className="text-sm font-semibold text-white truncate">{focus}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {doneCount > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {doneCount}/{tasks.length}
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ArrowLeft size={14} className="text-muted-foreground rotate-[-90deg]" />
          </motion.div>
        </div>
      </button>

      {/* Tasks */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 flex flex-col gap-2.5 border-t"
              style={{ borderColor: colors.border }}>
              {tasks.map((task, i) => (
                <button
                  key={i}
                  onClick={() => toggleTask(i)}
                  className="flex items-start gap-2.5 text-left pt-2.5">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all`}
                    style={{
                      borderColor: checked[i] ? colors.icon : colors.border,
                      background: checked[i] ? colors.icon : 'transparent',
                    }}>
                    {checked[i] && <CheckCircle2 size={12} className="text-white" strokeWidth={2.5} />}
                  </div>
                  <p className={`text-sm leading-snug transition-all ${
                    checked[i] ? 'line-through text-muted-foreground' : 'text-white/85'
                  }`}>{task}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NovoInsightsPage() {
  const { user } = useAuth();
  const [insight, setInsight]     = useState<NovoInsight | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [notFound, setNotFound]   = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);

    supabase
      .from('novo_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error('[NovoInsights] fetch:', error.message);
        if (data) setInsight(data as NovoInsight);
        else setNotFound(true);
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [user]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <Link to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ArrowLeft size={17} className="text-white" />
          </Link>
          <h1 className="font-heading text-lg font-bold text-white">Novo Insights</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading your report…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── No report yet ──
  if (notFound || !insight) {
    return (
      <div className="flex flex-col h-full bg-gradient-page">
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <Link to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ArrowLeft size={17} className="text-white" />
          </Link>
          <h1 className="font-heading text-lg font-bold text-white">Novo Insights</h1>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.25)' }}>
              <Sparkles size={36} className="text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-white mb-2">
                Your first report is on its way
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Novo generates your personalised weekly intelligence report every Sunday.
                Keep studying and your first report will arrive after you complete a few quizzes or sprints.
              </p>
            </div>
            <div className="rounded-2xl p-4 w-full text-left"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                To get your first report, complete any of:
              </p>
              {[
                { icon: Target,   label: 'At least 3 quizzes' },
                { icon: Zap,      label: '2 Study Sprints' },
                { icon: BookOpen, label: 'Log mistakes in your journal' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 py-1.5">
                  <Icon size={15} className="text-primary shrink-0" />
                  <span className="text-sm text-white">{label}</span>
                </div>
              ))}
            </div>
            <Link to="/quiz"
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white text-center block active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              Take a Quiz Now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Full report ──
  const isCurrentWeek = insight.week_start === currentWeekStart();

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div
        className="px-4 pt-4 pb-5 shrink-0"
        style={{ background: 'linear-gradient(160deg, #1A1144 0%, #2D1B7E 60%, #3B1FA0 100%)' }}>
        <div className="flex items-center gap-3 mb-4">
          <Link to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            <ArrowLeft size={17} className="text-white" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-yellow-300" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-yellow-300">
                Novo Insights
              </span>
            </div>
            <h1 className="font-heading text-lg font-bold text-white leading-tight">
              Weekly Intelligence Report
            </h1>
          </div>
          {isCurrentWeek && (
            <div className="px-2.5 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <span className="text-[10px] font-bold text-white/90 uppercase tracking-wide">This week</span>
            </div>
          )}
        </div>

        {/* Week range */}
        <p className="text-purple-300 text-[11px] mb-3">
          {formatWeekRange(insight.week_start)}
        </p>

        {/* Headline */}
        <p className="text-white font-bold text-lg leading-snug mb-4">
          "{insight.headline}"
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'XP Earned',  value: `+${insight.xp_this_week}`, icon: Trophy,   color: '#FCD34D' },
            { label: 'Quizzes',    value: insight.quizzes_taken,       icon: Target,   color: '#818CF8' },
            { label: 'Sprints',    value: insight.sprints_completed,   icon: Zap,      color: '#34D399' },
            { label: 'Mistakes',   value: insight.mistakes_logged,     icon: BookOpen, color: '#F87171' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl p-2.5 text-center"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <Icon size={16} style={{ color }} className="mx-auto mb-1" />
              <p className="font-heading font-bold text-sm text-white leading-none">{value}</p>
              <p className="text-[9px] text-purple-300 mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-5 flex flex-col gap-5">

        {/* ── Weak spots ── */}
        {insight.weakest_subjects.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <h2 className="font-heading text-base font-bold text-white">Needs Attention</h2>
            </div>
            <div className="flex flex-col gap-3">
              {insight.weakest_subjects.map((s, i) => (
                <motion.div
                  key={s.subject}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.06 }}
                  className="rounded-2xl p-4 flex gap-3"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <ScoreArc pct={s.score_pct} size={54} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown size={13} className="text-red-400 shrink-0" />
                      <p className="font-bold text-sm text-white truncate">{s.subject}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug mb-2">{s.reason}</p>
                    <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-xl"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Lightbulb size={13} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400 font-medium leading-snug">{s.study_tip}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Strengths ── */}
        {insight.strongest_subjects.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-emerald-500 shrink-0" />
              <h2 className="font-heading text-base font-bold text-white">Your Strengths</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              {insight.strongest_subjects.map((s, i) => (
                <motion.div
                  key={s.subject}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.14 + i * 0.06 }}
                  className="rounded-2xl p-4 flex gap-3"
                  style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <ScoreArc pct={s.score_pct} size={54} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={13} className="text-emerald-400 shrink-0" />
                      <p className="font-bold text-sm text-white truncate">{s.subject}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{s.reason}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Streak insight ── */}
        {insight.streak_insight && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <div className="flex items-center gap-2 mb-3">
              <Flame size={16} className="text-orange-400 shrink-0" />
              <h2 className="font-heading text-base font-bold text-white">Streak Pattern</h2>
            </div>
            <div className="rounded-2xl p-4 flex items-start gap-3"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.15)' }}>
                <Flame size={18} className="text-amber-400" />
              </div>
              <p className="text-sm text-white/85 leading-relaxed">{insight.streak_insight}</p>
            </div>
          </motion.section>
        )}

        {/* ── 3-Day Recovery Plan ── */}
        {insight.recovery_plan.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw size={16} className="text-primary shrink-0" />
              <h2 className="font-heading text-base font-bold text-white">3-Day Recovery Plan</h2>
            </div>
            <div className="flex flex-col gap-2.5">
              {insight.recovery_plan.map((day, i) => (
                <DayCard key={day.day} {...day} index={i} />
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Motivation quote ── */}
        {insight.motivation && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="rounded-3xl p-5 text-center"
            style={{
              background: 'rgba(91,106,245,0.1)',
              border: '1px solid rgba(91,106,245,0.25)',
            }}>
            <Sparkles size={22} className="text-primary mx-auto mb-2.5" />
            <p className="text-sm font-medium text-white/85 leading-relaxed italic">
              "{insight.motivation}"
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 font-medium">— Novo, your AI study coach</p>
          </motion.div>
        )}

        {/* ── Generated timestamp ── */}
        <p className="text-center text-[10px] text-muted-foreground pb-2">
          Generated {new Date(insight.generated_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </p>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}
