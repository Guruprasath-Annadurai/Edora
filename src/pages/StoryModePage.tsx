// ═══════════════════════════════════════════════════════════════
// Edora — StoryModePage
// Academic concepts delivered through immersive adventure narratives.
// Every 3 turns a concept checkpoint is embedded. XP awarded.
// Route: /story-mode
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Loader2, AlertCircle, RefreshCw,
  BookOpen, ChevronDown, ChevronUp, Trophy, CheckCircle2,
  Sparkles, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

type Screen = 'selector' | 'story';

interface Scenario {
  id: string;
  title: string;
  hook: string;
  description: string;
  topic: string;
  emoji: string;
  xp_max: number;
  subject?: string;
}

interface StoryMessage {
  id: string;
  role: 'narrator' | 'student';
  content: string;
  isCheckpoint?: boolean;
}

interface StorySession {
  id: string;
  scenario_title: string;
  scenario_hook: string;
  topic: string;
  messages: Array<{ role: 'narrator' | 'student'; content: string }>;
}

interface ContinueResponse {
  reply: string;
  is_checkpoint: boolean;
  status: 'active' | 'completed';
  xp_earned: number;
  concepts_covered: string[];
}

interface PastStorySession {
  id: string;
  scenario_title: string;
  subject: string;
  topic: string;
  status: string;
  xp_earned: number;
  checkpoints_passed: number;
  concepts_covered: string[];
  created_at: string;
}

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── CheckpointToast ───────────────────────────────────────────────────────────

function CheckpointToast({ xp }: { xp: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl self-center"
      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}>
      <CheckCircle2 size={14} style={{ color: '#34D399' }} />
      <span className="text-xs font-bold" style={{ color: '#34D399' }}>Checkpoint passed! +{xp} XP</span>
    </motion.div>
  );
}

// ── ConceptPills ──────────────────────────────────────────────────────────────

