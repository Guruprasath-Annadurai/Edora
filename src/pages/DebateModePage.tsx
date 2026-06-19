// ═══════════════════════════════════════════════════════════════
// Edora — DebateModePage
// Novo takes an intellectual position; student must argue the opposite.
// Novo pushes back, identifies logical gaps, challenges weak claims.
// AI judge scores argument quality (0-100) at the end.
// Route: /debate
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Trophy, Loader2, AlertCircle,
  RefreshCw, ChevronRight, Scale, Star,
  Clock, CheckCircle2, XCircle, BarChart2, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTypewriter } from '@/lib/useTypewriter';

// ── Types ─────────────────────────────────────────────────────────────────────

type Screen = 'selector' | 'debate' | 'results';

interface DebateTopic {
  topic: string;
  novo_position: string;
  user_position: string;
  fresh?: boolean;
  subject?: string;
}

interface DebateMessage {
  id: string;
  role: 'novo' | 'user';
  content: string;
}

interface DebateSession {
  id: string;
  topic: string;
  novo_position: string;
  user_position: string;
  messages: Array<{ role: 'novo' | 'user'; content: string }>;
}

interface DebateBreakdown {
  clarity: number;
  evidence: number;
  logic: number;
  rebuttal: number;
}

interface DebateResult {
  score: number;
  breakdown: DebateBreakdown;
  feedback: string;
  best_argument: string;
  missed_points: string[];
  xp_earned: number;
}

interface PastSession {
  id: string;
  topic: string;
  subject: string;
  score: number;
  status: string;
  turn_count: number;
  created_at: string;
}

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Outstanding';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Solid';
  if (score >= 40) return 'Developing';
  return 'Needs Work';
}

// ── NovoAvatar ────────────────────────────────────────────────────────────────

function NovoAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-white"
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
        fontSize: size * 0.4,
      }}>
      N
    </div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-2">
      <NovoAvatar size={32} />
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center"
        style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-purple-500"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.55, repeat: Infinity, delay }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── BreakdownBar ──────────────────────────────────────────────────────────────

function BreakdownBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ── AnimatedScore ─────────────────────────────────────────────────────────────

function AnimatedScore({ target }: { target: number }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        setDisplayed(target);
        clearInterval(timer);
      } else {
        setDisplayed(current);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [target]);

  const color = scoreColor(target);

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.span
        className="font-heading font-black"
        style={{ fontSize: 72, lineHeight: 1, color }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}>
        {displayed}
      </motion.span>
      <span className="text-sm font-semibold text-muted-foreground">/100</span>
      <motion.span
        className="text-base font-bold mt-1"
        style={{ color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}>
        {scoreLabel(target)}
      </motion.span>
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCancel}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="rounded-3xl p-6 w-full max-w-sm"
        style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <Scale size={26} className="text-red-400" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-bold text-white">End Debate?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The AI judge will score your arguments. You can't continue after this.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-muted-foreground active:scale-95 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Keep Arguing
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-red-500 active:scale-95 transition-all">
              End &amp; Judge
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── TopicCard ─────────────────────────────────────────────────────────────────

interface TopicCardProps {
  topic: DebateTopic;
  onStart: (t: DebateTopic) => void;
}

function TopicCard({ topic, onStart }: TopicCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onStart(topic)}
      className="w-full rounded-3xl p-4 text-left active:scale-[0.98] transition-all"
      style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-sm font-bold text-white flex-1 leading-snug">{topic.topic}</h3>
        {topic.fresh && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
            Fresh
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}>
            NOVO
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{topic.novo_position}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)', color: '#818CF8' }}>
            YOU
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{topic.user_position}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{topic.subject ?? 'General'}</span>
        <div className="flex items-center gap-1 text-primary">
          <span className="text-xs font-bold">Start Debate</span>
          <ChevronRight size={13} />
        </div>
      </div>
    </motion.button>
  );
}

// ── PastSessionRow ────────────────────────────────────────────────────────────

