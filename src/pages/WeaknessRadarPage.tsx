// ═══════════════════════════════════════════════════════════════
// Edora — WeaknessRadarPage
// Spider chart showing per-subject accuracy vs JEE topic weights.
// Auto-schedules a "Fix Your Weaknesses" sprint.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, RefreshCw, Zap, AlertTriangle, TrendingUp, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicStat {
  subject: string;
  topic: string;
  accuracy_pct: number;
  total_q: number;
  last_attempted_at: string | null;
}

interface JEEWeight {
  subject: string;
  topic: string;
  weight_pct: number;
}

interface RadarAxis {
  subject: string;
  accuracy: number;      // 0-100 user's score
  jeeWeight: number;     // 0-100 relative importance
  weakTopics: string[];
}

// ── Colour per subject ────────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  Physics:    '#8B5CF6',
  Chemistry:  '#10B981',
  Maths:      '#3B82F6',
  Biology:    '#F59E0B',
  History:    '#EF4444',
  English:    '#EC4899',
  Other:      '#6B7280',
};

function subjectColor(s: string) { return SUBJECT_COLORS[s] ?? SUBJECT_COLORS.Other; }

function masteryColor(pct: number) {
  if (pct >= 75) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  if (pct >= 30) return '#F97316';
  return '#EF4444';
}

// ── SVG Radar / Spider chart ──────────────────────────────────────────────────

const RADAR_SIZE  = 260;
const RADAR_CX    = RADAR_SIZE / 2;
const RADAR_CY    = RADAR_SIZE / 2;
const RADAR_R     = (RADAR_SIZE / 2) - 34;

function polarToXY(angle: number, radius: number): { x: number; y: number } {
  return {
    x: RADAR_CX + radius * Math.cos(angle - Math.PI / 2),
    y: RADAR_CY + radius * Math.sin(angle - Math.PI / 2),
  };
}

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
}

function RadarChart({ axes }: { axes: RadarAxis[] }) {
  if (axes.length < 3) return null;
  const n      = axes.length;
  const step   = (2 * Math.PI) / n;
  const rings  = [25, 50, 75, 100];

  const userPts    = axes.map((a, i) => polarToXY(i * step, RADAR_R * (a.accuracy / 100)));
  const jeePts     = axes.map((a, i) => polarToXY(i * step, RADAR_R * (Math.min(a.jeeWeight * 2.5, 100) / 100)));
  const axesEndPts = axes.map((_, i) => polarToXY(i * step, RADAR_R));

  return (
    <svg width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}>
      {/* Ring grid lines */}
      {rings.map(r => {
        const pts = axes.map((_, i) => polarToXY(i * step, RADAR_R * (r / 100)));
        return (
          <path key={r} d={pointsToPath(pts)} fill="none"
            stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        );
      })}

      {/* Ring labels */}
      {rings.map(r => {
        const p = polarToXY(0, RADAR_R * (r / 100) + 2);
        return (
          <text key={`lbl-${r}`} x={p.x + 4} y={p.y} fontSize={7}
            fill="rgba(255,255,255,0.25)" dominantBaseline="middle">{r}%</text>
        );
      })}

      {/* Axis spokes */}
      {axesEndPts.map((p, i) => (
        <line key={`spoke-${i}`} x1={RADAR_CX} y1={RADAR_CY} x2={p.x} y2={p.y}
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}

      {/* JEE weight shape */}
      <path d={pointsToPath(jeePts)} fill="rgba(251,191,36,0.06)"
        stroke="rgba(251,191,36,0.3)" strokeWidth={1.5} strokeDasharray="4 3" />

      {/* User accuracy shape */}
      <path d={pointsToPath(userPts)} fill="rgba(91,106,245,0.15)"
        stroke="#5B6AF5" strokeWidth={2} />

      {/* User data points */}
      {userPts.map((p, i) => (
        <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={4}
          fill={masteryColor(axes[i].accuracy)}
          stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
      ))}

      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = RADAR_R + 18;
        const p = polarToXY(i * step, labelR);
        const anchor = p.x < RADAR_CX - 2 ? 'end' : p.x > RADAR_CX + 2 ? 'start' : 'middle';
        return (
          <text key={`ax-${i}`} x={p.x} y={p.y} textAnchor={anchor}
            fontSize={9} fontWeight="700" fill={subjectColor(a.subject)}
            dominantBaseline="middle">
            {a.subject}
          </text>
        );
      })}

      {/* Center dot */}
      <circle cx={RADAR_CX} cy={RADAR_CY} r={3} fill="#5B6AF5" />
    </svg>
  );
}

// ── Topic row ─────────────────────────────────────────────────────────────────

