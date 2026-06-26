import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Globe, MapPin, Building2, School, Users, Trophy, TrendingUp, TrendingDown, Minus, Sword, Crown, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SkeletonLeaderboardRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

type Scope = 'global' | 'state' | 'city' | 'school' | 'friends';

interface LeaderEntry {
  user_id:      string;
  full_name:    string;
  avatar_url:   string | null;
  xp:           number;
  rank:         number;
  prev_rank?:   number;
  delta?:       number;    // rank positions gained today
  school_name?: string;
  city_name?:   string;
  is_rival?:    boolean;
  is_me?:       boolean;
}

interface HallEntry {
  user_id:   string;
  full_name: string;
  xp_earned: number;
  rank_pos:  number;
}

const SCOPES: { id: Scope; label: string; icon: React.ElementType }[] = [
  { id: 'global', label: 'Global',  icon: Globe      },
  { id: 'state',  label: 'State',   icon: MapPin     },
  { id: 'city',   label: 'City',    icon: Building2  },
  { id: 'school', label: 'School',  icon: School     },
  { id: 'friends',label: 'Friends', icon: Users      },
];

const SCOPE_COLORS: Record<Scope, string> = {
  global:  '#60A5FA',
  state:   '#A78BFA',
  city:    '#34D399',
  school:  '#FBBF24',
  friends: '#F472B6',
};

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return url ? (
    <img src={url} alt={name} className="rounded-full object-cover flex-shrink-0"
         style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
         style={{ width: size, height: size, background: 'rgba(91,106,245,0.3)', color: '#A0AEFF' }}>
      {initials}
    </div>
  );
}

function RankDelta({ delta }: { delta?: number }) {
  if (!delta || delta === 0) return <Minus size={12} style={{ color: 'var(--color-text-secondary)' }} />;
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: '#34D399' }}>
      <TrendingUp size={11} />↑{delta}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: '#F87171' }}>
      <TrendingDown size={11} />↓{Math.abs(delta)}
    </span>
  );
}

