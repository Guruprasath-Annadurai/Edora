// ═══════════════════════════════════════════════════════════════
// Edora — TutoringSessionPage
// Structured 1-on-1 tutoring session with Novo AI.
// Modes: standard (teach), socratic (guide), drill (fix mistakes)
// Route: /tutoring?subject=...&topic=...&mode=...&study_level=...
//        &drill_pattern_id=...&drill_description=...
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, BookOpen, HelpCircle, Wrench,
  CheckCircle2, ChevronRight,
  Loader2, AlertCircle, RefreshCw,
  GraduationCap,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';
import { geminiJSON } from '@/lib/gemini';
import { useTypewriter } from '@/lib/useTypewriter';
import { createCardsFromSession } from '@/lib/spacedRepetition';
import { updateStyleProfile } from '@/lib/learningStyle';
import type {
  TutoringMode, StudyLevel, PagePhase, SessionState, TutoringMessage, CheckpointQuestion,
} from '@/lib/tutoringTypes';
import { NovoAvatar } from '@/components/tutoring/NovoAvatar';
import { TypingIndicator } from '@/components/tutoring/TypingIndicator';
import { MessageItem } from '@/components/tutoring/MessageItem';
import { CompleteScreen } from '@/components/tutoring/CompleteScreen';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TutoringSessionPage() {
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  // ── URL param defaults ──
  const urlSubject     = searchParams.get('subject')          ?? '';
  const urlTopic       = searchParams.get('topic')            ?? '';
  const urlMode        = (searchParams.get('mode')            ?? 'standard') as TutoringMode;
  const urlStudyLevel  = (searchParams.get('study_level')     ?? 'school')   as StudyLevel;
  const urlDrillId     = searchParams.get('drill_pattern_id') ?? '';
  const urlDrillDesc   = searchParams.get('drill_description') ?? '';

  // Determine if we should skip the setup form
  const hasParams = Boolean(urlSubject && urlTopic);

  // ── Page-level state ──
  const [pagePhase, setPagePhase] = useState<PagePhase>(hasParams ? 'starting' : 'setup');

  // ── Setup form ──
  const [subject,    setSubject]    = useState(urlSubject);
  const [topic,      setTopic]      = useState(urlTopic);
  const [mode,       setMode]       = useState<TutoringMode>(urlMode);
  const [studyLevel, setStudyLevel] = useState<StudyLevel>(urlStudyLevel);

  // ── Session state ──
  const [messages,       setMessages]       = useState<TutoringMessage[]>([]);
  const [sessionState,   setSessionState]   = useState<SessionState | null>(null);
  const [inputText,      setInputText]      = useState('');
  const [loading,        setLoading]        = useState(false);  // waiting for Novo
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [errorBanner,    setErrorBanner]    = useState('');

  // Checkpoint in-progress tracking
  const [checkpointAnswered,  setCheckpointAnswered]  = useState(false);
  const [checkpointSelected,  setCheckpointSelected]  = useState<number | null>(null);
  const [checkpointCorrectIdx, setCheckpointCorrectIdx] = useState<number | null>(null);

  // Complete screen
  const [updatingMap,   setUpdatingMap]   = useState(false);
  const [mapUpdated,    setMapUpdated]    = useState(false);
  const [srCardsCount,  setSrCardsCount]  = useState(0);
  const [srGenDone,     setSrGenDone]     = useState(false);

  // ── Refs ──
  const sessionIdRef    = useRef<string | null>(null);
  const mountedRef      = useRef(true);
  const bottomRef       = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef(0);

  // ── Typewriter animation for Novo responses ──
  const { startTyping, getDisplay } = useTypewriter();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Auto-start when URL params are present
  useEffect(() => {
    if (hasParams && pagePhase === 'starting') {
      startSession(urlSubject, urlTopic, urlMode, urlStudyLevel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Start typewriter animation whenever a new Novo text message arrives
  useEffect(() => {
    if (messages.length <= prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      return;
    }
    const last = messages[messages.length - 1];
    if (last.role === 'novo' && last.type === 'text' && last.content.length > 10) {
      startTyping(last.id, last.content);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, startTyping]);

  // ── Helpers ──

  function genId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addMessage(msg: Omit<TutoringMessage, 'id'>) {
    if (!mountedRef.current) return;
    setMessages(prev => [...prev, { ...msg, id: genId() }]);
  }

  function processServerMessages(rawMessages: unknown[]) {
    if (!Array.isArray(rawMessages)) return;
    for (const raw of rawMessages) {
      const m = raw as Record<string, unknown>;
      addMessage({
        role:          (m.role as TutoringMessage['role'])   ?? 'novo',
        type:          (m.type as TutoringMessage['type'])   ?? 'text',
        content:       (m.content as string)                 ?? '',
        objectives:    m.objectives as string[] | undefined,
        conceptTitle:  m.concept_title as string | undefined,
        checkpointData: m.checkpoint_data as CheckpointQuestion | undefined,
        isCorrect:     m.is_correct as boolean | undefined,
        xpEarned:      m.xp_earned as number | undefined,
      });
    }
  }

  function applySessionState(state: SessionState | undefined) {
    if (!state || !mountedRef.current) return;
    setSessionState(state);
  }

  // ── Start session ──

  async function startSession(
    subj: string, tpc: string,
    m: TutoringMode, sl: StudyLevel,
  ) {
    if (!user) return;
    if (!mountedRef.current) return;

    setPagePhase('starting');
    setMessages([]);
    setErrorBanner('');
    setCheckpointAnswered(false);
    setCheckpointSelected(null);
    setCheckpointCorrectIdx(null);
    setMapUpdated(false);
    sessionIdRef.current = null;

    try {
      const body: Record<string, unknown> = {
        action: 'start',
        subject: subj,
        topic: tpc,
        mode: m,
        study_level: sl,
      };
      if (m === 'drill' && urlDrillId)   body.drill_pattern_id   = urlDrillId;
      if (m === 'drill' && urlDrillDesc) body.drill_description  = urlDrillDesc;

      const { data, error } = await withTimeout(
        supabase.functions.invoke('tutoring-engine', { body }),
        25_000,
        'Session start timed out. Please check your connection and try again.',
      );

      if (!mountedRef.current) return;

      if (error || !data) {
        setErrorBanner(error?.message ?? 'Failed to start session. Please try again.');
        setPagePhase('setup');
        return;
      }

      if (data.error || data.code) {
        setErrorBanner(data.error ?? data.message ?? 'Session start failed.');
        setPagePhase('setup');
        return;
      }

      sessionIdRef.current = data.session_id as string;
      if (data.messages) processServerMessages(data.messages);
      applySessionState(data.session_state as SessionState);
      setPagePhase('session');

      track('tutoring_session_started', { subject: subj, topic: tpc, mode: m, study_level: sl });

    } catch (err) {
      if (!mountedRef.current) return;
      setErrorBanner(err instanceof Error ? err.message : 'Network error. Please try again.');
      setPagePhase('setup');
    }
  }

  function handleStartSession() {
    if (!subject.trim() || !topic.trim()) return;
    startSession(subject.trim(), topic.trim(), mode, studyLevel);
  }

  // ── Send student message ──

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || loading || !sessionIdRef.current) return;

    setInputText('');
    setErrorBanner('');
    addMessage({ role: 'student', type: 'text', content });
    setLoading(true);

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('tutoring-engine', {
          body: { action: 'message', session_id: sessionIdRef.current, message: content },
        }),
        25_000,
        'Novo is taking too long to respond. Please try again.',
      );

      if (!mountedRef.current) return;

      if (error || !data) {
        setErrorBanner(error?.message ?? 'No response received. Please try again.');
        return;
      }
      if (data.error || data.code) {
        setErrorBanner(data.error ?? data.message ?? 'Something went wrong.');
        return;
      }

      if (data.message) {
        addMessage({
          role: 'novo',
          type: data.message.type ?? 'text',
          content: data.message.content ?? data.message,
          objectives: data.message.objectives,
          conceptTitle: data.message.concept_title,
        });
      }
      applySessionState(data.session_state as SessionState);

    } catch (err) {
      if (!mountedRef.current) return;
      setErrorBanner(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- addMessage only closes over stable mountedRef/setMessages; restructuring 1500-line component to useCallback not warranted
  }, [inputText, loading]);

  // ── Request checkpoint ──

  async function requestCheckpoint() {
    if (!sessionIdRef.current || checkpointLoading || loading) return;
    setCheckpointLoading(true);
    setErrorBanner('');
    setCheckpointAnswered(false);
    setCheckpointSelected(null);
    setCheckpointCorrectIdx(null);

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('tutoring-engine', {
          body: { action: 'request_checkpoint', session_id: sessionIdRef.current },
        }),
        25_000,
        'Checkpoint timed out. Please try again.',
      );

      if (!mountedRef.current) return;

      if (error || !data) {
        setErrorBanner(error?.message ?? 'Could not load checkpoint. Please try again.');
        return;
      }
      if (data.error || data.code) {
        setErrorBanner(data.error ?? data.message ?? 'Checkpoint error.');
        return;
      }

      if (data.checkpoint) {
        addMessage({
          role: 'novo',
          type: 'checkpoint_question',
          content: '',
          checkpointData: data.checkpoint as CheckpointQuestion,
        });
      }
      applySessionState(data.session_state as SessionState);

    } catch (err) {
      if (!mountedRef.current) return;
      setErrorBanner(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      if (mountedRef.current) setCheckpointLoading(false);
    }
  }

  // ── Submit checkpoint answer ──

  async function submitAnswer(answerIdx: number) {
    if (!sessionIdRef.current || checkpointAnswered) return;

    setCheckpointSelected(answerIdx);
    setCheckpointAnswered(true);
    setLoading(true);
    setErrorBanner('');

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('tutoring-engine', {
          body: { action: 'submit_answer', session_id: sessionIdRef.current, answer_idx: answerIdx },
        }),
        25_000,
        'Answer submission timed out. Please try again.',
      );

      if (!mountedRef.current) return;

      if (error || !data) {
        setErrorBanner(error?.message ?? 'Could not submit answer. Please try again.');
        return;
      }
      if (data.error || data.code) {
        setErrorBanner(data.error ?? data.message ?? 'Answer submission failed.');
        return;
      }

      const isCorrect: boolean  = data.is_correct ?? false;
      const correctIdx: number  = data.correct_answer ?? -1;
      setCheckpointCorrectIdx(correctIdx);

      // Checkpoint answer pill
      addMessage({
        role: 'student',
        type: 'checkpoint_answer',
        content: isCorrect ? 'Correct!' : `Wrong — answer was ${String.fromCharCode(65 + correctIdx)}`,
        isCorrect,
      });

      // Feedback from Novo
      if (data.feedback) {
        addMessage({
          role: 'novo',
          type: 'feedback',
          content: data.feedback,
          isCorrect,
        });
      }

      // Continue teaching
      if (data.next_teaching) {
        addMessage({
          role: 'novo',
          type: data.next_teaching.type ?? 'text',
          content: data.next_teaching.content ?? data.next_teaching,
          objectives: data.next_teaching.objectives,
          conceptTitle: data.next_teaching.concept_title,
        });
      }

      applySessionState(data.session_state as SessionState);

      // Session complete?
      if (data.session_complete) {
        const ss = data.session_state as SessionState;
        track('tutoring_session_complete', {
          subject,
          topic,
          score: ss?.score ?? 0,
          total: ss?.total_checkpoints ?? 0,
          accuracy: ss?.total_checkpoints
            ? Math.round(((ss?.score ?? 0) / ss.total_checkpoints) * 100)
            : 100,
        });
        // Fire post-session tasks in background (no await — don't block UI)
        if (sessionIdRef.current) {
          runPostSessionTasks(sessionIdRef.current);
        }
      }

    } catch (err) {
      if (!mountedRef.current) return;
      setErrorBanner(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // ── Update concept map ──

  async function updateConceptMap() {
    if (!user || updatingMap || mapUpdated) return;
    const concepts = sessionState?.completed_concepts ?? [];
    if (!concepts.length) { setMapUpdated(true); return; }

    setUpdatingMap(true);

    try {
      const score         = sessionState?.score ?? 0;
      const totalChk      = sessionState?.total_checkpoints ?? 1;
      const accuracyRatio = totalChk > 0 ? score / totalChk : 0;

      for (let i = 0; i < concepts.length; i++) {
        const concept = concepts[i];
        const masteryPct =
          concept.status === 'mastered'    ? Math.round(accuracyRatio * 100) :
          concept.status === 'partial'     ? Math.round(accuracyRatio * 50)  :
          concept.status === 'in_progress' ? 20 : 10;

        const { error: upsertError } = await supabase.from('concept_nodes').upsert({
          user_id:        user.id,
          subject,
          title:          concept.title,
          description:    `Studied in session on ${topic}`,
          mastery_pct:    masteryPct,
          times_studied:  1,
          last_studied_at: new Date().toISOString(),
        }, { onConflict: 'user_id,subject,title', ignoreDuplicates: false });

        if (upsertError) {
          console.error('[TutoringPage] concept_nodes upsert error:', upsertError.message);
        }
      }

      // Create sequential edges: concept[i] → concept[i+1]
      for (let i = 0; i < concepts.length - 1; i++) {
        await supabase.from('concept_edges').upsert({
          user_id:     user.id,
          subject,
          from_title:  concepts[i].title,
          to_title:    concepts[i + 1].title,
        }, { onConflict: 'user_id,subject,from_title,to_title', ignoreDuplicates: true });
      }

      if (mountedRef.current) setMapUpdated(true);

    } catch (err) {
      console.error('[TutoringPage] updateConceptMap error:', err);
    } finally {
      if (mountedRef.current) setUpdatingMap(false);
    }
  }

  // ── Auto post-session: SR cards + learning style ──────────────────────────

  async function runPostSessionTasks(sessionId: string) {
    if (!user || srGenDone) return;

    try {
      // 1. Generate SR cards from the session conversation
      const pairs = await geminiJSON<Array<{ front: string; back: string }>>(
        `You are a spaced repetition expert. Given this tutoring session on "${topic}" (${subject}), generate 5-8 high-quality flashcard pairs from what was taught.

Return ONLY valid JSON:
[{"front": "question or prompt", "back": "answer or explanation"}]

Rules:
- front: clear question or cloze
- back: concise (2-4 sentences)
- Focus on the most important concepts from ${topic}
- Make cards self-contained (understandable without context)`
      ).catch(() => []);

      if (pairs.length > 0 && mountedRef.current) {
        const count = await createCardsFromSession(user.id, subject, topic, sessionId, pairs).catch(() => 0);
        if (mountedRef.current) setSrCardsCount(count);
      }

      // 2. Update learning style profile from this session
      await updateStyleProfile(user.id, sessionId).catch(() => null);

      if (mountedRef.current) setSrGenDone(true);
    } catch {
      if (mountedRef.current) setSrGenDone(true);
    }
  }

  // ── New session ──

  function handleNewSession() {
    setPagePhase('setup');
    setMessages([]);
    setSessionState(null);
    setInputText('');
    setErrorBanner('');
    setCheckpointAnswered(false);
    setCheckpointSelected(null);
    setCheckpointCorrectIdx(null);
    setMapUpdated(false);
    sessionIdRef.current = null;
    setSubject('');
    setTopic('');
    setMode('standard');
    setStudyLevel('school');
  }

  // ── Derived state ──
  const ss            = sessionState;
  const sessionPhase  = ss?.phase ?? 'teaching';
  const isComplete    = sessionPhase === 'complete';
  const isCheckpoint  = sessionPhase === 'checkpoint';
  const showCheckpointPrompt = ss?.show_checkpoint_prompt ?? false;
  const conceptsDone  = ss?.concepts_done    ?? 0;
  const totalConcepts = ss?.total_concepts   ?? 1;
  const score         = ss?.score            ?? 0;
  const totalChk      = ss?.total_checkpoints ?? 0;
  const xpEarned      = ss?.xp_earned        ?? 0;
  const completedConcepts = ss?.completed_concepts ?? [];
  const progressPct   = totalConcepts > 0 ? Math.min(100, Math.round((conceptsDone / totalConcepts) * 100)) : 0;

  const MODE_META = {
    standard:  { label: 'Teach', Icon: GraduationCap, color: '#5B6AF5' },
    socratic:  { label: 'Guide', Icon: HelpCircle,    color: '#8B5CF6' },
    drill:     { label: 'Drill', Icon: Wrench,        color: '#EC4899' },
  };

  // ── Render: starting (full-screen spinner) ──

  if (pagePhase === 'starting') {
    return (
      <div className="flex flex-col h-full bg-gradient-page items-center justify-center gap-5">
        <div className="relative w-16 h-16">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <GraduationCap size={22} className="text-primary" />
          </div>
        </div>
        <div className="text-center px-6">
          <h2 className="font-heading text-lg font-bold text-white">Novo is preparing your session…</h2>
          <p className="text-sm text-muted-foreground mt-1">Setting up your personalised {mode} session</p>
        </div>
      </div>
    );
  }

  // ── Render: setup form ──

  if (pagePhase === 'setup') {
    return (
      <div className="flex flex-col h-full bg-gradient-page">

        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--hdr-a-820)', borderBottom: '1px solid var(--ink-100)', backdropFilter: 'blur(64px) saturate(220%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(220%) brightness(1.04)' }}>
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={17} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading text-base font-bold text-white">Tutoring Session</h1>
            <p className="text-[11px] text-muted-foreground">1-on-1 with Novo AI</p>
          </div>
          <NovoAvatar size={36} />
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-5 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>

          {errorBanner && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl px-4 py-3 flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-400">{errorBanner}</p>
              </div>
              <button onClick={() => setErrorBanner('')} className="text-red-400 shrink-0">✕</button>
            </motion.div>
          )}

          <div>
            <h2 className="font-heading text-xl font-bold text-white mb-0.5">New Session</h2>
            <p className="text-sm text-muted-foreground">Tell Novo what you want to learn</p>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              Subject
            </label>
            <input
              type="text"
              placeholder="e.g. Physics, Mathematics, History…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-2xl px-4 h-14 text-sm text-white placeholder:text-white/30 outline-none"
              style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
          </div>

          {/* Topic */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              Topic
            </label>
            <input
              type="text"
              placeholder="e.g. Newton's Laws, Integration, World War II…"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStartSession()}
              className="w-full rounded-2xl px-4 h-14 text-sm text-white placeholder:text-white/30 outline-none"
              style={{ background: 'var(--ink-055)', border: '1px solid var(--ink-080)', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
          </div>

          {/* Study level */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              Study Level
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['school', 'college', 'competitive', 'professional'] as StudyLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setStudyLevel(level)}
                  className={`py-3 rounded-2xl text-sm font-semibold capitalize transition-all active:scale-95
                    ${studyLevel === level ? 'text-white' : 'text-white/70'}`}
                  style={studyLevel === level
                    ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)', border: 'none' }
                    : { background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              Session Mode
            </label>
            <div className="flex flex-col gap-2">
              {([
                { key: 'standard' as TutoringMode, icon: <BookOpen size={18} />,  title: 'Teach Me',      desc: 'Novo explains concepts step-by-step' },
                { key: 'socratic' as TutoringMode, icon: <HelpCircle size={18} />, title: 'Guide Me',      desc: 'Novo asks questions instead of giving answers' },
                { key: 'drill'    as TutoringMode, icon: <Wrench size={18} />,    title: 'Fix My Mistake', desc: 'Targeted remediation for specific errors' },
              ]).map(({ key, icon, title, desc }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className="p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                  style={mode === key
                    ? { background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.3)' }
                    : { background: 'var(--hdr-b-750)', border: '1px solid var(--ink-070)' }}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all
                      ${mode === key ? 'text-white' : 'text-primary'}`}
                      style={mode === key
                        ? { background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }
                        : { background: 'rgba(91,106,245,0.12)' }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${mode === key ? 'text-primary' : 'text-white'}`}>
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    {mode === key && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <CheckCircle2 size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleStartSession}
            disabled={!subject.trim() || !topic.trim()}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
            <GraduationCap size={18} />
            Start Session
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Render: active session ──

  return (
    <div className="flex flex-col h-full bg-gradient-page">

      {/* ── Sticky header ── */}
      <div className="shrink-0"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: 'var(--hdr-a-880)',
          borderBottom: '1px solid var(--ink-060)',
          backdropFilter: 'blur(12px)',
        }}>
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              if (isComplete) { handleNewSession(); } else { navigate(-1); }
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={17} className="text-white" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-heading text-sm font-bold text-white truncate">
                {topic || 'Tutoring'}
              </p>
              {subject && (
                <span className="text-[10px] text-muted-foreground">· {subject}</span>
              )}
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-100)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {conceptsDone}/{totalConcepts}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Score */}
            {totalChk > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                <CheckCircle2 size={11} className="text-green-400" />
                <span className="text-[11px] font-bold text-white">{score}/{totalChk}</span>
              </div>
            )}
            {/* Mode badge */}
            {(() => { const ModeIcon = MODE_META[mode].Icon; return (
              <div className="px-2 py-1 rounded-full flex items-center gap-1"
                style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                <ModeIcon size={10} className="text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {MODE_META[mode].label}
                </span>
              </div>
            ); })()}
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {errorBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0">
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400 flex-1">{errorBanner}</p>
              <button
                onClick={() => setErrorBanner('')}
                className="text-red-400 shrink-0 ml-2">
                <RefreshCw size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Message thread ── */}
      <div className="flex-1 overflow-y-auto native-scroll pb-nav px-4 py-4 flex flex-col gap-3">

        <AnimatePresence initial={false}>
          {messages.map((msg, _idx) => {
            const tw = getDisplay(msg.id, msg.content);
            return (
              <MessageItem
                key={msg.id}
                msg={msg}
                displayContent={tw.text}
                isTyping={tw.typing}
                onAnswer={
                  msg.type === 'checkpoint_question'
                    ? submitAnswer
                    : undefined
                }
                answered={
                  msg.type === 'checkpoint_question'
                    ? checkpointAnswered
                    : undefined
                }
                selectedIdx={
                  msg.type === 'checkpoint_question'
                    ? checkpointSelected
                    : undefined
                }
                correctIdx={
                  msg.type === 'checkpoint_question'
                    ? checkpointCorrectIdx
                    : undefined
                }
              />
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {loading && <TypingIndicator key="typing" />}
        </AnimatePresence>

        {/* Complete screen (inline) */}
        <AnimatePresence>
          {isComplete && (
            <CompleteScreen
              key="complete"
              score={score}
              totalCheckpoints={totalChk}
              xpEarned={xpEarned}
              completedConcepts={completedConcepts}
              subject={subject}
              topic={topic}
              onNewSession={handleNewSession}
              onUpdateConceptMap={updateConceptMap}
              updatingMap={updatingMap}
              mapUpdated={mapUpdated}
              srCardsCount={srCardsCount}
            />
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom toolbar ── */}
      {!isComplete && (
        <div
          className="shrink-0"
          style={{
            background: 'var(--hdr-a-880)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--ink-080)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}>

          {isCheckpoint ? (
            /* Checkpoint hint */
            <div className="px-4 py-3 flex items-center justify-center gap-2">
              <HelpCircle size={14} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground italic">Answer the question above to continue</p>
            </div>
          ) : (
            /* Teaching toolbar */
            <div className="px-4 pt-3">
              {/* "Test my understanding" prompt */}
              <AnimatePresence>
                {showCheckpointPrompt && !loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="mb-2">
                    <button
                      onClick={requestCheckpoint}
                      disabled={checkpointLoading || loading}
                      className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all active:scale-95 disabled:opacity-60"
                      style={{ borderColor: '#5B6AF5', color: '#5B6AF5', background: 'rgba(91,106,245,0.06)' }}>
                      {checkpointLoading
                        ? <><Loader2 size={13} className="animate-spin" /> Loading checkpoint…</>
                        : <><HelpCircle size={13} /> Test My Understanding →</>
                      }
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-2xl flex items-center gap-2 px-4 h-12"
                  style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={
                      mode === 'socratic' ? 'Think it through and reply…' :
                      mode === 'drill'    ? 'Ask about your mistake…' :
                      'Ask Novo anything…'
                    }
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    disabled={loading}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none disabled:opacity-60"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!inputText.trim() || loading}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)' }}>
                    <Send size={14} className="text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
