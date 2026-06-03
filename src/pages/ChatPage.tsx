import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Brain, GraduationCap, MessageCircle, ArrowLeft, Volume2, Square, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SmartReplyChips } from '@/components/chat/SmartReplyChips';
import { getSmartReplies, SmartReplyMessage } from '@/plugins/SmartReplyPlugin';
import { useAuth } from '@/hooks/useAuth';
import { useNovaTTS } from '@/hooks/useNovaTTS';
import { supabase } from '@/lib/supabase';

interface Message {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: Date;
}

const SYSTEM_PROMPTS = {
  teacher: 'You are Nova, an expert AI tutor in teacher mode. Give structured, clear explanations with examples. Break complex topics into digestible steps. Never give life advice — only academic guidance.',
  friend:  'You are Nova, a friendly study buddy. Keep it casual and encouraging. Use simple language. Never give personal or life advice — only study help.',
};

const WELCOME = (name: string) =>
  `Hey ${name}! 👋 I'm Nova, your AI study companion. What would you like to learn today?`;

export default function ChatPage() {
  const { profile, user }     = useAuth();
  const { speak, getState }   = useNovaTTS();
  const [mode, setMode]       = useState<'teacher' | 'friend'>('teacher');
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [smartReplies, setSmartReplies]               = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || historyLoaded) return;
    (async () => {
      const { data } = await supabase
        .from('tutor_chats')
        .select('id, role, content, mode, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(60);

      if (data && data.length > 0) {
        setMessages(data.map(row => ({
          id: row.id, role: row.role as 'user' | 'assistant',
          content: row.content, timestamp: new Date(row.created_at),
        })));
        const lastMode = data[data.length - 1].mode;
        if (lastMode === 'teacher' || lastMode === 'friend') setMode(lastMode);
      } else {
        setMessages([{
          id: 'welcome', role: 'assistant',
          content: WELCOME(profile?.full_name?.split(' ')[0] ?? 'there'),
          timestamp: new Date(),
        }]);
      }
      setHistoryLoaded(true);
    })();
  }, [user, historyLoaded, profile]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, smartReplies]);

  async function persistMessage(role: 'user' | 'assistant', content: string, msgMode: typeof mode) {
    if (!user) return;
    await supabase.from('tutor_chats').insert({ user_id: user.id, role, content, mode: msgMode });
  }

  const fetchSmartReplies = useCallback(async (msgs: Message[]) => {
    setSmartReplies([]); setSmartRepliesLoading(true);
    try {
      const log: SmartReplyMessage[] = msgs.slice(-6).map((m, i) => ({
        text: m.content, isLocal: m.role === 'user',
        userId: m.role === 'user' ? 'local' : 'nova', timestamp: m.timestamp.getTime() + i,
      }));
      setSmartReplies(await getSmartReplies(log));
    } catch { setSmartReplies([]); }
    finally { setSmartRepliesLoading(false); }
  }, []);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs); setInput(''); setSmartReplies([]); setLoading(true);
    persistMessage('user', content, mode);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPTS[mode] }] },
            contents: updatedMsgs.slice(-8).map(m => ({
              role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }],
            })),
          }),
        }
      );
      const data  = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "I couldn't process that. Please try again!";
      const assistantMsg: Message = { id: (Date.now()+1).toString(), role: 'assistant', content: reply, timestamp: new Date() };
      const finalMsgs = [...updatedMsgs, assistantMsg];
      setMessages(finalMsgs);
      persistMessage('assistant', reply, mode);
      await fetchSmartReplies(finalMsgs);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now()+1).toString(), role: 'assistant',
        content: 'Connection issue. Please try again.', timestamp: new Date(),
      }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ── */}
      <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(91,106,245,0.06)' }}>
        <Link to="/home" className="touch-target">
          <ArrowLeft size={20} className="text-foreground" strokeWidth={1.75} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
          <Brain size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-foreground text-sm">Nova AI</h2>
          <p className="text-xs text-green-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Online · {mode === 'teacher' ? 'Teacher Mode' : 'Friend Mode'}
          </p>
        </div>
        <div className="bg-secondary border border-border rounded-2xl p-0.5 flex gap-0.5">
          <button onClick={() => setMode('teacher')}
            className={`p-2 rounded-xl transition-all ${mode === 'teacher' ? 'text-white' : 'text-muted-foreground'}`}
            style={mode === 'teacher' ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' } : {}}>
            <GraduationCap size={16} />
          </button>
          <button onClick={() => setMode('friend')}
            className={`p-2 rounded-xl transition-all ${mode === 'friend' ? 'text-white' : 'text-muted-foreground'}`}
            style={mode === 'friend' ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' } : {}}>
            <MessageCircle size={16} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 native-scroll px-4 py-4 flex flex-col gap-3 bg-background">
        {!historyLoaded && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>

              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-1"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                  <Brain size={14} className="text-white" />
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[78%]">
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'text-white rounded-br-sm'
                    : 'bg-white border border-border text-foreground rounded-bl-sm shadow-card'}`}
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }
                    : {}}>
                  {msg.content}
                </div>

                {msg.role === 'assistant' && (() => {
                  const ttsState = getState(msg.id);
                  return (
                    <button onClick={() => speak(msg.content, msg.id)}
                      className="self-start flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all active:scale-95"
                      style={{
                        color: ttsState === 'playing' ? '#5B6AF5' : '#94a3b8',
                        background: ttsState !== 'idle' ? 'rgba(91,106,245,0.08)' : 'transparent',
                      }}>
                      {ttsState === 'loading' && <Loader2 size={12} className="animate-spin" />}
                      {ttsState === 'playing' && <><Square size={11} fill="currentColor" /><span>Stop</span></>}
                      {ttsState === 'idle'    && <><Volume2 size={12} /><span>Listen</span></>}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Brain size={14} className="text-white" />
            </div>
            <div className="bg-white border border-border px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center shadow-card">
              {[0, 0.15, 0.3].map((delay, i) => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay }} />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      <SmartReplyChips suggestions={smartReplies} onSelect={s => { setSmartReplies([]); sendMessage(s); }} loading={smartRepliesLoading} />

      {/* ── Input ── */}
      <div className="bg-white border-t border-border px-4 py-3 shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', boxShadow: '0 -2px 12px rgba(91,106,245,0.06)' }}>
        <div className="bg-secondary border border-border rounded-2xl flex items-center gap-2 px-4 h-12">
          <input
            type="text" placeholder="Ask Nova anything…"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          <button className="touch-target text-muted-foreground">
            <Mic size={18} strokeWidth={1.75} />
          </button>
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Send size={14} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
