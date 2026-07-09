import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Sparkles, RefreshCw, Bell, CalendarClock, Flame,
  Trophy, BookOpen, Brain, Target, MessageSquarePlus,
  Heart, RotateCcw, Zap} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { TeachingIcon } from '@/components/ui/icons';
import type { NovoProactiveMessage, ProactiveMessageType } from '@/types';

// ── Message type styling ──────────────────────────────────────────────────────

interface TypeStyle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:  React.ComponentType<any>;
  color: string;
  bg:    string;
  label: string;
}

const TYPE_STYLES: Record<ProactiveMessageType, TypeStyle> = {
  diagnostic:      { icon: Brain,            color: '#5B6AF5', bg: 'rgba(91,106,245,0.15)',  label: 'Diagnostic'   },
  exam_reminder:   { icon: CalendarClock,    color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   label: 'Exam Alert'   },
  streak_check:    { icon: Flame,            color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  label: 'Streak'       },
  milestone:       { icon: Trophy,           color: '#10B981', bg: 'rgba(16,185,129,0.15)',  label: 'Milestone'    },
  lesson_nudge:    { icon: BookOpen,         color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)',  label: 'Lesson'       },
  memory_callback: { icon: Brain,            color: '#06B6D4', bg: 'rgba(6,182,212,0.15)',   label: 'Memory'       },
  welcome_back:    { icon: TeachingIcon,     color: '#5B6AF5', bg: 'rgba(91,106,245,0.15)',  label: 'Check-in'     },
  goal_check:      { icon: Target,           color: '#EC4899', bg: 'rgba(236,72,153,0.15)',  label: 'Goal'         },
  // New emotional intelligence types
  encouragement:   { icon: Heart,            color: '#F472B6', bg: 'rgba(244,114,182,0.15)', label: 'Encouragement' },
  comeback:        { icon: RotateCcw,        color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', label: 'We Miss You'  },
  revision_mode:   { icon: Zap,              color: '#EF4444', bg: 'rgba(239,68,68,0.18)',   label: 'REVISION MODE' } };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({ msg, onMarkRead, onCTA }: {
  msg: NovoProactiveMessage;
  onMarkRead: (id: string) => void;
  onCTA: (route: string, msgId: string) => void;
}) {
  const style = TYPE_STYLES[msg.message_type] ?? TYPE_STYLES.welcome_back;
  const Icon  = style.icon;
  const unread = !msg.read_at;

  return (
    <motion.div layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={unread
        ? { background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)', borderLeft: `3px solid ${style.color}` }
        : { background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-080)' }}>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Novo avatar */}
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Icon size={18} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-white">Novo AI</span>
              {unread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: style.color, background: style.bg }}>
                {style.label}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">{timeAgo(msg.created_at)}</span>
            </div>

            <p className="text-sm text-white/85 leading-relaxed">{msg.message}</p>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {msg.cta_label && msg.cta_route && (
                <button
                  onClick={() => onCTA(msg.cta_route!, msg.id)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl text-white active:scale-95 transition-transform"
                  style={{ background: style.color }}>
                  {msg.cta_label} →
                </button>
              )}
              {unread && (
                <button onClick={() => onMarkRead(msg.id)}
                  className="text-xs text-muted-foreground px-2 py-1.5 rounded-xl active:scale-95 transition-all"
                  style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-100)' }}>
                  Mark read
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NovoProactivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages]   = useState<NovoProactiveMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter]       = useState<'all' | 'unread'>('all');
  const [cooldownSecs, setCooldownSecs] = useState(0); // client-side 30s cooldown
  const cooldownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGenerated = useRef<number>(0);

  const FORCE_COOLDOWN_MS = 30_000; // 30 seconds between forced generations

  async function callFn(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    return supabase.functions.invoke('novo-proactive', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
  }

  async function loadHistory() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await callFn({ action: 'get_history', limit: 30 });
      if (!res.error) setMessages(res.data?.messages ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function startCooldown() {
    lastGenerated.current = Date.now();
    setCooldownSecs(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      const remaining = Math.ceil((FORCE_COOLDOWN_MS - (Date.now() - lastGenerated.current)) / 1000);
      if (remaining <= 0) {
        setCooldownSecs(0);
        if (cooldownRef.current) { clearInterval(cooldownRef.current); cooldownRef.current = null; }
      } else {
        setCooldownSecs(remaining);
      }
    }, 1000);
  }

  // Clean up interval on unmount
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  async function generateCheckin() {
    if (generating || cooldownSecs > 0) return;
    setGenerating(true);
    try {
      const res = await callFn({ action: 'generate_checkin', force: true });
      if (!res.error && res.data?.message) {
        const newMsg = res.data.message as NovoProactiveMessage;
        setMessages(prev => [newMsg, ...prev.filter(m => m.id !== newMsg.id)]);
        startCooldown(); // begin 30-second cooldown after successful generation
      }
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function markRead(messageId: string) {
    try {
      await callFn({ action: 'mark_read', message_id: messageId });
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m
      ));
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await callFn({ action: 'mark_read', all: true });
      const now = new Date().toISOString();
      setMessages(prev => prev.map(m => ({ ...m, read_at: m.read_at ?? now })));
    } catch { /* ignore */ }
  }

  function handleCTA(route: string, msgId: string) {
    markRead(msgId);
    navigate(route);
  }

  useEffect(() => { loadHistory(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = messages.filter(m => !m.read_at).length;
  const displayed = filter === 'unread' ? messages.filter(m => !m.read_at) : messages;

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Header ── */}
      <div className="px-4 py-3 shrink-0"
        style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <div className="flex items-center gap-3 mb-3">
          <Link aria-label="Go back" to="/home"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-100)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <TeachingIcon size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-white text-sm">Novo's Messages</h2>
              {unreadCount > 0 && (
                <span className="text-xs font-bold text-white bg-primary px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Novo checks in proactively</p>
          </div>
          <button
            onClick={generateCheckin}
            disabled={generating || cooldownSecs > 0}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors relative"
            style={{ background: 'var(--ink-040)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid var(--ink-100)' }}>
            {generating
              ? <RefreshCw size={15} className="text-primary animate-spin" />
              : cooldownSecs > 0
                ? <span className="text-xs font-bold text-muted-foreground">{cooldownSecs}s</span>
                : <MessageSquarePlus size={15} className="text-primary" />}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === f ? 'text-white' : 'text-muted-foreground'
              }`}
              style={filter === f ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' } : { background: 'var(--ink-060)' }}>
              {f === 'all' ? `All (${messages.length})` : `Unread (${unreadCount})`}
            </button>
          ))}
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="ml-auto text-xs text-primary font-semibold">
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 native-scroll pb-nav px-4 py-4 flex flex-col gap-3">

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center flex-1 gap-6 pb-8">
            <div className="w-24 h-24 rounded-4xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(91,106,245,0.1), rgba(139,92,246,0.1))' }}>
              <Bell size={44} className="text-primary" strokeWidth={1.5} />
            </div>
            <div className="text-center px-4">
              <h3 className="font-heading text-2xl font-bold text-white">
                {filter === 'unread' ? 'All caught up!' : 'No messages yet'}
              </h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                {filter === 'unread'
                  ? "You've read everything. Novo will reach out again soon."
                  : "Novo will proactively check in based on your study progress, streaks, and upcoming exams."}
              </p>
            </div>
            <Button size="lg" onClick={generateCheckin}
              disabled={generating || cooldownSecs > 0} className="w-full">
              {generating
                ? <><RefreshCw size={17} className="animate-spin" /> Generating…</>
                : cooldownSecs > 0
                  ? <>{cooldownSecs}s before next check-in</>
                  : <><Sparkles size={17} /> Get Novo's Check-in</>}
            </Button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {displayed.map((msg, i) => (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.2) }}>
                <MessageCard
                  msg={msg}
                  onMarkRead={markRead}
                  onCTA={handleCTA}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Generate CTA at bottom (persistent) ── */}
      {!loading && messages.length > 0 && (
        <div className="px-4 py-3 shrink-0"
          style={{ background: 'var(--hdr-a-880)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--ink-080)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <button onClick={generateCheckin} disabled={generating || cooldownSecs > 0}
            className="w-full py-3 rounded-2xl border border-dashed border-primary/30 text-sm font-semibold text-primary text-center active:bg-primary/5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {generating
              ? <><RefreshCw size={14} className="animate-spin" /> Getting new message…</>
              : cooldownSecs > 0
                ? <>{cooldownSecs}s before next check-in</>
                : <><MessageSquarePlus size={14} /> Get Novo's Latest Check-in</>}
          </button>
        </div>
      )}
    </div>
  );
}
