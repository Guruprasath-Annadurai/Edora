import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SkeletonWeeklyStats } from '@/components/ui/skeleton';
import {Map, Calendar, Users, Target, ChevronRight, BookOpen,
  BarChart3, Zap, Globe, Play, Sigma, CalendarCheck, Search,
  GraduationCap, ArrowRight} from 'lucide-react';
import { BookIcon } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const sections = [
  {
    title: 'Flashcards',
    desc: 'SM-2 spaced repetition review',
    icon: BookIcon,
    to: '/flashcard',
    color: '#A0AEFF',
    glow: 'rgba(91,106,245,0.25)',
    iconBg: 'rgba(91,106,245,0.14)',
    badge: 'DUE_COUNT',
    live: true },
  {
    title: 'AI Quiz',
    desc: 'Generate MCQs on any topic',
    icon: Target,
    to: '/quiz',
    color: '#F9A8D4',
    glow: 'rgba(236,72,153,0.22)',
    iconBg: 'rgba(236,72,153,0.12)',
    badge: null,
    live: true },
  {
    title: 'Knowledge Map',
    desc: 'Visual concept relationships',
    icon: Map,
    to: '/concept-map',
    color: '#67E8F9',
    glow: 'rgba(6,182,212,0.22)',
    iconBg: 'rgba(6,182,212,0.12)',
    badge: null,
    live: true },
  {
    title: 'Study Plan',
    desc: 'AI roadmap to your exam',
    icon: Calendar,
    to: '/roadmap',
    color: '#6EE7B7',
    glow: 'rgba(16,185,129,0.22)',
    iconBg: 'rgba(16,185,129,0.12)',
    badge: null,
    live: true },
  {
    title: 'Study Rooms',
    desc: 'Collaborate with peers',
    icon: Users,
    to: '/study-rooms',
    color: '#FDE68A',
    glow: 'rgba(245,158,11,0.22)',
    iconBg: 'rgba(245,158,11,0.12)',
    badge: null,
    live: true },
];

// Content Moat features — shown as a separate section
const CONTENT_MOAT = [
  { title:'NCERT Deep Dive',    desc:'Every paragraph mapped with exam insights',  icon:BookOpen,     to:'/ncert-deep',  color:'#93C5FD', iconBg:'rgba(59,130,246,0.14)' },
  { title:'Formula Sheet',      desc:'80+ formulas with derivations & mnemonics',  icon:Sigma,        to:'/formulas',    color:'#C4B5FD', iconBg:'rgba(139,92,246,0.14)' },
  { title:'Revision Planner',   desc:'Countdown-aware week-by-week study plan',    icon:CalendarCheck,to:'/planner',     color:'#6EE7B7', iconBg:'rgba(16,185,129,0.14)' },
  { title:'Concept Reels',      desc:'60-second TikTok-style concept videos',      icon:Play,         to:'/reels',       color:'#F472B6', iconBg:'rgba(236,72,153,0.14)' },
  { title:'Solved Examples',    desc:'10,000+ step-by-step worked solutions',      icon:BarChart3,    to:'/solved',      color:'#FBBF24', iconBg:'rgba(245,158,11,0.14)' },
  { title:'Regional Languages', desc:'Questions in Hindi + 6 Indian languages',    icon:Globe,        to:'/languages',   color:'#34D399', iconBg:'rgba(16,185,129,0.14)' },
];

function activityLabel(title: string, weeklyStats: { sprints: number; quizzes: number; cards: number } | null): string | null {
  if (!weeklyStats) return null;
  if (title === 'Flashcards' && weeklyStats.cards > 0)  return `${weeklyStats.cards} reviewed`;
  if (title === 'AI Quiz'    && weeklyStats.quizzes > 0) return `${weeklyStats.quizzes} this week`;
  return null;
}

const SUBJECT_COLORS: Record<string, string> = {
  mathematics: '#93C5FD',
  physics:     '#C4B5FD',
  chemistry:   '#6EE7B7',
  biology:     '#86EFAC',
  history:     '#FDE68A',
  english:     '#FCA5A5',
  geography:   '#A7F3D0',
  economics:   '#A5F3FC' };

