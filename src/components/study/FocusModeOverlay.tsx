import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pause, Play, RotateCcw } from 'lucide-react';
import { NovoAvatar } from '@/components/novo/NovoAvatar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

interface Props {
  open: boolean;
  onClose: () => void;
  durationMin?: number;
}

const NOVO_MESSAGES = [
  "You're doing great — stay locked in.",
  "10 minutes of deep focus > 1 hour of distraction.",
  "Every minute counts. Novo believes in you.",
  "The best students are consistent, not perfect.",
  "Block out the noise — your future self will thank you.",
];

const DEFAULT_MIN = 25;

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function FocusModeOverlay({ open, onClose, durationMin = DEFAULT_MIN }: Props) {
  const totalSecs = durationMin * 60;
  const [remaining, setRemaining] = useState(totalSecs);
  const [running, setRunning]     = useState(false);
  const [done, setDone]           = useState(false);
  const [msgIdx, setMsgIdx]       = useState(0);

  // Reset when opened
  useEffect(() => {
    if (open) { setRemaining(totalSecs); setRunning(false); setDone(false); }
  }, [open, totalSecs]);

  // Countdown — deps: [running] only, NOT [running, remaining].
  // setRemaining uses the functional form so it always reads the latest value
  // without needing 'remaining' in the dep array. With [running, remaining] the
  // old code created and destroyed a new setInterval every single second (1500
  // intervals in a 25-min session). Now one interval runs for the entire session
  // and is cleared only when running flips to false (pause/complete).
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { setDone(true); setRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  // Rotate Novo messages every 10 min
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setMsgIdx(i => (i + 1) % NOVO_MESSAGES.length);
    }, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [running]);

  const haptic = useCallback(async () => {
    if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Medium });
  }, []);

  function toggle() { haptic(); setRunning(r => !r); }
  function reset()  { haptic(); setRemaining(totalSecs); setRunning(false); setDone(false); }

  const progress = 1 - remaining / totalSecs;
  const strokeDash = 2 * Math.PI * 54; // r=54

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[800] flex flex-col items-center justify-center"
          style={{ background: 'var(--surface-scrim)', backdropFilter: 'blur(24px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

          {/* Close */}
          <button onClick={onClose} aria-label="Close focus mode"
            className="absolute top-14 right-5 w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ink-060)' }}>
            <X size={18} className="text-white" />
          </button>

          <motion.div className="flex flex-col items-center gap-8 px-6"
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', damping: 22 }}>

            {/* Novo */}
            <NovoAvatar state={done ? 'celebrating' : running ? 'talking' : 'idle'} size="lg" />

            {/* Ring timer */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(124,58,237,0.15)" strokeWidth="8" />
                <motion.circle
                  cx="60" cy="60" r="54" fill="none"
                  stroke="url(#fg)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={strokeDash}
                  strokeDashoffset={strokeDash * (1 - progress)}
                  transition={{ duration: 1, ease: 'linear' }}
                />
                <defs>
                  <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#A855F7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="text-center">
                <p className="font-mono text-3xl font-bold text-white tabular-nums">
                  {formatTime(remaining)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-400)' }}>
                  {done ? 'Complete!' : 'Focus'}
                </p>
              </div>
            </div>

            {/* Novo message */}
            <AnimatePresence mode="wait">
              <motion.p key={done ? 'done' : msgIdx}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="text-center text-sm max-w-xs"
                style={{ color: 'var(--ink-650)' }}>
                {done ? 'Focus session complete — take a short break.' : NOVO_MESSAGES[msgIdx]}
              </motion.p>
            </AnimatePresence>

            {/* Controls */}
            <div className="flex gap-4">
              <motion.button whileTap={{ scale: 0.92 }} onClick={reset}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                <RotateCcw size={18} className="text-white" />
              </motion.button>

              <motion.button whileTap={{ scale: 0.92 }} onClick={done ? onClose : toggle}
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 32px rgba(124,58,237,0.5)' }}>
                {done
                  ? <span className="text-white text-xs font-bold">Done</span>
                  : running
                    ? <Pause size={24} className="text-white" fill="white" />
                    : <Play  size={24} className="text-white" fill="white" />}
              </motion.button>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--ink-250)' }}>
              Phone calls still work · Tap × to exit early
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
