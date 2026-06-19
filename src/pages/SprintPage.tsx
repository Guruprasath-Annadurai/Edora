import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, User, Clock, ChevronRight, X, CheckCircle, Pause, Play } from 'lucide-react';
import { AddTeamIcon, TrophyIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatDuration } from '@/lib/utils';
import { loadUnlockedIds, checkAchievements, checkSprintCountAchievements } from '@/lib/achievements';
import { track } from '@/lib/analytics';

type Phase = 'select' | 'active' | 'complete';

const SUBJECTS = [
  'Mathematics','Physics','Chemistry','Biology',
  'History','English','Economics','Computer Science',
];

const SPRINT_DURATIONS = [
  { label: '10 min', value: 600,  xp: 50  },
  { label: '15 min', value: 900,  xp: 75  },
  { label: '25 min', value: 1500, xp: 125 },
  { label: '45 min', value: 2700, xp: 200 },
];

export default function SprintPage() {
  const { profile } = useAuth();
  const [phase, setPhase]         = useState<Phase>('select');
  const [subject, setSubject]     = useState('');
  const [topic, setTopic]         = useState('');
  const [duration, setDuration]   = useState(600);
  const [timeLeft, setTimeLeft]   = useState(600);
  const [paused, setPaused]       = useState(false);
  const [xpEarned, setXpEarned]   = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const intervalRef        = useRef<ReturnType<typeof setInterval>>();
  const timeLeftRef        = useRef(600);
  const durationRef        = useRef(600);
  const completeSprintRef  = useRef<() => void>(() => {});
  useEffect(() => { completeSprintRef.current = completeSprint; });
  useEffect(() => { durationRef.current = duration; }, [duration]);

  useEffect(() => {
    if (phase !== 'active' || paused) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        const next = t <= 1 ? 0 : t - 1;
        timeLeftRef.current = next;
        if (next === 0) { clearInterval(intervalRef.current); completeSprintRef.current(); }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase, paused]);

  function startSprint() {
    setPhase('active');
    setTimeLeft(durationRef.current);
    timeLeftRef.current = durationRef.current;
  }

  async function completeSprint() {
    const d      = durationRef.current;
    const spent  = d - timeLeftRef.current;
    const maxXP  = SPRINT_DURATIONS.find(s => s.value === d)?.xp ?? 50;
    const earned = Math.max(10, Math.round((spent / d) * maxXP));
    setXpEarned(earned); setElapsedSeconds(spent); setPhase('complete');
    track('sprint_complete', { mode: 'solo', subject, xp: earned, duration: d });
    if (profile) {
      const { error: insertError } = await supabase.from('sprint_sessions').insert({
        user_id: profile.id, mode: 'solo', subject, topic,
        duration: d, completed: true, xp_earned: earned,
      });
      if (!insertError) {
        await supabase.rpc('increment_xp', { user_id: profile.id, amount: earned });
        const { count } = await supabase
          .from('sprint_sessions').select('*',{count:'exact',head:true})
          .eq('user_id',profile.id).eq('completed',true);
        const isFirst = (count ?? 0) === 1;
        const unlocked = await loadUnlockedIds(profile.id);
        const updatedProfile = { xp: profile.xp + earned, streak_count: profile.streak_count };
        await checkAchievements({ userId: profile.id, unlocked, profile: updatedProfile, extras: { isFirstSprint: isFirst } });
        await checkSprintCountAchievements(profile.id, unlocked);
      }
    }
  }

  function reset() {
    setPhase('select'); setSubject(''); setTopic('');
    setTimeLeft(durationRef.current); timeLeftRef.current = durationRef.current;
    setPaused(false);
  }

  const progress      = ((durationRef.current - timeLeft) / durationRef.current) * 100;
  const circumference = 2 * Math.PI * 88;

  return (
    <div className="h-full native-scroll px-4 pt-5 pb-nav" style={{ background: 'transparent' }}>
      <AnimatePresence mode="wait">

        {/* ── SELECT ── */}
        {phase === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex flex-col gap-5"
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                  boxShadow: '0 0 20px rgba(245,158,11,0.45)',
                }}
              >
                <Zap size={20} className="text-white fill-white" />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/40">Focus Mode</p>
                <h1 className="font-heading text-2xl font-extrabold text-white leading-tight">Study Sprint</h1>
              </div>
            </div>

            {/* Mode cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="p-4 rounded-3xl flex flex-col items-center gap-2"
                style={{
                  background: 'rgba(91,106,245,0.12)',
                  border: '1.5px solid rgba(91,106,245,0.35)',
                  boxShadow: '0 0 16px rgba(91,106,245,0.15)',
                }}
              >
                <User size={28} style={{ color: '#A0AEFF' }} />
                <span className="font-semibold text-sm" style={{ color: '#A0AEFF' }}>Solo Sprint</span>
                <div
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(91,106,245,0.2)', color: '#A0AEFF' }}
                >
                  +50 XP
                </div>
              </div>

              <Link
                to="/study-rooms"
                className="relative p-4 rounded-3xl flex flex-col items-center gap-2 active:scale-95 transition-all"
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}
              >
                <AddTeamIcon size={28} style={{ color: '#6EE7B7' }} />
                <span className="font-semibold text-sm" style={{ color: '#6EE7B7' }}>Group Sprint</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}
                >
                  Live Now
                </span>
              </Link>
            </div>

            {/* Subject grid */}
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/40 mb-2">Choose Subject</p>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    className="py-3 px-4 rounded-2xl text-sm font-semibold transition-all text-left active:scale-95"
                    style={subject === s ? {
                      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                      color: '#fff',
                      boxShadow: '0 4px 20px rgba(91,106,245,0.4)',
                      border: '1px solid transparent',
                    } : {
                      background: 'rgba(15,20,45,0.7)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration selector */}
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/40 mb-2">Duration</p>
              <div className="grid grid-cols-4 gap-2">
                {SPRINT_DURATIONS.map(({ label, value, xp }) => (
                  <button
                    key={value}
                    onClick={() => { setDuration(value); durationRef.current = value; }}
                    className="flex flex-col items-center py-3 rounded-2xl text-xs font-bold transition-all active:scale-95"
                    style={duration === value ? {
                      background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
                      border: '1px solid transparent',
                    } : {
                      background: 'rgba(15,20,45,0.7)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] mt-0.5 opacity-70">+{xp} XP</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Topic input */}
            <div
              className="flex items-center px-4 h-14 rounded-2xl"
              style={{
                background: 'rgba(15,20,45,0.7)',
                border: '1.5px solid rgba(91,106,245,0.2)',
              }}
            >
              <input
                type="text"
                placeholder="Topic (optional — e.g. Quadratic Equations)"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder:text-white/25 text-sm outline-none font-medium"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
            </div>

            {/* Start button */}
            <button
              onClick={startSprint}
              disabled={!subject}
              className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-30"
              style={subject ? {
                background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                boxShadow: '0 6px 28px rgba(245,158,11,0.4)',
              } : {
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <Zap size={18} className="fill-white" />
              Start Sprint
            </button>
          </motion.div>
        )}

        {/* ── ACTIVE ── */}
        {phase === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-between h-full py-8"
          >
            {/* Status */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                {paused ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#FDE68A' }}>Paused</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(239,68,68,0.8)' }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#FCA5A5' }}>Sprint Active</span>
                  </>
                )}
              </div>
              <h2 className="font-heading text-lg font-bold text-white">{subject}</h2>
              {topic && <p className="text-white/40 text-sm">{topic}</p>}
            </div>

            {/* Countdown ring */}
            <div
              className="relative w-56 h-56 flex items-center justify-center"
              style={{
                filter: paused
                  ? 'drop-shadow(0 0 20px rgba(245,158,11,0.3))'
                  : 'drop-shadow(0 0 24px rgba(91,106,245,0.5))',
              }}
            >
              <svg className="w-56 h-56 -rotate-90 absolute inset-0">
                <circle cx="112" cy="112" r="88" stroke="rgba(255,255,255,0.05)" strokeWidth="10" fill="none" />
                <motion.circle
                  cx="112" cy="112" r="88"
                  stroke={paused ? 'url(#pauseGrad)' : 'url(#sprintGrad)'}
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress / 100)}
                  transition={{ duration: paused ? 0 : 1, ease: 'linear' }}
                />
                <defs>
                  <linearGradient id="sprintGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5B6AF5" /><stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                  <linearGradient id="pauseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F59E0B" /><stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="flex flex-col items-center justify-center z-10">
                <Clock size={22} className="mb-2" style={{ color: paused ? '#FDE68A' : '#A0AEFF' }} />
                <span className="font-heading text-4xl font-bold text-white">{formatDuration(timeLeft)}</span>
                <span className="text-xs text-white/35 mt-1">{paused ? 'paused' : 'remaining'}</span>
              </div>
            </div>

            {/* Focus tip */}
            <div
              className="rounded-3xl p-4 w-full text-center"
              style={{
                background: paused
                  ? 'rgba(245,158,11,0.07)'
                  : 'rgba(91,106,245,0.07)',
                border: `1px solid ${paused ? 'rgba(245,158,11,0.2)' : 'rgba(91,106,245,0.15)'}`,
              }}
            >
              <p className="text-sm font-semibold text-white/70">
                {paused
                  ? 'Sprint is paused. Resume when you\'re ready.'
                  : 'Put your phone face-down, close other tabs, and stay on topic. You can do this.'}
              </p>
            </div>

            {/* Controls */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setPaused(p => !p)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
                style={paused ? {
                  background: 'linear-gradient(135deg,#10B981,#059669)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
                  border: '1px solid transparent',
                } : {
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  color: '#FDE68A',
                }}
              >
                {paused
                  ? <><Play size={16} className="fill-white" /> Resume</>
                  : <><Pause size={16} /> Pause</>}
              </button>

              <button
                onClick={completeSprint}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#FCA5A5',
                }}
              >
                <X size={16} /> End Early
              </button>
            </div>
          </motion.div>
        )}

        {/* ── COMPLETE ── */}
        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center justify-center h-full gap-6"
          >
            <div className="text-7xl">🏅</div>

            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold text-white">Sprint Complete!</h2>
              <p className="text-white/45 mt-1">Outstanding focus session.</p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full">
              {[
                { label: 'Duration', value: formatDuration(elapsedSeconds), icon: Clock,     color: '#67E8F9' },
                { label: 'XP Earned', value: `+${xpEarned}`,               icon: TrophyIcon, color: '#FDE68A' },
                { label: 'Mode',     value: 'Solo',                          icon: User,      color: '#A0AEFF' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="rounded-2xl p-4 text-center"
                  style={{
                    background: 'rgba(15,20,45,0.7)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: `0 4px 16px ${color}22`,
                  }}
                >
                  <Icon size={20} style={{ color }} className="mx-auto mb-1.5" />
                  <p className="font-heading font-bold text-white" style={{ color }}>{value}</p>
                  <p className="text-xs text-white/35 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={reset}
              className="w-full py-4 rounded-2xl font-bold text-base text-white active:scale-98 transition-all"
              style={{
                background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                boxShadow: '0 6px 28px rgba(91,106,245,0.4)',
              }}
            >
              Start Another Sprint
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