// Memoized row — leaderboard lists can render 50+ rows; without memo every
// row re-renders on any parent state change (e.g. scope toggle, tab switch).
const LeaderboardRow = memo(function LeaderboardRow({ entry, index, color }: { entry: LeaderEntry; index: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 p-3 rounded-2xl"
      style={{
        background: entry.is_me ? `${color}12` : entry.is_rival ? 'rgba(248,113,113,0.08)' : 'var(--color-surface)',
        border: `1px solid ${entry.is_me ? color : entry.is_rival ? 'rgba(248,113,113,0.3)' : 'var(--color-border)'}`,
      }}>
      <span className="text-sm font-bold w-6 text-center flex-shrink-0"
            style={{ color: 'var(--color-text-secondary)' }}>#{entry.rank}</span>
      <Avatar name={entry.full_name} url={entry.avatar_url} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
          {entry.full_name} {entry.is_me && <span style={{ color }}>(you)</span>}
          {entry.is_rival && <span style={{ color: '#F87171' }}> ⚔️</span>}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {entry.xp.toLocaleString()} XP {entry.school_name ? `· ${entry.school_name}` : ''}
        </p>
      </div>
      <RankDelta delta={entry.delta} />
    </motion.div>
  );
});

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const [scope, setScope]     = useState<Scope>('global');
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderEntry | null>(null);
  const [hallOfFame, setHoF]  = useState<HallEntry[]>([]);
  const [rival, setRival]     = useState<LeaderEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHoF, setShowHoF] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { loadLeaderboard(); }, [scope, profile]);

  useEffect(() => {
    // Realtime: refresh when XP changes
    channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel('leaderboard-xp')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'xp=neq.xp' },
        () => loadLeaderboard())
      .subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function loadLeaderboard() {
    if (!profile) return;
    setLoading(true);

    let query = supabase.from('profiles').select('id,full_name,avatar_url,xp,school_name,city_name,state_name').order('xp', { ascending: false }).limit(50);

    if (scope === 'state' && profile.state_name)
      query = query.eq('state_name', profile.state_name);
    else if (scope === 'city' && profile.city_name)
      query = query.eq('city_name', profile.city_name);
    else if (scope === 'school' && profile.school_name)
      query = query.eq('school_name', profile.school_name);
    else if (scope === 'friends') {
      const { data: friendRows } = await supabase.from('my_friends').select('friend_id').eq('me', profile.id);
      const uids = [...new Set(friendRows?.map(f => f.friend_id) ?? []), profile.id];
      query = query.in('id', uids);
    }

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    // Assign ranks + compute delta (from yesterday's snapshot)
    const { data: snaps } = await supabase.from('xp_snapshots')
      .select('user_id,global_rank')
      .in('user_id', data.map(d => d.id))
      .eq('snapshot_at', new Date(Date.now() - 86400000).toISOString().split('T')[0]);
    const snapMap: Record<string, number> = {};
    (snaps ?? []).forEach(s => { snapMap[s.user_id] = s.global_rank; });

    // Load rival
    const { data: rivalRow } = await supabase.from('rivals')
      .select('rival_id').eq('user_id', profile.id).eq('scope', scope).maybeSingle();

    const ranked: LeaderEntry[] = data.map((p, i) => {
      const prevRank = snapMap[p.id];
      const currRank = i + 1;
      return {
        user_id:    p.id,
        full_name:  p.full_name ?? 'Student',
        avatar_url: p.avatar_url,
        xp:         p.xp ?? 0,
        rank:       currRank,
        prev_rank:  prevRank,
        delta:      prevRank ? prevRank - currRank : undefined,
        school_name: p.school_name ?? undefined,
        city_name:   p.city_name ?? undefined,
        is_rival:   p.id === rivalRow?.rival_id,
        is_me:      p.id === profile.id,
      };
    });

    setEntries(ranked);
    setMyEntry(ranked.find(e => e.is_me) ?? null);
    setRival(ranked.find(e => e.is_rival) ?? null);

    // Auto-assign rival if none: person 2 ranks above me
    if (!rivalRow && profile) {
      const myIdx = ranked.findIndex(e => e.is_me);
      if (myIdx >= 2) {
        const newRival = ranked[myIdx - 2];
        await supabase.from('rivals').upsert({ user_id: profile.id, rival_id: newRival.user_id, scope }, { onConflict: 'user_id,scope' });
      }
    }

    // Load hall of fame
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const { data: hof } = await supabase.from('hall_of_fame')
      .select('user_id,xp_earned,rank_pos,profiles(full_name)')
      .eq('scope', scope)
      .gte('week_start', weekStart.toISOString().split('T')[0])
      .order('rank_pos');
    setHoF((hof ?? []).map(h => {
      const joined = Array.isArray(h.profiles) ? h.profiles[0] : h.profiles;
      return {
        user_id:   h.user_id,
        full_name: (joined as { full_name: string } | undefined)?.full_name ?? '—',
        xp_earned: h.xp_earned,
        rank_pos:  h.rank_pos,
      };
    }));

    // Snapshot today's XP
    try { await supabase.rpc('upsert_xp_snapshot', { p_user_id: profile.id }); } catch { /* best-effort */ }

    setLoading(false);
    track('leaderboard_viewed', { scope });
  }

  const color = SCOPE_COLORS[scope];
  const top3  = entries.slice(0, 3);
  const rest  = entries.slice(3);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link aria-label="Go back" to="/home">
          <motion.button whileTap={{ scale: 0.92 }} className="p-2 rounded-xl"
            style={{ background: 'var(--color-surface)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          </motion.button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Leaderboard</h1>
          {myEntry && (
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              You are #{myEntry.rank} <RankDelta delta={myEntry.delta} />
            </p>
          )}
        </div>
        <button onClick={() => setShowHoF(s => !s)}
          className="p-2 rounded-xl transition-all"
          style={{ background: showHoF ? `${color}20` : 'var(--color-surface)', border: `1px solid ${showHoF ? color : 'var(--color-border)'}` }}>
          <Trophy size={18} color={showHoF ? color : 'var(--color-text-secondary)'} />
        </button>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto">
        {SCOPES.map(s => {
          const Icon = s.icon;
          const active = scope === s.id;
          return (
            <motion.button key={s.id} whileTap={{ scale: 0.94 }}
              onClick={() => setScope(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
              style={{
                background: active ? `${SCOPE_COLORS[s.id]}20` : 'var(--color-surface)',
                color: active ? SCOPE_COLORS[s.id] : 'var(--color-text-secondary)',
                border: `1px solid ${active ? SCOPE_COLORS[s.id] : 'var(--color-border)'}`,
              }}>
              <Icon size={13} /> {s.label}
            </motion.button>
          );
        })}
      </div>

      <div className="px-4 pb-6 space-y-4">
        {/* Rival callout */}
        <AnimatePresence>
          {rival && (
            <motion.div key="rival" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-3 rounded-2xl"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}>
              <Sword size={18} color="#F87171" />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: '#F87171' }}>Your Rival</p>
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {rival.full_name} · #{rival.rank} · {rival.xp.toLocaleString()} XP
                </p>
              </div>
              <Avatar name={rival.full_name} url={rival.avatar_url} size={32} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hall of Fame */}
        <AnimatePresence>
          {showHoF && (
            <motion.div key="hof" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <div className="p-3">
                <p className="text-xs font-bold mb-2" style={{ color: '#FBBF24' }}>🏆 Hall of Fame — This Week</p>
                {hallOfFame.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>No entries yet — top 3 appear Sunday night.</p>
                ) : hallOfFame.map(h => (
                  <div key={h.user_id} className="flex items-center gap-2 py-1.5">
                    <span className="text-base">{h.rank_pos === 1 ? '🥇' : h.rank_pos === 2 ? '🥈' : '🥉'}</span>
                    <span className="text-sm font-semibold flex-1" style={{ color: 'var(--color-text)' }}>{h.full_name}</span>
                    <span className="text-xs font-bold" style={{ color: '#FBBF24' }}>{h.xp_earned.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <SkeletonLeaderboardRows count={8} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Globe}
            iconColor="#A0AEFF"
            iconBg="rgba(91,106,245,0.10)"
            title={scope === 'friends' ? 'No friends on the board' : 'No rankings yet'}
            subtitle={scope === 'friends'
              ? 'Add study friends to see how you stack up against each other.'
              : 'Start studying to earn XP and appear on the leaderboard.'}
          />
        ) : (
          <>
            {/* Top 3 podium */}
            {top3.length >= 3 && (
              <div className="flex items-end justify-center gap-3 pt-2 pb-4">
                {/* 2nd */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-2 flex-1">
                  <Avatar name={top3[1].full_name} url={top3[1].avatar_url} size={48} />
                  <p className="text-xs font-semibold text-center truncate w-full" style={{ color: 'var(--color-text)' }}>{top3[1].full_name}</p>
                  <div className="w-full rounded-t-xl py-4 text-center"
                       style={{ background: 'rgba(192,192,192,0.15)', border: '1px solid rgba(192,192,192,0.3)' }}>
                    <span className="text-xl">🥈</span>
                    <p className="text-xs font-bold mt-1" style={{ color: '#C0C0C0' }}>{top3[1].xp.toLocaleString()}</p>
                  </div>
                </motion.div>
                {/* 1st */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-2 flex-1">
                  <Crown size={20} color="#FBBF24" />
                  <Avatar name={top3[0].full_name} url={top3[0].avatar_url} size={56} />
                  <p className="text-xs font-semibold text-center truncate w-full" style={{ color: 'var(--color-text)' }}>{top3[0].full_name}</p>
                  <div className="w-full rounded-t-xl py-6 text-center"
                       style={{ background: 'rgba(251,191,36,0.15)', border: `1px solid rgba(251,191,36,0.4)` }}>
                    <span className="text-2xl">🥇</span>
                    <p className="text-xs font-bold mt-1" style={{ color: '#FBBF24' }}>{top3[0].xp.toLocaleString()}</p>
                  </div>
                </motion.div>
                {/* 3rd */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="flex flex-col items-center gap-2 flex-1">
                  <Avatar name={top3[2].full_name} url={top3[2].avatar_url} size={48} />
                  <p className="text-xs font-semibold text-center truncate w-full" style={{ color: 'var(--color-text)' }}>{top3[2].full_name}</p>
                  <div className="w-full rounded-t-xl py-3 text-center"
                       style={{ background: 'rgba(205,127,50,0.15)', border: '1px solid rgba(205,127,50,0.3)' }}>
                    <span className="text-xl">🥉</span>
                    <p className="text-xs font-bold mt-1" style={{ color: '#CD7F32' }}>{top3[2].xp.toLocaleString()}</p>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Rest of list */}
            <div className="space-y-2">
              {rest.map((e, i) => (
                <LeaderboardRow key={e.user_id} entry={e} index={i} color={color} />
              ))}
            </div>

            {/* My position if not in top 50 */}
            {myEntry && myEntry.rank > 50 && (
              <div className="p-3 rounded-2xl mt-2"
                   style={{ background: `${color}12`, border: `1px solid ${color}` }}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color }}># {myEntry.rank}</span>
                  <Avatar name={myEntry.full_name} url={myEntry.avatar_url} size={32} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>You</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{myEntry.xp.toLocaleString()} XP</p>
                  </div>
                  <RankDelta delta={myEntry.delta} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