function subjectColor(name: string) {
  return SUBJECT_COLORS[name.toLowerCase()] ?? '#A0AEFF';
}

interface SubjectStat { name: string; progress: number; color: string; }
interface WeeklyStats { sprints: number; quizzes: number; cards: number; }

export default function LearningPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]     = useState<'tools' | 'progress'>('tools');
  const [dueCount, setDueCount]       = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [subjects, setSubjects]       = useState<SubjectStat[]>([]);

  useEffect(() => {
    if (!user) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now     = new Date().toISOString();
    Promise.all([
      supabase.from('flashcards').select('*',{count:'exact',head:true}).eq('user_id',user.id).lte('next_review',now),
      supabase.from('sprint_sessions').select('*',{count:'exact',head:true}).eq('user_id',user.id).eq('completed',true).gte('created_at',weekAgo),
      supabase.from('quiz_sessions').select('*',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',weekAgo),
      supabase.from('flashcards').select('*',{count:'exact',head:true}).eq('user_id',user.id).gt('repetitions',0),
      supabase.from('flashcards').select('subject, repetitions').eq('user_id',user.id),
    ]).then(([due, sprints, quizzes, reviewed, allCards]) => {
      setDueCount(due.count ?? 0);
      setWeeklyStats({ sprints: sprints.count ?? 0, quizzes: quizzes.count ?? 0, cards: reviewed.count ?? 0 });
      const cards = (allCards.data ?? []) as { subject: string; repetitions: number }[];
      const totals: Record<string,number> = {};
      const doneMap: Record<string,number> = {};
      for (const c of cards) {
        const s = c.subject?.trim() || 'General';
        totals[s]  = (totals[s]  ?? 0) + 1;
        doneMap[s] = (doneMap[s] ?? 0) + (c.repetitions > 0 ? 1 : 0);
      }
      setSubjects(Object.keys(totals).sort().map(name => ({
        name,
        progress: Math.round((doneMap[name] / totals[name]) * 100),
        color: subjectColor(name) })));
    }).catch(err => console.error('[LearningPage] stats load error:', err));
  }, [user]);

  return (
    <div className="h-full native-scroll px-4 pt-5 pb-nav flex flex-col gap-5" style={{ background: 'transparent' }}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg,#10B981,#06B6D4)',
            boxShadow: '0 0 16px rgba(16,185,129,0.45)' }}
        >
          <BookOpen size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-widest text-white/40">Your Courses</p>
          <h1 className="font-heading text-2xl font-extrabold text-white leading-tight">Learning Hub</h1>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('edora:open-command-palette'))}
          aria-label="Search features"
          className="flex items-center justify-center rounded-2xl shrink-0"
          style={{ width: 44, height: 44, background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}
        >
          <Search size={18} className="text-white/70" />
        </button>
      </div>

      {/* Tab toggle */}
      <div
        className="rounded-2xl p-1 flex gap-1"
        style={{
          background: 'var(--ink-055)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid var(--ink-100)',
          boxShadow: 'inset 0 1px 0 var(--ink-080)' }}
      >
        {(['tools','progress'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={activeTab === t ? {
              background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
              color: 'var(--ink-950)',
              boxShadow: '0 2px 12px rgba(91,106,245,0.35)' } : {
              color: 'var(--ink-350)' }}
          >
            {t === 'tools' ? 'Study Tools' : 'My Progress'}
          </button>
        ))}
      </div>

      {/* ── Featured: My Courses ── */}
      {activeTab === 'tools' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Link to="/course">
            <div className="relative specular rounded-3xl p-4 overflow-hidden flex items-center gap-4"
              style={{
                position: 'relative',
                background: 'rgba(91,106,245,0.13)',
                backdropFilter: 'blur(36px) saturate(180%) brightness(1.08)',
                WebkitBackdropFilter: 'blur(36px) saturate(180%) brightness(1.08)',
                border: '1.5px solid rgba(91,106,245,0.3)',
                boxShadow: 'inset 0 1.5px 0 var(--ink-180), 0 4px 24px rgba(91,106,245,0.22)' }}>
              {/* Ambient orb */}
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 70%)', transform: 'translate(30%, -30%)' }} />

              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', boxShadow: '0 4px 16px rgba(91,106,245,0.45)' }}>
                <GraduationCap size={22} className="text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-heading font-bold text-white text-sm">My Courses</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>NEW</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-500)' }}>
                  NCERT Classes 9–12 · Chapter-by-chapter
                </p>
              </div>

              <ArrowRight size={18} style={{ color: '#A0AEFF', flexShrink: 0 }} />
            </div>
          </Link>
        </motion.div>
      )}

      {/* Tools tab */}
      {activeTab === 'tools' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
          {sections.map(({ title, desc, icon: Icon, to, color, glow, iconBg, badge, live }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {live && to ? (
                <Link to={to}>
                  <div
                    className="liquid-glass rounded-3xl p-4 flex items-center gap-4 active:scale-98 transition-all"
                    style={{ boxShadow: `0 4px 20px ${glow}` }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: iconBg, border: `1px solid ${glow}` }}
                    >
                      <Icon size={22} style={{ color }} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white text-sm">{title}</p>
                        {badge === 'DUE_COUNT' && dueCount !== null && dueCount > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: color }}>
                            Due: {dueCount}
                          </span>
                        )}
                        {(() => {
                          const lbl = activityLabel(title, weeklyStats);
                          return lbl ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                              {lbl}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/25 shrink-0" />
                  </div>
                </Link>
              ) : (
                <div
                  className="rounded-3xl p-4 flex items-center gap-4 opacity-30"
                  style={{
                    background: 'var(--ink-030)',
                    border: '1px solid var(--ink-050)' }}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                    <Icon size={22} style={{ color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Content Moat section (always visible on tools tab) */}
      {activeTab === 'tools' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="h-px flex-1" style={{ background: 'var(--ink-070)' }} />
            <p className="text-xs font-bold uppercase tracking-widest text-white/30">Content Moat</p>
            <div className="h-px flex-1" style={{ background: 'var(--ink-070)' }} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {CONTENT_MOAT.map(({ title, desc, icon: Icon, to, color, iconBg }, i) => (
              <motion.div key={to} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.04 }}>
                <Link to={to}>
                  <div className="rounded-2xl p-3.5 flex flex-col gap-2.5 active:scale-97 transition-transform h-full"
                    style={{ background:'var(--ink-060)', border:'1px solid var(--ink-060)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                      <Icon size={17} style={{ color }} strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white leading-tight">{title}</p>
                      <p className="text-xs text-white/35 mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Progress tab */}
      {activeTab === 'progress' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {/* Subject progress */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-060)' }}
          >
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--ink-050)' }}>
              <h3 className="font-heading font-semibold text-white">Subject Progress</h3>
            </div>
            <div className="px-5 pb-5 pt-4 flex flex-col gap-4">
              {subjects.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-2">
                  No flashcards yet — add some to see progress.
                </p>
              ) : subjects.map(({ name, progress, color }) => (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-white/80">{name}</span>
                    <span style={{ color }}>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ink-050)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly summary */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-060)' }}
          >
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--ink-050)' }}>
              <h3 className="font-heading font-semibold text-white">Weekly Summary</h3>
            </div>
            <div className="px-5 pb-5 pt-4">
              {!weeklyStats ? (
                <SkeletonWeeklyStats />
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Sprints', value: weeklyStats.sprints, sub: 'this week', icon: Zap,      color: '#FDE68A' },
                    { label: 'Cards',   value: weeklyStats.cards,   sub: 'reviewed',  icon: BookOpen, color: '#A0AEFF' },
                    { label: 'Quizzes', value: weeklyStats.quizzes, sub: 'completed', icon: Target,   color: '#F9A8D4' },
                  ].map(({ label, value, sub, icon: Icon, color }) => (
                    <div key={label} className="text-center p-3 rounded-2xl"
                      style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-060)' }}>
                      <Icon size={16} style={{ color }} className="mx-auto mb-1.5" />
                      <p className="font-heading text-xl font-bold text-white">{value}</p>
                      <p className="text-xs text-white/40 mt-0.5">{label}</p>
                      <p className="text-xs text-white/30">{sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="h-4" />
    </div>
  );
}
