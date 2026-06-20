import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  SkeletonProfileHero, SkeletonLeaderboardRows,
  SkeletonMasteryBars,
} from '@/components/ui/skeleton';
import {
  User, Flame, Star, Shield, Bell, LogOut, Snowflake, Loader2,
  ChevronRight, Award, CalendarDays, MessageSquare, Users, TrendingUp,
  Crown, FileText, Medal, Trophy, X,
  Calculator, Atom, FlaskConical, Microscope, BookOpen, Landmark, BarChart3, Code2,
} from 'lucide-react';
import { TrophyIcon, TeachingIcon } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { isInFreeTrial, trialDaysRemaining } from '@/lib/trial';
import { supabase } from '@/lib/supabase';
import { getLevelFromXP, getXPForLevel } from '@/lib/utils';
import { ACHIEVEMENT_DEFS, loadUnlockedIds } from '@/lib/achievements';
import { StudyDNA } from '@/components/profile/StudyDNA';
import { MoodHeatmap } from '@/components/profile/MoodHeatmap';
import { useNovoMemory, MEMORY_TYPE_LABELS, MEMORY_TYPE_COLORS } from '@/hooks/useNovoMemory';

const SUBJECT_COLORS: Record<string, { color: string; glow: string }> = {
  Mathematics:        { color: '#93C5FD', glow: 'rgba(147,197,253,0.3)'  },
  Physics:            { color: '#C4B5FD', glow: 'rgba(196,181,253,0.3)'  },
  Chemistry:          { color: '#6EE7B7', glow: 'rgba(110,231,183,0.3)'  },
  Biology:            { color: '#86EFAC', glow: 'rgba(134,239,172,0.3)'  },
  History:            { color: '#FDE68A', glow: 'rgba(253,230,138,0.3)'  },
  English:            { color: '#FCA5A5', glow: 'rgba(252,165,165,0.3)'  },
  Economics:          { color: '#A5F3FC', glow: 'rgba(165,243,252,0.3)'  },
  'Computer Science': { color: '#DDD6FE', glow: 'rgba(221,214,254,0.3)'  },
};
const DEFAULT_SUBJECT_COLOR = { color: '#A0AEFF', glow: 'rgba(160,174,255,0.3)' };
const SPRINTS_FOR_FULL_MASTERY = 20;

const SUBJECT_ICONS: Record<string, React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>> = {
  Mathematics:        Calculator,
  Physics:            Atom,
  Chemistry:          FlaskConical,
  Biology:            Microscope,
  English:            BookOpen,
  History:            Landmark,
  Economics:          BarChart3,
  'Computer Science': Code2,
};

interface LeaderboardRow {
  rank: number; display_name: string; xp: number;
  level: number; streak_count: number; is_current_user: boolean;
}

const STUDY_LEVELS = [
  { value: 'school',   label: 'School (6–12)' },
  { value: 'college',  label: 'College / UG'  },
  { value: 'jee_neet', label: 'JEE / NEET'    },
  { value: 'sat_act',  label: 'SAT / ACT'     },
];

type MenuItem = { icon: React.ElementType; label: string; to: string; pro?: boolean; highlight?: boolean };
type MenuSection = { title: string; items: MenuItem[] };

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Learning',
    items: [
      { icon: Award,        label: 'Certifications',   to: '/certifications' },
      { icon: CalendarDays, label: 'Lesson Plan',      to: '/lesson-plan'    },
    ],
  },
  {
    title: 'AI & Insights',
    items: [
      { icon: MessageSquare, label: "Novo's Messages", to: '/novo-messages'             },
      { icon: TrendingUp,    label: 'Analytics',       to: '/analytics', pro: true      },
    ],
  },
  {
    title: 'Community',
    items: [
      { icon: Users, label: 'Study Groups', to: '/study-groups' },
    ],
  },
  {
    title: 'Account',
    items: [
      { icon: Bell,   label: 'Study Reminders',  to: '/reminders'                  },
      { icon: Shield, label: 'Parent Dashboard', to: '/parent'                     },
      { icon: User,   label: 'Account Settings', to: '/account'                    },
    ],
  },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', boxShadow: '0 0 8px rgba(245,158,11,0.5)' }}>
      <Medal size={13} className="text-white" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg,#94A3B8,#64748B)', boxShadow: '0 0 6px rgba(148,163,184,0.4)' }}>
      <Medal size={13} className="text-white" />
    </div>
  );
  if (rank === 3) return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg,#B45309,#92400E)', boxShadow: '0 0 6px rgba(180,83,9,0.4)' }}>
      <Medal size={13} className="text-white" />
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-[11px] font-bold text-white/50">#{rank}</span>
    </div>
  );
}

