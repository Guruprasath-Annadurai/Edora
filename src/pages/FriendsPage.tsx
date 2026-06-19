// ═══════════════════════════════════════════════════════════════════════════
// FriendsPage — Friend system: search, add, requests, nudges
// Route: /friends
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Search, UserPlus, Check, X, Flame, Zap,
  Bell, Share2, QrCode, Users as UsersIcon, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FriendRow {
  friendship_id: string;
  id:            string;
  full_name:     string;
  username:      string | null;
  avatar_url:    string | null;
  streak_count:  number;
  level:         number;
  last_active:   string | null;
}

interface RequestRow {
  friendship_id: string;
  id:            string;
  full_name:     string;
  avatar_url:    string | null;
  username:      string | null;
}

interface SearchResult {
  id:         string;
  full_name:  string;
  username:   string | null;
  avatar_url: string | null;
  rel:        'none' | 'pending_sent' | 'pending_received' | 'friends';
}

type Tab = 'friends' | 'requests' | 'add';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{initials}</div>
  );
}

function isInactive(lastActive: string | null): number {
  if (!lastActive) return 999;
  return Math.floor((Date.now() - new Date(lastActive).getTime()) / 86_400_000);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]             = useState<Tab>('friends');
  const [friends, setFriends]     = useState<FriendRow[]>([]);
  const [requests, setRequests]   = useState<RequestRow[]>([]);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [nudging, setNudging]     = useState<string | null>(null);
  const [toast, setToast]         = useState('');

  useEffect(() => { loadAll(); }, [profile?.id]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }
  }, [toast]);

  async function loadAll() {
    if (!profile) return;
    setLoading(true);
    await Promise.all([loadFriends(), loadRequests()]);
    setLoading(false);
  }

  async function loadFriends() {
    if (!profile) return;
    const { data: friendIds } = await supabase
      .from('my_friends')
      .select('friend_id')
      .eq('me', profile.id);

    if (!friendIds?.length) { setFriends([]); return; }
    const ids = friendIds.map(f => f.friend_id);

    const { data: rows } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, streak_count, level, last_active')
      .in('id', ids);

    const { data: friendshipRows } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${profile.id},friend_id.eq.${profile.id}`);

    const fsMap: Record<string, string> = {};
    (friendshipRows ?? []).forEach(f => {
      const otherId = f.user_id === profile.id ? f.friend_id : f.user_id;
      fsMap[otherId] = f.id;
    });

    setFriends((rows ?? []).map(r => ({
      friendship_id: fsMap[r.id] ?? '',
      id: r.id, full_name: r.full_name ?? 'Student', username: r.username,
      avatar_url: r.avatar_url, streak_count: r.streak_count ?? 0,
      level: r.level ?? 0, last_active: r.last_active,
    })).sort((a, b) => isInactive(a.last_active) - isInactive(b.last_active) || b.streak_count - a.streak_count));
  }

  async function loadRequests() {
    if (!profile) return;
    const { data } = await supabase
      .from('friendships')
      .select('id, user_id, profiles!friendships_user_id_fkey(id, full_name, avatar_url, username)')
      .eq('friend_id', profile.id)
      .eq('status', 'pending');

    setRequests((data ?? []).map((r: any) => ({
      friendship_id: r.id,
      id: r.profiles.id, full_name: r.profiles.full_name ?? 'Student',
      avatar_url: r.profiles.avatar_url, username: r.profiles.username,
    })));
  }

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!profile || q.trim().length < 2) { setResults([]); return; }
    setSearching(true);

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq('id', profile.id)
      .limit(15);

    if (!data) { setResults([]); setSearching(false); return; }

    const ids = data.map(d => d.id);
    const { data: relations } = await supabase
      .from('friendships')
      .select('user_id, friend_id, status')
      .or(`user_id.in.(${ids.join(',')}),friend_id.in.(${ids.join(',')})`)
      .or(`user_id.eq.${profile.id},friend_id.eq.${profile.id}`);

    setResults(data.map(d => {
      const rel = (relations ?? []).find(r =>
        (r.user_id === profile.id && r.friend_id === d.id) ||
        (r.friend_id === profile.id && r.user_id === d.id)
      );
      let relStatus: SearchResult['rel'] = 'none';
      if (rel) {
        if (rel.status === 'accepted') relStatus = 'friends';
        else if (rel.user_id === profile.id) relStatus = 'pending_sent';
        else relStatus = 'pending_received';
      }
      return { id: d.id, full_name: d.full_name ?? 'Student', username: d.username, avatar_url: d.avatar_url, rel: relStatus };
    }));
    setSearching(false);
  }, [profile]);

  async function sendRequest(toId: string) {
    if (!profile) return;
    const { error } = await supabase.from('friendships').insert({ user_id: profile.id, friend_id: toId });
    if (!error) {
      setResults(prev => prev.map(r => r.id === toId ? { ...r, rel: 'pending_sent' } : r));
      track('friend_request_sent', { to: toId });
      setToast('Friend request sent!');
    }
  }

  async function acceptRequest(friendshipId: string) {
    await supabase.rpc('accept_friend_request', { p_friendship_id: friendshipId });
    setRequests(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setToast('Friend added! 🎉');
    loadFriends();
  }

  async function declineRequest(friendshipId: string) {
    await supabase.from('friendships').update({ status: 'declined' }).eq('id', friendshipId);
    setRequests(prev => prev.filter(r => r.friendship_id !== friendshipId));
  }

  async function sendNudge(toId: string, name: string) {
    setNudging(toId);
    try {
      await supabase.rpc('send_nudge', { p_to_user: toId, p_message: `Your friend nudged you to study! 🔥` });
      setToast(`Nudged ${name}! 🔥`);
      track('friend_nudge_sent', { to: toId });
    } catch {
      setToast('Already nudged today');
    } finally {
      setNudging(null);
    }
  }

  async function shareInvite() {
    const link = `https://edora.app/invite?ref=${profile?.username ?? profile?.id ?? ''}`;
    try {
      await Share.share({
        title: 'Study with me on Edora!',
        text: 'Join me on Edora — AI-powered exam prep for JEE/NEET/boards. Let\'s keep each other accountable! 🔥',
        url: link,
        dialogTitle: 'Invite a friend',
      });
      track('friend_invite_shared', {});
    } catch { /* user cancelled share sheet */ }
  }

  const cfg = { gradient: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #05060F 0%, #0B0E1F 100%)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button aria-label="Go back" onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="font-heading text-lg font-bold text-white flex-1">Friends</h1>
        <button onClick={shareInvite} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(91,106,245,0.15)' }}>
          <Share2 className="w-4.5 h-4.5" style={{ color: '#A0AEFF' }} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pb-3">
        {([
          { id: 'friends', label: `Friends (${friends.length})`, icon: UsersIcon },
          { id: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}`, icon: Bell },
          { id: 'add', label: 'Add Friend', icon: UserPlus },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors"
            style={tab === t.id
              ? { background: cfg.gradient, color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }
            }>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        {/* ── Friends list ──────────────────────────────────────────────── */}
        {tab === 'friends' && (
          loading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl" style={{ background: 'rgba(91,106,245,0.12)' }}>👫</div>
              <p className="text-white/60 text-sm">No friends yet. Add some to start a streak together!</p>
              <Button onClick={() => setTab('add')} className="mt-2" style={{ background: cfg.gradient }}>Find Friends</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {friends.map(f => {
                const inactiveDays = isInactive(f.last_active);
                return (
                  <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Avatar url={f.avatar_url} name={f.full_name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{f.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#FB923C' }}>
                          <Flame className="w-3 h-3" />{f.streak_count}
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#A0AEFF' }}>
                          <Zap className="w-3 h-3" />Lvl {f.level}
                        </span>
                        {inactiveDays >= 2 && (
                          <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(239,68,68,0.85)' }}>
                            <Clock className="w-3 h-3" />{inactiveDays}d inactive
                          </span>
                        )}
                      </div>
                    </div>
                    {inactiveDays >= 2 && (
                      <button
                        onClick={() => sendNudge(f.id, f.full_name)}
                        disabled={nudging === f.id}
                        className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                        style={{ background: 'rgba(251,146,60,0.15)', color: '#FB923C' }}>
                        🔥 Nudge
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )
        )}

        {/* ── Requests ──────────────────────────────────────────────────── */}
        {tab === 'requests' && (
          requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl" style={{ background: 'rgba(91,106,245,0.12)' }}>📭</div>
              <p className="text-white/60 text-sm">No pending requests</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              {requests.map(r => (
                <motion.div key={r.friendship_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar url={r.avatar_url} name={r.full_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.full_name}</p>
                    {r.username && <p className="text-xs text-white/40">@{r.username}</p>}
                  </div>
                  <button onClick={() => acceptRequest(r.friendship_id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.18)' }}>
                    <Check className="w-4.5 h-4.5" style={{ color: '#34D399' }} />
                  </button>
                  <button onClick={() => declineRequest(r.friendship_id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
                    <X className="w-4.5 h-4.5" style={{ color: '#F87171' }} />
                  </button>
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* ── Add friend / search ──────────────────────────────────────────── */}
        {tab === 'add' && (
          <div className="pt-1">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Search className="w-4.5 h-4.5 text-white/40 flex-shrink-0" />
              <input
                value={query}
                onChange={e => search(e.target.value)}
                placeholder="Search by name or username..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>

            <button onClick={shareInvite}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white mb-4"
              style={{ background: cfg.gradient }}>
              <QrCode className="w-4 h-4" /> Share Invite Link
            </button>

            {searching && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}

            <div className="flex flex-col gap-2.5">
              {results.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar url={r.avatar_url} name={r.full_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{r.full_name}</p>
                    {r.username && <p className="text-xs text-white/40">@{r.username}</p>}
                  </div>
                  {r.rel === 'none' && (
                    <button onClick={() => sendRequest(r.id)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                      style={{ background: cfg.gradient, color: '#fff' }}>
                      <UserPlus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                  {r.rel === 'pending_sent' && (
                    <span className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Pending</span>
                  )}
                  {r.rel === 'pending_received' && (
                    <button onClick={() => setTab('requests')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.18)', color: '#34D399' }}>Respond</button>
                  )}
                  {r.rel === 'friends' && (
                    <span className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(91,106,245,0.15)', color: '#A0AEFF' }}>Friends</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white z-50"
            style={{ background: 'rgba(20,25,50,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
