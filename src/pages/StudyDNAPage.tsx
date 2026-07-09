import {useState, useEffect} from 'react';
import {motion} from 'framer-motion';
import { ArrowLeft, Share2, Loader2, Zap, Flame, Target, BookOpen, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeeklyStats {
  xpEarned:        number;
  sessionsCompleted: number;
  topicsStudied:   number;
  streakDays:      number;
  strongestSubject: string;
  weakestSubject:  string;
  totalMinutes:    number;
  quizAccuracy:    number;
  topTopics:       Array<{ topic: string; subject: string; wins: number }>;
  weakTopics:      Array<{ topic: string; subject: string; struggles: number }>;
}

// ── DNA Helix animation ───────────────────────────────────────────────────────

function DNAHelix({ stats }: { stats: WeeklyStats }) {
  const pairs = 12;
  const subjects = ['Physics', 'Chemistry', 'Maths', 'Biology'];
  const subjectColors: Record<string, string> = {
    Physics:   '#5B6AF5',
    Chemistry: '#10B981',
    Maths:     '#F59E0B',
    Biology:   '#EC4899' };

  return (
    <div className="relative flex justify-center" style={{ height: 240, overflow: 'hidden' }}>
      <svg width={120} height={240} viewBox="0 0 120 240">
        {Array.from({ length: pairs }, (_, i) => {
          const y     = 10 + i * (220 / pairs);
          const phase = (i / pairs) * Math.PI * 2;
          const x1    = 60 + Math.cos(phase) * 40;
          const x2    = 60 + Math.cos(phase + Math.PI) * 40;
          const subj  = subjects[i % 4];
          const color = subjectColors[subj];
          const size  = 4 + (stats.xpEarned > 0 ? (i % 3) : 0);

          return (
            <g key={i}>
              {/* Connection bar */}
              <motion.line
                x1={x1} y1={y} x2={x2} y2={y}
                stroke={`${color}55`} strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              />
              {/* Left node */}
              <motion.circle
                cx={x1} cy={y} r={size}
                fill={color}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 300 }}
                style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
              />
              {/* Right node */}
              <motion.circle
                cx={x2} cy={y} r={size}
                fill={`${color}88`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 + 0.02, type: 'spring', stiffness: 300 }}
              />
            </g>
          );
        })}

        {/* Left spine */}
        <motion.path
          d={`M 60 10 ${Array.from({ length: pairs }, (_, i) => {
            const y = 10 + i * (220 / pairs);
            const phase = (i / pairs) * Math.PI * 2;
            const x = 60 + Math.cos(phase) * 40;
            return `L ${x} ${y}`;
          }).join(' ')}`}
          fill="none" stroke="rgba(91,106,245,0.3)" strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
        {/* Right spine */}
        <motion.path
          d={`M 60 10 ${Array.from({ length: pairs }, (_, i) => {
            const y = 10 + i * (220 / pairs);
            const phase = (i / pairs) * Math.PI * 2;
            const x = 60 + Math.cos(phase + Math.PI) * 40;
            return `L ${x} ${y}`;
          }).join(' ')}`}
          fill="none" stroke="rgba(16,185,129,0.3)" strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.1 }}
        />
      </svg>

      {/* Subject legend */}
      <div className="absolute right-0 top-0 flex flex-col gap-2 justify-center" style={{ height: 240 }}>
        {Object.entries({ 'Physics': '#5B6AF5', 'Chem': '#10B981', 'Maths': '#F59E0B', 'Bio': '#EC4899' }).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: c }} />
            <span className="text-xs text-white/40">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div className="flex-1 p-3 rounded-2xl flex flex-col items-center text-center gap-1"
      style={{ background: `${color}12`, border: `1px solid ${color}22` }}>
      <Icon size={16} style={{ color }} />
      <p className="text-xl font-black text-white">{value}</p>
      <p className="text-xs text-white/50 font-medium leading-tight">{label}</p>
      {sub && <p className="text-xs" style={{ color: `${color}99` }}>{sub}</p>}
    </div>
  );
}

// ── Share card canvas builder ─────────────────────────────────────────────────

