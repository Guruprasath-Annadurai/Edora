import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Flame, Star, Trophy, Shield, Bell, LogOut, Snowflake, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getLevelFromXP, getXPForLevel } from '@/lib/utils';

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

const menuItems = [
  { icon: Bell,   label: 'Study Reminders'  },
  { icon: Shield, label: 'Parent Dashboard' },
  { icon: User,   label: 'Account Settings' },
];

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbLoading, setLbLoading]     = useState(true);

  const xp          = profile?.xp ?? 0;
  const level       = getLevelFromXP(xp);
  const nextXP      = getXPForLevel(level + 1);
  const curXP       = getXPForLevel(level);
  const xpProgress  = Math.round(((xp - curXP) / (nextXP - curXP)) * 100);
  const streak      = profile?.streak_count ?? 0;
  const freezes     = profile?.streak_freeze_count ?? 0;
  const initials    = (profile?.full_name ?? 'E').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    (async () => {
      setLbLoading(true);
      const { data } = await supabase
        .from('weekly_leaderboard')
        .select('rank, display_name, xp, level, streak_count, is_current_user')
        .order('rank', { ascending: true }).limit(10);
      if (data) setLeaderboard(data as LeaderboardRow[]);
      setLbLoading(false);
    })();
  }, []);

  const stats = [
    { label: 'XP Total', value: xp.toLocaleString(), icon: Star,      color: '#F59E0B' },
    { label: 'Level',    value: level.toString(),     icon: Trophy,    color: '#5B6AF5' },
    { label: 'Streak',   value: `${streak}d`,         icon: Flame,     color: '#EF4444' },
    { label: 'Freezes',  value: freezes.toString(),   icon: Snowflake, color: '#06B6D4' },
  ];

  const rankEmoji = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;

  return (
    <div className="h-full native-scroll px-4 py-4 flex flex-col gap-5 bg-background">

      {/* ── Avatar + Name ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 pt-2">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            {initials}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
            {level}
          </div>
        </div>
        <div className="text-center">
          <h2 className="font-heading text-xl font-bold text-foreground">{profile?.full_name ?? 'Explorer'}</h2>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <span className="text-xs text-primary font-semibold mt-1 block bg-secondary px-3 py-1 rounded-full inline-block">
            {STUDY_LEVELS.find(l => l.value === profile?.study_level)?.label ?? 'Student'}
          </span>
        </div>
      </motion.div>

      {/* ── XP Progress ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="glass rounded-3xl p-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground font-medium">Level {level}</span>
            <span className="text-primary font-semibold">{nextXP - xp} XP to next level</span>
          </div>
          <Progress value={xpProgress} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1.5">{xp - curXP} / {nextXP - curXP} XP</p>
        </div>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="grid grid-cols-4 gap-2.5">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="glass rounded-2xl p-3 flex flex-col items-center gap-1.5">
              <Icon size={18} style={{ color }} strokeWidth={1.75} />
              <span className="font-heading font-bold text-foreground text-sm">{value}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Leaderboard ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
        <div className="glass rounded-3xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <h3 className="font-heading font-semibold text-foreground">Weekly Leaderboard</h3>
          </div>
          <div className="px-5 pb-4 pt-2">
            {lbLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No data yet — start studying! 🚀</p>
            ) : leaderboard.map(row => (
              <div key={row.rank}
                className={`flex items-center gap-3 py-2.5 border-b border-border last:border-0 rounded-xl px-2 -mx-2 transition-all
                  ${row.is_current_user ? 'bg-secondary' : ''}`}>
                <span className="w-7 text-center text-sm font-bold shrink-0">{rankEmoji(row.rank)}</span>
                <span className={`flex-1 text-sm font-medium truncate ${row.is_current_user ? 'text-primary' : 'text-foreground'}`}>
                  {row.display_name}
                  {row.is_current_user && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Star size={11} className="text-yellow-400" />
                  <span className="text-sm font-semibold text-foreground">{row.xp.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Settings (coming soon) ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        className="flex flex-col gap-2">
        {menuItems.map(({ icon: Icon, label }) => (
          <div key={label} className="glass rounded-2xl p-4 flex items-center gap-3 opacity-50">
            <Icon size={20} className="text-muted-foreground" strokeWidth={1.75} />
            <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Soon</span>
          </div>
        ))}
      </motion.div>

      {/* ── Sign out ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}>
        <Button variant="destructive" size="lg" onClick={signOut} className="w-full">
          <LogOut size={18} /> Sign Out
        </Button>
      </motion.div>

      <div className="h-4" />
    </div>
  );
}
