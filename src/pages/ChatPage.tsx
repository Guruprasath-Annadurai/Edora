import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Brain, GraduationCap, MessageCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SmartReplyChips } from '@/components/chat/SmartReplyChips';
import { getSmartReplies, SmartReplyMessage } from '@/plugins/SmartReplyPlugin';
import { useAuth } from '@/hooks/useAuth';

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

export default function ChatPage() {
  const { profile } = useAuth();
  const [mode, setMode]             = useState<'teacher' | 'friend'>('teacher');
  const [messages, setMessages]     = useState<Message[]>([{
    id: '1', role: 'assistant',
    content: `Hey ${profile?.full_name?.split(' ')[0] ?? 'there'}! 👋 I'm Nova, your AI study companion. What would you like to learn today?`,
    timestamp: new Date(),
  }]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [smartReplies, setSmartReplies]     = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, smartReplies]);

  // ── Generate smart replies after Nova responds ───────────────────
  const fetchSmartReplies = useCallback(async (msgs: Message[]) => {
    setSmartReplies([]);
    setSmartRepliesLoading(true);
    try {
      // Build ML Kit-compatible message log (last 6 messages)
      const log: SmartReplyMessage[] = msgs.slice(-6).map((m, i) => ({
        text:      m.content,
        isLocal:   m.role === 'user',
        userId:    m.role === 'user' ? 'local' : 'nova',
        timestamp: m.timestamp.getTime() + i,   // ensure strictly increasing
      }));

      const suggestions = await getSmartReplies(log);
      setSmartReplies(suggestions);
    } catch {
      setSmartReplies([]);
    } finally {
      setSmartRepliesLoading(false);
    }
  }, []);

  // ── Send a message ───────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(), role: 'user', content, timestamp: new Date(),
    };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInput('');
    setSmartReplies([]);
    setLoading(true);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPTS[mode] }] },
            contents: [
              ...updatedMsgs.slice(-8).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
              })),
            ],
          }),
        }
      );
      const data  = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
                    ?? "I couldn't process that. Please try again!";

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: reply, timestamp: new Date(),
      };
      const finalMsgs = [...updatedMsgs, assistantMsg];
      setMessages(finalMsgs);

      // Generate smart replies for Nova's response
      await fetchSmartReplies(finalMsgs);

    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: 'Connection issue. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  // Tap a chip → send it immediately
  function handleChipSelect(text: string) {
    setSmartReplies([]);
    sendMessage(text);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="glass-strong border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/home" className="touch-target">
          <ArrowLeft size={22} className="text-foreground" strokeWidth={1.75} />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
          <Brain size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-foreground text-sm">Nova AI</h2>
          <p className="text-xs text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Online · {mode === 'teacher' ? 'Teacher Mode' : 'Friend Mode'}
          </p>
        </div>
        {/* Mode toggle */}
        <div className="glass rounded-xl p-0.5 flex gap-0.5">
          <button onClick={() => setMode('teacher')}
            className={`p-2 rounded-lg transition-all ${mode === 'teacher' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>
            <GraduationCap size={16} />
          </button>
          <button onClick={() => setMode('friend')}
            className={`p-2 rounded-lg transition-all ${mode === 'friend' ? 'bg-primary text-white' : 'text-muted-foreground'}`}>
            <MessageCircle size={16} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 native-scroll px-4 py-4 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-1"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
                  <Brain size={14} className="text-white" />
                </div>
              )}
              <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : 'glass text-foreground rounded-bl-sm'}`}
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }
                  : {}}>
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Nova typing indicator */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
              <Brain size={14} className="text-white" />
            </div>
            <div className="glass px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              {[0, 0.15, 0.3].map((delay, i) => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay }} />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Smart Reply Chips ── */}
      <SmartReplyChips
        suggestions={smartReplies}
        onSelect={handleChipSelect}
        loading={smartRepliesLoading}
      />

      {/* ── Input bar ── */}
      <div className="glass-strong border-t border-border px-4 py-3 shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div className="glass rounded-2xl flex items-center gap-2 px-4 h-12">
          <input
            type="text"
            placeholder="Ask Nova anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
          />
          <button className="touch-target text-muted-foreground hover:text-foreground transition-colors">
            <Mic size={18} strokeWidth={1.75} />
          </button>
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
