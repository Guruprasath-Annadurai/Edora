// ═══════════════════════════════════════════════════════════════════════════
// StudyCirclePage — Enhanced Study Circles with sync sprints, group streak,
//                   WhatsApp invite, 6-digit code
// Route: /circles
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Plus, Users, Flame, Hash, Copy, Check,
  Play, Square, Timer, Crown, Zap, RefreshCw,
  MessageCircle, Users2} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import CircleChatPanel from '@/components/CircleChatPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Circle {
  id: string;
  name: string;
  description: string | null;
  avatar_emoji: string;
  invite_code: string;
  group_streak: number;
  last_streak_at: string | null;
  total_xp: number;
  is_classroom: boolean;
  member_count: number;
  my_role: 'admin' | 'member';
}

interface SprintState {
  id: string;
  subject: string;
  duration_mins: number;
  started_at: string;
  ended_at: string | null;
  started_by: string;
  starter_name: string;
}

interface Member {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
}

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'History', 'Geography', 'English', 'Computer Science'];

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const fallback = (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--ink-950)' }}>{initials}</div>
  );
  if (url && !imgError) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} onError={() => setImgError(true)} />;
  return fallback;
}

// ── Utility: format sprint timer ──────────────────────────────────────────────
function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudyCirclePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [circles, setCircles]           = useState<Circle[]>([]);
  const [selected, setSelected]         = useState<Circle | null>(null);
  const [members, setMembers]           = useState<Member[]>([]);
  const [sprint, setSprint]             = useState<SprintState | null>(null);
  const [sprintSecs, setSprintSecs]     = useState(0);
  const [loading, setLoading]           = useState(true);
  const [showCreate, setShowCreate]     = useState(false);
  const [showJoin, setShowJoin]         = useState(false);
  const [copied, setCopied]             = useState(false);

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load circles ────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCircles closes over user which is already in deps
  useEffect(() => { loadCircles(); }, [user]);

  async function loadCircles() {
    if (!user) return;
    setLoading(true);
    const { data: memberRows } = await supabase
      .from('study_circle_members')
      .select('circle_id')
      .eq('user_id', user.id);

    if (!memberRows?.length) { setCircles([]); setLoading(false); return; }

    const ids = memberRows.map(r => r.circle_id);
    const { data: circleData } = await supabase
      .from('study_circles')
      .select('*')
      .in('id', ids);

    // Enrich with member counts and roles
    const enriched: Circle[] = await Promise.all((circleData ?? []).map(async c => {
      const { count } = await supabase.from('study_circle_members').select('*', { count: 'exact', head: true }).eq('circle_id', c.id);
      const { data: roleRow } = await supabase.from('study_circle_members').select('role').eq('circle_id', c.id).eq('user_id', user.id).maybeSingle();
      return { ...c, member_count: count ?? 0, my_role: roleRow?.role ?? 'member' };
    }));
    setCircles(enriched);
    setLoading(false);
  }

  // ── Open circle ─────────────────────────────────────────────────────────────
  async function openCircle(c: Circle) {
    setSelected(c);
    loadMembers(c.id);
    subscribeToSprints(c.id);
    // Load active sprint
    const { data } = await supabase
      .from('circle_sprints')
      .select('*, profiles!started_by(full_name)')
      .eq('circle_id', c.id)
      .is('ended_at', null)
      .maybeSingle();
    if (data) {
      setSprint({ ...data, starter_name: (data.profiles as { full_name: string }).full_name ?? 'Someone' });
      startSprintTimer(data.started_at, data.duration_mins);
    }
    track('circle_opened', { circle_id: c.id });
  }

  async function loadMembers(circleId: string) {
    const { data } = await supabase
      .from('study_circle_members')
      .select('profiles(id,full_name,avatar_url,xp)')
      .eq('circle_id', circleId);
    const m = (data ?? []).map(r => r.profiles as unknown as Member).filter(Boolean);
    setMembers(m.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0)));
  }

  // ── Sprint realtime ─────────────────────────────────────────────────────────
  function subscribeToSprints(circleId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`circle_sprints:${circleId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'circle_sprints', filter: `circle_id=eq.${circleId}` }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const s = payload.new as SprintState;
          const { data: starter } = await supabase.from('profiles').select('full_name').eq('id', s.started_by).maybeSingle();
          setSprint({ ...s, starter_name: starter?.full_name ?? 'Someone' });
          startSprintTimer(s.started_at, s.duration_mins);
        } else if (payload.eventType === 'UPDATE' && (payload.new as SprintState).ended_at) {
          endSprintTimer();
        }
      })
      .subscribe();
    channelRef.current = ch;
  }

  function startSprintTimer(startedAt: string, durationMins: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    const totalSecs = durationMins * 60;
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    let remaining = Math.max(0, totalSecs - elapsed);
    setSprintSecs(remaining);

    timerRef.current = setInterval(() => {
      remaining--;
      setSprintSecs(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setSprint(null);
      }
    }, 1000);
  }

  function endSprintTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSprint(null);
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }, []);

  // ── Start sprint ─────────────────────────────────────────────────────────────
  async function startSprint(subject: string, mins: number) {
    if (!user || !selected) return;
    const { data } = await supabase
      .from('circle_sprints')
      .insert({ circle_id: selected.id, started_by: user.id, subject, duration_mins: mins })
      .select()
      .single();
    if (data) {
      setSprint({ ...data, starter_name: profile?.full_name ?? 'You' });
      startSprintTimer(data.started_at, mins);
      track('sprint_started', { circle_id: selected.id, subject, mins });
    }
  }

  async function endSprint() {
    if (!sprint) return;
    await supabase.from('circle_sprints').update({ ended_at: new Date().toISOString() }).eq('id', sprint.id);
    endSprintTimer();
  }

  // ── Copy invite ─────────────────────────────────────────────────────────────
  async function copyCode() {
    if (!selected) return;
    const text = selected.invite_code;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!selected) return;
    const code = selected.invite_code;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join my Edora Study Circle "${selected.name}". Enter code ${code} in the Edora app to join.`)}`, '_blank', 'noopener,noreferrer');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (selected) return (
    <CircleDetailView
      circle={selected}
      members={members}
      sprint={sprint}
      sprintSecs={sprintSecs}
      myId={user?.id ?? ''}
      onBack={() => { setSelected(null); setSprint(null); endSprintTimer(); }}
      onStartSprint={startSprint}
      onEndSprint={endSprint}
      onCopyCode={copyCode}
      onShareWhatsApp={shareWhatsApp}
      copied={copied}
    />
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--ink-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Go back" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Study Circles</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Learn together, grow together</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setShowJoin(true)}>
            <Hash size={14} style={{ marginRight: 4 }} />Join
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} style={{ background: '#7C3AED' }}>
            <Plus size={14} style={{ marginRight: 4 }} />Create
          </Button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <div>Loading circles…</div>
          </div>
        ) : circles.length === 0 ? (
          <EmptyState onJoin={() => setShowJoin(true)} onCreate={() => setShowCreate(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {circles.map(c => (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => openCircle(c)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: 'var(--ink-055)', borderRadius: 16,
                  border: '1px solid var(--ink-100)', padding: '16px 18px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 32 }}>{c.avatar_emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={12} />{c.member_count} members
                      {c.is_classroom && <span style={{ color: '#A78BFA' }}>· Classroom</span>}
                    </div>
                  </div>
                  {c.my_role === 'admin' && <Crown size={16} color="#F59E0B" />}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Flame size={14} color={c.group_streak > 0 ? '#F59E0B' : '#6B7280'} />
                    <span style={{ color: c.group_streak > 0 ? '#F59E0B' : 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {c.group_streak} day streak
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Zap size={14} color="#60A5FA" />
                    <span style={{ color: 'var(--color-text-secondary)' }}>{c.total_xp.toLocaleString()} XP</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && <CreateCircleModal onClose={() => setShowCreate(false)} onCreated={(c) => { setCircles(prev => [c, ...prev]); setShowCreate(false); }} userId={user?.id ?? ''} />}
      </AnimatePresence>

      {/* Join modal */}
      <AnimatePresence>
        {showJoin && <JoinCircleModal onClose={() => setShowJoin(false)} onJoined={(c) => { setCircles(prev => [c, ...prev]); setShowJoin(false); }} userId={user?.id ?? ''} />}
      </AnimatePresence>
    </div>
  );
}

// ── Circle Detail View ────────────────────────────────────────────────────────
function CircleDetailView({ circle, members, sprint, sprintSecs, myId, onBack, onStartSprint, onEndSprint, onCopyCode, onShareWhatsApp, copied }: {
  circle: Circle;
  members: Member[];
  sprint: SprintState | null;
  sprintSecs: number;
  myId: string;
  onBack: () => void;
  onStartSprint: (subject: string, mins: number) => void;
  onEndSprint: () => void;
  onCopyCode: () => void;
  onShareWhatsApp: () => void;
  copied: boolean;
}) {
  const [showSprintPicker, setShowSprintPicker] = useState(false);
  const [sprintSubject, setSprintSubject]       = useState('Physics');
  const [sprintMins, setSprintMins]             = useState(25);
  const [showChat, setShowChat]                 = useState(false);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--ink-100)', background: 'var(--ink-055)' }}>
        <button aria-label="Go back" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ fontSize: 28 }}>{circle.avatar_emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{circle.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{members.length} members</div>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>
        {/* Streak + XP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'var(--ink-055)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--ink-100)', textAlign: 'center' }}>
            <Flame size={24} color={circle.group_streak > 0 ? '#F59E0B' : '#6B7280'} style={{ marginBottom: 4 }} />
            <div style={{ fontWeight: 800, fontSize: 22, color: circle.group_streak > 0 ? '#F59E0B' : 'var(--color-text)' }}>{circle.group_streak}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Group Streak</div>
          </div>
          <div style={{ background: 'var(--ink-055)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--ink-100)', textAlign: 'center' }}>
            <Zap size={24} color="#60A5FA" style={{ marginBottom: 4 }} />
            <div style={{ fontWeight: 800, fontSize: 22 }}>{circle.total_xp.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Total XP</div>
          </div>
        </div>

        {/* Active sprint */}
        <AnimatePresence>
          {sprint && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: 'linear-gradient(135deg,rgba(124,58,237,0.2),rgba(167,139,250,0.1))',
                border: '2px solid rgba(124,58,237,0.4)',
                borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Timer size={18} color="#A78BFA" />
                  Sync Sprint — {sprint.subject}
                </div>
                <div style={{ fontWeight: 900, fontSize: 24, color: sprintSecs <= 60 ? '#EF4444' : '#A78BFA', fontFamily: 'monospace' }}>
                  {formatTime(sprintSecs)}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                Started by {sprint.starter_name} · {sprint.duration_mins}min session
              </div>
              {sprint.started_by === myId && (
                <Button variant="outline" size="sm" onClick={onEndSprint} style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                  <Square size={12} style={{ marginRight: 4 }} /> End Sprint
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Start sprint */}
        {!sprint && (
          <div style={{ marginBottom: 20 }}>
            {!showSprintPicker ? (
              <button
                onClick={() => setShowSprintPicker(true)}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14,
                  border: '2px dashed rgba(124,58,237,0.4)', background: 'transparent',
                  color: '#A78BFA', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Play size={16} />Start Sync Sprint for everyone
              </button>
            ) : (
              <div style={{ background: 'var(--ink-055)', borderRadius: 14, padding: '16px', border: '1px solid var(--ink-100)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Configure Sprint</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Subject</div>
                  <select value={sprintSubject} onChange={e => setSprintSubject(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ink-140)', background: 'var(--ink-080)', color: 'var(--ink-880)', fontSize: 14, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Duration</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[15, 25, 45, 60].map(m => (
                      <button key={m} onClick={() => setSprintMins(m)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: `2px solid ${sprintMins === m ? '#7C3AED' : 'var(--ink-120)'}`,
                        background: sprintMins === m ? 'rgba(124,58,237,0.15)' : 'var(--ink-055)',
                        color: sprintMins === m ? '#A78BFA' : 'var(--ink-750)', cursor: 'pointer' }}>{m}m</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => setShowSprintPicker(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => { onStartSprint(sprintSubject, sprintMins); setShowSprintPicker(false); }} style={{ background: '#7C3AED', flex: 1 }}>
                    <Play size={14} style={{ marginRight: 4 }} />Start Sprint
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invite code */}
        <div style={{ background: 'var(--ink-055)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, border: '1px solid var(--ink-100)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8, fontWeight: 600 }}>INVITE CODE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, letterSpacing: 8, flex: 1, color: '#A78BFA' }}>
              {circle.invite_code}
            </div>
            <button onClick={onCopyCode} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: copied ? '#10B981' : 'var(--color-text-secondary)' }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button onClick={onShareWhatsApp} style={{ background: '#25D366', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, color: 'var(--ink-950)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
              <MessageCircle size={14} />Share
            </button>
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Circle Leaderboard</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--ink-055)', borderRadius: 12, border: m.id === myId ? '1px solid rgba(124,58,237,0.4)' : '1px solid var(--ink-100)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7C2F' : 'var(--color-text-secondary)', minWidth: 24 }}>
                {`#${i + 1}`}
              </div>
              <Avatar url={m.avatar_url} name={m.full_name} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.full_name}{m.id === myId ? ' (you)' : ''}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#60A5FA' }}>{m.xp?.toLocaleString()} XP</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating chat button */}
      <button
        onClick={() => setShowChat(true)}
        style={{
          position: 'fixed', bottom: 24, right: 20, width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(91,106,245,0.4)', zIndex: 30 }}
      >
        <MessageCircle size={24} color="#fff" />
      </button>

      <AnimatePresence>
        {showChat && <CircleChatPanel circleId={circle.id} onClose={() => setShowChat(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ onJoin, onCreate }: { onJoin: () => void; onCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ marginBottom: 16 }}><Users2 size={56} className="mx-auto text-white/25" strokeWidth={1.4} /></div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No Study Circles Yet</div>
      <div style={{ color: 'var(--color-text-secondary)', marginBottom: 28, fontSize: 14 }}>
        Join a circle with a code or create one for your friends.
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Button variant="outline" onClick={onJoin}><Hash size={14} style={{ marginRight: 4 }} />Join with Code</Button>
        <Button onClick={onCreate} style={{ background: '#7C3AED' }}><Plus size={14} style={{ marginRight: 4 }} />Create Circle</Button>
      </div>
    </div>
  );
}

// ── Create Circle Modal ───────────────────────────────────────────────────────
function CreateCircleModal({ onClose, onCreated, userId }: {
  onClose: () => void;
  onCreated: (c: Circle) => void;
  userId: string;
}) {
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [emoji, setEmoji] = useState('📚');
  const [loading, setLoading] = useState(false);

  const EMOJIS = ['📚', '🧠', '🔥', '💡', '🎯', '🚀', '⚡', '🌟', '✏️', '🏆'];

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase
      .from('study_circles')
      .insert({ name: name.trim(), description: desc.trim() || null, avatar_emoji: emoji, invite_code: code, created_by: userId })
      .select()
      .single();
    if (data && !error) {
      await supabase.from('study_circle_members').insert({ circle_id: data.id, user_id: userId, role: 'admin' });
      onCreated({ ...data, member_count: 1, my_role: 'admin' });
    }
    setLoading(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
      onClick={onClose}
    >
      <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
        style={{ width: '100%', background: 'var(--hdr-a-920)', backdropFilter: 'blur(64px) saturate(200%)', WebkitBackdropFilter: 'blur(64px) saturate(200%)', borderRadius: '20px 20px 0 0', borderTop: '1px solid var(--ink-100)', padding: '24px 20px 40px', maxWidth: 480, margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Create Study Circle</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 24, padding: '4px 8px', borderRadius: 8, border: `2px solid ${emoji === e ? '#7C3AED' : 'transparent'}`, background: 'none', cursor: 'pointer' }}>{e}</button>
          ))}
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Circle name"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--ink-140)', background: 'var(--ink-070)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: 'var(--ink-920)', fontSize: 15, marginBottom: 10, boxSizing: 'border-box' }} />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" rows={2}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--ink-140)', background: 'var(--ink-070)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: 'var(--ink-920)', fontSize: 14, marginBottom: 16, resize: 'none', boxSizing: 'border-box' }} />
        <Button onClick={create} disabled={loading || !name.trim()} style={{ width: '100%', background: '#7C3AED', padding: '13px' }}>
          {loading ? 'Creating…' : `${emoji} Create Circle`}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── Join Circle Modal ─────────────────────────────────────────────────────────
