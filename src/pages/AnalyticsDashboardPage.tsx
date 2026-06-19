import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, RefreshCw, TrendingUp, Target, Clock, Zap, Lock, Crown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { isInFreeTrial } from '@/lib/trial';
import { supabase } from '@/lib/supabase';
import type { AnalyticsStats } from '@/types';

async function callFn(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('novo-analytics', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

// ── Mini bar chart (SVG, zero deps) ──────────────────────────────────────────
function BarChart({ data }: { data: { date: string; xp: number }[] }) {
  const maxXP = Math.max(...data.map(d => d.xp), 1);
  const BAR_W = 12;
  const GAP = 4;
  const H = 72;
  const W = data.length * (BAR_W + GAP);

  return (
    <div className="overflow-x-auto pb-1">
      <svg width={W} height={H + 20} style={{ minWidth: '100%' }}>
        {data.map((d, i) => {
          const barH = Math.max(3, (d.xp / maxXP) * H);
          const x = i * (BAR_W + GAP);
          const y = H - barH;
          const isToday = d.date === new Date().toISOString().slice(0, 10);
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={3}
                fill={isToday ? '#5B6AF5' : d.xp > 0 ? '#A5B0F7' : 'rgba(255,255,255,0.1)'} />
              {/* Day label every 2 days */}
              {i % 2 === 0 && (
                <text x={x + BAR_W / 2} y={H + 14} textAnchor="middle"
                  fontSize={8} fill="#94a3b8">
                  {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Horizontal accuracy bar ───────────────────────────────────────────────────
function AccuracyBar({ label, accuracy, total, color = '#5B6AF5' }: {
  label: string; accuracy: number; total: number; color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white font-medium w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${accuracy}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-white w-10 text-right shrink-0">{accuracy}%</span>
      <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">{total} q</span>
    </div>
  );
}

// ── Predicted score ring ──────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const R = 44;
  const circ = 2 * Math.PI * R;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <svg width={108} height={108} viewBox="0 0 108 108">
      <circle cx={54} cy={54} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
      <circle cx={54} cy={54} r={R} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x="54" y="50" textAnchor="middle" fontSize="22" fontWeight="bold" fill={color}>{score}</text>
      <text x="54" y="65" textAnchor="middle" fontSize="10" fill="#94a3b8">%</text>
    </svg>
  );
}

// ── Pro gate overlay ──────────────────────────────────────────────────────────
function ProGate({ preview }: { preview: { total_sprints: number; total_quizzes: number; xp: number; streak: number } | null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [weekData, setWeekData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    if (!user) return;
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('sprint_sessions')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('created_at', weekAgo)
      .then(({ data }) => {
        if (!data) return;
        const counts = [0, 0, 0, 0, 0, 0, 0];
        data.forEach(s => {
          const day = (new Date().getDay() - new Date(s.created_at).getDay() + 7) % 7;
          counts[6 - day] = (counts[6 - day] ?? 0) + 1;
        });
        const max = Math.max(...counts, 1);
        setWeekData(counts.map(c => Math.round((c / max) * 80) + 10));
      });
  }, [user]);
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Blurred teaser */}
      <div className="relative rounded-3xl overflow-hidden">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 backdrop-blur-sm"
          style={{ background: 'rgba(8,12,26,0.85)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Lock size={28} className="text-white" />
          </div>
          <div className="text-center px-6">
            <p className="font-heading font-bold text-white text-lg">Advanced Analytics</p>
            <p className="text-sm text-muted-foreground mt-1">Unlock deep insights, weak-topic heatmaps, and predicted exam scores with Novo Pro.</p>
          </div>
          <Button onClick={() => navigate('/pro')} className="px-8">
            <Crown size={16} className="mr-1" /> Upgrade to Pro
          </Button>
        </div>

        {/* Blurred content behind gate */}
        <div className="p-5 blur-sm select-none pointer-events-none">
          <div className="flex flex-col gap-3">
            {preview && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-2xl font-bold text-white">{preview.total_sprints}</p>
                  <p className="text-xs text-muted-foreground">Study Sessions</p>
                </div>
                <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-2xl font-bold text-white">{preview.total_quizzes}</p>
                  <p className="text-xs text-muted-foreground">Quizzes Taken</p>
                </div>
              </div>
            )}
            {/* Weekly activity bar chart — real sprint counts */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-semibold text-muted-foreground mb-3">THIS WEEK'S ACTIVITY</p>
              <div className="flex items-end gap-2 h-16">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg opacity-50 transition-all duration-500"
                      style={{ height: `${weekData[i]}%`, background: 'linear-gradient(180deg,#5B6AF5,#8B5CF6)' }} />
                    <span className="text-[9px] text-muted-foreground">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Free summary if available */}
      {preview && (
        <div className="glass rounded-3xl p-5">
          <p className="text-xs font-semibold text-muted-foreground mb-3">YOUR SUMMARY</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Study Sessions', value: preview.total_sprints },
              { label: 'Quizzes Done', value: preview.total_quizzes },
              { label: 'Total XP', value: preview.xp.toLocaleString() },
              { label: 'Day Streak', value: `${preview.streak}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full Pro dashboard ────────────────────────────────────────────────────────
function FullDashboard({ stats, onRefresh, refreshing }: {
  stats: AnalyticsStats;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const subjectColors = ['#5B6AF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

  return (
    <div className="flex flex-col gap-4 px-4 py-4">

      {/* ── Summary row ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Zap, label: 'Sessions (30d)', value: stats.total_sessions_30d, color: '#5B6AF5' },
          { icon: Target, label: 'Avg Accuracy', value: `${stats.avg_accuracy_30d}%`, color: '#10B981' },
          { icon: Clock, label: 'Study Time', value: `${Math.round(stats.study_time_by_subject.reduce((s, x) => s + x.minutes, 0) / 60)}h`, color: '#F59E0B' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass rounded-2xl p-3 flex flex-col items-center gap-1">
            <Icon size={18} style={{ color }} />
            <p className="text-base font-bold text-white">{value}</p>
            <p className="text-[10px] text-muted-foreground text-center leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Predicted Score ── */}
      {stats.predicted_score !== null && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-5 flex items-center gap-4">
          <ScoreRing score={stats.predicted_score} />
          <div className="flex-1">
            <p className="font-heading font-bold text-white">Predicted Score</p>
            <p className="text-xs text-muted-foreground mt-1">Based on your recent quiz and certification performance with recency weighting.</p>
            {stats.best_subject && (
              <p className="text-xs text-emerald-400 font-semibold mt-2">Best: {stats.best_subject}</p>
            )}
            {stats.worst_subject && (
              <p className="text-xs text-red-400 font-semibold mt-0.5">Needs work: {stats.worst_subject}</p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── XP Trend ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-primary" />
          <p className="font-semibold text-white text-sm">XP Earned — Last 14 Days</p>
        </div>
        {stats.xp_by_day.length > 0 && stats.xp_by_day.some(d => d.xp > 0)
          ? <BarChart data={stats.xp_by_day} />
          : <p className="text-xs text-muted-foreground text-center py-4">No sprint activity yet — complete some sessions!</p>
        }
      </motion.div>

      {/* ── Subject Accuracy ── */}
      {stats.subject_accuracy.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
          className="glass rounded-3xl p-5">
          <p className="font-semibold text-white text-sm mb-4">Subject Accuracy (30d)</p>
          <div className="flex flex-col gap-3">
            {stats.subject_accuracy.map((s, i) => (
              <AccuracyBar key={s.subject} label={s.subject} accuracy={s.accuracy}
                total={s.total} color={subjectColors[i % subjectColors.length]} />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Study Time Breakdown ── */}
      {stats.study_time_by_subject.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="glass rounded-3xl p-5">
          <p className="font-semibold text-white text-sm mb-3">Study Time by Subject</p>
          <div className="flex flex-col gap-2.5">
            {stats.study_time_by_subject.slice(0, 6).map((s, i) => {
              const maxMin = stats.study_time_by_subject[0].minutes;
              const pct = maxMin > 0 ? (s.minutes / maxMin) * 100 : 0;
              const h = Math.floor(s.minutes / 60);
              const m = s.minutes % 60;
              return (
                <div key={s.subject} className="flex items-center gap-3">
                  <span className="text-xs text-white font-medium w-28 shrink-0 truncate">{s.subject}</span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: subjectColors[i % subjectColors.length] }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
                    {h > 0 ? `${h}h ${m}m` : `${m}m`}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Weak Topics ── */}
      {stats.weak_topics.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-3xl p-5">
          <p className="font-semibold text-white text-sm mb-1">Topics Needing Attention</p>
          <p className="text-xs text-muted-foreground mb-4">Topics where your accuracy is below average (min 3 questions)</p>
          <div className="flex flex-col gap-2.5">
            {stats.weak_topics.map((t, i) => {
              const color = t.accuracy < 40 ? '#EF4444' : t.accuracy < 65 ? '#F59E0B' : '#10B981';
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{t.topic}</p>
                    <p className="text-[10px] text-muted-foreground">{t.subject} · {t.count} questions</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color }}>{t.accuracy}%</span>
                </div>
              );
            })}
          </div>
          {stats.weak_topics.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No weak topics detected — great work!</p>
          )}
        </motion.div>
      )}

      {/* Refresh */}
      <button onClick={onRefresh} disabled={refreshing}
        className="flex items-center justify-center gap-2 py-3 text-xs text-primary font-semibold">
        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
      </button>

      <div className="h-4" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsDashboardPage() {
  const { profile, user } = useAuth();
  const isPro = (!!profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()))
    || (user?.created_at ? isInFreeTrial(user.created_at) : false);

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]         = useState<AnalyticsStats | null>(null);
  const [preview, setPreview]     = useState<{ total_sprints: number; total_quizzes: number; xp: number; streak: number } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    if (isPro) {
      const res = await callFn({ action: 'get_stats' });
      if (!res.error && res.data?.stats) setStats(res.data.stats);
    } else {
      const res = await callFn({ action: 'get_preview' });
      if (!res.error && res.data?.preview) setPreview(res.data.preview);
    }

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }, [isPro]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <Link aria-label="Go back" to="/profile"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <TrendingUp size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-bold text-white text-sm">Analytics</h2>
            <p className="text-xs text-muted-foreground">
              {isPro ? 'Your deep performance insights' : 'Upgrade to unlock full analytics'}
            </p>
          </div>
          {isPro && (
            <span className="text-[10px] px-2 py-1 rounded-full font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              PRO
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll pb-nav">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : isPro && stats ? (
          <FullDashboard stats={stats} onRefresh={() => load(true)} refreshing={refreshing} />
        ) : (
          <ProGate preview={preview} />
        )}
      </div>
    </div>
  );
}