function buildShareCard(stats: WeeklyStats, name: string): string {
  const c  = document.createElement('canvas');
  c.width  = 400;
  c.height = 600;
  const ctx = c.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, '#0a0c1c');
  bg.addColorStop(1, '#0f1428');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 400, 600);

  // Header bar
  const hdr = ctx.createLinearGradient(0, 0, 400, 0);
  hdr.addColorStop(0, '#5B6AF5');
  hdr.addColorStop(1, '#8B5CF6');
  ctx.fillStyle = hdr;
  ctx.beginPath();
  ctx.roundRect(20, 20, 360, 80, 16);
  ctx.fill();

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px system-ui';
  ctx.fillText('Study DNA Report', 40, 55);
  ctx.fillStyle = 'var(--ink-700)';
  ctx.font = '14px system-ui';
  ctx.fillText(`${name} · Week of ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, 40, 78);

  // Stats grid
  const statItems = [
    { label: 'XP Earned',   value: `+${stats.xpEarned}`,           color: '#F59E0B' },
    { label: 'Sessions',    value: String(stats.sessionsCompleted), color: '#5B6AF5' },
    { label: 'Accuracy',    value: `${stats.quizAccuracy}%`,        color: '#10B981' },
    { label: 'Streak',      value: `${stats.streakDays}d`,          color: '#EC4899' },
  ];

  statItems.forEach((item, i) => {
    const x = 20 + (i % 2) * 190;
    const y = 120 + Math.floor(i / 2) * 110;
    ctx.fillStyle = `${item.color}22`;
    ctx.beginPath();
    ctx.roundRect(x, y, 175, 95, 12);
    ctx.fill();
    ctx.strokeStyle = `${item.color}44`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = item.color;
    ctx.font = 'bold 32px system-ui';
    ctx.fillText(item.value, x + 16, y + 48);
    ctx.fillStyle = 'var(--ink-500)';
    ctx.font = '12px system-ui';
    ctx.fillText(item.label, x + 16, y + 70);
  });

  // Top topics
  ctx.fillStyle = 'var(--ink-080)';
  ctx.beginPath();
  ctx.roundRect(20, 360, 360, 120, 12);
  ctx.fill();
  ctx.fillStyle = 'var(--ink-400)';
  ctx.font = 'bold 11px system-ui';
  ctx.fillText('THIS WEEK\'S STRONGEST TOPICS', 36, 382);
  stats.topTopics.slice(0, 3).forEach((t, i) => {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui';
    ctx.fillText(`${i + 1}. ${t.topic} (${t.subject})`, 36, 405 + i * 24);
  });

  // Footer
  ctx.fillStyle = 'var(--ink-200)';
  ctx.font = '12px system-ui';
  ctx.fillText('Made with Edora · edora.app', 20, 570);

  return c.toDataURL('image/png');
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudyDNAPage() {
  const { user, profile } = useAuth();
  const [stats,   setStats]   = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared,  setShared]  = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Student';

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [
        { data: sprints },
        { data: quizzes },
        { data: topicStats },
        { data: profileData },
      ] = await Promise.all([
        supabase.from('sprint_sessions')
          .select('subject, topic, xp_earned, duration_mins, created_at')
          .eq('user_id', user.id)
          .gte('created_at', weekAgo),
        supabase.from('quiz_sessions')
          .select('subject, score, total: questions_count')
          .eq('user_id', user.id)
          .gte('created_at', weekAgo),
        supabase.from('topic_stats')
          .select('subject, topic, struggle_count, win_count')
          .eq('user_id', user.id)
          .order('win_count', { ascending: false })
          .limit(20),
        supabase.from('profiles')
          .select('xp, streak_count')
          .eq('id', user.id)
          .single(),
      ]);

      const sprintList = sprints ?? [];
      const quizList   = quizzes ?? [];
      const tsList     = topicStats ?? [];

      const xpEarned     = sprintList.reduce((s: number, r: { xp_earned?: number }) => s + (r.xp_earned ?? 0), 0);
      const totalMinutes = sprintList.reduce((s: number, r: { duration_mins?: number }) => s + (r.duration_mins ?? 15), 0);
      const topicsSet    = new Set([...sprintList.map((r: { topic: string }) => r.topic), ...tsList.map((r: { topic: string }) => r.topic)]);
      const quizAcc      = quizList.length > 0
        ? Math.round(quizList.reduce((s: number, q: { score: number; total: number }) => s + (q.score / Math.max(1, q.total)), 0) / quizList.length * 100)
        : 0;

      // Subject breakdown
      const subjectWins: Record<string, number> = {};
      const subjectStruggles: Record<string, number> = {};
      tsList.forEach((t: { subject: string; win_count: number; struggle_count: number }) => {
        subjectWins[t.subject]      = (subjectWins[t.subject] ?? 0) + t.win_count;
        subjectStruggles[t.subject] = (subjectStruggles[t.subject] ?? 0) + t.struggle_count;
      });

      const subjects   = Object.keys(subjectWins);
      const strongest  = subjects.sort((a, b) => (subjectWins[b] ?? 0) - (subjectWins[a] ?? 0))[0] ?? '—';
      const weakest    = subjects.sort((a, b) => (subjectStruggles[b] ?? 0) - (subjectStruggles[a] ?? 0))[0] ?? '—';

      const topTopics = tsList
        .filter((t: { win_count: number }) => t.win_count > 0)
        .slice(0, 5)
        .map((t: { topic: string; subject: string; win_count: number }) => ({ topic: t.topic, subject: t.subject, wins: t.win_count }));

      const weakTopics = tsList
        .filter((t: { struggle_count: number; win_count: number }) => t.struggle_count > t.win_count)
        .slice(0, 3)
        .map((t: { topic: string; subject: string; struggle_count: number }) => ({ topic: t.topic, subject: t.subject, struggles: t.struggle_count }));

      setStats({
        xpEarned, sessionsCompleted: sprintList.length,
        topicsStudied: topicsSet.size,
        streakDays: profileData?.streak_count ?? 0,
        strongestSubject: strongest, weakestSubject: weakest,
        totalMinutes, quizAccuracy: quizAcc,
        topTopics, weakTopics });
      setLoading(false);
    })();
  }, [user]);

  async function handleShare() {
    if (!stats) return;
    try {
      const dataUrl = buildShareCard(stats, firstName);
      const blob    = await (await fetch(dataUrl)).blob();
      const file    = new File([blob], 'edora-study-dna.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Edora Study DNA Report', text: `I studied ${stats.sessionsCompleted} sessions and earned ${stats.xpEarned} XP this week.` });
      } else {
        const a  = document.createElement('a');
        a.href   = dataUrl;
        a.download = 'edora-study-dna.png';
        a.click();
      }
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch { /* user cancelled */ }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-white/50 text-sm">Building your DNA report…</p>
      </div>
    );
  }

  if (!stats) return null;

  const weekStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/home"
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
              style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
              <ArrowLeft size={18} className="text-white" />
            </Link>
            <div>
              <h1 className="font-heading font-extrabold text-white text-lg">Study DNA</h1>
              <p className="text-xs text-white/40">Week ending {weekStr}</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: shared ? 'rgba(16,185,129,0.15)' : 'rgba(91,106,245,0.15)', border: `1px solid ${shared ? 'rgba(16,185,129,0.4)' : 'rgba(91,106,245,0.4)'}` }}>
            <Share2 size={14} color={shared ? '#10B981' : '#A0AEFF'} />
            <span className="text-xs font-bold" style={{ color: shared ? '#10B981' : '#A0AEFF' }}>
              {shared ? 'Saved!' : 'Share'}
            </span>
          </motion.button>
        </div>
      </div>

      <div className="flex-1 native-scroll px-4 pb-nav flex flex-col gap-4">

        {/* DNA visualization */}
        <div className="rounded-3xl p-4"
          style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
          <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider text-center">Your Study DNA</p>
          <DNAHelix stats={stats} />
        </div>

        {/* Stats grid */}
        <div className="flex gap-2">
          <StatCard icon={Zap}      label="XP Earned"  value={`+${stats.xpEarned}`}  color="#F59E0B" />
          <StatCard icon={Flame}    label="Streak"     value={`${stats.streakDays}d`} color="#EF4444" />
          <StatCard icon={Target}   label="Accuracy"   value={`${stats.quizAccuracy}%`} color="#10B981" />
          <StatCard icon={BookOpen} label="Sessions"   value={stats.sessionsCompleted} color="#5B6AF5" />
        </div>

        {/* Subject breakdown */}
        <div className="p-4 rounded-2xl"
          style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
          <p className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">Subject Verdict</p>
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <p className="text-xs text-white/40">Strongest</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <p className="text-white font-bold text-sm">{stats.strongestSubject}</p>
              </div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex-1 flex flex-col gap-1">
              <p className="text-xs text-white/40">Needs work</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <p className="text-white font-bold text-sm">{stats.weakestSubject}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top topics */}
        {stats.topTopics.length > 0 && (
          <div className="p-4 rounded-2xl"
            style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-070)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={14} color="#F59E0B" />
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Top Topics This Week</p>
            </div>
            {stats.topTopics.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0"
                style={{ borderColor: 'var(--ink-050)' }}>
                <span className="text-xs font-black text-white/30 w-4">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{t.topic}</p>
                  <p className="text-xs text-white/40">{t.subject}</p>
                </div>
                <span className="text-xs font-bold" style={{ color: '#10B981' }}>{t.wins} wins</span>
              </div>
            ))}
          </div>
        )}

        {/* Weak topics — next week focus */}
        {stats.weakTopics.length > 0 && (
          <div className="p-4 rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: '#F87171' }}>Focus Next Week</p>
            {stats.weakTopics.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="text-xs text-red-400">⚠</span>
                <p className="text-sm text-white/70 flex-1">{t.topic} <span className="text-white/30 text-xs">({t.subject})</span></p>
                <span className="text-xs" style={{ color: '#F87171' }}>{t.struggles} struggles</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
