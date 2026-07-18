import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Lock, Trophy, Target, Zap, Camera, CheckCircle,
  Flame, Star, Crown, BookOpen, BookMarked, Timer, TrendingUp,
  GraduationCap, Sun, Moon, type LucideIcon,
} from 'lucide-react';
import { AwardIcon } from '@/components/ui/icons';
import { ListPageSkeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ACHIEVEMENT_DEFS, type AchievementDef } from '@/lib/achievements';

const ACHIEVEMENT_CATEGORIES: { label: string; ids: string[] }[] = [
  { label: 'Streaks',  ids: ['streak_3', 'streak_7', 'streak_30'] },
  { label: 'Quizzes', ids: ['first_steps', 'perfect_quiz'] },
  { label: 'Study',   ids: ['first_sprint', 'sprint_5', 'cards_50', 'cards_100', 'first_scan'] },
  { label: 'Levels',  ids: ['level_5', 'level_10'] },
  { label: 'Time',    ids: ['early_bird', 'night_owl'] },
];

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  first_steps:   Target,
  first_sprint:  Zap,
  first_scan:    Camera,
  perfect_quiz:  CheckCircle,
  streak_3:      Flame,
  streak_7:      Star,
  streak_30:     Crown,
  cards_50:      BookOpen,
  cards_100:     BookMarked,
  sprint_5:      Timer,
  level_5:       TrendingUp,
  level_10:      GraduationCap,
  early_bird:    Sun,
  night_owl:     Moon,
};

function AchievementIcon({ id, color }: { id: string; color: string }) {
  const Icon = ACHIEVEMENT_ICONS[id] ?? Trophy;
  return <Icon size={26} style={{ color }} strokeWidth={1.75} />;
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [unlockedDates, setUnlockedDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('achievements')
        .select('achievement_id, unlocked_at')
        .eq('user_id', user.id);
      if (error) console.error('[AchievementsPage] load error:', error.message);
      const ids = new Set<string>();
      const dates: Record<string, string> = {};
      for (const row of (data ?? []) as { achievement_id: string; unlocked_at: string }[]) {
        ids.add(row.achievement_id);
        dates[row.achievement_id] = row.unlocked_at;
      }
      setUnlockedIds(ids);
      setUnlockedDates(dates);
      setLoading(false);
    })();
  }, [user]);

  const unlocked = ACHIEVEMENT_DEFS.filter(a => unlockedIds.has(a.id));
  const _locked   = ACHIEVEMENT_DEFS.filter(a => !unlockedIds.has(a.id));
  const totalXP  = unlocked.reduce((s, a) => s + a.xp, 0);

  function getAchievement(id: string): AchievementDef | undefined {
    return ACHIEVEMENT_DEFS.find(a => a.id === id);
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <Link aria-label="Go back" to="/profile"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)', boxShadow: '0 0 16px rgba(245,158,11,0.4)' }}>
          <AwardIcon size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Achievements</h2>
          <p className="text-xs" style={{ color: 'var(--ink-400)' }}>
            {loading ? '…' : `${unlocked.length} / ${ACHIEVEMENT_DEFS.length} unlocked`}
          </p>
        </div>
      </div>

      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-5">

        {/* Summary banner */}
        {!loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-4 flex items-center gap-4"
            style={{
              background: 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(239,68,68,0.1))',
              border: '1px solid rgba(245,158,11,0.25)',
            }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)', boxShadow: '0 0 20px rgba(245,158,11,0.35)' }}>
              <Trophy size={28} className="text-white" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="font-heading font-bold text-white text-lg leading-none">
                {unlocked.length} Badges
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--ink-500)' }}>
                {totalXP.toLocaleString()} bonus XP earned
              </p>
              <div className="h-1.5 rounded-full mt-2.5 w-40 overflow-hidden" style={{ background: 'var(--ink-100)' }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.round((unlocked.length / ACHIEVEMENT_DEFS.length) * 100)}%`,
                    background: 'linear-gradient(90deg,#F59E0B,#EF4444)',
                  }} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Category-grouped achievements */}
        {!loading && ACHIEVEMENT_CATEGORIES.map((cat, ci) => {
          const catAchievements = cat.ids.map(id => getAchievement(id)).filter(Boolean) as AchievementDef[];
          if (!catAchievements.length) return null;
          const catUnlocked = catAchievements.filter(a => unlockedIds.has(a.id));
          return (
            <div key={cat.label}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-400)' }}>
                  {cat.label}
                </p>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink-250)' }}>
                  {catUnlocked.length}/{catAchievements.length}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {catAchievements.map((a, i) => {
                  const isUnlocked = unlockedIds.has(a.id);
                  return (
                    <motion.div key={a.id}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: ci * 0.05 + i * 0.04 }}
                      className="rounded-3xl p-4 flex flex-col items-center gap-2 text-center"
                      style={isUnlocked ? {
                        background: 'var(--hdr-b-750)',
                        border: `1.5px solid ${a.color}35`,
                        boxShadow: `0 4px 20px ${a.color}18`,
                      } : {
                        background: 'var(--ink-030)',
                        border: '1px solid var(--ink-050)',
                        opacity: 0.55,
                      }}>
                      <div className="relative">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={isUnlocked
                            ? { background: `${a.color}18`, border: `1px solid ${a.color}30` }
                            : { background: 'var(--ink-050)', filter: 'grayscale(1)' }}>
                          <AchievementIcon id={a.id} color={isUnlocked ? a.color : 'var(--ink-500)'} />
                        </div>
                        {!isUnlocked && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: 'var(--ink-080)', border: '1px solid var(--ink-120)' }}>
                            <Lock size={9} style={{ color: 'var(--ink-500)' }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-heading font-bold text-white text-sm">{a.title}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: isUnlocked ? 'var(--ink-400)' : 'var(--ink-500)' }}>
                          {a.desc}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                        style={isUnlocked
                          ? { background: `${a.color}18`, border: `1px solid ${a.color}28` }
                          : { background: 'var(--ink-050)' }}>
                        <span className="text-xs font-bold" style={{ color: isUnlocked ? a.color : 'var(--ink-500)' }}>
                          +{a.xp} XP
                        </span>
                      </div>
                      {isUnlocked && unlockedDates[a.id] && (
                        <p className="text-xs" style={{ color: 'var(--ink-500)' }}>
                          {new Date(unlockedDates[a.id]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {loading && <ListPageSkeleton count={6} header={false} />}

        <div className="h-4" />
      </div>
    </div>
  );
}
