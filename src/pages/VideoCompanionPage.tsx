// ═══════════════════════════════════════════════════════════════
// Edora — VideoCompanionPage
// Paste a YouTube URL → get AI summary, key concepts, flashcards,
// and a Q&A chat powered by the video-companion edge function.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Youtube, Play, BookOpen, Brain, Layers, MessageSquare,
  Send, ArrowLeft, Loader2, CheckCircle2, AlertCircle,
  Plus, ChevronRight, ExternalLink, X, RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ──────────────────────────────────────────────────────────────────────

interface VideoSession {
  id: string;
  video_id: string;
  youtube_url: string;
  title: string | null;
  channel: string | null;
  duration_text: string | null;
  thumbnail_url: string | null;
  summary: string | null;
  key_concepts: Array<{ concept: string; explanation: string }>;
  flashcards: Array<{ front: string; back: string }>;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'no_captions';
  chat_history: Array<{ role: string; content: string }>;
  sr_cards_added: number;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Phase = 'input' | 'loading' | 'ready' | 'error';
type Tab = 'summary' | 'concepts' | 'flashcards' | 'chat';

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      // handle /embed/ and /shorts/
      const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

function thumbUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

interface ToastState { id: number; message: string; type: 'success' | 'error' | 'info' }

function Toast({ message, type, onDismiss }: ToastState & { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const bg = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#5B6AF5';
  return (
    <motion.div
      initial={{ opacity: 0, y: -48, x: '-50%' }}
      animate={{ opacity: 1, y: 0,   x: '-50%' }}
      exit={{    opacity: 0, y: -48, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2"
      style={{ background: bg, minWidth: 200, maxWidth: 320 }}
    >
      {type === 'success' && <CheckCircle2 size={15} className="text-white shrink-0" />}
      {type === 'error'   && <AlertCircle  size={15} className="text-white shrink-0" />}
      <span className="text-sm font-semibold text-white">{message}</span>
    </motion.div>
  );
}

// ── Loading dots ───────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full"
          style={{ background: 'var(--ink-600)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ── Status messages cycling ────────────────────────────────────────────────────

const STATUS_MESSAGES = [
  'Fetching video info…',
  'Downloading captions…',
  'Analysing with Novo…',
  'Generating flashcards…',
];

function CyclingStatus() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % STATUS_MESSAGES.length), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={idx}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="text-sm font-medium"
        style={{ color: 'var(--ink-700)' }}
      >
        {STATUS_MESSAGES[idx]}
      </motion.p>
    </AnimatePresence>
  );
}

// ── Feature preview cards ──────────────────────────────────────────────────────

const FEATURES = [
  { icon: BookOpen,      color: '#5B6AF5', title: 'AI Summary',      sub: 'Instant bullet-point overview' },
  { icon: Layers,        color: '#8B5CF6', title: 'Key Concepts',    sub: 'Extracted and explained' },
  { icon: Brain,         color: '#06B6D4', title: 'Auto Flashcards', sub: 'Ready to review in Spaced Review' },
];

// ── Recent session row ─────────────────────────────────────────────────────────

function RecentRow({ session, onOpen }: { session: VideoSession; onOpen: () => void }) {
  const vid = session.video_id;
  const isComplete = session.status === 'complete' || session.status === 'no_captions';
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.98]"
      style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)' }}
    >
      <img
        src={thumbUrl(vid)}
        alt=""
        className="w-10 h-10 rounded-xl object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{session.title ?? 'Untitled'}</p>
        <p className="text-xs truncate" style={{ color: 'var(--ink-500)' }}>
          {session.channel ?? ''}
        </p>
      </div>
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={isComplete
          ? { background: 'rgba(16,185,129,0.2)', color: '#10B981' }
          : { background: 'rgba(251,191,36,0.2)', color: '#FBBF24' }}
      >
        {isComplete ? 'Done' : 'Processing'}
      </span>
      <ChevronRight size={14} style={{ color: 'var(--ink-500)' }} />
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VideoCompanionPage() {
  const { user } = useAuth();

  // Phase
  const [phase, setPhase]         = useState<Phase>('input');
  const [errorMsg, setErrorMsg]   = useState('');

  // Input
  const [urlInput, setUrlInput]   = useState('');
  const videoId = extractVideoId(urlInput);

  // Session
  const [session, setSession]     = useState<VideoSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<VideoSession[]>([]);
  const [recentLoading, setRecentLoading]   = useState(true);

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  // Concepts accordion
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);

  // Flashcards accordion
  const [expandedCard, setExpandedCard]         = useState<number | null>(null);
  const [srAdded, setSrAdded]                   = useState(false);
  const [srAdding, setSrAdding]                 = useState(false);

  // Chat
  const [chatMessages, setChatMessages]         = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]               = useState('');
  const [chatLoading, setChatLoading]           = useState(false);
  const chatBottomRef                           = useRef<HTMLDivElement>(null);

