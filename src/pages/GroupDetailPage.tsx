import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Users, Trophy, Hash, Copy, Check,
  Crown, Flame, Star, RefreshCw, LogOut, Trash2, AlertCircle,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import type { StudyGroup, StudyGroupMember, GroupLeaderboardEntry } from '@/types';

async function callFn(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('study-groups', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

function rankLabel(rank: number): { text: string; color: string } {
  if (rank === 1) return { text: '1st', color: '#FFD700' };
  if (rank === 2) return { text: '2nd', color: '#C0C0C0' };
  if (rank === 3) return { text: '3rd', color: '#CD7F32' };
  return { text: `#${rank}`, color: 'var(--ink-400)' };
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ groupId }: { groupId: string; userId?: string }) {
  const [board, setBoard]         = useState<GroupLeaderboardEntry[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callFn({ action: 'get_leaderboard', group_id: groupId });
    if (!res.error) {
      setBoard(res.data?.leaderboard ?? []);
      setWeekStart(res.data?.week_start ?? '');
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );

  if (board.length === 0) return (
    <div className="text-center py-12 px-6">
      <Trophy size={40} className="mx-auto mb-3" style={{ color: 'var(--ink-250)' }} />
      <p className="font-heading font-bold text-white">No activity yet</p>
      <p className="text-sm text-muted-foreground mt-1">Complete sprints this week to appear on the leaderboard!</p>
    </div>
  );

  const weekLabel = weekStart
    ? `Week of ${new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'This week';

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-xs text-muted-foreground text-center font-semibold">{weekLabel} · Weekly XP</p>

      {board.map((entry, i) => (
        <motion.div key={entry.user_id}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="rounded-2xl overflow-hidden"
          style={entry.is_current_user
            ? { background: 'rgba(91,106,245,0.12)', border: '1px solid #5B6AF5' }
            : { background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            {(() => { const r = rankLabel(entry.rank); return <span className="w-9 text-center shrink-0 text-sm font-bold" style={{ color: r.color }}>{r.text}</span>; })()}

            {/* Avatar */}
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-white text-sm"
              style={{ background: entry.is_current_user ? 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' : 'linear-gradient(135deg, #94a3b8, #64748b)' }}>
              {(entry.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: entry.is_current_user ? '#8B9BFA' : 'white' }}>
                {entry.full_name ?? 'Anonymous'}
                {entry.is_current_user && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Flame size={10} className="text-orange-400" /> {entry.streak_count}d
                </span>
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star size={10} className="text-amber-400" /> {entry.xp.toLocaleString()} XP total
                </span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-base font-bold text-white">{entry.weekly_xp.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">XP this week</p>
            </div>
          </div>

          {/* Progress bar (relative to leader) */}
          {board.length > 0 && (
            <div className="h-1" style={{ background: 'var(--ink-060)' }}>
              <div className="h-full rounded-r-full transition-all"
                style={{
                  width: `${board[0].weekly_xp > 0 ? (entry.weekly_xp / board[0].weekly_xp) * 100 : 0}%`,
                  background: entry.is_current_user ? 'linear-gradient(90deg, #5B6AF5, #8B5CF6)' : 'var(--ink-200)',
                }} />
            </div>
          )}
        </motion.div>
      ))}

      <button onClick={load} className="flex items-center justify-center gap-2 py-3 text-xs font-semibold" style={{ color: '#8B9BFA' }}>
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────
function MembersTab({ members }: {
  members: StudyGroupMember[];
  myRole?: 'admin' | 'member';
  groupId?: string;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-xs text-muted-foreground font-semibold">{members.length} member{members.length !== 1 ? 's' : ''}</p>

      {members.map((m, i) => (
        <motion.div key={m.user_id}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-white text-sm"
            style={{ background: m.role === 'admin' ? 'linear-gradient(135deg, #F59E0B, #EF4444)' : 'linear-gradient(135deg, #94a3b8, #64748b)' }}>
            {(m.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{m.full_name ?? 'Anonymous'}</p>
              {m.role === 'admin' && <Crown size={11} className="text-amber-500" />}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span><Flame size={10} className="inline text-orange-400" /> {m.streak_count ?? 0}d streak</span>
              <span><Star size={10} className="inline text-amber-400" /> {(m.xp ?? 0).toLocaleString()} XP</span>
            </div>
          </div>
          {m.role === 'admin' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ color: '#FBBF24', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>Admin</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup]     = useState<(StudyGroup & { my_role: 'admin' | 'member' }) | null>(null);
  const [members, setMembers] = useState<StudyGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'leaderboard' | 'members'>('leaderboard');
  const [copied, setCopied]   = useState(false);
  const [showLeave, setShowLeave]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!groupId || !user) return;
    (async () => {
      setLoading(true);
      const res = await callFn({ action: 'get_group', group_id: groupId });
      if (!res.error) {
        setGroup(res.data?.group ?? null);
        setMembers(res.data?.members ?? []);
      } else {
        navigate('/study-groups', { replace: true });
      }
      setLoading(false);
    })();
  }, [groupId, user, navigate]);

  async function copyCode() {
    if (!group) return;
    await navigator.clipboard.writeText(group.invite_code.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (Capacitor.isNativePlatform()) await Toast.show({ text: 'Invite code copied!' });
  }

  async function handleLeave() {
    if (!group) return;
    setActionLoading(true);
    const res = await callFn({ action: 'leave', group_id: group.id });
    if (!res.error) {
      if (Capacitor.isNativePlatform()) await Toast.show({ text: `Left ${group.name}` });
      navigate('/study-groups', { replace: true });
    } else {
      const msg = res.data?.error ?? 'Could not leave group';
      if (Capacitor.isNativePlatform()) await Toast.show({ text: msg });
      else alert(msg);
    }
    setActionLoading(false);
    setShowLeave(false);
  }

  async function handleDelete() {
    if (!group) return;
    setActionLoading(true);
    const res = await callFn({ action: 'delete', group_id: group.id });
    if (!res.error) {
      if (Capacitor.isNativePlatform()) await Toast.show({ text: `Deleted ${group.name}` });
      navigate('/study-groups', { replace: true });
    } else {
      const msg = res.data?.error ?? 'Could not delete group';
      if (Capacitor.isNativePlatform()) await Toast.show({ text: msg });
      else alert(msg);
    }
    setActionLoading(false);
    setShowDelete(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-gradient-page">
      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );

  if (!group) return null;

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 shrink-0 sticky top-0 z-20"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button aria-label="Go back" onClick={() => navigate('/study-groups')} className="text-white">
            <ChevronLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
            style={{ background: 'rgba(91,106,245,0.15)' }}>
            {group.avatar_emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-bold text-white text-sm truncate">{group.name}</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span><Users size={10} className="inline" /> {members.length} members</span>
              <button onClick={copyCode} className="flex items-center gap-1 font-semibold" style={{ color: '#8B9BFA' }}>
                <Hash size={10} /> {group.invite_code.toUpperCase()}
                {copied ? <Check size={10} /> : <Copy size={10} />}
              </button>
            </div>
          </div>
          {/* Admin menu */}
          {group.my_role === 'admin' ? (
            <button onClick={() => setShowDelete(true)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <Trash2 size={14} className="text-red-400" />
            </button>
          ) : (
            <button onClick={() => setShowLeave(true)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
              <LogOut size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['leaderboard', 'members'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={tab === t
                ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: 'var(--ink-950)' }
                : { background: 'var(--ink-055)', border: '1px solid var(--ink-080)', color: 'var(--ink-500)' }}>
              {t === 'leaderboard' ? <><Trophy size={11} className="inline mr-1" />Leaderboard</> : <><Users size={11} className="inline mr-1" />Members</>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll pb-nav">
        {tab === 'leaderboard'
          ? <LeaderboardTab groupId={group.id} userId={user?.id ?? ''} />
          : <MembersTab members={members} myRole={group.my_role} groupId={group.id} />}
      </div>

      {/* Leave confirm */}
      <AnimatePresence>
        {(showLeave || showDelete) && (
          <motion.div className="fixed inset-0 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => { setShowLeave(false); setShowDelete(false); }} />
            <motion.div className="relative w-full rounded-t-3xl p-6 pb-10"
              style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--ink-200)' }} />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <AlertCircle size={20} className="text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-white">
                    {showDelete ? 'Delete group?' : 'Leave group?'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {showDelete
                      ? 'This will permanently delete the group and remove all members.'
                      : 'You can rejoin using the invite code later.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1"
                  onClick={() => { setShowLeave(false); setShowDelete(false); }}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1"
                  onClick={showDelete ? handleDelete : handleLeave}
                  disabled={actionLoading}>
                  {actionLoading
                    ? <RefreshCw size={14} className="animate-spin" />
                    : showDelete ? 'Delete' : 'Leave'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
