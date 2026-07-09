import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {ArrowLeft, Loader2, TrendingUp, TrendingDown, Target, Brain} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicStat {
  subject:        string;
  topic:          string;
  struggle_count: number;
  win_count:      number;
  last_active:    string;
}

interface QuizSession {
  id:           string;
  subject:      string;
  topic:        string;
  score:        number;
  total:        number;
  completed_at: string;
}

interface CoachNote {
  verdict:       string;
  topStrength:   string;
  topWeakness:   string;
  actionItems:   string[];
  motivationLine: string;
}

// ── Radar chart (SVG) ─────────────────────────────────────────────────────────

function RadarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const n     = labels.length;
  const cx    = 100;
  const cy    = 100;
  const r     = 80;
  const steps = [0.25, 0.5, 0.75, 1.0];

  function point(angle: number, radius: number) {
    const a = (angle - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  const axisAngles = labels.map((_, i) => (360 / n) * i);
  const dataPoints = values.map((v, i) => point(axisAngles[i], (v / 100) * r));
  const polyline   = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ maxWidth: 200, maxHeight: 200 }}>
      {/* Grid rings */}
      {steps.map(s => (
        <polygon key={s}
          points={axisAngles.map(a => { const p = point(a, s * r); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="var(--ink-080)" strokeWidth={1} />
      ))}
      {/* Axes */}
      {axisAngles.map((a, i) => {
        const p = point(a, r);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--ink-100)" strokeWidth={1} />;
      })}
      {/* Data polygon */}
      <polygon points={polyline} fill={`${color}33`} stroke={color} strokeWidth={2} />
      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} />
      ))}
      {/* Labels */}
      {labels.map((label, i) => {
        const p = point(axisAngles[i], r + 16);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="var(--ink-600)" fontSize={9} fontWeight={600}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Cricket batting card row ──────────────────────────────────────────────────

function BattingRow({ rank, topic, subject, attempted, correct, color }: {
  rank: number; topic: string; subject: string;
  attempted: number; correct: number; color: string;
}) {
  const avg    = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const isPoor = avg < 50;
  return (
    <div className="flex items-center gap-2 py-2.5 border-b" style={{ borderColor: 'var(--ink-050)' }}>
      <span className="text-xs text-white/30 w-5 shrink-0 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{topic}</p>
        <p className="text-xs text-white/40">{subject}</p>
      </div>
      <div className="flex gap-3 text-right shrink-0">
        <div>
          <p className="text-xs text-white/30">Att</p>
          <p className="text-xs font-bold text-white">{attempted}</p>
        </div>
        <div>
          <p className="text-xs text-white/30">Cor</p>
          <p className="text-xs font-bold text-white">{correct}</p>
        </div>
        <div>
          <p className="text-xs text-white/30">Avg</p>
          <p className="text-xs font-bold" style={{ color: isPoor ? '#EF4444' : color }}>{avg}%</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MockPostmortemPage() {
  const { user, profile } = useAuth();
  const [searchParams]    = useSearchParams();
  const _sessionId        = searchParams.get('session');

  const [topicStats,    setTopicStats]    = useState<TopicStat[]>([]);
  const [recentSessions, setRecentSessions] = useState<QuizSession[]>([]);
  const [coachNote,     setCoachNote]     = useState<CoachNote | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<'batting' | 'radar' | 'coach'>('batting');

  const examName = profile?.exam_name ?? 'JEE';

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: stats }, { data: sessions }] = await Promise.all([
        supabase.from('topic_stats')
          .select('subject, topic, struggle_count, win_count, last_active')
          .eq('user_id', user.id)
          .order('struggle_count', { ascending: false })
          .limit(20),
        supabase.from('quiz_sessions')
          .select('id, subject, topic, score, total: questions_count, completed_at')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(10),
      ]);

      const ts = (stats ?? []) as TopicStat[];
      const qs = (sessions ?? []) as QuizSession[];
      setTopicStats(ts);
      setRecentSessions(qs);

      // Generate AI coach note
      if (ts.length > 0) {
        try {
          const weakList  = ts.slice(0, 5).map(t => `${t.subject}/${t.topic}: ${t.struggle_count} struggles, ${t.win_count} wins`).join('\n');
          const strongList = [...ts].sort((a, b) => b.win_count - a.win_count).slice(0, 3).map(t => `${t.subject}/${t.topic}`).join(', ');
          const avgScore   = qs.length > 0 ? Math.round(qs.reduce((s, q) => s + (q.score / Math.max(1, q.total)), 0) / qs.length * 100) : 0;

          const note = await geminiJSON<CoachNote>(`
You are an expert ${examName} coach doing a postmortem analysis for a student.

Weak topics (worst first):
${weakList}
Strongest topics: ${strongList}
Average quiz score: ${avgScore}%

Return a JSON coaching report:
{
  "verdict": "1 sentence overall verdict (honest, not harsh)",
  "topStrength": "1 sentence about their strongest area",
  "topWeakness": "1 sentence naming their #1 weak spot and what to do about it",
  "actionItems": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "motivationLine": "1 sentence motivational closer (specific, not generic)"
}`);
          setCoachNote(note);
        } catch {
          setCoachNote({
            verdict: 'You have clear patterns to work on — both strengths and weaknesses are identifiable.',
            topStrength: 'Your consistent topics show genuine mastery when you engage with them.',
            topWeakness: 'Your top struggle topic needs targeted practice — attempt it in Novo chat first.',
            actionItems: ['Spend 20 min daily on your weakest topic', 'Use spaced repetition for formula recall', 'Take one timed mock per week'],
            motivationLine: 'Every JEE topper had these exact patterns at this stage. The work is the way.' });
        }
      }
      setLoading(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Radar chart: subject-wise win rates
  const subjects = ['Physics', 'Chemistry', 'Maths', 'Biology'];
  const radarValues = subjects.map(subj => {
    const rows = topicStats.filter(t => t.subject === subj);
    if (rows.length === 0) return 50;
    const total    = rows.reduce((s, r) => s + r.struggle_count + r.win_count, 0);
    const wins     = rows.reduce((s, r) => s + r.win_count, 0);
    return total > 0 ? Math.round((wins / total) * 100) : 50;
  });

  // Overall score from recent sessions
  const overallAcc = recentSessions.length > 0
    ? Math.round(recentSessions.reduce((s, q) => s + (q.score / Math.max(1, q.total)), 0) / recentSessions.length * 100)
    : 0;

  const topicColor = '#5B6AF5';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-white/50 text-sm">Analysing your performance…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" />
          </Link>
          <div>
            <h1 className="font-heading font-extrabold text-white text-lg">Mock Postmortem</h1>
            <p className="text-xs text-white/40">Cricket-style performance analysis</p>
          </div>
        </div>

        {/* Summary row */}
        <div className="flex gap-3 mb-4">
          {[
            { icon: Target, label: 'Accuracy', value: `${overallAcc}%`, color: overallAcc >= 70 ? '#10B981' : overallAcc >= 50 ? '#F59E0B' : '#EF4444' },
            { icon: TrendingDown, label: 'Weak Topics', value: String(topicStats.filter(t => t.struggle_count > t.win_count).length), color: '#EF4444' },
            { icon: TrendingUp, label: 'Strong Topics', value: String(topicStats.filter(t => t.win_count >= t.struggle_count).length), color: '#10B981' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex-1 p-3 rounded-2xl text-center"
              style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
              <Icon size={16} style={{ color }} className="mx-auto mb-1" />
              <p className="text-lg font-black" style={{ color }}>{value}</p>
              <p className="text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--ink-040)' }}>
          {([
            { key: 'batting', label: 'Batting Card' },
            { key: 'radar',   label: 'Radar' },
            { key: 'coach',   label: 'Coach' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: activeTab === tab.key ? 'var(--ink-100)' : 'transparent',
                color: activeTab === tab.key ? 'white' : 'var(--ink-400)' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 native-scroll px-4 pb-nav">

        {/* Batting Card */}
        {activeTab === 'batting' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Header row */}
            <div className="flex items-center gap-2 py-2 mb-1">
              <span className="text-xs text-white/30 w-5 shrink-0 text-center">#</span>
              <span className="flex-1 text-xs text-white/30 font-bold uppercase tracking-wider">Topic</span>
              <div className="flex gap-3 text-right shrink-0">
                {['Att', 'Cor', 'Avg'].map(h => (
                  <span key={h} className="text-xs text-white/30 font-bold uppercase w-6 text-right">{h}</span>
                ))}
              </div>
            </div>
            {topicStats.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-white/40 text-sm">No quiz data yet.</p>
                <p className="text-white/25 text-xs mt-1">Complete some quizzes to see your batting card.</p>
              </div>
            ) : (
              topicStats.map((t, i) => (
                <BattingRow
                  key={i} rank={i + 1}
                  topic={t.topic} subject={t.subject}
                  attempted={t.struggle_count + t.win_count}
                  correct={t.win_count}
                  color={topicColor}
                />
              ))
            )}
          </motion.div>
        )}

        {/* Radar Chart */}
        {activeTab === 'radar' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 pt-2">
            <RadarChart
              labels={subjects}
              values={radarValues}
              color={topicColor}
            />
            <div className="w-full flex flex-col gap-2">
              {subjects.map((subj, i) => (
                <div key={subj} className="flex items-center gap-3">
                  <span className="text-sm text-white/60 w-20 shrink-0">{subj}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${radarValues[i]}%` }}
                      transition={{ delay: i * 0.1, duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: radarValues[i] >= 70 ? '#10B981' : radarValues[i] >= 50 ? '#5B6AF5' : '#EF4444' }}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-10 text-right">{radarValues[i]}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Coach Note */}
        {activeTab === 'coach' && coachNote && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3 pt-2">
            <div className="p-4 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(91,106,245,0.3)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} color="#A0AEFF" />
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Coach Verdict</p>
              </div>
              <p className="text-white text-sm leading-relaxed">{coachNote.verdict}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-2xl"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: '#10B981' }}>STRENGTH</p>
                <p className="text-xs text-white/70 leading-relaxed">{coachNote.topStrength}</p>
              </div>
              <div className="p-3 rounded-2xl"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: '#EF4444' }}>⚠️ FIX THIS</p>
                <p className="text-xs text-white/70 leading-relaxed">{coachNote.topWeakness}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl"
              style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
              <p className="text-xs font-bold text-white/50 mb-3 uppercase tracking-wider">Action Plan</p>
              {coachNote.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <span className="text-primary font-bold text-sm shrink-0">{i + 1}.</span>
                  <p className="text-white/80 text-sm">{item}</p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl text-center"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="text-sm font-bold italic" style={{ color: '#FCD34D' }}>"{coachNote.motivationLine}"</p>
            </div>
          </motion.div>
        )}

        {activeTab === 'coach' && !coachNote && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-white/40 text-sm">Complete some quizzes first</p>
            <p className="text-white/25 text-xs">Coach analysis requires quiz history</p>
          </div>
        )}
      </div>
    </div>
  );
}
