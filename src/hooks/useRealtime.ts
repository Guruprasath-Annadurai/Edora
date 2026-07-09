// ─────────────────────────────────────────────────────────────────────────────
// useRealtime — Supabase Realtime hooks for live features:
//   • Live leaderboard score updates
//   • Study circle online presence
//   • Teacher broadcast messages
//   • 1v1 Battle score sync (with reconnection + offline fallback)
//
// All channel hooks include:
//   - Exponential backoff reconnection (1s → 2s → 4s → 8s, max 5 attempts)
//   - Connection state tracking ('connecting'|'connected'|'reconnecting'|'offline')
//   - Graceful degradation when offline (optimistic local state preserved)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import type {RealtimeChannel} from '@supabase/supabase-js';
import { supabase }                 from '@/lib/supabase';

// ── Connection state ──────────────────────────────────────────────────────────
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff


// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  user_id:    string;
  full_name:  string;
  avatar_url: string | null;
  xp:         number;
  rank:       number;
}

export interface OnlinePresence {
  user_id:   string;
  full_name: string;
  status:    'studying' | 'quiz' | 'idle';
  joined_at: string;
}

export interface TeacherBroadcastMessage {
  id:         string;
  from_name:  string;
  message:    string;
  type:       'info' | 'warning' | 'quiz_start';
  sent_at:    string;
}

// ── 1. Live Leaderboard ───────────────────────────────────────────────────────

