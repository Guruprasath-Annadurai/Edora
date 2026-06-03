import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Flame, Star, Brain, BookOpen, Zap, Target, Bell, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Progress } from '@/components/ui/progress';
import { getLevelFromXP, getXPForLevel } from '@/lib/utils';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return { label: 'Night owl mode 🦉',    sub: 'Still going strong!' };
  if (h < 12) return { label: 'Good Morning',           sub: 'Ready to learn today?' };
  if (h < 17) return { label: 'Good Afternoon',         sub: "Let's keep the streak going!" };
  if (h < 21) return { label: 'Good Evening',           sub: 'One more session tonight?' };
  return       { label: 'Burning midnight oil 🔥',      sub: 'Dedication is key!' };
}

const NOVA_MESSAGES = [
  "You're learning great today! 🚀",
  'Keep up the amazing work! ⭐',
  'Every session makes you smarter! 🧠',
  "You're on fire! Don't stop now! 🔥",
  'Consistency is your superpower! 💪',
];

const quickActions = [
  { to: '/chat',      icon: Brain,    label: 'Ask Nova',   color: '#5B6AF5', bg: 'rgba(91,106,245,0.12)'  },
  { to: '/sprint',    icon: Zap,      label: 'Sprint',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  { to: '/flashcard', icon: BookOpen, label: 'Flashcards', color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  { to: '/quiz',      icon: Target,   label: 'Quiz',       color: '#EC4899', bg: 'rgba(236,72,153,0.12)'  },
];

interface ChallengeState { id: string; title: string; xp: number; done: boolean; }

function todayKey(uid: string) {
  return `challenges_${uid}_${new Date().toISOString().slice(0, 10)}`;
}
function getAwardedSet(uid: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(todayKey(uid)) ?? '[]')); }
  catch { return new Set(); }
}
function markAwarded(uid: string, id: string) {
  const s = getAwardedSet(uid); s.add(id);
  localStorage.setItem(todayKey(uid), JSON.stringify([...s]));
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const xp            = profile?.xp ?? 0;
  const level         = getLevelFromXP(xp);
  const nextLevelXP   = getXPForLevel(level + 1);
  const currentLevelXP= getXPForLevel(level);
  const levelProgress = Math.round(((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);
  const streak        = profile?.streak_count ?? 0;
  const firstName     = profile?.full_name?.split(' ')[0] ?? 'Explorer';
  const initials      = (profile?.full_name ?? 'E').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const greeting      = getGreeting();
  const novaMsg       = NOVA_MESSAGES[new Date().getDay() % NOVA_MESSAGES.length];

  const [challenges, setChallenges] = useState<ChallengeState[]>([
    { id: 'sprint',    title: 'Complete a 10-min Sprint', xp: 50, done: false },
    { id: 'flashcard', title: 'Review 10 Flashcards',     xp: 30, done: false },
    { id: 'chat',      title: 'Ask Nova 3 Questions',     xp: 20, done: false },
  ]);
  const awardedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    awardedRef.current = getAwardedSet(user.id);
    const todayISO = new Date(new Date().setHours(0,0,0,0)).toISOString();

    Promise.all([
      supabase.from('sprint_sessions').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('completed', true).gte('created_at', todayISO),
      supabase.from('flashcards').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gt('repetitions', 0).gte('updated_at', todayISO),
      supabase.from('tutor_chats').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('role', 'user').gte('created_at', todayISO),
    ]).then(async ([s, f, c]) => {
      const counts = { sprint: s.count ?? 0, flashcard: f.count ?? 0, chat: c.count ?? 0 };
      const thresholds = { sprint: 1, flashcard: 10, chat: 3 };
      const rewards    = { sprint: 50, flashcard: 30, chat: 20 };
      for (const id of Object.keys(thresholds) as (keyof typeof thresholds)[]) {
        if (counts[id] >= thresholds[id] && !awardedRef.current.has(id)) {
          markAwarded(user.id, id);
          awardedRef.current.add(id);
          supabase.rpc('increment_xp', { user_id: user.id, amount: rewards[id] });
        }
      }
      setChallenges(prev => prev.map(ch => ({
        ...ch, done: (counts[ch.id as keyof typeof counts] ?? 0) >= thresholds[ch.id as keyof typeof thresholds],
      })));
    });
  }, [user]);

  return (
    <div className="h-full native-scroll bg-background px-4 py-4 flex flex-col gap-4">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            {initials}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{greeting.sub}</p>
            <h1 className="font-heading text-lg font-bold text-foreground leading-tight">
              Hello {firstName} 👋
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-secondary border border-border">
            <Flame size={14} className="text-orange-400" />
            <span className="text-xs font-bold text-foreground">{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-secondary border border-border">
            <Star size={14} className="text-yellow-400" />
            <span className="text-xs font-bold text-foreground">{xp.toLocaleString()}</span>
          </div>
          <button className="w-9 h-9 rounded-2xl bg-secondary border border-border flex items-center justify-center relative">
            <Bell size={16} className="text-muted-foreground" strokeWidth={1.75} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400" />
          </button>
        </div>
      </motion.div>

      {/* ── Nova AI Buddy Card ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Link to="/chat">
          <div className="card-ai rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-transform">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Brain size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary mb-0.5">Your AI buddy</p>
              <p className="text-sm font-bold text-foreground">{novaMsg}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <ChevronRight size={16} className="text-muted-foreground" />
            </div>
          </div>
        </Link>
      </motion.div>

      {/* ── Level Progress Card ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="glass rounded-3xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                {level}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current level</p>
                <p className="font-heading font-bold text-foreground text-sm">Level {level}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Next level</p>
              <p className="text-xs font-semibold text-primary">{nextLevelXP - xp} XP to go</p>
            </div>
          </div>
          <Progress value={levelProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {xp - currentLevelXP} / {nextLevelXP - currentLevelXP} XP
          </p>
        </div>
      </motion.div>

      {/* ── Quick Start ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
        <h2 className="font-heading font-semibold text-foreground text-sm mb-3">Quick Start</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map(({ to, icon: Icon, label, color, bg }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-white active:scale-95 transition-transform shadow-card"
              style={{ boxShadow: '0 2px 10px rgba(30,36,64,0.06)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                <Icon size={20} style={{ color }} strokeWidth={1.75} />
              </div>
              <span className="text-[10px] font-semibold text-foreground text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Daily Challenges ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-foreground text-sm">Daily Challenges</h2>
          <span className="text-xs text-primary font-semibold">
            {challenges.filter(c => c.done).length}/{challenges.length} done
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {challenges.map((c, i) => (
            <motion.div key={c.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.14 + i * 0.04 }}>
              <div className={`glass rounded-2xl p-3.5 flex items-center gap-3 transition-all
                ${c.done ? 'opacity-60' : ''}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                  ${c.done ? 'border-green-400 bg-green-400' : 'border-border'}`}>
                  {c.done && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-current">
                      <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <p className={`flex-1 text-sm font-medium
                  ${c.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {c.title}
                </p>
                <div className="flex items-center gap-1 bg-secondary border border-border px-2 py-1 rounded-xl">
                  <Star size={9} className="text-yellow-400" />
                  <span className="text-[10px] font-bold text-foreground">+{c.xp}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="h-4" />
    </div>
  );
}
