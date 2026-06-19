import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Lock, Trophy, Target, Zap, Camera, CheckCircle,
  Flame, Star, Crown, BookOpen, BookMarked, Timer, TrendingUp,
  GraduationCap, Sun, Moon, type LucideIcon,
} from 'lucide-react';
import { AwardIcon } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';

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
  const locked   = ACHIEVEMENT_DEFS.filter(a => !unlockedIds.has(a.id));
  const totalXP  = unlocked.reduce((s, a) => s + a.xp, 0);

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/profile"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)', boxShadow: '0 0 16px rgba(245,158,11,0.4)' }}>
          <AwardIcon size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Achievements</h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {totalXP.toLocaleString()} bonus XP earned
              </p>
              <div className="h-1.5 rounded-full mt-2.5 w-40 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.round((unlocked.length / ACHIEVEMENT_DEFS.length) * 100)}%`,
                    background: 'linear-gradient(90deg,#F59E0B,#EF4444)',
                  }} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Unlocked */}
        {unlocked.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Unlocked
            </p>
            <div className="grid grid-cols-2 gap-3">
              {unlocked.map((a, i) => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-3xl p-4 flex flex-col items-center gap-2 text-center"
                  style={{
                    background: 'rgba(15,20,45,0.75)',
                    border: `1.5px solid ${a.color}35`,
                    boxShadow: `0 4px 20px ${a.color}18`,
                  }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}>
                    <AchievementIcon id={a.id} color={a.color} />
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-sm">{a.title}</p>
                    <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                    style={{ background: `${a.color}18`, border: `1px solid ${a.color}28` }}>
                    <span className="text-[10px] font-bold" style={{ color: a.color }}>+{a.xp} XP</span>
                  </div>
                  {unlockedDates[a.id] && (
                    <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {new Date(unlockedDates[a.id]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Locked
            </p>
            <div className="grid grid-cols-2 gap-3">
              {locked.map((a, i) => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-3xl p-4 flex flex-col items-center gap-2 text-center"
                  style={{
                    background: 'rgba(15,20,45,0.5)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    opacity: 0.55,
                  }}>
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.05)', filter: 'grayscale(1)' }}>
                      <AchievementIcon id={a.id} color="rgba(255,255,255,0.35)" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <Lock size={9} style={{ color: 'rgba(255,255,255,0.5)' }} />
                    </div>
                  </div>
                  <div>
                    <p className="font-heading font-bold text-white text-sm">{a.title}</p>
                    <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>+{a.xp} XP</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
