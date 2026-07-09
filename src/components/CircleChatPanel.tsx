// ─────────────────────────────────────────────────────────────────────────────
// CircleChatPanel — in-app messaging inside a study circle
// Text + emoji reactions + photo share, via Supabase Realtime broadcast
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {motion} from 'framer-motion';
import { spring } from '@/lib/motion';
import { X, Send, Image as ImageIcon, ChevronDown, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ChatMessage {
  id:         string;
  circle_id:  string;
  user_id:    string;
  message:    string | null;
  photo_url:  string | null;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
  reactions:  Record<string, number>; // emoji -> count
  my_reaction?: string;
}

const QUICK_EMOJIS = ['🔥', '👏', '😂', '❤️', '🤯'];

function Avatar({ url, name, size = 28 }: { url: string | null | undefined; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (url && !imgError) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} onError={() => setImgError(true)} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'var(--ink-950)', flexShrink: 0 }}>{initials}</div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// Memoized bubble — circle chats can scroll back through 100+ messages;
// without memo, every new message triggers a full re-render of the list.
const ChatMessageBubble = memo(function ChatMessageBubble({
  message, isMine, onToggleReaction }: {
  message: ChatMessage; isMine: boolean; onToggleReaction: (messageId: string, emoji: string, current?: string) => void;
}) {
  return (
    <div className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
      <Avatar url={message.sender_avatar} name={message.sender_name ?? ''} />
      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[75%]`}>
        {!isMine && <span className="text-xs text-white/40 mb-0.5 px-1">{message.sender_name}</span>}
        {message.photo_url ? (
          <img src={message.photo_url} alt="shared problem" className="rounded-2xl max-w-full" style={{ maxHeight: 220 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
        ) : (
          <div className="px-3.5 py-2.5 rounded-2xl text-sm"
            style={isMine
              ? { background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', color: 'var(--ink-950)' }
              : { background: 'var(--ink-060)', color: 'var(--ink-900)' }}>
            {message.message}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1 px-1">
          <span className="text-xs text-white/30">{timeAgo(message.created_at)}</span>
          {Object.entries(message.reactions).map(([emoji, count]) => (
            <button key={emoji} onClick={() => onToggleReaction(message.id, emoji, message.my_reaction)}
              className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ background: message.my_reaction === emoji ? 'rgba(91,106,245,0.25)' : 'var(--ink-060)' }}>
              {emoji} {count}
            </button>
          ))}
        </div>
        {/* Quick react row */}
        <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100">
          {QUICK_EMOJIS.map(e => (
            <button key={e} onClick={() => onToggleReaction(message.id, e, message.my_reaction)} className="text-sm px-1">{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default function CircleChatPanel({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data: msgs } = await supabase
      .from('circle_messages')
      .select('id, circle_id, user_id, message, photo_url, created_at')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!msgs?.length) { setMessages([]); setLoading(false); return; }

    const userIds = [...new Set(msgs.map(m => m.user_id))];
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name, avatar_url').in('id', userIds);
    const pMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
    (profiles ?? []).forEach(p => { pMap[p.id] = { full_name: p.full_name ?? 'Student', avatar_url: p.avatar_url }; });

    const ids = msgs.map(m => m.id);
    const { data: reactions } = await supabase
      .from('circle_message_reactions').select('message_id, user_id, emoji').in('message_id', ids);

    setMessages(msgs.map(m => {
      const msgReactions = (reactions ?? []).filter(r => r.message_id === m.id);
      const counts: Record<string, number> = {};
      let mine: string | undefined;
      msgReactions.forEach(r => {
        counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
        if (r.user_id === user?.id) mine = r.emoji;
      });
      return {
        ...m, sender_name: pMap[m.user_id]?.full_name ?? 'Student',
        sender_avatar: pMap[m.user_id]?.avatar_url, reactions: counts, my_reaction: mine };
    }));
    setLoading(false);
  }, [circleId, user?.id]);

  useEffect(() => {
    loadMessages();

    const channel = supabase.channel(`circle_chat_${circleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${circleId}` },
        () => loadMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_message_reactions' },
        () => loadMessages())
      .subscribe();
    channelRef.current = channel;

    return () => { void channel.unsubscribe(); };
  }, [circleId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setInput('');
    try {
      await supabase.from('circle_messages').insert({ circle_id: circleId, user_id: user.id, message: text });
    } finally {
      setSending(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!user) return;

    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED_MIME.includes(file.type)) return;

    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_BYTES) return;

    // Sanitize: UUID + extension only — never use user-supplied file.name (path traversal)
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const path = `circle_photos/${circleId}/${safeName}`;

    const { error } = await supabase.storage.from('public-media').upload(path, file);
    if (error) return;
    const { data } = supabase.storage.from('public-media').getPublicUrl(path);
    await supabase.from('circle_messages').insert({ circle_id: circleId, user_id: user.id, photo_url: data.publicUrl });
  }

  const toggleReaction = useCallback(async (messageId: string, emoji: string, current?: string) => {
    if (!user) return;
    if (current === emoji) {
      await supabase.from('circle_message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id);
    } else {
      await supabase.from('circle_message_reactions').upsert({ message_id: messageId, user_id: user.id, emoji });
    }
  }, [user]);

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={spring.sheet}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl"
      style={{ height: '85vh', background: 'var(--surface-sheet)', border: '1px solid var(--ink-080)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: 'var(--ink-060)' }}>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--ink-060)' }}>
          <ChevronDown className="w-4.5 h-4.5 text-white" />
        </button>
        <h3 className="font-heading text-sm font-bold text-white">Circle Chat</h3>
        <button aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--ink-060)' }}>
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-2">
            <MessageCircle size={32} className="text-white/25" strokeWidth={1.6} />
            <p className="text-sm text-white/40">No messages yet. Say hi!</p>
          </div>
        ) : (
          messages.map(m => (
            <ChatMessageBubble key={m.id} message={m} isMine={m.user_id === user?.id} onToggleReaction={toggleReaction} />
          ))
        )}
      </div>

      {/* Quick reactions bar */}
      <div className="flex gap-2 px-4 pb-2">
        {QUICK_EMOJIS.map(e => (
          <button key={e} onClick={() => messages.length && toggleReaction(messages[messages.length - 1].id, e, messages[messages.length - 1].my_reaction)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: 'var(--ink-050)' }}>
            {e}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--ink-060)' }}>
        <label className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer" style={{ background: 'var(--ink-060)' }}>
          <ImageIcon className="w-4.5 h-4.5 text-white/60" />
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
        </label>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Message the circle..."
          className="flex-1 px-4 py-2.5 rounded-2xl text-sm text-white bg-white/5 placeholder:text-white/30 outline-none"
        />
        <button onClick={sendMessage} disabled={!input.trim() || sending}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </motion.div>
  );
}