function PastSessionRow({ session }: { session: PastSession }) {
  const color = scoreColor(session.score);
  return (
    <div className="flex items-center gap-3 py-3 last:border-b-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
        style={{ background: `${color}22`, color }}>
        {session.score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{session.topic}</p>
        <p className="text-xs text-muted-foreground">{session.subject} · {session.turn_count} turns</p>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={session.status === 'completed'
          ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }
          : { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
        {session.status}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DebateModePage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [screen, setScreen] = useState<Screen>('selector');

  // Selector
  const [selectedSubject, setSelectedSubject] = useState('');
  const [topics, setTopics]                   = useState<DebateTopic[]>([]);
  const [topicsLoading, setTopicsLoading]     = useState(false);
  const [pastSessions, setPastSessions]       = useState<PastSession[]>([]);
  const [pastLoading, setPastLoading]         = useState(false);
  const [selectorError, setSelectorError]     = useState('');
  const [startingSession, setStartingSession] = useState(false);

  // Debate
  const [session, setSession]           = useState<DebateSession | null>(null);
  const [messages, setMessages]         = useState<DebateMessage[]>([]);
  const [inputText, setInputText]       = useState('');
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError]   = useState('');
  const [turnCount, setTurnCount]       = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endingDebate, setEndingDebate] = useState(false);

  // Results
  const [result, setResult] = useState<DebateResult | null>(null);

  const mountedRef      = useRef(true);
  const bottomRef       = useRef<HTMLDivElement>(null);
  const sessionIdRef    = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);

  const { startTyping, getDisplay } = useTypewriter();
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadTopics();
    loadPastSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTopics(selectedSubject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, debateLoading]);

  // Typewriter animation for new Novo messages
  useEffect(() => {
    if (messages.length <= prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      return;
    }
    const last = messages[messages.length - 1];
    if (last.role === 'novo' && last.content.length > 10) {
      startTyping(last.id, last.content);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, startTyping]);

  // ── API ──

  async function loadTopics(subject?: string) {
    setTopicsLoading(true);
    setSelectorError('');
    try {
      const { data, error } = await supabase.functions.invoke('debate-mode', {
        body: { action: 'get_topics', subject: subject || undefined },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setSelectorError(error?.message ?? 'Failed to load topics'); return; }
      setTopics((data.topics as DebateTopic[]) ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setSelectorError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setTopicsLoading(false);
    }
  }

  async function loadPastSessions() {
    setPastLoading(true);
    try {
      const { data } = await supabase.functions.invoke('debate-mode', {
        body: { action: 'list_sessions' },
      });
      if (!mountedRef.current) return;
      setPastSessions((data?.sessions as PastSession[]) ?? []);
    } catch (_) { /* silent */ } finally {
      if (mountedRef.current) setPastLoading(false);
    }
  }

  async function startDebate(topic: DebateTopic) {
    if (!user) return;
    setStartingSession(true);
    setSelectorError('');
    try {
      const { data, error } = await supabase.functions.invoke('debate-mode', {
        body: {
          action: 'create_session',
          topic: topic.topic,
          subject: (topic.subject ?? selectedSubject) || 'General',
          novo_position: topic.novo_position,
          user_position: topic.user_position,
        },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setSelectorError(error?.message ?? 'Failed to start debate'); return; }

      const s = data.session as DebateSession;
      setSession(s);
      sessionIdRef.current = s.id;
      setMessages((s.messages ?? []).map(m => ({ id: genId(), role: m.role, content: m.content })));
      setTurnCount(0);
      setScreen('debate');
    } catch (err) {
      if (!mountedRef.current) return;
      setSelectorError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setStartingSession(false);
    }
  }

  const sendArgument = useCallback(async () => {
    const content = inputText.trim();
    if (!content || debateLoading || !sessionIdRef.current) return;

    setInputText('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    setDebateError('');
    setMessages(prev => [...prev, { id: genId(), role: 'user', content }]);
    setDebateLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('debate-mode', {
        body: { action: 'send_message', session_id: sessionIdRef.current, message: content },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setDebateError(error?.message ?? 'No response received'); return; }
      setMessages(prev => [...prev, { id: genId(), role: 'novo', content: data.reply as string }]);
      setTurnCount((data.turn_count as number) ?? turnCount + 1);
    } catch (err) {
      if (!mountedRef.current) return;
      setDebateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setDebateLoading(false);
    }
  }, [inputText, debateLoading, turnCount]);

  async function endDebate() {
    if (!sessionIdRef.current || endingDebate) return;
    setShowEndConfirm(false);
    setEndingDebate(true);
    setDebateError('');
    try {
      const { data, error } = await supabase.functions.invoke('debate-mode', {
        body: { action: 'end_debate', session_id: sessionIdRef.current },
      });
      if (!mountedRef.current) return;
      if (error || !data) {
        setDebateError(error?.message ?? 'Failed to end debate');
        setEndingDebate(false);
        return;
      }
      setResult(data as DebateResult);
      setScreen('results');
    } catch (err) {
      if (!mountedRef.current) return;
      setDebateError(err instanceof Error ? err.message : 'Network error');
      setEndingDebate(false);
    }
  }

  function resetToSelector() {
    setScreen('selector');
    setSession(null);
    setMessages([]);
    setInputText('');
    setTurnCount(0);
    setResult(null);
    setDebateError('');
    setSelectorError('');
    sessionIdRef.current = null;
    loadPastSessions();
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: SELECTOR
  // ════════════════════════════════════════════════════════════════

  if (screen === 'selector') {
    return (
      <div className="flex flex-col h-screen bg-gradient-page">
        <div
          className="shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <ArrowLeft size={17} className="text-white" />
            </button>
            <div className="flex-1">
              <h1 className="font-heading text-base font-bold text-white">Debate Mode</h1>
              <p className="text-[11px] text-muted-foreground">Argue your position against Novo</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Scale size={16} className="text-white" />
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-4 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>

          <AnimatePresence>
            {selectorError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-2xl px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertCircle size={15} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-400 flex-1">{selectorError}</p>
                <button onClick={() => setSelectorError('')} className="text-red-400"><XCircle size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subject filter */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Filter by Subject</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedSubject('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                  selectedSubject === '' ? 'text-white border-transparent' : 'text-muted-foreground'
                }`}
                style={selectedSubject === ''
                  ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                All
              </button>
              {SUBJECTS.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedSubject(s === selectedSubject ? '' : s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                    selectedSubject === s ? 'text-white border-transparent' : 'text-muted-foreground'
                  }`}
                  style={selectedSubject === s
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Topics */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Choose a Topic</p>
            {topicsLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 rounded-3xl animate-pulse"
                    style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }} />
                ))}
              </div>
            ) : topics.length === 0 ? (
              <div className="rounded-3xl p-6 text-center"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-sm text-muted-foreground">No topics found. Try a different subject.</p>
                <button
                  onClick={() => loadTopics(selectedSubject)}
                  className="mt-3 text-xs font-semibold text-primary flex items-center gap-1 mx-auto">
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {topics.map((t, i) => (
                  <TopicCard key={i} topic={t} onStart={startDebate} />
                ))}
              </div>
            )}
          </div>

          {/* Past debates */}
          {(pastSessions.length > 0 || pastLoading) && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Recent Debates</p>
              <div className="rounded-3xl px-4"
                style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {pastLoading ? (
                  <div className="py-4 flex justify-center">
                    <Loader2 size={18} className="text-muted-foreground animate-spin" />
                  </div>
                ) : (
                  pastSessions.slice(0, 5).map(s => <PastSessionRow key={s.id} session={s} />)
                )}
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {startingSession && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className="rounded-3xl p-8 flex flex-col items-center gap-4 mx-6"
                style={{ background: 'rgba(10,12,28,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Loader2 size={32} className="text-primary animate-spin" />
                <p className="font-heading text-base font-bold text-white">Preparing your debate…</p>
                <p className="text-xs text-muted-foreground text-center">Novo is formulating its position</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: DEBATE
  // ════════════════════════════════════════════════════════════════

  if (screen === 'debate' && session) {
    return (
      <div className="flex flex-col h-screen bg-gradient-page">
        <div
          className="shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <ArrowLeft size={17} className="text-white" />
            </button>
            <p className="font-heading text-sm font-bold text-white flex-1 truncate">{session.topic}</p>
            <button
              onClick={() => setShowEndConfirm(true)}
              disabled={endingDebate || messages.length < 2}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-red-500 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0">
              {endingDebate
                ? <><Loader2 size={11} className="animate-spin" /> Judging…</>
                : <><Scale size={11} /> End Debate</>}
            </button>
          </div>

          {/* Position pills */}
          <div className="px-4 pb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full min-w-0"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span className="text-[10px] font-bold truncate" style={{ color: '#F87171' }}>NOVO's Position</span>
            </div>
            <Scale size={13} className="text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full min-w-0"
              style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}>
              <span className="text-[10px] font-bold truncate" style={{ color: '#818CF8' }}>YOUR Position</span>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {debateError && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden shrink-0">
              <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-400 flex-1">{debateError}</p>
                <button onClick={() => setDebateError('')} className="text-red-400"><RefreshCw size={12} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {turnCount > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-1.5 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,12,28,0.6)' }}>
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{turnCount} exchange{turnCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-3 flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {messages.map(msg => {
              if (msg.role === 'novo') {
                const tw = getDisplay(msg.id, msg.content);
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="flex items-start gap-2" style={{ maxWidth: '85%' }}>
                    <NovoAvatar size={30} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-purple-600 mb-1 uppercase tracking-wide">NOVO</p>
                      <div className="rounded-2xl rounded-tl-sm px-4 py-3"
                        style={{ background: 'rgba(15,20,45,0.75)', borderLeft: '2px solid #8B5CF6', border: '1px solid rgba(255,255,255,0.07)', borderLeftWidth: '2px', borderLeftColor: '#8B5CF6' }}>
                        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                          {tw.text}
                          {tw.typing && <span className="inline-block ml-0.5 w-0.5 h-[1em] align-middle bg-white/50 animate-pulse" />}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="flex justify-end">
                  <div
                    className="px-4 py-3 rounded-2xl rounded-br-sm text-sm text-white leading-relaxed"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)', maxWidth: '80%' }}>
                    {msg.content}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <AnimatePresence>
            {debateLoading && <TypingIndicator key="typing" />}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        <div
          className="shrink-0 px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', background: 'rgba(10,12,28,0.92)', borderTop: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl px-4 py-3 flex items-end"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Make your argument…"
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendArgument(); }
                }}
                disabled={debateLoading || endingDebate}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground outline-none resize-none disabled:opacity-60 w-full leading-relaxed"
                style={{ WebkitUserSelect: 'text', userSelect: 'text', maxHeight: 120 }}
              />
            </div>
            <button
              onClick={() => void sendArgument()}
              disabled={!inputText.trim() || debateLoading || endingDebate}
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 shrink-0"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Send size={15} className="text-white" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">Argue →</p>
        </div>

        <AnimatePresence>
          {showEndConfirm && (
            <ConfirmModal key="confirm" onConfirm={() => void endDebate()} onCancel={() => setShowEndConfirm(false)} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: RESULTS
  // ════════════════════════════════════════════════════════════════

  if (screen === 'results' && result) {
    const bd = result.breakdown;
    return (
      <div className="flex flex-col h-screen bg-gradient-page">
        <div
          className="shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={resetToSelector}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <ArrowLeft size={17} className="text-white" />
            </button>
            <h1 className="font-heading text-base font-bold text-white flex-1">Debate Complete</h1>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
              <Trophy size={16} className="text-white" />
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-5 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 flex flex-col items-center gap-2"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your Score</p>
            <AnimatedScore target={result.score} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-3xl p-5"
            style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Score Breakdown</p>
            </div>
            <div className="flex flex-col gap-4">
              <BreakdownBar label="Clarity" value={bd.clarity} />
              <BreakdownBar label="Evidence" value={bd.evidence} />
              <BreakdownBar label="Logic" value={bd.logic} />
              <BreakdownBar label="Rebuttal" value={bd.rebuttal} />
            </div>
          </motion.div>

          {result.xp_earned > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.15)' }}>
                <Zap size={18} style={{ color: '#FBBF24' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: '#FBBF24' }}>+{result.xp_earned} XP Earned!</p>
                <p className="text-xs text-muted-foreground">Great debating skills</p>
              </div>
            </motion.div>
          )}

          {result.best_argument && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="rounded-3xl p-5"
              style={{ background: 'rgba(15,20,45,0.75)', border: '2px solid rgba(245,158,11,0.3)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Star size={15} style={{ color: '#FBBF24' }} />
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#FBBF24' }}>Your Best Argument</p>
              </div>
              <p className="text-sm text-white/80 leading-relaxed italic">"{result.best_argument}"</p>
            </motion.div>
          )}

          {result.missed_points && result.missed_points.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="rounded-3xl p-5"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={15} className="text-amber-600" />
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">What You Missed</p>
              </div>
              <div className="flex flex-col gap-2">
                {result.missed_points.map((point, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <XCircle size={13} className="shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
                    <p className="text-sm leading-relaxed" style={{ color: '#FBBF24' }}>{point}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {result.feedback && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-3xl p-5"
              style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={15} className="text-primary" />
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Judge's Feedback</p>
              </div>
              <p className="text-sm text-white leading-relaxed">{result.feedback}</p>
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            onClick={resetToSelector}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <Scale size={16} />
            Start New Debate
          </motion.button>
        </div>
      </div>
    );
  }

  return null;
}