function JoinCircleModal({ onClose, onJoined, userId }: {
  onClose: () => void;
  onJoined: (c: Circle) => void;
  userId: string;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function join() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { setError('Code must be 6 characters'); return; }
    setLoading(true);
    setError('');
    const { data: circle, error: err } = await supabase.from('study_circles').select('*').eq('invite_code', c).maybeSingle();
    if (err || !circle) { setError('Circle not found. Check the code.'); setLoading(false); return; }

    const { error: joinErr } = await supabase.from('study_circle_members').insert({ circle_id: circle.id, user_id: userId, role: 'member' });
    if (joinErr && !joinErr.message.includes('duplicate')) { setError('Could not join circle.'); setLoading(false); return; }

    onJoined({ ...circle, member_count: 0, my_role: 'member' });
    setLoading(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
      onClick={onClose}
    >
      <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
        style={{ width: '100%', background: 'var(--hdr-a-920)', backdropFilter: 'blur(64px) saturate(200%)', WebkitBackdropFilter: 'blur(64px) saturate(200%)', borderRadius: '20px 20px 0 0', borderTop: '1px solid var(--ink-100)', padding: '24px 20px 40px', maxWidth: 480, margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Join a Circle</div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 20 }}>Enter the 6-character invite code</div>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE1" maxLength={6}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: `1px solid ${error ? '#EF4444' : 'var(--ink-160)'}`, background: 'var(--ink-070)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: 'var(--ink-920)', fontSize: 22, fontWeight: 800, letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace', marginBottom: 8, boxSizing: 'border-box' }} />
        {error && <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <Button onClick={join} disabled={loading || code.length !== 6} style={{ width: '100%', background: '#7C3AED', padding: '13px', marginTop: 8 }}>
          {loading ? 'Joining…' : 'Join Circle'}
        </Button>
      </motion.div>
    </motion.div>
  );
}