  // Toasts
  const [toasts, setToasts]                     = useState<ToastState[]>([]);
  const toastCounter                            = useRef(0);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Load recent sessions ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('video-companion', {
          body: { action: 'list_sessions' },
        });
        if (!mountedRef.current) return;
        if (data?.sessions) setRecentSessions(data.sessions);
      } catch (err) {
        console.warn('[VideoCompanion] list_sessions:', err);
      } finally {
        if (mountedRef.current) setRecentLoading(false);
      }
    })();
  }, [user]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Open existing session ──
  function openSession(s: VideoSession) {
    setSession(s);
    setSrAdded(s.sr_cards_added > 0);
    const initial: ChatMessage = {
      role: 'assistant',
      content: `Hi! I've analysed '${s.title ?? 'this video'}'. What would you like to know about it?`,
    };
    const history: ChatMessage[] = (s.chat_history ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    setChatMessages([initial, ...history]);
    setActiveTab('summary');
    setPhase('ready');
  }

  // ── Analyse ──
  async function handleAnalyse() {
    if (!videoId || !user) return;
    setPhase('loading');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('video-companion', {
        body: { action: 'analyse', youtube_url: urlInput.trim() },
      });
      if (!mountedRef.current) return;
      if (error || !data?.session) {
        throw new Error(error?.message ?? data?.error ?? 'Unknown error');
      }
      openSession(data.session as VideoSession);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      setPhase('error');
    }
  }

  // ── Add to Spaced Review ──
  async function handleAddToSR() {
    if (!session || !user || srAdded || srAdding) return;
    setSrAdding(true);
    try {
      const rows = session.flashcards.map(f => ({
        user_id: user.id,
        subject: session.key_concepts[0]?.concept ?? 'General',
        topic: session.title ?? 'Video Lecture',
        source_type: 'manual',
        front: f.front,
        back: f.back,
        next_review_date: new Date().toISOString().slice(0, 10),
      }));
      const { error } = await supabase.from('sr_cards').insert(rows);
      if (error) throw error;
      await supabase
        .from('video_sessions')
        .update({ sr_cards_added: rows.length })
        .eq('id', session.id);
      setSrAdded(true);
      showToast(`✓ ${rows.length} flashcards added to Spaced Review`, 'success');
    } catch (err) {
      console.error('[VideoCompanion] addToSR:', err);
      showToast('Failed to add flashcards.', 'error');
    } finally {
      if (mountedRef.current) setSrAdding(false);
    }
  }

  // ── Send chat message ──
  async function handleSendChat(text?: string) {
    const question = (text ?? chatInput).trim();
    if (!question || !session || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('video-companion', {
        body: { action: 'chat', session_id: session.id, question },
      });
      if (!mountedRef.current) return;
      if (error || !data?.answer) throw new Error(error?.message ?? 'No response');
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.answer };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch {
      if (!mountedRef.current) return;
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I had trouble answering that. Please try again.',
      };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      if (mountedRef.current) setChatLoading(false);
    }
  }

  // ── Glass card style helper ──
  const glassCard = {
    background: 'var(--ink-050)',
    border: '1px solid var(--ink-100)',
  };

  const gradientBtn = {
    background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
  };

  // ════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'transparent', minHeight: '100dvh' }}
    >
      {/* ── Toasts ── */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} {...t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* ════════════════════ INPUT PHASE ════════════════════ */}
      <AnimatePresence mode="wait">
        {phase === 'input' && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col h-full overflow-y-auto"
          >
            {/* Header */}
            <div className="px-4 pt-safe pt-4 pb-3 flex items-center gap-3 shrink-0">
              <Link aria-label="Go back"
                to="/tools"
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={glassCard}
              >
                <ArrowLeft size={17} className="text-white" />
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="font-heading text-lg font-bold text-white leading-tight">
                  Video Companion
                </h1>
                <p className="text-xs" style={{ color: 'var(--ink-500)' }}>
                  Learn from any YouTube lecture
                </p>
              </div>
            </div>

            {/* URL Input */}
            <div className="px-4 pt-2 pb-4 shrink-0">
              <div
                className="rounded-2xl p-1 flex items-center gap-2"
                style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }}
              >
                <Youtube size={18} className="ml-3 shrink-0" style={{ color: '#FF4444' }} />
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && videoId && handleAnalyse()}
                  placeholder="Paste YouTube URL — e.g. https://youtu.be/dQw4w9WgXcQ"
                  className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none py-3 pr-2"
                  style={{ resize: 'none' }}
                />
                {urlInput && (
                  <button aria-label="Close"
                    onClick={() => setUrlInput('')}
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-1"
                    style={{ background: 'var(--ink-080)' }}
                  >
                    <X size={13} className="text-white/50" />
                  </button>
                )}
              </div>

              {/* Thumbnail preview */}
              <AnimatePresence>
                {videoId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-3"
                  >
                    <div className="relative rounded-2xl overflow-hidden aspect-video">
                      <img
                        src={thumbUrl(videoId)}
                        alt="Video thumbnail"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.3)' }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.6)' }}>
                          <Play size={20} className="text-white ml-1" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Analyse button */}
              <button
                onClick={handleAnalyse}
                disabled={!videoId}
                className="mt-3 w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
                style={gradientBtn}
              >
                <Brain size={16} />
                Analyse with Novo
              </button>
            </div>

            {/* Recent sessions */}
            <div className="flex-1 px-4 pb-8">
              {recentLoading ? (
                <div className="flex gap-2 items-center" style={{ color: 'var(--ink-500)' }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Loading recent videos…</span>
                </div>
              ) : recentSessions.length > 0 ? (
                <>
                  <p className="text-xs font-bold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--ink-400)' }}>
                    Recent videos
                  </p>
                  <div className="flex flex-col gap-2">
                    {recentSessions.slice(0, 5).map(s => (
                      <RecentRow key={s.id} session={s} onOpen={() => openSession(s)} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--ink-400)' }}>
                    What you get
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {FEATURES.map((f, i) => (
                      <motion.div
                        key={f.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="p-4 rounded-2xl flex items-center gap-3"
                        style={glassCard}
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${f.color}22`, border: `1px solid ${f.color}44` }}>
                          <f.icon size={17} style={{ color: f.color }} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{f.title}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-500)' }}>{f.sub}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ════════════════════ LOADING PHASE ════════════════════ */}
        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center"
          >
            {videoId && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-48 rounded-2xl overflow-hidden shadow-2xl"
              >
                <img src={thumbUrl(videoId)} alt="" className="w-full object-cover" />
              </motion.div>
            )}

            <div className="flex flex-col items-center gap-3">
              <LoadingDots />
              <CyclingStatus />
              <p className="text-xs" style={{ color: 'var(--ink-500)' }}>
                This usually takes 15–30 seconds
              </p>
            </div>

            <button aria-label="Close"
              onClick={() => setPhase('input')}
              className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-full"
              style={{ color: 'var(--ink-400)', background: 'var(--ink-060)' }}
            >
              <X size={12} /> Cancel
            </button>
          </motion.div>
        )}

        {/* ════════════════════ ERROR PHASE ════════════════════ */}
        {phase === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)' }}>
              <AlertCircle size={30} className="text-red-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white mb-2">Analysis failed</p>
              <p className="text-sm" style={{ color: 'var(--ink-500)' }}>{errorMsg}</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={handleAnalyse}
                className="py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
                style={gradientBtn}
              >
                <RotateCcw size={15} /> Retry
              </button>
              <button
                onClick={() => setPhase('input')}
                className="py-3 rounded-2xl text-sm font-semibold"
                style={{ color: 'var(--ink-600)', background: 'var(--ink-060)' }}
              >
                Back to input
              </button>
            </div>
          </motion.div>
        )}

        {/* ════════════════════ READY PHASE ════════════════════ */}
        {phase === 'ready' && session && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            {/* Back header */}
            <div className="px-4 pt-safe pt-3 pb-2 flex items-center gap-3 shrink-0">
              <button aria-label="Go back"
                onClick={() => setPhase('input')}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={glassCard}
              >
                <ArrowLeft size={17} className="text-white" />
              </button>
              <h1 className="font-heading text-base font-bold text-white flex-1 truncate">
                Video Companion
              </h1>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Video card */}
              <div className="px-4 mb-4">
                <div className="rounded-2xl overflow-hidden" style={glassCard}>
                  {/* Thumbnail */}
                  <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                    <img
                      src={session.thumbnail_url ?? thumbUrl(session.video_id)}
                      alt={session.title ?? ''}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  {/* Info */}
                  <div className="p-4">
                    <p className="text-base font-bold text-white leading-snug mb-1">
                      {session.title ?? 'Untitled Video'}
                    </p>
                    {session.channel && (
                      <p className="text-sm mb-2" style={{ color: 'var(--ink-500)' }}>
                        {session.channel}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {session.duration_text && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--ink-080)', color: 'var(--ink-600)' }}>
                          {session.duration_text}
                        </span>
                      )}
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={session.status === 'complete'
                          ? { background: 'rgba(16,185,129,0.2)', color: '#10B981' }
                          : { background: 'rgba(251,191,36,0.2)', color: '#FBBF24' }}
                      >
                        {session.status === 'complete'
                          ? <><CheckCircle2 size={11} /> Complete</>
                          : 'Limited analysis'}
                      </span>
                    </div>

                    <button
                      onClick={() => window.open(session.youtube_url, '_blank', 'noopener')}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
                      style={{ background: 'var(--ink-080)', color: 'var(--ink-700)' }}
                    >
                      <ExternalLink size={13} /> Watch on YouTube
                    </button>
                  </div>
                </div>

                {/* No captions banner */}
                {session.status === 'no_captions' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 px-4 py-3 rounded-2xl flex items-start gap-2.5"
                    style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}
                  >
                    <AlertCircle size={15} style={{ color: '#FBBF24' }} className="shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed" style={{ color: '#FBBF24' }}>
                      This video has no captions. Analysis is based on the video title and description only.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Tab bar */}
              <div className="px-4 mb-4 shrink-0">
                <div
                  className="flex rounded-2xl p-1 gap-1"
                  style={{ background: 'var(--ink-050)', border: '1px solid var(--ink-080)' }}
                >
                  {([
                    { key: 'summary',    label: 'Summary'   },
                    { key: 'concepts',   label: 'Concepts'  },
                    { key: 'flashcards', label: 'Cards'     },
                    { key: 'chat',       label: 'Ask'       },
                  ] as { key: Tab; label: string }[]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                      style={activeTab === tab.key
                        ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', color: 'var(--ink-950)' }
                        : { color: 'var(--ink-450)' }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <AnimatePresence mode="wait">

                {/* ── Summary ── */}
                {activeTab === 'summary' && (
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-8 space-y-4"
                  >
                    {/* Summary text */}
                    <div
                      className="p-4 rounded-2xl"
                      style={{ ...glassCard, borderColor: 'rgba(91,106,245,0.4)' }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen size={15} style={{ color: '#5B6AF5' }} />
                        <span className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: '#5B6AF5' }}>Summary</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-800)' }}>
                        {session.summary ?? 'No summary available.'}
                      </p>
                    </div>

                    {/* Topic tags */}
                    {session.key_concepts.length > 0 && (
                      <div>
                        <p className="text-xs font-bold mb-2 uppercase tracking-wider"
                          style={{ color: 'var(--ink-400)' }}>Topics</p>
                        <div className="flex flex-wrap gap-2">
                          {session.key_concepts.slice(0, 5).map(k => (
                            <span
                              key={k.concept}
                              className="text-xs font-semibold px-3 py-1 rounded-full"
                              style={{ background: 'rgba(91,106,245,0.2)', color: '#8B9BFA' }}
                            >
                              {k.concept}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Difficulty badge */}
                    {(() => {
                      const concepts = session.key_concepts.length;
                      const level = concepts >= 8 ? 'Advanced' : concepts >= 4 ? 'Intermediate' : 'Beginner';
                      const style = level === 'Advanced'
                        ? { background: 'rgba(239,68,68,0.15)', color: '#F87171' }
                        : level === 'Intermediate'
                        ? { background: 'rgba(251,191,36,0.15)', color: '#FCD34D' }
                        : { background: 'rgba(16,185,129,0.15)', color: '#34D399' };
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--ink-400)' }}>Difficulty:</span>
                          <span className="text-xs font-bold px-3 py-1 rounded-full" style={style}>{level}</span>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}

                {/* ── Concepts ── */}
                {activeTab === 'concepts' && (
                  <motion.div
                    key="concepts"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-8 space-y-2"
                  >
                    {session.key_concepts.length === 0 ? (
                      <p className="text-sm text-center py-8" style={{ color: 'var(--ink-400)' }}>
                        No key concepts extracted.
                      </p>
                    ) : session.key_concepts.map((k, i) => (
                      <motion.div
                        key={k.concept}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="rounded-2xl overflow-hidden cursor-pointer"
                        style={glassCard}
                        onClick={() => setExpandedConcept(expandedConcept === i ? null : i)}
                      >
                        <div className="px-4 py-3.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(91,106,245,0.2)' }}>
                            <Layers size={13} style={{ color: '#5B6AF5' }} />
                          </div>
                          <p className="flex-1 text-sm font-semibold text-white">{k.concept}</p>
                          <motion.div animate={{ rotate: expandedConcept === i ? 90 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronRight size={15} style={{ color: 'var(--ink-500)' }} />
                          </motion.div>
                        </div>
                        <AnimatePresence>
                          {expandedConcept === i && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4"
                                style={{ borderTop: '1px solid var(--ink-060)' }}>
                                <p className="text-sm pt-3 leading-relaxed"
                                  style={{ color: 'var(--ink-650)' }}>
                                  {k.explanation}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* ── Flashcards ── */}
                {activeTab === 'flashcards' && (
                  <motion.div
                    key="flashcards"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-8"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-bold text-white">
                        {session.flashcards.length} flashcard{session.flashcards.length !== 1 ? 's' : ''} generated
                      </p>
                      <button
                        onClick={handleAddToSR}
                        disabled={srAdded || srAdding || session.flashcards.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                        style={srAdded
                          ? { background: 'rgba(16,185,129,0.25)', color: '#10B981' }
                          : gradientBtn}
                      >
                        {srAdding ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : srAdded ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <Plus size={13} />
                        )}
                        {srAdded ? 'Added to Spaced Review' : 'Add to Spaced Review'}
                      </button>
                    </div>

                    {session.flashcards.length === 0 ? (
                      <p className="text-sm text-center py-8" style={{ color: 'var(--ink-400)' }}>
                        No flashcards generated.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {session.flashcards.map((fc, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="rounded-2xl overflow-hidden cursor-pointer"
                            style={glassCard}
                            onClick={() => setExpandedCard(expandedCard === i ? null : i)}
                          >
                            <div className="px-4 py-3.5 flex items-start gap-3">
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                style={{ background: 'rgba(139,92,246,0.2)' }}>
                                <span className="text-[10px] font-bold" style={{ color: '#8B5CF6' }}>Q</span>
                              </div>
                              <p className="flex-1 text-sm text-white leading-snug">{fc.front}</p>
                              <motion.div animate={{ rotate: expandedCard === i ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                <ChevronRight size={15} style={{ color: 'var(--ink-500)' }} />
                              </motion.div>
                            </div>
                            <AnimatePresence>
                              {expandedCard === i && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4"
                                    style={{ borderTop: '1px solid var(--ink-060)' }}>
                                    <div className="flex items-start gap-3 pt-3">
                                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ background: 'rgba(16,185,129,0.2)' }}>
                                        <span className="text-[10px] font-bold" style={{ color: '#10B981' }}>A</span>
                                      </div>
                                      <p className="text-sm leading-relaxed"
                                        style={{ color: 'var(--ink-700)' }}>
                                        {fc.back}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Chat ── */}
                {activeTab === 'chat' && (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col"
                    style={{ minHeight: '400px' }}
                  >
                    {/* Messages */}
                    <div className="flex-1 px-4 space-y-3 pb-4">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                            style={msg.role === 'assistant'
                              ? { background: 'rgba(91,106,245,0.2)', border: '1px solid rgba(91,106,245,0.3)', color: 'var(--ink-900)', borderBottomLeftRadius: '6px' }
                              : { background: 'var(--ink-080)', border: '1px solid var(--ink-100)', color: 'var(--ink-850)', borderBottomRightRadius: '6px' }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}

                      {/* Loading dots */}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="px-4 py-3 rounded-2xl"
                            style={{ background: 'rgba(91,106,245,0.2)', border: '1px solid rgba(91,106,245,0.3)' }}>
                            <LoadingDots />
                          </div>
                        </div>
                      )}

                      {/* Suggested questions (shown when only the opener message exists) */}
                      {chatMessages.length <= 1 && !chatLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-2 pt-2"
                        >
                          <p className="text-xs font-bold uppercase tracking-wider"
                            style={{ color: 'var(--ink-500)' }}>
                            Suggested questions
                          </p>
                          {[
                            'What are the main points of this video?',
                            session.key_concepts[0]
                              ? `Can you explain ${session.key_concepts[0].concept} in simpler terms?`
                              : 'Can you break down the key concept in simpler terms?',
                            'What should I study next after this?',
                          ].map(q => (
                            <button
                              key={q}
                              onClick={() => handleSendChat(q)}
                              className="w-full text-left px-4 py-3 rounded-2xl text-xs font-medium transition-all active:scale-[0.98]"
                              style={glassCard}
                            >
                              <span style={{ color: 'var(--ink-700)' }}>{q}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}

                      <div ref={chatBottomRef} />
                    </div>

                    {/* Chat input bar */}
                    <div
                      className="px-4 pb-6 pt-3 shrink-0"
                      style={{ borderTop: '1px solid var(--ink-080)' }}
                    >
                      <div
                        className="flex items-center gap-2 rounded-2xl p-1"
                        style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-120)' }}
                      >
                        <MessageSquare size={16} className="ml-3 shrink-0" style={{ color: 'var(--ink-500)' }} />
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                          placeholder="Ask about this video…"
                          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none py-2.5"
                        />
                        <button
                          onClick={() => handleSendChat()}
                          disabled={!chatInput.trim() || chatLoading}
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-40"
                          style={gradientBtn}
                        >
                          <Send size={14} className="text-white" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
