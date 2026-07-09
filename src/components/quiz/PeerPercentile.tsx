import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  topic: string;        // e.g. "Thermodynamics"
  userScore: number;    // 0-100
  className?: string;
}

/**
 * Shows "You scored better than X% of students who attempted this topic today."
 * Pulls live aggregated data from quiz_results — no personal data exposed.
 */
export function PeerPercentile({ topic, userScore, className }: Props) {
  const [percentile, setPercentile] = useState<number | null>(null);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;

    async function fetch() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('quiz_sessions')
        .select('score_pct')
        .eq('topic', topic)
        .gte('completed_at', `${today}T00:00:00Z`)
        .not('score_pct', 'is', null);

      if (cancelled || !data || data.length < 3) return;
      const scores = data.map((r: { score_pct: number }) => r.score_pct);
      const below  = scores.filter((s: number) => s < userScore).length;
      setPercentile(Math.round((below / scores.length) * 100));
    }

    fetch().catch(() => {});
    return () => { cancelled = true; };
  }, [topic, userScore]);

  if (percentile === null) return null;

  const color = percentile >= 75 ? '#10B981' : percentile >= 50 ? '#F59E0B' : '#A855F7';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 rounded-2xl p-3.5 ${className ?? ''}`}
      style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}20` }}>
        <Users size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-bold text-white">
          Better than{' '}
          <span style={{ color }}>{percentile}%</span>{' '}
          of students
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-450)' }}>
          who attempted {topic} today
        </p>
      </div>
    </motion.div>
  );
}
