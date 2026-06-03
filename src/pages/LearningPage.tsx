import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Map, Calendar, Users, Target, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const sections = [
  {
    title: 'Flashcards',
    desc: 'SM-2 spaced repetition review',
    icon: BookOpen,
    to: '/flashcard',
    color: '#5B6AF5',
    bg: 'rgba(91,106,245,0.10)',
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

const SUBJECT_COLORS: Record<string, string> = {
  mathematics: '#7C3AED',
  physics:     '#3B82F6',
  chemistry:   '#10B981',
  biology:     '#EC4899',
  history:     '#F59E0B',
  english:     '#06B6D4',
  geography:   '#84CC16',
  economics:   '#EF4444',
};

function subjectColor(name: string) {
  return SUBJECT_COLORS[name.toLowerCase()] ?? '#8B5CF6';
}

interface SubjectStat {
  name: string;
  progress: number;
  color: string;
}

interface WeeklyStats {
  sprints: number;
  quizzes: number;
  cards:   number;
}

export default function LearningPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]   = useState<'tools' | 'progress'>('tools');
  const [dueCount, setDueCount]       = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [subjects, setSubjects]       = useState<SubjectStat[]>([]);

  useEffect(() => {
    if (!user) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now     = new Date().toISOString();

    // Parallel: due-card count + weekly stats + subject progress
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
        .gt('repetitions', 0),
      supabase
        .from('flashcards')
        .select('subject, repetitions')
        .eq('user_id', user.id),
    ]).then(([due, sprints, quizzes, reviewed, allCards]) => {
      setDueCount(due.count ?? 0);
      setWeeklyStats({
        sprints: sprints.count ?? 0,
        quizzes: quizzes.count ?? 0,
        cards:   reviewed.count ?? 0,
      });

      // Compute per-subject progress from flashcards
      const cards = (allCards.data ?? []) as { subject: string; repetitions: number }[];
      const totals: Record<string, number>   = {};
      const doneMap: Record<string, number>  = {};
      for (const c of cards) {
        const s = c.subject?.trim() || 'General';
        totals[s]  = (totals[s]  ?? 0) + 1;
        doneMap[s] = (doneMap[s] ?? 0) + (c.repetitions > 0 ? 1 : 0);
      }
      const stats: SubjectStat[] = Object.keys(totals)
        .sort()
        .map(name => ({
          name,
          progress: Math.round((doneMap[name] / totals[name]) * 100),
          color: subjectColor(name),
        }));
      setSubjects(stats);
    });
  }, [user]);

  return (
    <div className="h-full native-scroll px-4 py-4 flex flex-col gap-5 bg-background">
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
            style={activeTab === t ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' } : {}}>
            {t === 'tools' ? 'Study Tools' : 'My Progress'}
          </button>
        ))}
      </div>

      {activeTab === 'tools' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {sections.map(({ title, desc, icon: Icon, to, color, bg, badge, live }, i) => (
            <motion.div key={title} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              {live && to ? (
                <Link to={to}>
                  <div className="glass rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-all shadow-card">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                      <Icon size={22} style={{ color }} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm">{title}</p>
                        {badge === 'DUE_COUNT' && dueCount !== null && dueCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: color }}>
                            Due: {dueCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ) : (
                <div className="glass rounded-3xl p-4 flex items-center gap-4 opacity-40">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon size={22} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{title}</p>
                      {badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
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
          <div className="glass rounded-3xl overflow-hidden shadow-card">
            <div className="px-5 pt-5 pb-3 border-b border-border">
              <h3 className="font-heading font-semibold text-foreground">Subject Progress</h3>
            </div>
            <div className="px-5 pb-5 pt-4 flex flex-col gap-4">
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No flashcards yet — add some to see progress.
                </p>
              ) : subjects.map(({ name, progress, color }) => (
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
            </div>
          </div>

          <div className="glass rounded-3xl overflow-hidden shadow-card">
            <div className="px-5 pt-5 pb-3 border-b border-border">
              <h3 className="font-heading font-semibold text-foreground">Weekly Summary</h3>
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sprints',  value: weeklyStats?.sprints ?? '—', sub: 'this week' },
                  { label: 'Cards',    value: weeklyStats?.cards   ?? '—', sub: 'reviewed'  },
                  { label: 'Quizzes', value: weeklyStats?.quizzes  ?? '—', sub: 'completed' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="text-center p-3 bg-secondary rounded-2xl border border-border">
                    <p className="font-heading text-xl font-bold text-foreground">{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      <div className="h-4" />
    </div>
  );
}
