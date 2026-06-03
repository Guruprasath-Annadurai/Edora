import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Map, Calendar, Users, Target, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const sections = [
  {
    title: 'Flashcards',
    desc: 'SM-2 spaced repetition review',
    icon: BookOpen,
    to: '/flashcard',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
    badge: 'DUE_COUNT',   // replaced dynamically below
    live: true,
  },
  {
    title: 'AI Quiz',
    desc: 'Generate MCQs on any topic',
    icon: Target,
    to: '/quiz',
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.12)',
    badge: null,
    live: true,
  },
  {
    title: 'Knowledge Map',
    desc: 'Visual concept relationships',
    icon: Map,
    to: null,
    color: '#06B6D4',
    bg: 'rgba(6,182,212,0.12)',
    badge: 'Soon',
    live: false,
  },
  {
    title: 'Study Plan',
    desc: 'Build your schedule',
    icon: Calendar,
    to: null,
    color: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
    badge: 'Soon',
    live: false,
  },
  {
    title: 'Study Rooms',
    desc: 'Collaborate with peers',
    icon: Users,
    to: null,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    badge: 'Soon',
    live: false,
  },
];

const subjects = [
  { name: 'Mathematics', progress: 72, color: '#7C3AED' },
  { name: 'Physics',     progress: 45, color: '#3B82F6' },
  { name: 'Chemistry',   progress: 60, color: '#10B981' },
  { name: 'Biology',     progress: 30, color: '#EC4899' },
];

interface WeeklyStats {
  sprints: number;
  quizzes: number;
  cards:   number;
}

export default function LearningPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]   = useState<'tools' | 'progress'>('tools');
  const [dueCount, setDueCount]     = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);

  useEffect(() => {
    if (!user) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now     = new Date().toISOString();

    // Parallel: due-card count + weekly stats
    Promise.all([
      supabase
        .from('flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lte('next_review', now),
      supabase
        .from('sprint_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('created_at', weekAgo),
      supabase
        .from('quiz_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo),
      supabase
        .from('flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gt('repetitions', 0),        // cards reviewed at least once
    ]).then(([due, sprints, quizzes, reviewed]) => {
      setDueCount(due.count ?? 0);
      setWeeklyStats({
        sprints: sprints.count ?? 0,
        quizzes: quizzes.count ?? 0,
        cards:   reviewed.count ?? 0,
      });
    });
  }, [user]);

  return (
    <div className="h-full native-scroll px-4 py-4 flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Learning Hub</h1>
        <p className="text-muted-foreground text-sm">All your study tools in one place</p>
      </div>

      {/* Tab toggle */}
      <div className="glass rounded-2xl p-1 flex gap-1">
        {(['tools', 'progress'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${activeTab === t ? 'text-white' : 'text-muted-foreground'}`}
            style={activeTab === t ? { background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' } : {}}>
            {t === 'tools' ? 'Study Tools' : 'My Progress'}
          </button>
        ))}
      </div>

      {activeTab === 'tools' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {sections.map(({ title, desc, icon: Icon, to, color, bg, badge, live }, i) => (
            <motion.div key={title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              {live && to ? (
                <Link to={to}>
                  <div className="glass rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-all">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                      <Icon size={24} style={{ color }} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm">{title}</p>
                        {badge === 'DUE_COUNT' && dueCount !== null && dueCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: color }}>
                            Due: {dueCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ) : (
                // Coming-soon items — visually present but not tappable
                <div className="glass rounded-3xl p-4 flex items-center gap-4 opacity-50">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon size={24} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{title}</p>
                      {badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {activeTab === 'progress' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Subject Progress</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {subjects.map(({ name, progress, color }) => (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Weekly Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sprints',  value: weeklyStats?.sprints ?? '—', sub: 'this week' },
                  { label: 'Cards',    value: weeklyStats?.cards   ?? '—', sub: 'reviewed'  },
                  { label: 'Quizzes', value: weeklyStats?.quizzes  ?? '—', sub: 'completed' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="text-center p-3 glass rounded-2xl">
                    <p className="font-heading text-xl font-bold text-foreground">{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
      <div className="h-4" />
    </div>
  );
}
