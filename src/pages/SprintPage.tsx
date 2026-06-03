import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Users, User, Clock, ChevronRight, Trophy, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatDuration } from '@/lib/utils';

type Phase = 'select' | 'matching' | 'active' | 'complete';

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English', 'Economics', 'Computer Science'];
const SPRINT_DURATION = 600; // 10 minutes

export default function SprintPage() {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<Phase>('select');
  const [mode, setMode] = useState<'solo' | 'group'>('solo');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [timeLeft, setTimeLeft] = useState(SPRINT_DURATION);
  const [matchTimer, setMatchTimer] = useState(60);
  const [matchCount, setMatchCount] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Sprint timer
  useEffect(() => {
    if (phase !== 'active') return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(intervalRef.current); completeSprint(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase]);

  // Matchmaking timer
  useEffect(() => {
    if (phase !== 'matching') return;
    const sim = setTimeout(() => setMatchCount(Math.floor(Math.random() * 3) + 1), 2000);
    const timeout = setInterval(() => {
      setMatchTimer(t => {
        if (t <= 1) { clearInterval(timeout); startSprint(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { clearTimeout(sim); clearInterval(timeout); };
  }, [phase]);

  function startMatching() {
    if (!subject) return;
    if (mode === 'solo') { startSprint(); return; }
    setPhase('matching');
    setMatchTimer(60);
  }

  function startSprint() {
    setPhase('active');
    setTimeLeft(SPRINT_DURATION);
  }

  async function completeSprint() {
    const earned = mode === 'group' ? 75 : 50;
    setXpEarned(earned);
    setPhase('complete');
    if (profile) {
      await supabase.from('sprint_sessions').insert({
        user_id: profile.id, mode, subject, topic,
        duration: SPRINT_DURATION, completed: true, xp_earned: earned,
      });
      await supabase.rpc('increment_xp', { user_id: profile.id, amount: earned });
    }
  }

  function reset() {
    setPhase('select'); setSubject(''); setTopic('');
    setTimeLeft(SPRINT_DURATION); setMatchCount(0);
  }

  const progress = ((SPRINT_DURATION - timeLeft) / SPRINT_DURATION) * 100;
  const circumference = 2 * Math.PI * 88;

  return (
    <div className="h-full native-scroll px-4 py-4">
      <AnimatePresence mode="wait">

        {/* ── SELECT ── */}
        {phase === 'select' && (
          <motion.div key="select" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-5">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">Study Sprint</h1>
              <p className="text-muted-foreground text-sm mt-1">10-minute focused session</p>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-3">
              {(['solo', 'group'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`p-4 rounded-3xl flex flex-col items-center gap-2 transition-all border
                    ${mode === m ? 'border-primary/50 nova-glow' : 'glass border-transparent'}`}
                  style={mode === m ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.2))' } : {}}>
                  {m === 'solo' ? <User size={28} className={mode === m ? 'text-primary' : 'text-muted-foreground'} /> : <Users size={28} className={mode === m ? 'text-primary' : 'text-muted-foreground'} />}
                  <span className={`font-semibold text-sm ${mode === m ? 'text-primary' : 'text-muted-foreground'}`}>
                    {m === 'solo' ? 'Solo Sprint' : 'Group Sprint'}
                  </span>
                  <span className="text-xs text-muted-foreground">{m === 'solo' ? '+50 XP' : '+75 XP'}</span>
                </button>
              ))}
            </div>

            {/* Subject */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Subject</p>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map(s => (
                  <button key={s} onClick={() => setSubject(s)}
                    className={`py-3 px-4 rounded-2xl text-sm font-medium transition-all text-left
                      ${subject === s ? 'bg-primary text-white' : 'glass text-muted-foreground'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div className="glass rounded-2xl flex items-center px-4 h-12">
              <input type="text" placeholder="Topic (optional — e.g. Quadratic Equations)"
                value={topic} onChange={e => setTopic(e.target.value)}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
            </div>

            <Button size="lg" onClick={startMatching} disabled={!subject} className="w-full">
              {mode === 'solo' ? 'Start Sprint' : 'Find Study Partners'}
              <ChevronRight size={18} />
            </Button>
          </motion.div>
        )}

        {/* ── MATCHING ── */}
        {phase === 'matching' && (
          <motion.div key="matching" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-full gap-8">
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 -rotate-90">
                <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
                <motion.circle cx="80" cy="80" r="72" stroke="url(#matchGrad)" strokeWidth="8" fill="none"
                  strokeLinecap="round" strokeDasharray={2 * Math.PI * 72}
                  strokeDashoffset={(2 * Math.PI * 72) * (1 - matchTimer / 60)}
                  transition={{ duration: 1, ease: 'linear' }} />
                <defs><linearGradient id="matchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#06B6D4" />
                </linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Users size={28} className="text-primary mb-1" />
                <span className="font-heading text-2xl font-bold text-foreground">{matchTimer}s</span>
              </div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {[...Array(3)].map((_, i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
              <h2 className="font-heading text-xl font-bold text-foreground">Finding Partners</h2>
              <p className="text-muted-foreground text-sm mt-1">{subject} · {topic || 'Any Topic'}</p>
              {matchCount > 0 && <p className="text-green-400 text-sm mt-2 font-medium">{matchCount} student{matchCount > 1 ? 's' : ''} found!</p>}
            </div>

            <div className="flex flex-col gap-3 w-full">
              <Button onClick={startSprint} className="w-full">Start Now ({matchCount} joined)</Button>
              <Button variant="ghost" onClick={reset} className="w-full">Cancel</Button>
            </div>
          </motion.div>
        )}

        {/* ── ACTIVE ── */}
        {phase === 'active' && (
          <motion.div key="active" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-between h-full py-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Sprint Active</span>
              </div>
              <h2 className="font-heading text-lg font-bold text-foreground">{subject}</h2>
              {topic && <p className="text-muted-foreground text-sm">{topic}</p>}
            </div>

            {/* Ring timer */}
            <div className="relative w-56 h-56">
              <svg className="w-56 h-56 -rotate-90">
                <circle cx="112" cy="112" r="88" stroke="rgba(255,255,255,0.06)" strokeWidth="12" fill="none" />
                <motion.circle cx="112" cy="112" r="88"
                  stroke="url(#sprintGrad)" strokeWidth="12" fill="none" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress / 100)}
                  transition={{ duration: 1, ease: 'linear' }} />
                <defs><linearGradient id="sprintGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#06B6D4" />
                </linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Clock size={24} className="text-primary mb-2" />
                <span className="font-heading text-4xl font-bold text-foreground">{formatDuration(timeLeft)}</span>
                <span className="text-xs text-muted-foreground mt-1">remaining</span>
              </div>
            </div>

            <Card className="w-full">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-muted-foreground">Focus tip</p>
                <p className="text-foreground font-medium mt-1 text-sm">
                  Put your phone face-down, close other tabs, and stay on topic. You can do this! 💪
                </p>
              </CardContent>
            </Card>

            <Button variant="destructive" onClick={completeSprint} className="w-full">
              <X size={16} /> End Sprint Early
            </Button>
          </motion.div>
        )}

        {/* ── COMPLETE ── */}
        {phase === 'complete' && (
          <motion.div key="complete" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full gap-6">
            <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6 }}>
              <CheckCircle size={72} className="text-green-400" strokeWidth={1.5} />
            </motion.div>
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold text-foreground">Sprint Complete!</h2>
              <p className="text-muted-foreground mt-1">Great focus session 🔥</p>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full">
              {[
                { label: 'Duration', value: '10:00', icon: Clock },
                { label: 'XP Earned', value: `+${xpEarned}`, icon: Trophy },
                { label: 'Mode', value: mode === 'group' ? 'Group' : 'Solo', icon: mode === 'group' ? Users : User },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                  <CardContent className="pt-4 text-center">
                    <Icon size={20} className="text-primary mx-auto mb-1" />
                    <p className="font-heading font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button size="lg" onClick={reset} className="w-full">Start Another Sprint</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