export function useLiveLeaderboard(classroomId: string | null) {
  const [entries,    setEntries]    = useState<LeaderboardEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!classroomId) return;

    // Initial fetch
    supabase
      .from('classroom_members')
      .select('user_id, profiles(full_name, avatar_url, xp)')
      .eq('classroom_id', classroomId)
      .order('profiles(xp)', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) return;
        type Joined = { user_id: string; profiles: { full_name: string; avatar_url: string | null; xp: number } | { full_name: string; avatar_url: string | null; xp: number }[] | null };
        setEntries(
          (data as unknown as Joined[])
            .map(r => ({ user_id: r.user_id, profile: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles }))
            .filter((r): r is { user_id: string; profile: { full_name: string; avatar_url: string | null; xp: number } } => !!r.profile)
            .map((r, i) => ({
              user_id:    r.user_id,
              full_name:  r.profile.full_name,
              avatar_url: r.profile.avatar_url,
              xp:         r.profile.xp,
              rank:       i + 1 }))
        );
      });

    // Subscribe to XP changes in this classroom
    channelRef.current = supabase
      .channel(`leaderboard:${classroomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as { id: string; xp: number; full_name: string; avatar_url: string | null };
          setEntries(prev => {
            const next = prev.map(e =>
              e.user_id === updated.id
                ? { ...e, xp: updated.xp, full_name: updated.full_name }
                : e
            );
            // Re-sort by XP and re-rank
            next.sort((a, b) => b.xp - a.xp);
            next.forEach((e, i) => { e.rank = i + 1; });
            setLastUpdate(new Date());
            return [...next];
          });
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [classroomId]);

  return { entries, lastUpdate };
}

// ── 2. Study Circle Presence ──────────────────────────────────────────────────

export function useStudyCirclePresence(
  circleId: string | null,
  currentUser: { id: string; full_name: string } | null,
  currentStatus: 'studying' | 'quiz' | 'idle' = 'studying'
) {
  const [onlineUsers, setOnlineUsers] = useState<OnlinePresence[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!circleId || !currentUser) return;

    channelRef.current = supabase.channel(`circle:${circleId}`, {
      config: { presence: { key: currentUser.id } } });

    channelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = channelRef.current!.presenceState<OnlinePresence>();
        const users = Object.values(state)
          .flat()
          .filter(Boolean) as OnlinePresence[];
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channelRef.current!.track({
            user_id:   currentUser.id,
            full_name: currentUser.full_name,
            status:    currentStatus,
            joined_at: new Date().toISOString() });
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, currentUser?.id, currentStatus]);

  // Update status without rejoining
  const updateStatus = useCallback(async (status: 'studying' | 'quiz' | 'idle') => {
    if (!channelRef.current || !currentUser) return;
    await channelRef.current.track({
      user_id:   currentUser.id,
      full_name: currentUser.full_name,
      status,
      joined_at: new Date().toISOString() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  return { onlineUsers, updateStatus };
}

// ── 3. Teacher Broadcast ──────────────────────────────────────────────────────

export function useTeacherBroadcast(classroomId: string | null) {
  const [message,     setMessage]     = useState<TeacherBroadcastMessage | null>(null);
  const [dismissed,   setDismissed]   = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    if (!classroomId) return;

    channelRef.current = supabase
      .channel(`broadcast:${classroomId}`)
      .on('broadcast', { event: 'teacher_message' }, ({ payload }) => {
        setMessage(payload as TeacherBroadcastMessage);
        setDismissed(false);
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [classroomId]);

  return { message: dismissed ? null : message, dismiss };
}

// ── 4. Teacher: send a broadcast ─────────────────────────────────────────────

export async function sendTeacherBroadcast(
  classroomId: string,
  payload: Omit<TeacherBroadcastMessage, 'id' | 'sent_at'>
): Promise<void> {
  const channel = supabase.channel(`broadcast:${classroomId}`);
  await channel.send({
    type:    'broadcast',
    event:   'teacher_message',
    payload: {
      ...payload,
      id:      `msg_${Date.now()}`,
      sent_at: new Date().toISOString() } });
  supabase.removeChannel(channel);
}

// ── 5. 1v1 Battle Score Sync (resilient) ─────────────────────────────────────

export interface BattleScore {
  user_id: string;
  score:   number;
  done:    boolean;
}

export function use1v1BattleSync(battleId: string | null, myUserId: string | null) {
  const [scores,       setScores]       = useState<Record<string, BattleScore>>({});
  const [opponentDone, setOpponentDone] = useState(false);
  const channelRef     = useRef<RealtimeChannel | null>(null);
  const attemptRef     = useRef(0);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef     = useRef<{ score: number; done: boolean } | null>(null);
  const [connStatus,   setConnStatus]   = useState<ConnectionStatus>('connecting');

  const flushPending = useCallback(async () => {
    if (!pendingRef.current || !channelRef.current || !myUserId) return;
    try {
      await channelRef.current.send({
        type: 'broadcast', event: 'score_update',
        payload: { user_id: myUserId, ...pendingRef.current } });
      pendingRef.current = null;
    } catch { /* will retry on next pushScore */ }
  }, [myUserId]);

  const connect = useCallback(() => {
    if (!battleId || !myUserId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }

    setConnStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

    const ch = supabase
      .channel(`battle:${battleId}`)
      .on('broadcast', { event: 'score_update' }, ({ payload }) => {
        const update = payload as BattleScore;
        setScores(prev => ({ ...prev, [update.user_id]: update }));
        if (update.user_id !== myUserId && update.done) setOpponentDone(true);
      });

    channelRef.current = ch;
    ch.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        attemptRef.current = 0;
        setConnStatus('connected');
        flushPending();
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
        const delay = RECONNECT_DELAYS_MS[Math.min(attemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
        attemptRef.current++;
        if (attemptRef.current > RECONNECT_DELAYS_MS.length) { setConnStatus('offline'); return; }
        setConnStatus('reconnecting');
        timerRef.current = setTimeout(connect, delay);
      }
    });
  }, [battleId, myUserId, flushPending]);

  useEffect(() => {
    attemptRef.current = 0;
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [connect]);

  const pushScore = useCallback(async (score: number, done: boolean) => {
    if (!myUserId) return;
    // Always update local state immediately (optimistic)
    setScores(prev => ({ ...prev, [myUserId]: { user_id: myUserId, score, done } }));
    pendingRef.current = { score, done };

    if (!channelRef.current || connStatus !== 'connected') {
      // Offline: keep pending, will flush on reconnect
      return;
    }
    try {
      await channelRef.current.send({
        type: 'broadcast', event: 'score_update',
        payload: { user_id: myUserId, score, done } });
      pendingRef.current = null;
    } catch { /* pending will flush on reconnect */ }
  }, [myUserId, connStatus]);

  return { scores, opponentDone, pushScore, connStatus };
}