function TopicRow({ stat }: { stat: TopicStat }) {
  const color = masteryColor(stat.accuracy_pct);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{stat.topic}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {stat.total_q} questions · {stat.subject}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <motion.div className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${stat.accuracy_pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: color }} />
        </div>
        <span className="text-xs font-bold w-8 text-right" style={{ color }}>{Math.round(stat.accuracy_pct)}%</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeaknessRadarPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [topics, setTopics]       = useState<TopicStat[]>([]);
  const [jeeWeights, setJeeWeights] = useState<JEEWeight[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const [tpRes, jeeRes] = await Promise.all([
        supabase
          .from('topic_performance')
          .select('subject, topic, accuracy_pct, total_q, last_attempted_at')
          .eq('user_id', user.id)
          .gt('total_q', 0)
          .order('accuracy_pct', { ascending: true }),
        supabase.from('jee_topic_weights').select('subject, topic, weight_pct'),
      ]);
      if (tpRes.error) throw tpRes.error;
      setTopics((tpRes.data ?? []) as TopicStat[]);
      setJeeWeights((jeeRes.data ?? []) as JEEWeight[]);
      track('weakness_radar_viewed', { topic_count: tpRes.data?.length ?? 0 });
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const subjects = Array.from(new Set(topics.map(t => t.subject)));

  const radarAxes: RadarAxis[] = subjects.map(subject => {
    const subTopics = topics.filter(t => t.subject === subject);
    const avgAcc = subTopics.length > 0
      ? subTopics.reduce((sum, t) => sum + t.accuracy_pct, 0) / subTopics.length
      : 0;
    const subJee = jeeWeights.filter(j => j.subject === subject);
    const totalJeeWeight = subJee.reduce((sum, j) => sum + j.weight_pct, 0);
    const weakTopics = subTopics
      .filter(t => t.accuracy_pct < 50)
      .map(t => t.topic)
      .slice(0, 3);
    return { subject, accuracy: avgAcc, jeeWeight: totalJeeWeight, weakTopics };
  });

  const filteredTopics = selectedSubject
    ? topics.filter(t => t.subject === selectedSubject)
    : topics;

  const weakTopics = [...topics]
    .filter(t => t.accuracy_pct < 50 && t.total_q >= 3)
    .sort((a, b) => a.accuracy_pct - b.accuracy_pct)
    .slice(0, 5);

  // ── Launch weakness sprint ─────────────────────────────────────────────────

  async function launchWeaknessSprint() {
    if (!profile || !weakTopics.length) return;
    setLaunching(true);
    try {
      const worstTopic = weakTopics[0];
      const { error: sprintErr } = await supabase.from('sprint_sessions').insert({
        user_id: profile.id,
        mode: 'solo',
        subject: worstTopic.subject,
        topic: worstTopic.topic,
        duration: 600,
        completed: false,
        xp_earned: 0,
      });
      if (sprintErr) throw sprintErr;
      track('weakness_sprint_launched', { topic: worstTopic.topic });
      navigate('/sprint', { state: { subject: worstTopic.subject, topic: worstTopic.topic } });
    } catch (e: any) {
      setError(e.message ?? 'Failed to launch sprint');
      setLaunching(false);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!loading && topics.length === 0) {
    return (
      <div className="h-full native-scroll pb-nav bg-gradient-page">
        <div className="px-4 pt-5">
          <div className="flex items-center gap-3 mb-6">
            <Link aria-label="Go back" to="/profile" className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ChevronLeft size={18} className="text-white" />
            </Link>
            <h1 className="font-heading text-xl font-extrabold text-foreground">Weakness Radar</h1>
          </div>
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(91,106,245,0.1)', border: '2px solid rgba(91,106,245,0.2)' }}>
              <Target size={28} style={{ color: '#5B6AF5' }} />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-white">No Data Yet</h2>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Complete a few quizzes to see your radar.
              </p>
            </div>
            <Button onClick={() => navigate('/quiz')}
              className="px-8 py-3 rounded-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
              Take a Quiz
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full native-scroll pb-nav bg-gradient-page">
      <div className="px-4 pt-5 flex flex-col gap-5 pb-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link aria-label="Go back" to="/profile" className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ChevronLeft size={18} className="text-white" />
            </Link>
            <div>
              <h1 className="font-heading text-xl font-extrabold text-foreground">Weakness Radar</h1>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                vs JEE topic weights
              </p>
            </div>
          </div>
          <button onClick={load}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <RefreshCw size={16} className={`text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={14} style={{ color: '#F87171' }} />
            <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 rounded-full border-2 border-secondary animate-spin"
              style={{ borderTopColor: '#5B6AF5' }} />
          </div>
        ) : (
          <>
            {/* ── Radar chart ── */}
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="rounded-3xl p-5 flex flex-col items-center gap-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(91,106,245,0.2)' }}>

              {radarAxes.length >= 3 ? (
                <>
                  <RadarChart axes={radarAxes} />
                  <div className="flex items-center gap-6 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded" style={{ background: '#5B6AF5' }} />
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Your Score</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded border-t border-dashed" style={{ borderColor: 'rgba(251,191,36,0.5)' }} />
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>JEE Weight</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp size={32} style={{ color: 'rgba(255,255,255,0.2)' }} className="mx-auto mb-2" />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Take quizzes across 3+ subjects to see the radar
                  </p>
                </div>
              )}
            </motion.div>

            {/* ── Weak topics priority list ── */}
            {weakTopics.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-3xl p-5"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} style={{ color: '#F87171' }} />
                    <h2 className="font-heading text-base font-bold text-white">Needs Attention</h2>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                    {weakTopics.length} topics
                  </span>
                </div>
                <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {weakTopics.map(t => <TopicRow key={`${t.subject}-${t.topic}`} stat={t} />)}
                </div>

                <Button onClick={launchWeaknessSprint} disabled={launching}
                  className="w-full mt-5 py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#EF4444,#F97316)', opacity: launching ? 0.7 : 1 }}>
                  <Zap size={16} />
                  {launching ? 'Launching Sprint…' : `Fix "${weakTopics[0].topic}" Now`}
                </Button>
              </motion.div>
            )}

            {/* ── Subject filter tabs ── */}
            {subjects.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 native-scroll">
                <button
                  onClick={() => setSelectedSubject(null)}
                  className="px-4 py-2 rounded-full text-xs font-bold shrink-0 transition-all"
                  style={selectedSubject === null ? {
                    background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                    color: '#fff',
                  } : {
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                  All
                </button>
                {subjects.map(s => (
                  <button key={s}
                    onClick={() => setSelectedSubject(s)}
                    className="px-4 py-2 rounded-full text-xs font-bold shrink-0 transition-all"
                    style={selectedSubject === s ? {
                      background: subjectColor(s),
                      color: '#fff',
                    } : {
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* ── All topics list ── */}
            <div className="rounded-3xl p-5"
              style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="font-heading text-base font-bold text-white mb-3">
                {selectedSubject ?? 'All Topics'}
              </h2>
              {filteredTopics.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  No data for {selectedSubject}
                </p>
              ) : (
                <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {filteredTopics.map(t => (
                    <TopicRow key={`${t.subject}-${t.topic}`} stat={t} />
                  ))}
                </div>
              )}
            </div>

            {/* ── JEE weight reference ── */}
            {jeeWeights.length > 0 && (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-3xl p-5"
                  style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <h2 className="font-heading text-base font-bold text-white mb-3 flex items-center gap-2">
                    <Target size={16} style={{ color: '#FBBF24' }} />
                    JEE Previous Year Weights
                  </h2>
                  <div className="flex flex-col gap-2">
                    {jeeWeights
                      .filter(j => !selectedSubject || j.subject === selectedSubject)
                      .sort((a, b) => b.weight_pct - a.weight_pct)
                      .slice(0, 8)
                      .map(j => {
                        const myTopic = topics.find(t =>
                          t.topic.toLowerCase().includes(j.topic.toLowerCase().split(' ')[0]) ||
                          j.topic.toLowerCase().includes(t.topic.toLowerCase().split(' ')[0])
                        );
                        const myAcc = myTopic?.accuracy_pct ?? null;
                        return (
                          <div key={`${j.subject}-${j.topic}`}
                            className="flex items-center gap-3">
                            <span className="text-xs font-medium w-36 shrink-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                              {j.topic}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                              style={{ background: 'rgba(251,191,36,0.12)' }}>
                              <div className="h-full rounded-full"
                                style={{ width: `${j.weight_pct}%`, background: 'rgba(251,191,36,0.6)' }} />
                            </div>
                            <span className="text-[10px] w-8 text-right shrink-0"
                              style={{ color: 'rgba(251,191,36,0.7)' }}>{j.weight_pct}%</span>
                            {myAcc !== null && (
                              <span className="text-[10px] w-8 text-right shrink-0 font-bold"
                                style={{ color: masteryColor(myAcc) }}>{Math.round(myAcc)}%</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    JEE% = typical paper weightage · My% = your quiz accuracy
                  </p>
                </motion.div>
              </AnimatePresence>
            )}
          </>
        )}
      </div>
    </div>
  );
}
