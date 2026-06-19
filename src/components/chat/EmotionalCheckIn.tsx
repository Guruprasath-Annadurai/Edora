import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckInMood = 'focused' | 'tired' | 'stressed' | 'motivated';

export interface MoodEntry {
  mood: CheckInMood;
  date: string; // YYYY-MM-DD
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const storageKey = (uid: string, date: string) => `edora_mood_${uid}_${date}`;

export function getTodayMood(uid: string): MoodEntry | null {
  const date = new Date().toISOString().slice(0, 10);
  const raw = storage.getItem(storageKey(uid, date));
  if (!raw) return null;
  try { return JSON.parse(raw) as MoodEntry; }
  catch { return null; }
}

function saveMoodLocally(uid: string, mood: CheckInMood) {
  const date = new Date().toISOString().slice(0, 10);
  const entry: MoodEntry = { mood, date };
  storage.setItem(storageKey(uid, date), JSON.stringify(entry));
}

async function persistMoodToDb(uid: string, mood: CheckInMood) {
  const date = new Date().toISOString().slice(0, 10);
  await supabase
    .from('user_mood_checkins')
    .upsert({ user_id: uid, date, mood }, { onConflict: 'user_id,date' })
    .then(() => {});
}

// ── System prompt addendum per mood ─────────────────────────────────────────

export function getMoodSystemAddendum(mood: CheckInMood): string {
  switch (mood) {
    case 'focused':
      return '\n\nEMOTIONAL CONTEXT: Student is focused and in a good headspace today. Maintain brisk, high-quality explanations. Challenge them appropriately. End with a stretch question.';
    case 'tired':
      return '\n\nEMOTIONAL CONTEXT: Student is tired today. Shorten explanations. Use more bullet points instead of paragraphs. Celebrate every small win loudly. Avoid long walls of text. Suggest short 15-min sprints. Do NOT push for complex derivations today.';
    case 'stressed':
      return '\n\nEMOTIONAL CONTEXT: Student is stressed right now. Start with one reassuring sentence. Break everything into the smallest possible step. Never add "but first you need to understand..." detours. Address one concept at a time. Be exceptionally patient. If they make an error, validate the attempt before correcting.';
    case 'motivated':
      return '\n\nEMOTIONAL CONTEXT: Student is highly motivated today. Match their energy. Push slightly harder than usual. Introduce connections to advanced topics. This is a good day to tackle their most persistent weak spot — bring it up naturally.';
  }
}

// ── Breathing Exercise (for stressed mode) ────────────────────────────────────

const BREATHING_PHASES = [
  { label: 'Breathe In', duration: 4000, scale: 1.35, color: '#5B6AF5' },
  { label: 'Hold', duration: 4000, scale: 1.35, color: '#8B5CF6' },
  { label: 'Breathe Out', duration: 6000, scale: 0.75, color: '#10B981' },
  { label: 'Hold', duration: 2000, scale: 0.75, color: '#06B6D4' },
] as const;

function BreathingExercise({ onDone }: { onDone: () => void }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(Math.round(BREATHING_PHASES[0].duration / 1000));
  const [cycles, setCycles] = useState(0);
  const TOTAL_CYCLES = 3;

  const phaseRef = useRef(phaseIdx);
  phaseRef.current = phaseIdx;
  const cycleRef = useRef(cycles);
  cycleRef.current = cycles;

  useEffect(() => {
    const phase = BREATHING_PHASES[phaseRef.current];
    const tick = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    const advance = setTimeout(() => {
      clearInterval(tick);
      const nextIdx = (phaseRef.current + 1) % BREATHING_PHASES.length;
      const nextCycles = nextIdx === 0 ? cycleRef.current + 1 : cycleRef.current;
      if (nextCycles >= TOTAL_CYCLES) { onDone(); return; }
      setCycles(nextCycles);
      setPhaseIdx(nextIdx);
      setCountdown(Math.round(BREATHING_PHASES[nextIdx].duration / 1000));
    }, phase.duration);

    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [phaseIdx, onDone]);

  const phase = BREATHING_PHASES[phaseIdx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center gap-10"
      style={{ minHeight: 320 }}>

      <div className="text-center">
        <p className="text-white/50 text-sm font-medium mb-1">Box Breathing — Cycle {cycles + 1}/{TOTAL_CYCLES}</p>
        <p className="text-white font-heading font-bold text-xl">You've got this.</p>
      </div>

      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        {/* Outer pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${phase.color}22 0%, transparent 70%)` }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Main breathing circle */}
        <motion.div
          className="rounded-full flex flex-col items-center justify-center"
          style={{
            width: 120, height: 120,
            background: `radial-gradient(circle at 40% 40%, ${phase.color}cc, ${phase.color}66)`,
            boxShadow: `0 0 40px ${phase.color}66`,
          }}
          animate={{ scale: phase.scale }}
          transition={{ duration: phase.duration / 1000, ease: 'easeInOut' }}>
          <span className="text-3xl font-bold text-white">{countdown}</span>
        </motion.div>
      </div>

      <motion.p
        key={phase.label}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-bold"
        style={{ color: phase.color }}>
        {phase.label}
      </motion.p>

      <button
        onClick={onDone}
        className="text-white/40 text-sm underline underline-offset-4 active:text-white/70">
        Skip
      </button>
    </motion.div>
  );
}

// ── Mood cards config ─────────────────────────────────────────────────────────

const MOODS: Array<{
  key: CheckInMood;
  emoji: string;
  label: string;
  sublabel: string;
  gradient: string;
  glow: string;
}> = [
  {
    key: 'focused',
    emoji: '🎯',
    label: "Focused",
    sublabel: "Ready to deep-dive",
    gradient: 'linear-gradient(135deg, #5B6AF5, #4F46E5)',
    glow: 'rgba(91,106,245,0.4)',
  },
  {
    key: 'motivated',
    emoji: '🔥',
    label: "Motivated",
    sublabel: "Let's crush it",
    gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)',
    glow: 'rgba(245,158,11,0.4)',
  },
  {
    key: 'tired',
    emoji: '😴',
    label: "Tired",
    sublabel: "Need lighter sessions",
    gradient: 'linear-gradient(135deg, #64748B, #475569)',
    glow: 'rgba(100,116,139,0.4)',
  },
  {
    key: 'stressed',
    emoji: '😰',
    label: "Stressed",
    sublabel: "Need to calm down",
    gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    glow: 'rgba(139,92,246,0.4)',
  },
];

// ── Main component ─────────────────────────────────────────────────────────────

interface EmotionalCheckInProps {
  userId: string;
  firstName: string;
  onComplete: (mood: CheckInMood) => void;
  onSkip: () => void;
}

export function EmotionalCheckIn({ userId, firstName, onComplete, onSkip }: EmotionalCheckInProps) {
  const [selected, setSelected] = useState<CheckInMood | null>(null);
  const [phase, setPhase] = useState<'pick' | 'breathing' | 'done'>('pick');

  async function handleMoodSelect(mood: CheckInMood) {
    setSelected(mood);
    saveMoodLocally(userId, mood);
    persistMoodToDb(userId, mood);

    if (mood === 'stressed') {
      setPhase('breathing');
    } else {
      setPhase('done');
      onComplete(mood);
    }
  }

  function handleBreathingDone() {
    setPhase('done');
    onComplete('stressed');
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, rgba(91,106,245,0.15) 0%, rgba(10,12,28,0.98) 60%)',
        backdropFilter: 'blur(20px)',
      }}>

      <AnimatePresence mode="wait">
        {phase === 'pick' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col flex-1 px-5 pt-16 pb-10">

            {/* Header */}
            <div className="mb-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', boxShadow: '0 8px 32px rgba(91,106,245,0.4)' }}>
                <span className="text-3xl">🧠</span>
              </motion.div>
              <h2 className="font-heading font-extrabold text-white text-2xl leading-tight mb-2">
                Hey {firstName}, how are you feeling?
              </h2>
              <p className="text-white/50 text-sm leading-relaxed">
                Novo adapts to your state. Honest answer = better session.
              </p>
            </div>

            {/* Mood grid */}
            <div className="grid grid-cols-2 gap-3 flex-1">
              {MOODS.map((m, i) => (
                <motion.button
                  key={m.key}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 300, damping: 22 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => handleMoodSelect(m.key)}
                  className="flex flex-col items-start justify-between rounded-3xl p-5 relative overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    minHeight: 120,
                  }}>
                  {/* Background gradient on hover is handled via the border glow */}
                  <span className="text-4xl">{m.emoji}</span>
                  <div className="mt-auto">
                    <p className="font-bold text-white text-base leading-tight">{m.label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{m.sublabel}</p>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Skip */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              onClick={onSkip}
              className="mt-6 text-white/30 text-sm text-center w-full py-2 active:text-white/60">
              Skip for now
            </motion.button>

          </motion.div>
        )}

        {phase === 'breathing' && (
          <motion.div
            key="breathing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col flex-1 items-center justify-center px-5">
            <div className="text-center mb-8">
              <span className="text-4xl">🌬️</span>
              <h2 className="font-heading font-extrabold text-white text-xl mt-3 mb-1">
                Let's calm your mind first
              </h2>
              <p className="text-white/40 text-sm">3 cycles of box breathing before we study</p>
            </div>
            <BreathingExercise onDone={handleBreathingDone} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