// ── Novo Memory Viewer (inline) ───────────────────────────────────────────────
function NovoMemoryViewer({ userId }: { userId: string }) {
  const { memories, loading, deleteMemory, totalCount } = useNovoMemory();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? memories : memories.slice(0, 3);

  if (loading) return (
    <div style={{ borderRadius: 20, padding: 20, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', height: 80 }}
      className="animate-pulse" />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ borderRadius: 22, padding: 20, background: 'rgba(15,17,23,0.8)', border: '1px solid rgba(124,58,237,0.18)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: '#7C3AED', textTransform: 'uppercase', marginBottom: 2 }}>
            Novo's Memory
          </div>
          <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 700, color: '#F4F6FA' }}>
            {totalCount} things Novo knows about you
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
          background: 'rgba(124,58,237,0.15)', color: '#A855F7', border: '1px solid rgba(124,58,237,0.25)',
        }}>
          {totalCount}
        </div>
      </div>

      {memories.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>
          Chat with Novo to build your memory
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(m => (
            <motion.div key={m.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
              layout
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                background: MEMORY_TYPE_COLORS[m.memory_type],
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: MEMORY_TYPE_COLORS[m.memory_type], textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  {MEMORY_TYPE_LABELS[m.memory_type]}
                  {m.subject && <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}> · {m.subject}</span>}
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{m.content}</p>
              </div>
              <button
                onClick={() => deleteMemory(m.id).catch(() => {})}
                style={{ color: 'rgba(255,255,255,0.25)', padding: 4, flexShrink: 0, minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Delete memory"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {memories.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 4, minHeight: 32 }}
        >
          {expanded ? 'Show less' : `Show all ${totalCount} memories`}
          <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}
    </motion.div>
  );
}

export default function ProfilePage() {
  const { profile, signOut, user, loading: authLoading } = useAuth();
  const trialActive = user?.created_at ? isInFreeTrial(user.created_at) : false;
  const daysLeft    = user?.created_at ? trialDaysRemaining(user.created_at) : 0;
  const isPro = trialActive || (!!profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()));

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbLoading, setLbLoading]     = useState(true);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [subjectMastery, setSubjectMastery] = useState<{
    subject: string; pct: number; color: string; glow: string;
  }[]>([]);
  const [masteryLoading, setMasteryLoading] = useState(true);

  const xp         = profile?.xp ?? 0;
  const level      = getLevelFromXP(xp);
  const nextXP     = getXPForLevel(level + 1);
  const curXP      = getXPForLevel(level);
  const xpProgress = Math.round(((xp - curXP) / (nextXP - curXP)) * 100);
  const streak     = profile?.streak_count ?? 0;
  const freezes    = profile?.streak_freeze_count ?? 0;
  const initials   = (profile?.full_name ?? 'E').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLbLoading(true);
      const { data, error } = await supabase
        .from('weekly_leaderboard')
        .select('rank, display_name, xp, level, streak_count, is_current_user')
        .order('rank', { ascending: true }).limit(10);
      if (error) console.error('[ProfilePage] leaderboard error:', error.message);
      if (data) setLeaderboard(data as LeaderboardRow[]);
      setLbLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadUnlockedIds(user.id).then(ids => setUnlockedCount(ids.size));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('sprint_sessions')
      .select('subject')
      .eq('user_id', user.id)
      .eq('completed', true)
      .then(({ data }) => {
        if (!data || data.length === 0) { setSubjectMastery([]); setMasteryLoading(false); return; }
        const counts: Record<string, number> = {};
        data.forEach(s => { counts[s.subject] = (counts[s.subject] ?? 0) + 1; });
        const mastery = Object.entries(counts)
          .map(([subject, count]) => ({
            subject,
            pct: Math.min(100, Math.round((count / SPRINTS_FOR_FULL_MASTERY) * 100)),
            ...(SUBJECT_COLORS[subject] ?? DEFAULT_SUBJECT_COLOR),
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5);
        setSubjectMastery(mastery);
        setMasteryLoading(false);
      });
  }, [user]);

  const stats = [
    { label: 'XP Total', value: xp.toLocaleString(), icon: Star,      color: '#EAB308' },
    { label: 'Level',    value: level.toString(),     icon: TrophyIcon, color: '#A0AEFF' },
    { label: 'Streak',   value: `${streak}d`,         icon: Flame,     color: '#FB923C' },
    { label: 'Freezes',  value: freezes.toString(),   icon: Snowflake, color: '#67E8F9' },
  ];

  return (
    <div className="h-full native-scroll pb-nav" style={{ background: 'transparent' }}>
      <div className="px-4 pt-5 flex flex-col gap-4">

        {/* ── Hero card ─────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          {authLoading && !profile ? (
            <SkeletonProfileHero />
          ) : (
          <div
            className="rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg,#1A1060 0%,#1D1575 40%,#210C6B 100%)',
              border: '1px solid rgba(91,106,245,0.3)',
              boxShadow: '0 10px 40px rgba(91,106,245,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Neon top stripe */}
            <div style={{ height: 2, background: 'linear-gradient(90deg,#5B6AF5,#8B5CF6,#EC4899)', opacity: 0.9 }} />

            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div
                      className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center text-xl font-extrabold text-white"
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        boxShadow: '0 0 20px rgba(91,106,245,0.3)',
                      }}
                    >
                      {initials}
                    </div>
                    <div
                      className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white"
                      style={{
                        background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                        border: '2px solid #1A1060',
                        boxShadow: '0 0 8px rgba(245,158,11,0.5)',
                      }}
                    >
                      {level}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-heading text-lg font-extrabold text-white">
                        {profile?.full_name?.split(' ')[0] ?? 'Explorer'}
                      </h2>
                      {isPro && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-extrabold"
                          style={{ background: 'rgba(255,255,255,0.18)', color: 'white' }}
                        >
                          PRO
                        </span>
                      )}
                    </div>
                    <p className="text-white/55 text-[11px] font-semibold">
                      {STUDY_LEVELS.find(l => l.value === profile?.study_level)?.label ?? 'Student'}
                    </p>
                  </div>
                </div>

                {/* XP pill */}
                <div className="flex flex-col items-end gap-1">
                  <div
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.25)' }}
                  >
                    <Star size={11} style={{ color: '#EAB308', fill: '#EAB308' }} />
                    <span className="text-xs font-extrabold" style={{ color: '#EAB308' }}>{xp.toLocaleString()} XP</span>
                  </div>
                  <span className="text-white/45 text-[10px] font-semibold">Level {level}</span>
                </div>
              </div>

              {/* XP bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-white/55 font-semibold">Level {level}</span>
                  <span className="text-white/55 font-semibold">{(nextXP - xp).toLocaleString()} XP to Level {level + 1}</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
                    style={{
                      background: 'linear-gradient(90deg,#5B6AF5,#8B5CF6)',
                      boxShadow: '0 0 8px rgba(91,106,245,0.6)',
                    }}
                  />
                </div>
                <p className="text-white/40 text-[10px] mt-1.5 font-medium text-right">
                  {(xp - curXP).toLocaleString()} / {(nextXP - curXP).toLocaleString()} XP
                </p>
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {stats.map(({ label, value, color }, i) => (
                <div
                  key={label}
                  className={`flex flex-col items-center py-3 gap-1 ${i < 3 ? 'border-r' : ''}`}
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <span className="font-heading font-extrabold text-sm text-white" style={{ color }}>
                    {value}
                  </span>
                  <span className="text-[10px] font-semibold text-white/40">{label}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </motion.div>

        {/* ── Subject Mastery ───────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
          <h3 className="font-heading font-bold text-white text-base mb-3">Subject Mastery</h3>
          <div
            className="rounded-3xl p-4"
            style={{
              background: 'rgba(15,20,45,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}
          >
            {masteryLoading ? (
              <SkeletonMasteryBars count={3} />
            ) : subjectMastery.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-3">
                Complete study sprints to track your subject mastery.
              </p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {subjectMastery.map(({ subject, pct, color, glow }, i) => {
                  const SubjectIcon = SUBJECT_ICONS[subject] ?? BookOpen;
                  return (
                    <div key={subject}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <SubjectIcon size={13} style={{ color }} />
                          <span className="text-sm font-semibold text-white/80">{subject}</span>
                        </div>
                        <span className="text-sm font-extrabold" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.85, ease: 'easeOut', delay: 0.1 * i + 0.15 }}
                          style={{ background: color, boxShadow: `0 0 6px ${glow}` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Achievements preview ──────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}>
          <Link to="/achievements">
            <div
              className="rounded-3xl p-4 flex items-center gap-3 active:scale-98 transition-all"
              style={{
                background: 'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.1))',
                border: '1px solid rgba(245,158,11,0.2)',
                boxShadow: '0 4px 20px rgba(245,158,11,0.08)',
              }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(239,68,68,0.2))',
                  border: '1px solid rgba(245,158,11,0.25)',
                }}
              >
                <Trophy size={20} style={{ color: '#FDE68A' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Achievements</p>
                <p className="text-[11px] text-white/45">{unlockedCount} / {ACHIEVEMENT_DEFS.length} unlocked</p>
              </div>
              <ChevronRight size={16} className="text-white/30" />
            </div>
          </Link>
        </motion.div>

        {/* ── Leaderboard ───────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h3 className="font-heading font-bold text-white text-base mb-3">Leaderboard</h3>
          {lbLoading ? (
            <SkeletonLeaderboardRows count={5} />
          ) : (
          <div
            className="rounded-3xl overflow-hidden"
            style={{
              background: 'rgba(15,20,45,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {leaderboard.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-5">No data yet — start studying!</p>
            ) : leaderboard.map((row, idx) => (
              <div
                key={row.rank}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderBottom: idx < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  background: row.is_current_user
                    ? 'linear-gradient(135deg,rgba(91,106,245,0.1),rgba(139,92,246,0.08))'
                    : 'transparent',
                }}
              >
                <RankBadge rank={row.rank} />
                <span
                  className={`flex-1 text-sm font-semibold truncate ${
                    row.is_current_user ? 'text-primary' : 'text-white/80'
                  }`}
                >
                  {row.display_name}
                  {row.is_current_user && (
                    <span className="text-[11px] text-white/30 font-normal ml-1">(you)</span>
                  )}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Star size={11} style={{ color: '#EAB308', fill: '#EAB308' }} />
                  <span className="text-sm font-bold text-white/80">{row.xp.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          )}
        </motion.div>

        {/* ── Study DNA ─────────────────────────────────────── */}
        {user && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
            <StudyDNA userId={user.id} />
          </motion.div>
        )}

        {/* ── Mood Heatmap ──────────────────────────────────── */}
        {user && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.135 }}>
            <MoodHeatmap userId={user.id} />
          </motion.div>
        )}

        {/* ── Novo Memory Viewer ────────────────────────────── */}
        {user && <NovoMemoryViewer userId={user.id} />}

        {/* ── Menu sections ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="flex flex-col gap-5"
        >
          {/* Free trial banner */}
          {trialActive && (
            <div className="rounded-3xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'linear-gradient(135deg,rgba(91,106,245,0.15),rgba(139,92,246,0.15))', border: '1px solid rgba(91,106,245,0.25)' }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                <Crown size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Free Pro Trial</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining — all features unlocked
                </p>
              </div>
            </div>
          )}

          {MENU_SECTIONS.map(({ title, items }) => (
            <div key={title}>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/30 mb-2 px-1">
                {title}
              </p>
              <div
                className="rounded-3xl overflow-hidden"
                style={{ background: 'rgba(15,20,45,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {items.map(({ icon: Icon, label, to, pro, highlight }, idx) => (
                  <Link
                    key={label}
                    to={to}
                    className="flex items-center gap-3.5 px-4 active:scale-98 transition-all"
                    style={{
                      minHeight: 56,
                      borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: highlight && !isPro
                        ? 'linear-gradient(135deg,rgba(91,106,245,0.08),rgba(139,92,246,0.08))'
                        : 'transparent',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: highlight && !isPro ? 'rgba(91,106,245,0.18)' : 'rgba(255,255,255,0.06)' }}
                    >
                      <Icon size={18} className="text-primary" strokeWidth={1.75} />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-white/80">{label}</span>
                    {pro && !isPro && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold mr-1"
                        style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF', border: '1px solid rgba(91,106,245,0.2)' }}>
                        PRO
                      </span>
                    )}
                    {highlight && !isPro && (
                      <span className="text-[10px] px-2.5 py-1 rounded-full font-bold text-white"
                        style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                        Upgrade
                      </span>
                    )}
                    {highlight && isPro && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold mr-1"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }}>
                        Active
                      </span>
                    )}
                    <ChevronRight size={15} className="text-white/25 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* Legal — grouped separately at bottom */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(15,20,45,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <button
              onClick={() => Browser.open({ url: 'https://edora-app.vercel.app/privacy-policy', presentationStyle: 'popover' })}
              className="flex items-center gap-3.5 px-4 w-full text-left active:scale-98 transition-all"
              style={{ minHeight: 56 }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <FileText size={18} className="text-primary" strokeWidth={1.75} />
              </div>
              <span className="flex-1 text-sm font-semibold text-white/80">Privacy Policy</span>
              <ChevronRight size={15} className="text-white/25 shrink-0" />
            </button>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 16px' }} />
            <button
              onClick={() => Browser.open({ url: 'https://edora-app.vercel.app/terms-of-service', presentationStyle: 'popover' })}
              className="flex items-center gap-3.5 px-4 w-full text-left active:scale-98 transition-all"
              style={{ minHeight: 56 }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <FileText size={18} className="text-primary" strokeWidth={1.75} />
              </div>
              <span className="flex-1 text-sm font-semibold text-white/80">Terms of Service</span>
              <ChevronRight size={15} className="text-white/25 shrink-0" />
            </button>
          </div>
        </motion.div>

        {/* ── Sign out ──────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}>
          <button
            onClick={signOut}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#FCA5A5',
            }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </motion.div>

        <div className="h-2" />
      </div>
    </div>
  );
}
