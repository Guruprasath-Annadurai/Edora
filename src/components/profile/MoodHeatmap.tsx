import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

interface MoodEntry {
  logged_at: string;
  mood: string;
}

const MOOD_COLORS: Record<string, string> = {
  focused:    '#F97316',
  determined: '#7C3AED',
  good:       '#10B981',
  okay:       '#F59E0B',
  low:        '#6B7280',
  anxious:    '#EF4444',
};

const MOOD_LABELS: Record<string, string> = {
  focused: 'Focused', determined: 'Determined', good: 'Good',
  okay: 'Okay', low: 'Low', anxious: 'Anxious',
};

function getLast30Days(): Date[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export function MoodHeatmap({ userId }: { userId: string }) {
  const [entries, setEntries]   = useState<MoodEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<{ date: string; mood: string } | null>(null);

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    supabase.from('user_moods')
      .select('logged_at, mood')
      .eq('user_id', userId)
      .gte('logged_at', from.toISOString())
      .order('logged_at', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as MoodEntry[]);
        setLoading(false);
      });
  }, [userId]);

  const days = getLast30Days();
  const byDay: Record<string, string> = {};
  entries.forEach(e => {
    const day = e.logged_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = e.mood;
  });

  // Mood distribution
  const dist: Record<string, number> = {};
  entries.forEach(e => { dist[e.mood] = (dist[e.mood] ?? 0) + 1; });
  const topMood = Object.keys(dist).sort((a, b) => dist[b] - dist[a])[0] ?? null;

  if (loading) {
    return (
      <div style={{ borderRadius: 20, padding: 20, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', height: 110 }}
        className="animate-pulse" />
    );
  }

  return (
    <div style={{
      borderRadius: 22, padding: 20,
      background: 'var(--surface-elev-08)',
      border: '1px solid rgba(124,58,237,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: '#7C3AED', textTransform: 'uppercase', marginBottom: 2 }}>
            Mood History
          </div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 700, color: '#F4F6FA' }}>
            Last 30 days
          </div>
        </div>
        {topMood && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 12,
            background: `rgba(${hexToRgb(MOOD_COLORS[topMood] ?? '#7C3AED')}, 0.12)`,
            border: `1px solid rgba(${hexToRgb(MOOD_COLORS[topMood] ?? '#7C3AED')}, 0.25)`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: MOOD_COLORS[topMood] ?? '#7C3AED', display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: MOOD_COLORS[topMood] ?? '#7C3AED', textTransform: 'capitalize' }}>
              Usually {topMood}
            </span>
          </div>
        )}
      </div>

      {/* Grid: 6 weeks × 5 rows = 30 days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
        {days.map((d, i) => {
          const key  = d.toISOString().slice(0, 10);
          const mood = byDay[key];
          const color = mood ? (MOOD_COLORS[mood] ?? '#7C3AED') : null;
          const isToday = key === new Date().toISOString().slice(0, 10);
          const isSelected = selected?.date === key;

          return (
            <motion.button
              key={key}
              onClick={() => setSelected(mood ? (isSelected ? null : { date: key, mood }) : null)}
              style={{
                width: '100%', aspectRatio: '1',
                borderRadius: 6,
                background: color ? `rgba(${hexToRgb(color)}, 0.25)` : 'var(--ink-040)',
                border: isToday
                  ? '1.5px solid rgba(124,58,237,0.6)'
                  : isSelected
                  ? `1.5px solid ${color ?? 'var(--ink-200)'}`
                  : '1px solid var(--ink-040)',
                cursor: mood ? 'pointer' : 'default',
                minHeight: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.015, type: 'spring', stiffness: 400, damping: 25 }}
              whileTap={mood ? { scale: 0.88 } : {}}
              aria-label={mood ? `${key}: ${mood}` : key}
            >
            </motion.button>
          );
        })}
      </div>

      {/* Selected day tooltip */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 12,
            background: `rgba(${hexToRgb(MOOD_COLORS[selected.mood] ?? '#7C3AED')}, 0.1)`,
            border: `1px solid rgba(${hexToRgb(MOOD_COLORS[selected.mood] ?? '#7C3AED')}, 0.25)`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: MOOD_COLORS[selected.mood] ?? '#7C3AED', display: 'inline-block' }} />
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: MOOD_COLORS[selected.mood], textTransform: 'capitalize' }}>
              {selected.mood}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 6 }}>
              {new Date(selected.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </motion.div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.entries(MOOD_LABELS).map(([mood, label]) => (
          <div key={mood} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: MOOD_COLORS[mood], display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-350)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
