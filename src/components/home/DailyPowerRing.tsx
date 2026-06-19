import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Props {
  className?: string;
}

export function DailyPowerRing({ className = '' }: Props) {
  const { user }  = useAuth();
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(0);
  const [loading, setLoading]     = useState(true);

  const MAX = 6;
  const size    = 64;
  const stroke  = 5;
  const r       = (size - stroke) / 2;
  const circ    = 2 * Math.PI * r;
  const pct     = Math.min(1, progress / MAX);
  const offset  = circ * (1 - pct);

  const ringColor = completed
    ? '#10B981'
    : progress >= 4
    ? '#F59E0B'
    : '#5B6AF5';

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke('novo-daily-session', {
          body: { action: 'get_progress' },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (res.data) {
          setProgress(res.data.progress ?? 0);
          setCompleted(!!res.data.completed);
          setXpAwarded(res.data.xp_awarded ?? 0);
        }
      } catch { /* non-critical */ }
      setLoading(false);
    })();
  }, [user]);

  return (
    <Link to="/daily-session" className={`block ${className}`}>
      <motion.div
        whileTap={{ scale: 0.96 }}
        className="rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-transform"
        style={{
          background: completed
            ? 'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(5,150,105,0.08))'
            : 'linear-gradient(135deg,rgba(91,106,245,0.12),rgba(139,92,246,0.08))',
          border: `1px solid ${completed ? 'rgba(16,185,129,0.2)' : 'rgba(91,106,245,0.2)'}`,
          boxShadow: completed
            ? '0 4px 24px rgba(16,185,129,0.1)'
            : '0 4px 24px rgba(91,106,245,0.12)',
        }}
      >
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          {loading ? (
            <div
              className="w-full h-full rounded-full animate-pulse"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
          ) : (
            <>
              <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}
                />
                <motion.circle
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none" stroke={ringColor} strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  initial={{ strokeDashoffset: circ }}
                  animate={{ strokeDashoffset: offset }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                  style={{ filter: `drop-shadow(0 0 4px ${ringColor}80)` }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {completed ? (
                  <CheckCircle2 size={20} style={{ color: '#10B981' }} />
                ) : (
                  <>
                    <span
                      className="font-heading font-extrabold leading-none"
                      style={{ fontSize: 18, color: ringColor }}
                    >
                      {progress}
                    </span>
                    <span className="text-[9px] text-white/35 font-semibold">/{MAX}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Zap size={12} style={{ color: completed ? '#10B981' : '#5B6AF5' }} />
            <p className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: completed ? 'rgba(16,185,129,0.7)' : 'rgba(91,106,245,0.7)' }}>
              Daily Power Session
            </p>
          </div>
          {loading ? (
            <div className="h-4 w-32 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          ) : completed ? (
            <p className="text-sm font-bold text-white">Completed! +{xpAwarded} XP</p>
          ) : (
            <p className="text-sm font-bold text-white">
              {progress === 0 ? 'Start your 10-min session' : `${MAX - progress} items left`}
            </p>
          )}
          <p className="text-[11px] text-white/35 mt-0.5">
            {completed
              ? 'See you tomorrow'
              : '3 flashcards · 2 PYQ · 1 concept'}
          </p>
        </div>

        {/* Arrow */}
        {!completed && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.2)' }}
          >
            <Zap size={13} style={{ color: '#A0AEFF', fill: '#A0AEFF' }} />
          </div>
        )}
      </motion.div>
    </Link>
  );
}