function ConceptPills({ concepts, expanded, onToggle }: {
  concepts: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (concepts.length === 0) return null;

  return (
    <div className="px-4 py-2 shrink-0"
      style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full">
        <BookOpen size={11} style={{ color: '#FBBF24' }} />
        <span className="text-xs font-bold uppercase tracking-wide flex-1 text-left" style={{ color: '#FBBF24' }}>
          Topics covered so far
        </span>
        {expanded
          ? <ChevronUp size={12} style={{ color: '#FBBF24' }} />
          : <ChevronDown size={12} style={{ color: '#FBBF24' }} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="flex flex-wrap gap-1.5 mt-2">
              {concepts.map((c, i) => (
                <span
                  key={i}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ScenarioCard ──────────────────────────────────────────────────────────────

interface ScenarioCardProps {
  scenario: Scenario;
  onStart: (s: Scenario) => void;
}

function ScenarioCard({ scenario, onStart }: ScenarioCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onStart(scenario)}
      className="w-full rounded-3xl p-5 text-left active:scale-[0.98] transition-all"
      style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          {scenario.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-base font-bold text-white leading-tight mb-1">{scenario.title}</h3>
          <span
            className="inline-block text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(91,106,245,0.1)', color: '#5B6AF5' }}>
            teaches: {scenario.topic}
          </span>
        </div>
      </div>

      <p className="text-sm italic text-muted-foreground leading-relaxed mb-2 pl-3" style={{ borderLeft: '2px solid rgba(245,158,11,0.4)' }}>
        {scenario.hook}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{scenario.description}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={12} style={{ color: '#FBBF24' }} />
          <span className="text-xs font-bold" style={{ color: '#FBBF24' }}>Up to {scenario.xp_max} XP</span>
        </div>
        <div className="flex items-center gap-1 text-primary">
          <BookOpen size={12} />
          <span className="text-xs font-bold">Begin Adventure</span>
        </div>
      </div>
    </motion.button>
  );
}

// ── PastStoryRow ──────────────────────────────────────────────────────────────

function PastStoryRow({ session }: { session: PastStorySession }) {
  return (
    <div className="flex items-center gap-3 py-3 last:border-b-0" style={{ borderBottom: '1px solid var(--ink-060)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(245,158,11,0.12)' }}>
        <BookOpen size={16} style={{ color: '#FBBF24' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{session.scenario_title}</p>
        <p className="text-xs text-muted-foreground">{session.topic} · +{session.xp_earned} XP</p>
      </div>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={session.status === 'completed'
          ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }
          : { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
        {session.status === 'completed' ? 'Done' : 'In Progress'}
      </span>
    </div>
  );
}

// ── CompletionOverlay ─────────────────────────────────────────────────────────

interface CompletionOverlayProps {
  title: string;
  totalXp: number;
  concepts: string[];
  onSaveNotes: () => void;
  onExploreMore: () => void;
}

function CompletionOverlay({ title, totalXp, concepts, onSaveNotes, onExploreMore }: CompletionOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full rounded-t-3xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)', borderBottom: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>

        <div className="flex flex-col items-center gap-3 text-center">
          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.1))', border: '1px solid rgba(245,158,11,0.3)' }}
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 1.2, repeat: 2 }}>
            <BookOpen size={36} style={{ color: '#FBBF24' }} />
          </motion.div>
          <div>
            <h2 className="font-heading text-xl font-bold text-white">Adventure Complete!</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{title}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Sparkles size={14} style={{ color: '#FBBF24' }} />
            <span className="text-sm font-bold" style={{ color: '#FBBF24' }}>+{totalXp} XP Earned!</span>
          </div>
        </div>

        {concepts.length > 0 && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#FBBF24' }}>Concepts Learned</p>
            <div className="flex flex-wrap gap-1.5">
              {concepts.map((c, i) => (
                <span
                  key={i}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24' }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={onSaveNotes}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-muted-foreground flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <CheckCircle2 size={16} className="text-[#34D399]" />
            Save to Notes
          </button>
          <button
            onClick={onExploreMore}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <BookOpen size={16} />
            Explore More Stories
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full">
      <div className="rounded-2xl px-5 py-4 flex gap-1.5 items-center"
        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <BookOpen size={13} className="mr-1 shrink-0" style={{ color: '#FBBF24' }} />
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ background: '#FBBF24' }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.55, repeat: Infinity, delay }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StoryModePage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [screen, setScreen] = useState<Screen>('selector');
  const [selectorTab, setSelectorTab] = useState<'new' | 'continue'>('new');

  // Selector
  const [selectedSubject, setSelectedSubject] = useState('');
  const [scenarios, setScenarios]             = useState<Scenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [pastSessions, setPastSessions]       = useState<PastStorySession[]>([]);
  const [pastLoading, setPastLoading]         = useState(false);
  const [selectorError, setSelectorError]     = useState('');
  const [startingSession, setStartingSession] = useState(false);

  // Story
  const [session, setSession]           = useState<StorySession | null>(null);
  const [messages, setMessages]         = useState<StoryMessage[]>([]);
  const [inputText, setInputText]       = useState('');
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError]     = useState('');
  const [totalXp, setTotalXp]           = useState(0);
  const [conceptsCovered, setConceptsCovered] = useState<string[]>([]);
  const [conceptsExpanded, setConceptsExpanded] = useState(false);
  const [isCompleted, setIsCompleted]   = useState(false);
  const [lastCheckpoint, setLastCheckpoint] = useState(false);
  const [lastCheckpointXp, setLastCheckpointXp] = useState(20);

  const mountedRef   = useRef(true);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadScenarios();
    loadPastSessions();
  }, []);

  useEffect(() => {
    loadScenarios(selectedSubject);
  }, [selectedSubject]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, storyLoading]);

  // ── API ──

  async function loadScenarios(subject?: string) {
    setScenariosLoading(true);
    setSelectorError('');
    try {
      const { data, error } = await supabase.functions.invoke('story-mode', {
        body: { action: 'get_scenarios', subject: subject || undefined },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setSelectorError(error?.message ?? 'Failed to load scenarios'); return; }
      setScenarios((data.scenarios as Scenario[]) ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setSelectorError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setScenariosLoading(false);
    }
  }

  async function loadPastSessions() {
    setPastLoading(true);
    try {
      const { data } = await supabase.functions.invoke('story-mode', {
        body: { action: 'list_sessions' },
      });
      if (!mountedRef.current) return;
      setPastSessions((data?.sessions as PastStorySession[]) ?? []);
    } catch { /* silent */ } finally {
      if (mountedRef.current) setPastLoading(false);
    }
  }

  async function startStory(scenario: Scenario) {
    if (!user) return;
    setStartingSession(true);
    setSelectorError('');
    try {
      const { data, error } = await supabase.functions.invoke('story-mode', {
        body: {
          action: 'create_session',
          scenario_id: scenario.id,
          subject: (scenario.subject ?? selectedSubject) || 'General',
        },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setSelectorError(error?.message ?? 'Failed to start story'); return; }

      const s = data.session as StorySession;
      setSession(s);
      sessionIdRef.current = s.id;
      setMessages((s.messages ?? []).map(m => ({ id: genId(), role: m.role, content: m.content })));
      setTotalXp(0);
      setConceptsCovered([]);
      setIsCompleted(false);
      setLastCheckpoint(false);
      setScreen('story');
    } catch (err) {
      if (!mountedRef.current) return;
      setSelectorError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setStartingSession(false);
    }
  }

  const sendResponse = useCallback(async () => {
    const content = inputText.trim();
    if (!content || storyLoading || !sessionIdRef.current) return;

    setInputText('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    setStoryError('');
    setLastCheckpoint(false);
    setMessages(prev => [...prev, { id: genId(), role: 'student', content }]);
    setStoryLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('story-mode', {
        body: { action: 'continue_story', session_id: sessionIdRef.current, message: content },
      });
      if (!mountedRef.current) return;
      if (error || !data) { setStoryError(error?.message ?? 'No response received'); return; }

      const res = data as ContinueResponse;
      setMessages(prev => [...prev, { id: genId(), role: 'narrator', content: res.reply, isCheckpoint: res.is_checkpoint }]);

      if (res.is_checkpoint) {
        setLastCheckpoint(true);
        setLastCheckpointXp(res.xp_earned ?? 20);
      }
      if (res.xp_earned) {
        setTotalXp(prev => prev + res.xp_earned);
      }
      if (res.concepts_covered && res.concepts_covered.length > 0) {
        setConceptsCovered(res.concepts_covered);
      }
      if (res.status === 'completed') {
        setIsCompleted(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setStoryError(err instanceof Error ? err.message : 'Network error');
    } finally {
      if (mountedRef.current) setStoryLoading(false);
    }
  }, [inputText, storyLoading]);

  function handleSaveNotes() {
  }

  function resetToSelector() {
    setScreen('selector');
    setSession(null);
    setMessages([]);
    setInputText('');
    setTotalXp(0);
    setConceptsCovered([]);
    setIsCompleted(false);
    setLastCheckpoint(false);
    setStoryError('');
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
      <div className="page-immersive bg-gradient-page">
        <div
          className="shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
              <ArrowLeft size={17} className="text-white" />
            </button>
            <div className="flex-1">
              <h1 className="font-heading text-base font-bold text-white">Story Mode</h1>
              <p className="text-xs text-muted-foreground">Learn through immersive adventures</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              <BookOpen size={16} className="text-white" />
            </div>
          </div>

          {/* Tabs */}
          <div className="px-4 pb-3 flex gap-2">
            {(['new', 'continue'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSelectorTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectorTab === tab
                    ? 'text-white'
                    : 'text-muted-foreground'
                }`}
                style={selectorTab === tab
                  ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }
                  : { background: 'var(--ink-050)' }}>
                {tab === 'new' ? 'New Story' : 'Continue Reading'}
              </button>
            ))}
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
                <button onClick={() => setSelectorError('')} className="text-red-400"><X size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {selectorTab === 'new' ? (
            <>
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
                      : { background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
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
                        : { background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scenarios */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Choose Your Adventure</p>
                {scenariosLoading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-44 rounded-3xl animate-pulse"
                        style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }} />
                    ))}
                  </div>
                ) : scenarios.length === 0 ? (
                  <div className="rounded-3xl p-6 text-center"
                    style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                    <p className="text-sm text-muted-foreground">No stories found. Try a different subject.</p>
                    <button
                      onClick={() => loadScenarios(selectedSubject)}
                      className="mt-3 text-xs font-semibold text-primary flex items-center gap-1 mx-auto">
                      <RefreshCw size={12} /> Retry
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {scenarios.map(sc => (
                      <ScenarioCard key={sc.id} scenario={sc} onStart={startStory} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Continue Reading tab */
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Stories in Progress</p>
              {pastLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="text-muted-foreground animate-spin" />
                </div>
              ) : pastSessions.length === 0 ? (
                <div className="rounded-3xl p-6 text-center"
                  style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                  <BookOpen size={28} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No stories started yet.</p>
                  <button
                    onClick={() => setSelectorTab('new')}
                    className="mt-3 text-xs font-bold text-primary">
                    Start your first adventure →
                  </button>
                </div>
              ) : (
                <div className="rounded-3xl px-4"
                  style={{ background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                  {pastSessions.map(s => <PastStoryRow key={s.id} session={s} />)}
                </div>
              )}
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
                style={{ background: 'var(--hdr-a-880)', border: '1px solid var(--ink-100)' }}>
                <BookOpen size={36} className="animate-bounce" style={{ color: '#FBBF24' }} />
                <p className="font-heading text-base font-bold text-white">Opening the story…</p>
                <p className="text-xs text-muted-foreground text-center">Setting the scene for your adventure</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SCREEN: STORY
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="page-immersive bg-gradient-page relative">

      {/* Sticky header */}
      <div
        className="shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={17} className="text-white" />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <BookOpen size={15} className="shrink-0" style={{ color: '#FBBF24' }} />
            <p className="font-heading text-sm font-bold text-white truncate">
              {session?.scenario_title ?? 'Story Mode'}
            </p>
          </div>
          {/* XP counter */}
          {totalXp > 0 && (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <Sparkles size={10} style={{ color: '#FBBF24' }} />
              <span className="text-xs font-bold" style={{ color: '#FBBF24' }}>+{totalXp} XP</span>
            </div>
          )}
          <button
            onClick={resetToSelector}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Concepts covered expandable */}
      <ConceptPills
        concepts={conceptsCovered}
        expanded={conceptsExpanded}
        onToggle={() => setConceptsExpanded(v => !v)}
      />

      {/* Error banner */}
      <AnimatePresence>
        {storyError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0">
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400 flex-1">{storyError}</p>
              <button onClick={() => setStoryError('')} className="text-red-400"><RefreshCw size={12} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-4 flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            if (msg.role === 'narrator') {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full">
                  <div
                    className="w-full rounded-2xl px-5 py-4"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <BookOpen size={11} style={{ color: '#FBBF24' }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#FBBF24' }}>Narrator</span>
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap"
                      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      {msg.content}
                    </p>
                  </div>
                  {/* Checkpoint notification after narrator msg if this was a checkpoint response */}
                  {msg.isCheckpoint && idx === messages.length - 1 && (
                    <div className="mt-2 flex">
                      <CheckpointToast xp={lastCheckpointXp} />
                    </div>
                  )}
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

        {/* Checkpoint passed toast (shows after user sends, before narrator replies) */}
        <AnimatePresence>
          {lastCheckpoint && storyLoading && (
            <CheckpointToast key="checkpoint-pending" xp={lastCheckpointXp} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {storyLoading && <TypingIndicator key="typing" />}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      {!isCompleted && (
        <div
          className="shrink-0 px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', background: 'var(--hdr-a-820)', borderTop: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl px-4 py-3 flex items-end"
              style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Your response…"
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendResponse(); }
                }}
                disabled={storyLoading}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground outline-none resize-none disabled:opacity-60 w-full leading-relaxed"
                style={{ WebkitUserSelect: 'text', userSelect: 'text', maxHeight: 120 }}
              />
            </div>
            <button
              onClick={() => void sendResponse()}
              disabled={!inputText.trim() || storyLoading}
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 shrink-0"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>
              <Send size={15} className="text-white" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">Continue →</p>
        </div>
      )}

      {/* Completion overlay */}
      <AnimatePresence>
        {isCompleted && session && (
          <CompletionOverlay
            key="completion"
            title={session.scenario_title}
            totalXp={totalXp}
            concepts={conceptsCovered}
            onSaveNotes={handleSaveNotes}
            onExploreMore={resetToSelector}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
