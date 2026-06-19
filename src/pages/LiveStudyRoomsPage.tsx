// ═══════════════════════════════════════════════════════════════════════════
// LiveStudyRoomsPage — Multi-user Study Rooms with AI Librarian
// Route: /live-study-rooms
//
// Architecture:
//   • Supabase Realtime channel per room: `live-room:{roomId}`
//   • Presence  → track who's currently studying in the room
//   • Broadcast → real-time chat messages (fast path, no round-trip)
//   • DB        → persisted AI-librarian answers + room history
//
// Phases: 'lobby' → browse / create rooms
//         'room'  → inside a room: chat + AI Librarian
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Plus, Sparkles, Send, Hash,
  Loader2, BookOpen, X, Search, Crown, Clock,
  MessageCircle, Zap, LogOut, Copy, Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveRoom {
  id: string;
  code: string;
  name: string;
  subject: string | null;
  host_id: string;
  is_active: boolean;
  created_at: string;
  host_name?: string;
  member_count?: number;
}

interface RoomMessage {
  id: string;
  user_id: string | null;
  sender_name: string;
  content: string;
  message_type: 'chat' | 'ai_answer' | 'question' | 'system';
  created_at: string;
  is_me: boolean;
}

interface PresenceMember {
  user_id: string;
  name: string;
  avatar_letter: string;
  is_studying: boolean;
}

interface LibrarianResponse {
  answer: string;
  key_points: string[];
  formula_hint: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUBJECTS   = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'All Subjects'];

const SUBJECT_COLORS: Record<string, string> = {
  Physics:     '#5B6AF5',
  Chemistry:   '#10B981',
  Mathematics: '#F59E0B',
  Biology:     '#EC4899',
};

function generateCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LiveStudyRoomsPage() {
  const { user, profile } = useAuth();

  // Phase
  const [phase, setPhase] = useState<'lobby' | 'room'>('lobby');

  // Lobby state
  const [rooms, setRooms]             = useState<LiveRoom[]>([]);
  const [lobbyLoading, setLobbyLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState('All Subjects');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal]     = useState(false);
  const [joinCode, setJoinCode]       = useState('');
  const [joinError, setJoinError]     = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSubject, setNewRoomSubject] = useState('Physics');
  const [creating, setCreating]       = useState(false);

  // Room state
  const [currentRoom, setCurrentRoom]   = useState<LiveRoom | null>(null);
  const [messages, setMessages]         = useState<RoomMessage[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [aiInput, setAiInput]           = useState('');
  const [aiThinking, setAiThinking]     = useState(false);
  const [copiedCode, setCopiedCode]     = useState(false);
  const [activeTab, setActiveTab]       = useState<'chat' | 'ask'>('chat');

  const channelRef    = useRef<RealtimeChannel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Scroll to bottom on new message ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Fetch active rooms ──────────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    setLobbyLoading(true);
    const { data } = await supabase
      .from('live_study_rooms')
      .select('*, profiles!host_id(full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setRooms(data.map((r) => ({
        ...r,
        host_name: (r.profiles as { full_name: string } | null)?.full_name ?? 'Anonymous',
      })));
    }
    setLobbyLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ── Enter room ──────────────────────────────────────────────────────────────
  const enterRoom = useCallback(async (room: LiveRoom) => {
    if (!user) return;

    // Fetch last 50 messages
    const { data: msgs } = await supabase
      .from('live_room_messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .limit(50);

    setMessages(
      (msgs ?? []).map((m) => ({ ...m, is_me: m.user_id === user.id }))
    );
    setCurrentRoom(room);
    setPhase('room');

    // System message
    const sysMsg: RoomMessage = {
      id:           crypto.randomUUID(),
      user_id:      null,
      sender_name:  'System',
      content:      `You joined ${room.name}. Say hi! 👋`,
      message_type: 'system',
      created_at:   new Date().toISOString(),
      is_me:        false,
    };
    setMessages((prev) => [...prev, sysMsg]);

    // Realtime channel
    const channel = supabase
      .channel(`live-room:${room.id}`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMember>();
        setOnlineMembers(Object.values(state).flat());
      })
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        const msg = payload.message as RoomMessage;
        if (msg.user_id !== user.id) {
          setMessages((prev) => [...prev, { ...msg, is_me: false }]);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const name       = (profile as { full_name?: string } | null)?.full_name ?? 'Student';
          const avatarLetter = name[0]?.toUpperCase() ?? 'S';
          await channel.track({ user_id: user.id, name, avatar_letter: avatarLetter, is_studying: true });
        }
      });

    channelRef.current = channel;
  }, [user, profile]);

  // ── Leave room ──────────────────────────────────────────────────────────────
  const leaveRoom = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.untrack();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setCurrentRoom(null);
    setMessages([]);
    setOnlineMembers([]);
    setPhase('lobby');
    fetchRooms();
  }, [fetchRooms]);

  // ── Create room ─────────────────────────────────────────────────────────────
  const createRoom = async () => {
    if (!user || !newRoomName.trim()) return;
    setCreating(true);
    const code = generateCode();
    const { data, error } = await supabase
      .from('live_study_rooms')
      .insert({ code, name: newRoomName.trim(), subject: newRoomSubject, host_id: user.id })
      .select()
      .single();

    if (!error && data) {
      setShowCreateModal(false);
      setNewRoomName('');
      await enterRoom({ ...data, host_name: (profile as { full_name?: string } | null)?.full_name ?? 'You' });
    }
    setCreating(false);
  };

  // ── Join by code ─────────────────────────────────────────────────────────────
  const joinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length !== 6) { setJoinError('Enter a valid 6-character code'); return; }
    setJoinError('');
    const { data } = await supabase
      .from('live_study_rooms')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (!data) { setJoinError('Room not found or no longer active'); return; }
    setShowJoinModal(false);
    setJoinCode('');
    await enterRoom(data as LiveRoom);
  };

  // ── Send chat ────────────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim() || !currentRoom || !user) return;
    const text = chatInput.trim();
    setChatInput('');

    const name = (profile as { full_name?: string } | null)?.full_name ?? 'Student';
    const msg: RoomMessage = {
      id:           crypto.randomUUID(),
      user_id:      user.id,
      sender_name:  name,
      content:      text,
      message_type: 'chat',
      created_at:   new Date().toISOString(),
      is_me:        true,
    };

    setMessages((prev) => [...prev, msg]);

    // Persist
    supabase.from('live_room_messages').insert({
      room_id: currentRoom.id, user_id: user.id,
      sender_name: name, message_type: 'chat', content: text,
    }).then(() => {});

    // Broadcast to room
    channelRef.current?.send({ type: 'broadcast', event: 'chat_message', payload: { message: msg } });
  };

  // ── Ask AI Librarian ─────────────────────────────────────────────────────────
  const askLibrarian = async () => {
    if (!aiInput.trim() || aiThinking || !currentRoom || !user) return;
    const question = aiInput.trim();
    setAiInput('');
    setAiThinking(true);

    const name = (profile as { full_name?: string } | null)?.full_name ?? 'Student';
    const questionMsg: RoomMessage = {
      id:           crypto.randomUUID(),
      user_id:      user.id,
      sender_name:  name,
      content:      `📚 Ask: ${question}`,
      message_type: 'question',
      created_at:   new Date().toISOString(),
      is_me:        true,
    };
    setMessages((prev) => [...prev, questionMsg]);
    channelRef.current?.send({ type: 'broadcast', event: 'chat_message', payload: { message: questionMsg } });

    try {
      const resp = await geminiJSON<LibrarianResponse>(`
You are Novo, an AI Librarian in a live study room. Subject context: ${currentRoom.subject ?? 'General'}.
A student asks: "${question}"

Answer concisely for a JEE/NEET student. Return ONLY valid JSON:
{
  "answer": "Clear 2-3 sentence answer",
  "key_points": ["Key point 1", "Key point 2"],
  "formula_hint": "Relevant formula or null if not applicable"
}
`);

      let content = resp.answer ?? 'I could not process that question.';
      if (resp.key_points?.length) content += '\n\n' + resp.key_points.map((p) => `• ${p}`).join('\n');
      if (resp.formula_hint) content += `\n\n📐 ${resp.formula_hint}`;

      const aiMsg: RoomMessage = {
        id:           crypto.randomUUID(),
        user_id:      null,
        sender_name:  'AI Librarian',
        content,
        message_type: 'ai_answer',
        created_at:   new Date().toISOString(),
        is_me:        false,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Persist AI answer
      supabase.from('live_room_messages').insert({
        room_id: currentRoom.id, user_id: null,
        sender_name: 'AI Librarian', message_type: 'ai_answer', content,
      }).then(() => {});

      channelRef.current?.send({ type: 'broadcast', event: 'chat_message', payload: { message: aiMsg } });
    } catch {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), user_id: null, sender_name: 'AI Librarian',
        content: 'Sorry, I ran into an error. Please try again.',
        message_type: 'ai_answer', created_at: new Date().toISOString(), is_me: false,
      }]);
    } finally {
      setAiThinking(false);
    }
  };

  // ── Copy room code ────────────────────────────────────────────────────────────
  const copyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Filtered rooms ────────────────────────────────────────────────────────────
  const filteredRooms = rooms.filter((r) => {
    const matchSubject = subjectFilter === 'All Subjects' || r.subject === subjectFilter;
    const matchSearch  = !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSubject && matchSearch;
  });

  // ── Lobby UI ──────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-[#0A0A0F]/90 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <Link to="/home" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="font-bold text-white">Live Study Rooms</h1>
            <p className="text-xs text-gray-400">Study together, ask AI Librarian</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-3 py-1.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms..."
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Subject filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSubjectFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  subjectFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Room list */}
          {lobbyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-4xl">🏛️</div>
              <p className="text-gray-400">No active rooms right now</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Create the first one
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRooms.map((room) => (
                <motion.button
                  key={room.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => enterRoom(room)}
                  className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/40 hover:bg-white/8 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold text-white">{room.name}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {room.subject && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{
                              background: `${SUBJECT_COLORS[room.subject] ?? '#6B7280'}20`,
                              color: SUBJECT_COLORS[room.subject] ?? '#9CA3AF',
                            }}
                          >
                            {room.subject}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {timeAgo(room.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Crown className="w-3 h-3" />
                      <span>{room.host_name}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <Hash className="w-3 h-3" />
                    <span className="font-mono tracking-widest">{room.code}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Create Room Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4"
              onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="w-full max-w-sm bg-[#13131A] border border-white/10 rounded-3xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white">Create Room</h2>
                  <button onClick={() => setShowCreateModal(false)}>
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="space-y-3">
                  <input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Room name (e.g. Thermodynamics Cram)"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={newRoomSubject}
                    onChange={(e) => setNewRoomSubject(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {['Physics', 'Chemistry', 'Mathematics', 'Biology'].map((s) => (
                      <option key={s} value={s} className="bg-[#13131A]">{s}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={createRoom}
                  disabled={!newRoomName.trim() || creating}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Creating…' : 'Create Room'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Join Modal */}
        <AnimatePresence>
          {showJoinModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4"
              onClick={(e) => e.target === e.currentTarget && setShowJoinModal(false)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="w-full max-w-sm bg-[#13131A] border border-white/10 rounded-3xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white">Join by Code</h2>
                  <button onClick={() => setShowJoinModal(false)}>
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ENTER CODE"
                  className="w-full text-center px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-lg font-mono tracking-[0.3em] text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
                />
                {joinError && <p className="text-xs text-red-400">{joinError}</p>}
                <button
                  onClick={joinByCode}
                  disabled={joinCode.length !== 6}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-sm transition-colors"
                >
                  Join Room
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Room UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      {/* Room Header */}
      <div className="sticky top-0 z-20 bg-[#0A0A0F]/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={leaveRoom} className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white truncate">{currentRoom?.name}</div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              {currentRoom?.subject && (
                <span style={{ color: SUBJECT_COLORS[currentRoom.subject] ?? '#9CA3AF' }}>
                  {currentRoom.subject}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {onlineMembers.length} online
              </span>
            </div>
          </div>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-gray-400 transition-colors"
          >
            {copiedCode ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {currentRoom?.code}
          </button>
        </div>

        {/* Online members */}
        {onlineMembers.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 px-1">
            {onlineMembers.slice(0, 6).map((m) => (
              <div
                key={m.user_id}
                className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold"
                title={m.name}
              >
                {m.avatar_letter}
              </div>
            ))}
            {onlineMembers.length > 6 && (
              <span className="text-xs text-gray-500">+{onlineMembers.length - 6}</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(['chat', 'ask'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                activeTab === tab ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab === 'chat' ? (
                <span className="flex items-center justify-center gap-1.5"><MessageCircle className="w-3 h-3" /> Chat</span>
              ) : (
                <span className="flex items-center justify-center gap-1.5"><Sparkles className="w-3 h-3 text-indigo-400" /> Ask Librarian</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.message_type === 'system') {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-xs text-gray-600 py-1"
                >
                  {msg.content}
                </motion.div>
              );
            }

            const isAI = msg.message_type === 'ai_answer';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.is_me ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                  isAI ? 'bg-gradient-to-br from-indigo-600 to-purple-600' : 'bg-white/10'
                }`}>
                  {isAI ? <Sparkles className="w-4 h-4" /> : msg.sender_name[0]?.toUpperCase()}
                </div>

                {/* Bubble */}
                <div className={`max-w-[75%] space-y-1 ${msg.is_me ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!msg.is_me && (
                    <span className={`text-[10px] font-medium ${isAI ? 'text-indigo-400' : 'text-gray-500'}`}>
                      {isAI ? '✨ AI Librarian' : msg.sender_name}
                    </span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.is_me
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : isAI
                      ? 'bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-500/20 text-gray-100 rounded-tl-sm'
                      : msg.message_type === 'question'
                      ? 'bg-amber-900/30 border border-amber-500/20 text-amber-100 rounded-tl-sm'
                      : 'bg-white/8 text-gray-100 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-600">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {aiThinking && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/8 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
              <span className="text-xs text-gray-400">Librarian thinking…</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-[#0A0A0F]/95 backdrop-blur border-t border-white/5 px-4 py-3">
        {activeTab === 'chat' ? (
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Say something to the room…"
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-indigo-400">
              <Sparkles className="w-3 h-3" />
              <span>Ask anything about {currentRoom?.subject ?? 'your subject'}</span>
            </div>
            <div className="flex gap-2">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askLibrarian()}
                placeholder="e.g. Explain Bernoulli's principle…"
                className="flex-1 px-4 py-2.5 bg-white/5 border border-indigo-500/30 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={askLibrarian}
                disabled={!aiInput.trim() || aiThinking}
                className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 transition-all"
              >
                {aiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating member count */}
      <div className="fixed bottom-24 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <Users className="w-3 h-3" />
        <span>{onlineMembers.length}</span>
      </div>
    </div>
  );
}

// Suppress unused import warnings for BookOpen (used in potential future empty state)
void BookOpen;
