import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring, dur } from '@/lib/motion';
import { X, Flame, Zap, Smile, Meh, Frown, CloudRain, Brain } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface MoodCheckInProps {
  userId: string;
  onClose: (mood: string | null) => void;
}

const MOODS = [
  { icon: Flame,     label: 'Focused',    value: 'focused',    color: '#F97316' },
  { icon: Zap,       label: 'Determined', value: 'determined', color: '#7C3AED' },
  { icon: Smile,     label: 'Good',       value: 'good',       color: '#10B981' },
  { icon: Meh,       label: 'Okay',       value: 'okay',       color: '#F59E0B' },
  { icon: Frown,     label: 'Low',        value: 'low',        color: '#6B7280' },
  { icon: CloudRain, label: 'Anxious',    value: 'anxious',    color: '#EF4444' },
];

const MOOD_MESSAGES: Record<string, string> = {
  focused:    "Let's lock in. Novo is ready.",
  determined: "That energy? Let's channel it right.",
  good:       "Perfect mindset for a solid session.",
  okay:       "Even okay days stack up. Let's go.",
  low:        "Low energy? Short bursts work. I've got you.",
  anxious:    "Breathe. One concept at a time. That's all.",
};

export function MoodCheckIn({ userId, onClose }: MoodCheckInProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  async function pickMood(value: string) {
    setSelected(value);
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* web */ }

    setSaving(true);
    await supabase.from('user_moods').insert({
      user_id:   userId,
      mood:      value,
      logged_at: new Date().toISOString(),
    }).then(() => {});

    setTimeout(() => onClose(value), 900);
  }

  const mood = MOODS.find(m => m.value === selected);

  return (
    <motion.div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dur.fast }}
    >
      <motion.div
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(180deg, var(--grad-mood-card-1) 0%, var(--grad-mood-card-2) 100%)',
          borderRadius: '28px 28px 0 0',
          border: '1px solid rgba(124,58,237,0.2)',
          borderBottom: 'none',
          padding: '28px 24px',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring.gentle}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              color: '#7C3AED', marginBottom: 4, textTransform: 'uppercase',
            }}>
              Daily Check-In
            </div>
            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 800, color: '#F4F6FA', lineHeight: 1.2 }}>
              How are you feeling?
            </h2>
          </div>
          <button
            onClick={() => onClose(null)}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--ink-060)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--ink-080)',
            }}
            aria-label="Close"
          >
            <X size={16} style={{ color: 'var(--ink-500)' }} />
          </button>
        </div>

        {/* Mood grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {MOODS.map((m) => (
            <motion.button
              key={m.value}
              onClick={() => pickMood(m.value)}
              disabled={saving}
              style={{
                padding: '14px 8px',
                borderRadius: 18,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: selected === m.value
                  ? `rgba(${hexToRgb(m.color)}, 0.15)`
                  : 'var(--ink-040)',
                border: selected === m.value
                  ? `1.5px solid ${m.color}60`
                  : '1.5px solid var(--ink-060)',
                boxShadow: selected === m.value
                  ? `0 0 16px rgba(${hexToRgb(m.color)}, 0.2)`
                  : 'none',
                cursor: 'pointer',
                minHeight: 44,
              }}
              whileTap={{ scale: 0.93 }}
              animate={selected === m.value ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <m.icon size={24} style={{ color: m.color }} strokeWidth={1.8} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: selected === m.value ? m.color : 'var(--ink-600)',
              }}>
                {m.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Novo response */}
        <AnimatePresence>
          {selected && mood && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                background: 'rgba(124,58,237,0.1)',
                border: '1px solid rgba(124,58,237,0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Brain size={18} style={{ color: '#8B5CF6', flexShrink: 0 }} strokeWidth={1.7} />
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-850)', lineHeight: 1.5 }}>
                  {MOOD_MESSAGES[selected]}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
