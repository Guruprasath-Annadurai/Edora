import { motion } from 'framer-motion';
import { Flame, Zap, Star, ChevronRight, Brain, BookOpen, Trophy, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getLevelFromXP, getXPForLevel } from '@/lib/utils';

const quickActions = [
  { to: '/chat',      icon: Brain,    label: 'Ask Nova',    color: '#7C3AED', bg: 'rgba(124,58,237,0.15)' },
  { to: '/sprint',    icon: Zap,      label: 'Sprint',      color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  { to: '/flashcard', icon: BookOpen, label: 'Flashcards',  color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
  { to: '/quiz',      icon: Target,   label: 'Quiz',        color: '#EC4899', bg: 'rgba(236,72,153,0.15)' },
];

const challenges = [
  { id: 1, title: 'Complete a 10-min Sprint', xp: 50, done: false, type: 'sprint' },
  { id: 2, title: 'Review 10 Flashcards', xp: 30, done: true,  type: 'flashcard' },
  { id: 3, title: 'Ask Nova 3 Questions', xp: 20, done: false, type: 'chat' },
];

export default function HomePage() {
  const { profile } = useAuth();
  const xp = profile?.xp ?? 0;
  const level = getLevelFromXP(xp);
  const nextLevelXP = getXPForLevel(level + 1);
  const currentLevelXP = getXPForLevel(level);
  const progress = Math.round(((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);
  const streak = profile?.streak_count ?? 0;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Explorer';

  return (
    <div className="h-full native-scroll px-4 py-4 flex flex-col gap-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between pt-1">
        <div>
          <p className="text-muted-foreground text-sm">Good morning 👋</p>
          <h1 className="font-heading text-2xl font-bold text-foreground">{firstName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 glass px-3 py-2 rounded-2xl">
            <Flame size={16} className="text-orange-400" />
            <span className="text-sm font-bold text-foreground">{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 glass px-3 py-2 rounded-2xl">
            <Star size={16} className="text-yellow-400" />
            <span className="text-sm font-bold text-foreground">{xp.toLocaleString()}</span>
          </div>
        </div>
      </motion.div>

      {/* XP Level Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="overflow-hidden">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
                  {level}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Level {level}</p>
                  <p className="text-xs text-muted-foreground">{xp - currentLevelXP} / {nextLevelXP - currentLevelXP} XP</p>
                </div>
              </div>
              <Trophy size={20} className="text-yellow-400" />
            </div>
            <Progress value={progress} className="h-2.5" />
            <p className="text-xs text-muted-foreground mt-2">{nextLevelXP - xp} XP to Level {level + 1}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="font-heading font-semibold text-foreground mb-3">Quick Start</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map(({ to, icon: Icon, label, color, bg }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95"
              style={{ background: bg }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: `${color}25` }}>
                <Icon size={22} style={{ color }} strokeWidth={1.75} />
              </div>
              <span className="text-[11px] font-medium text-foreground text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Nova AI Banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Link to="/chat">
          <div className="rounded-3xl p-4 overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, #7C3AED22, #3B82F622)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full blur-2xl"
              style={{ background: 'rgba(124,58,237,0.3)' }} />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-medium text-green-400">Nova is ready</span>
                </div>
                <h3 className="font-heading font-bold text-foreground">Ask Nova AI</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Your personal AI tutor</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center nova-glow"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
                <Brain size={24} className="text-white" />
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Daily Challenges */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-foreground">Daily Challenges</h2>
          <Link to="/challenges" className="text-xs text-primary font-medium flex items-center gap-0.5">
            All <ChevronRight size={12} />
          </Link>
        </div>
        <div className="flex flex-col gap-2.5">
          {challenges.map((c, i) => (
            <motion.div key={c.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}>
              <div className={`glass rounded-2xl p-3.5 flex items-center gap-3 ${c.done ? 'opacity-60' : ''}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                  ${c.done ? 'border-green-400 bg-green-400' : 'border-border'}`}>
                  {c.done && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-current">
                    <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>}
                </div>
                <p className={`flex-1 text-sm font-medium ${c.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {c.title}
                </p>
                <div className="flex items-center gap-1 glass px-2 py-1 rounded-lg">
                  <Star size={10} className="text-yellow-400" />
                  <span className="text-xs font-bold text-foreground">+{c.xp}</span>
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
