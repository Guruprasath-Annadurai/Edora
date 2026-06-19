import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Zap, Clock, Target, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DNAData {
  topSubject:    string | null;
  peakHour:      number | null;
  avgSessionMin: number;
  accuracyPct:   number;
  streakMax:     number;
  studyStyle:    'sprinter' | 'marathon' | 'night-owl' | 'early-bird' | 'consistent';
}

const STYLE_LABELS = {
  sprinter:    { label: 'The Sprinter',    desc: 'Short intense bursts', color: '#F97316' },
  marathon:    { label: 'The Marathon',    desc: 'Long focused sessions', color: '#7C3AED' },
  'night-owl': { label: 'The Night Owl',   desc: 'Peak performance after 10pm', color: '#A855F7' },
  'early-bird':{ label: 'The Early Bird',  desc: 'Best performance before noon', color: '#F59E0B' },
  consistent:  { label: 'The Consistent',  desc: 'Steady daily progress', color: '#10B981' },
};

function Helix({ color }: { color: string }) {
  return (
    <svg width="40" height="56" viewBox="0 0 40 56" fill="none">
      {[0,1,2,3,4,5,6].map(i => {
        const y = i * 8;
        const r = 8 * Math.abs(Math.sin((i / 6) * Math.PI));
        return (
          <motion.circle key={i} cx={20} cy={y + 4} r={r}
            fill="none" stroke={color} strokeWidth={1.5} opacity={0.5 + r / 16}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 20 }}
          />
        );
      })}
      <motion.line x1="20" y1="0" x2="20" y2="56" stroke={color} strokeWidth={1.5} opacity={0.3}
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.4 }} />
    </svg>
  );
}

export function StudyDNA({ userId }: { userId: string }) {
  const [dna, setDna]       = useState<DNAData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sprints, quizStats, profile] = await Promise.all([
        supabase.from('sprint_sessions').select('subject,duration,created_at')
          .eq('user_id', userId).eq('completed', true).order('created_at', { ascending: false }).limit(100),
        supabase.from('topic_stats').select('subject,correct_count,attempt_count')
          .eq('user_id', userId),
        supabase.from('profiles').select('streak_count').eq('id', userId).single(),
      ]);

      const sessions = sprints.data ?? [];
      const stats    = quizStats.data ?? [];

      // Top subject
      const subjCount: Record<string, number> = {};
      sessions.forEach(s => { subjCount[s.subject] = (subjCount[s.subject] ?? 0) + 1; });
      const topSubject = Object.keys(subjCount).sort((a, b) => subjCount[b] - subjCount[a])[0] ?? null;

      // Peak hour
      const hourCount: Record<number, number> = {};
      sessions.forEach(s => {
        const h = new Date(s.created_at).getHours();
        hourCount[h] = (hourCount[h] ?? 0) + 1;
      });
      const peakHour = Object.keys(hourCount).length
        ? Number(Object.keys(hourCount).sort((a, b) => hourCount[Number(b)] - hourCount[Number(a)])[0])
        : null;

      // Avg session duration
      const totalDur = sessions.reduce((s, r) => s + (r.duration ?? 0), 0);
      const avgSessionMin = sessions.length ? Math.round(totalDur / sessions.length / 60) : 0;

      // Accuracy
      const totalCorrect  = stats.reduce((s, r) => s + (r.correct_count ?? 0), 0);
      const totalAttempts = stats.reduce((s, r) => s + (r.attempt_count ?? 0), 0);
      const accuracyPct   = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

      // Study style
      let studyStyle: DNAData['studyStyle'] = 'consistent';
      if (peakHour !== null && peakHour >= 22) studyStyle = 'night-owl';
      else if (peakHour !== null && peakHour <= 9) studyStyle = 'early-bird';
      else if (avgSessionMin < 15) studyStyle = 'sprinter';
      else if (avgSessionMin > 45) studyStyle = 'marathon';

      setDna({
        topSubject,
        peakHour,
        avgSessionMin,
        accuracyPct,
        streakMax: (profile.data as { streak_count: number } | null)?.streak_count ?? 0,
        studyStyle,
      });
      setLoading(false);
    })();
  }, [userId]);

  if (loading) {
    return (
      <div style={{ borderRadius: 20, padding: '20px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', height: 120 }}
        className="animate-pulse" />
    );
  }
  if (!dna) return null;

  const style = STYLE_LABELS[dna.studyStyle];
  const stats = [
    { icon: Target,    label: 'Accuracy',     value: `${dna.accuracyPct}%`,  color: '#10B981' },
    { icon: Clock,     label: 'Avg Session',  value: `${dna.avgSessionMin}m`, color: '#F59E0B' },
    { icon: TrendingUp,label: 'Best Streak',  value: `${dna.streakMax}d`,    color: '#EF4444' },
    { icon: Zap,       label: 'Peak Hour',    value: dna.peakHour !== null ? `${dna.peakHour}:00` : '–', color: '#A855F7' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 22,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(168,85,247,0.06))',
        border: '1px solid rgba(124,58,237,0.2)',
        boxShadow: '0 4px 24px rgba(124,58,237,0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <Helix color={style.color} />
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: '#7C3AED', textTransform: 'uppercase', marginBottom: 4 }}>
            Study DNA
          </div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 800, color: '#F4F6FA', lineHeight: 1.2 }}>
            {style.label}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {style.desc}
            {dna.topSubject && ` · ${dna.topSubject} specialist`}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {stats.map(({ icon: Icon, label, value, color }) => (
          <div key={label} style={{
            padding: '10px 6px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <Icon size={14} style={{ color }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#F4F6FA' }}>{value}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
