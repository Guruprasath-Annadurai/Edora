import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Users, Trophy, RefreshCw, X, Hash, Copy, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import type { StudyGroup } from '@/types';

interface GroupWithMeta extends StudyGroup {
  member_count: number;
  my_role: 'admin' | 'member';
}

async function callFn(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('study-groups', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

const EMOJI_OPTIONS = ['📚', '🧠', '🔥', '💡', '🎯', '🚀', '⚡', '🌟', '📖', '✏️', '🏆', '💪'];

// ── Create Group Sheet ────────────────────────────────────────────────────────
function CreateGroupSheet({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (group: StudyGroup) => void;
}) {
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [emoji, setEmoji]       = useState('📚');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleCreate() {
    if (name.trim().length < 2) return;
    setLoading(true);
    const res = await callFn({ action: 'create', name: name.trim(), description: desc.trim() || null, avatar_emoji: emoji, is_public: isPublic });
    if (!res.error && res.data?.group) {
      onCreated(res.data.group);
      onClose();
    } else {
      const msg = res.data?.error ?? 'Failed to create group';
      if (Capacitor.isNativePlatform()) await Toast.show({ text: msg });
      else alert(msg);
    }
    setLoading(false);
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="relative w-full rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
        style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <div className="flex items-center justify-between mb-5">
          <p className="font-heading font-bold text-white text-lg">Create Study Group</p>
          <button onClick={onClose}><X size={20} className="text-muted-foreground" /></button>
        </div>

        {/* Emoji picker */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Group icon</p>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? 'scale-110' : 'opacity-60'}`}
                style={emoji === e ? { background: 'rgba(91,106,245,0.2)', border: '2px solid #5B6AF5' } : { background: 'rgba(255,255,255,0.06)' }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-white">Group name *</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={50}
              placeholder="e.g. JEE 2026 Aspirants"
              className="mt-1 w-full px-4 py-3 rounded-2xl text-sm text-white placeholder:text-muted-foreground outline-none"
              style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-white">Description (optional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={200}
              placeholder="What's this group about?"
              className="mt-1 w-full px-4 py-3 rounded-2xl text-sm text-white placeholder:text-muted-foreground outline-none resize-none"
              style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>
          <button onClick={() => setIsPublic(p => !p)}
            className="flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <p className="text-sm font-semibold text-white">Public group</p>
              <p className="text-xs text-muted-foreground">Others can find and join via invite code</p>
            </div>
            <div className={`w-12 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-primary' : ''}`}
              style={!isPublic ? { background: 'rgba(255,255,255,0.15)' } : {}}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-7' : 'translate-x-1'}`} />
            </div>
          </button>
        </div>

        <Button size="lg" className="w-full mt-5" onClick={handleCreate}
          disabled={name.trim().length < 2 || loading}>
          {loading ? <RefreshCw size={16} className="animate-spin" /> : `${emoji} Create Group`}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── Join Group Sheet ──────────────────────────────────────────────────────────
function JoinGroupSheet({ onClose, onJoined }: {
  onClose: () => void;
  onJoined: (group: StudyGroup) => void;
}) {
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (code.trim().length < 4) return;
    setLoading(true);
    const res = await callFn({ action: 'join', invite_code: code.trim().toLowerCase() });
    if (!res.error && res.data?.group) {
      const msg = res.data.already_member ? 'Already in this group!' : `Joined ${res.data.group.name}!`;
      if (Capacitor.isNativePlatform()) await Toast.show({ text: msg });
      onJoined(res.data.group);
      onClose();
    } else {
      const msg = res.data?.error ?? 'Invalid invite code';
      if (Capacitor.isNativePlatform()) await Toast.show({ text: msg });
      else alert(msg);
    }
    setLoading(false);
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="relative w-full rounded-t-3xl p-5 pb-8"
        style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <div className="flex items-center justify-between mb-5">
          <p className="font-heading font-bold text-white text-lg">Join a Group</p>
          <button onClick={onClose}><X size={20} className="text-muted-foreground" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Enter the 8-character invite code from your study group.</p>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8}
          placeholder="ABCD1234"
          className="w-full px-4 py-4 rounded-2xl text-xl text-center font-bold tracking-[0.3em] text-white placeholder:text-muted-foreground outline-none mb-4"
          style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.1)' }} />
        <Button size="lg" className="w-full" onClick={handleJoin}
          disabled={code.trim().length < 4 || loading}>
          {loading ? <RefreshCw size={16} className="animate-spin" /> : 'Join Group →'}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, onPress }: { group: GroupWithMeta; onPress: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyCode(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(group.invite_code.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (Capacitor.isNativePlatform()) await Toast.show({ text: 'Invite code copied!' });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden active:scale-[0.99] transition-transform"
      style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}
      onClick={onPress}>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
            style={{ background: 'rgba(91,106,245,0.08)', border: '1.5px solid rgba(91,106,245,0.12)' }}>
            {group.avatar_emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-heading font-bold text-white text-sm truncate">{group.name}</h3>
              {group.my_role === 'admin' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary shrink-0">admin</span>
              )}
            </div>
            {group.description && <p className="text-xs text-muted-foreground truncate">{group.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users size={11} /> {group.member_count} members
              </div>
              <button onClick={copyCode}
                className="flex items-center gap-1 text-xs text-primary font-semibold">
                <Hash size={10} />
                {group.invite_code.toUpperCase()}
                {copied ? <Check size={10} /> : <Copy size={10} />}
              </button>
            </div>
          </div>
          <Trophy size={16} className="text-muted-foreground shrink-0 mt-1" />
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudyGroupsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups]         = useState<GroupWithMeta[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin]     = useState(false);

  async function loadGroups() {
    if (!user) return;
    setLoading(true);
    const res = await callFn({ action: 'get_my_groups' });
    if (!res.error) setGroups(res.data?.groups ?? []);
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGroupCreated(group: StudyGroup) {
    loadGroups();
    navigate(`/study-group/${group.id}`);
  }

  function handleGroupJoined(group: StudyGroup) {
    loadGroups();
    navigate(`/study-group/${group.id}`);
  }

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Link aria-label="Go back" to="/profile"><ChevronLeft size={20} className="text-white" /></Link>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)' }}>
            <Users size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-bold text-white text-sm">Study Groups</h2>
            <p className="text-xs text-muted-foreground">Study together, achieve more</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Plus size={14} /> Create Group
          </button>
          <button onClick={() => setShowJoin(true)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(91,106,245,0.15)', color: '#818CF8', border: '1px solid rgba(91,106,245,0.3)' }}>
            <Hash size={14} /> Join via Code
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center flex-1 gap-5 pb-8">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <Users size={40} style={{ color: '#34D399' }} />
            </div>
            <div className="text-center px-4">
              <h3 className="font-heading text-2xl font-bold text-white">No groups yet</h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                Create a study group or join one with an invite code. Study together, compete on the leaderboard, and keep each other accountable.
              </p>
            </div>
            <Button size="lg" onClick={() => setShowCreate(true)} className="w-full">
              <Plus size={17} /> Create Your First Group
            </Button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {groups.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}>
                <GroupCard group={g} onPress={() => navigate(`/study-group/${g.id}`)} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {showCreate && <CreateGroupSheet onClose={() => setShowCreate(false)} onCreated={handleGroupCreated} />}
        {showJoin && <JoinGroupSheet onClose={() => setShowJoin(false)} onJoined={handleGroupJoined} />}
      </AnimatePresence>
    </div>
  );
}
