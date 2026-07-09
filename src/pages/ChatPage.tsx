import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, ArrowLeft, Square, Loader2,
  Sparkles, Camera, BookOpen, Volume2, VolumeX, Crown, Download } from 'lucide-react';
import { AiAudioIcon, SendIcon } from '@/components/ui/icons';
import { Link, useNavigate } from 'react-router-dom';
import { SmartReplyChips } from '@/components/chat/SmartReplyChips';
import { NovoMemoryPanel } from '@/components/chat/NovoMemoryPanel';
import { ConceptPills } from '@/components/chat/ConceptPills';
import { AIFeedback, logAIInteraction } from '@/components/ui/AIFeedback';
import { FlashcardSaveSheet } from '@/components/chat/FlashcardSaveSheet';
import { InlineQuizEmbed, type QuizQuestion } from '@/components/chat/InlineQuizEmbed';
import { getSmartReplies, SmartReplyMessage } from '@/plugins/SmartReplyPlugin';
import { useAuth } from '@/hooks/useAuth';
import { isInFreeTrial } from '@/lib/trial';
import { useNovoTTS } from '@/hooks/useNovoTTS';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/lib/supabase';
import { Events } from '@/lib/analytics';
import {GeminiRateLimitError, GeminiTimeoutError, GeminiNetworkError} from '@/lib/gemini';
import { writeSessionCache, getOfflineFallback } from '@/lib/ragCache';
import { getBestFallbackAnswer } from '@/lib/fallbackQA';
import { inferOffline, isModelReady, initOfflineModel, onStatusChange as onModelStatusChange, onProgress as onModelProgress, type ModelStatus } from '@/lib/offlineModel';
import { useGeminiStream } from '@/lib/useGeminiStream';
import { Capacitor } from '@capacitor/core';
import { Toast } from '@capacitor/toast';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import VoiceStudyOverlay from '@/components/voice/VoiceStudyOverlay';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import type { NovoPersonality, NovoMemory, NovoMemoryContext, NovoProactiveMessage } from '@/types';
import { EmotionalCheckIn, getTodayMood, type CheckInMood } from '@/components/chat/EmotionalCheckIn';
import { NovoMarkdown } from '@/components/ui/NovoMarkdown';
import { NovoEmptyState } from '@/components/novo/NovoEmptyState';
import { useStudyContext, buildStudyContextBlock, getPersonalisedChips } from '@/hooks/useStudyContext';
import {
  detectMood, detectQuizIntent, parseConceptsFromResponse, resolveDrawTags,
  buildSystemPrompt, parseAndExecuteActions, translateText, fetchNcertContext,
  PERSONALITIES,
  type MoodState, type NcertSource,
} from '@/lib/chatHelpers';
import { ProactiveBanner } from '@/components/chat/ProactiveBanner';
import { PersonalityCards } from '@/components/chat/PersonalityCards';
import { PersonalitySheet } from '@/components/chat/PersonalitySheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:             string;
  role:           'user' | 'assistant';
  content:        string;
  displayContent?: string;  // content with [CONCEPTS: ...] tag stripped
  concepts?:       string[];
  quizData?:       { questions: QuizQuestion[]; topic: string };
  ncertSources?:   NcertSource[]; // NCERT chapters the answer was grounded in
  interactionId?:  string;        // ai_interactions row ID — used for AIFeedback
  timestamp:      Date;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChatPage() {
  const navigate = useNavigate();
  const { profile, user }   = useAuth();
  const { speak, getState } = useNovoTTS();
  const { language, langOption } = useLanguage();
  const { streamMessage, isStreaming, streamingText } = useGeminiStream();

  const [personality, setPersonality] = useState<NovoPersonality>(
    profile?.novo_personality ?? 'dominie'
  );
  const [messages, setMessages]       = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [smartReplies, setSmartReplies]   = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);
  const [voiceOpen, setVoiceOpen]     = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [showPersonalitySheet, setShowPersonalitySheet] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown]   = useState(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Memory
  const [memCtx, setMemCtx]           = useState<NovoMemoryContext | null>(null);
  const [memories, setMemories]       = useState<NovoMemory[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [memPanelOpen, setMemPanelOpen] = useState(false);

  // Proactive banner
  const [proactiveMsg, setProactiveMsg] = useState<NovoProactiveMessage | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  // Emotional check-in
  const [checkInMood, setCheckInMood]   = useState<CheckInMood | null>(null);
  const [showCheckIn, setShowCheckIn]   = useState(false);

  // New: mood, auto-speak, flashcard sheet, snap-solve
  const [moodState, setMoodState]     = useState<MoodState>('neutral');
  const [autoSpeak, setAutoSpeak]     = useState(false);
  const [flashcardSheet, setFlashcardSheet] = useState<{
    messageId: string; front: string; back: string;
  } | null>(null);
  const [snapSolving, setSnapSolving] = useState(false);

  const bottomRef          = useRef<HTMLDivElement>(null);
  const sessionMsgs        = useRef<Message[]>([]);
  const lastInteractionId  = useRef<string | null>(null); // tracks last logged AI response for follow_up_count
  const lastChunkIdsRef    = useRef<string[]>([]);         // L3: carry last RAG chunk IDs for follow-up detection
  const [offlineModelStatus, setOfflineModelStatus] = useState<ModelStatus>('idle');
  const [modelDownloadPct,   setModelDownloadPct]   = useState(0);
  const [showModelPrompt,    setShowModelPrompt]     = useState(false);

  // ── Free-tier AI usage counter ───────────────────────────────────────────
  const FREE_AI_DAILY_LIMIT = 10;
  const [aiUsageCount,     setAiUsageCount]     = useState(0);
  const [showAiLimitSheet, setShowAiLimitSheet] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const key = `edora_ai_daily_${user.id}_${new Date().toISOString().slice(0, 10)}`;
    const stored = parseInt(localStorage.getItem(key) ?? '0', 10);
    setAiUsageCount(isNaN(stored) ? 0 : stored);
  }, [user?.id]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  // ── Study context for Novo contextual awareness ──────────────────────────
  const { ctx: studyCtx } = useStudyContext(user?.id, profile?.streak_count ?? 0);

  // ── Voice availability ───────────────────────────────────────────────────
  useEffect(() => {
    async function checkVoice() {
      try {
        if (!Capacitor.isNativePlatform()) {
          setVoiceAvailable('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
          return;
        }
        const { available } = await SpeechRecognition.available();
        setVoiceAvailable(available);
      } catch { setVoiceAvailable(false); }
    }
    checkVoice();
  }, []);

  // ── Emotional check-in: show once per day ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const existing = getTodayMood(user.id);
    if (existing) {
      setCheckInMood(existing.mood);
    } else {
      // Small delay so the chat UI renders first
      const t = setTimeout(() => setShowCheckIn(true), 600);
      return () => clearTimeout(t);
    }
  }, [user]);

  // ── Load memory context ──────────────────────────────────────────────────
  async function loadMemoryContext(currentTopic?: string) {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('novo-memory', {
        body: { action: 'get_context', current_topic: currentTopic ?? undefined },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
      if (!res.error && res.data) {
        setMemCtx(res.data as NovoMemoryContext);
        setMemories([
          ...(res.data.top_weaknesses ?? []),
          ...(res.data.recent_strengths ?? []),
        ] as NovoMemory[]);
      }
      setMemoriesLoaded(true);
    } catch (err) {
      console.error('[ChatPage] memory context load failed — greeting will be generic:', (err as Error)?.message);
      setMemoriesLoaded(true); // still unblock history load; just no personalisation this session
    }
  }

  useEffect(() => {
    if (!user || memoriesLoaded) return;
    loadMemoryContext();
  }, [user, memoriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load proactive message ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke('novo-proactive', {
          body: { action: 'get_pending', limit: 1 },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
        const msg = res.data?.messages?.[0] ?? null;
        if (msg) { setProactiveMsg(msg); setBannerVisible(true); }
      } catch { /* non-critical */ }
    })();
  }, [user]);

  // ── Load chat history ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || historyLoaded || !memoriesLoaded) return;
    (async () => {
      const { data, error } = await supabase
        .from('tutor_chats')
        .select('id, role, content, mode, personality, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(60);

      if (error) console.error('[ChatPage] history load error:', error.message);

      if (data && data.length > 0) {
        setMessages(data.map(row => ({
          id: row.id, role: row.role as 'user' | 'assistant',
          content: row.content,
          displayContent: parseConceptsFromResponse(row.content).displayContent,
          concepts: parseConceptsFromResponse(row.content).concepts,
          timestamp: new Date(row.created_at) })));
        const lastPersonality = data[data.length - 1].personality as NovoPersonality | null;
        if (lastPersonality && PERSONALITIES[lastPersonality]) setPersonality(lastPersonality);
      } else {
        const welcomeMsg = buildWelcomeMessage(profile?.novo_personality ?? 'dominie', firstName, memories, memCtx);
        setMessages([{ id: 'welcome', role: 'assistant', content: welcomeMsg, displayContent: welcomeMsg, concepts: [], timestamp: new Date() }]);
      }
      setHistoryLoaded(true);
    })();
  }, [user, historyLoaded, memoriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save memories on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const msgsToAnalyse = sessionMsgs.current;
      if (!user || msgsToAnalyse.length < 2) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        supabase.functions.invoke('novo-memory', {
          body: {
            action: 'save_from_session',
            messages: msgsToAnalyse.slice(-20).map(m => ({ role: m.role, content: m.displayContent ?? m.content })),
            source: 'chat' },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
      });
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, smartReplies]);

  // ── Offline model status listeners ───────────────────────────────────────
  useEffect(() => {
    const u1 = onModelStatusChange(setOfflineModelStatus);
    const u2 = onModelProgress(({ progress }) => setModelDownloadPct(progress));
    return () => { u1(); u2(); };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function buildWelcomeMessage(p: NovoPersonality, name: string, mems: NovoMemory[], ctx: NovoMemoryContext | null): string {
    const cfg       = PERSONALITIES[p];
    const struggle  = mems.find(m => m.memory_type === 'struggle');
    const milestone = mems.find(m => m.memory_type === 'milestone');
    const lastSession = ctx?.session_summaries?.[0];
    // Surface a specific weak topic from topic_stats if available
    const weakTopics = ctx?.topic_stats?.filter(s => s.struggle_count > s.win_count) ?? [];
    const topWeak = weakTopics[0];

    if (p === 'dominie') {
      const base = `${name}. Novo Dominie here — we work at a high level and we don't cut corners.`;
      if (topWeak) return `${base} You've struggled with **${topWeak.topic}** ${topWeak.struggle_count}x. We're fixing that today — from first principles.`;
      return struggle ? `${base} Last time you were struggling with ${struggle.topic ?? 'a concept'}. Let's go back to the root of it.` : `${base} What concept are we mastering today?`;
    }
    if (p === 'preceptor') {
      const base = `${name} — Novo Preceptor. Let's think strategically and build real depth today.`;
      if (topWeak) return `${base} I see **${topWeak.topic}** has been a recurring challenge — let's map out exactly where your understanding breaks down.`;
      if (lastSession) {
        const when = new Date(lastSession.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${base} Last time (${when}) we covered ${lastSession.summary.toLowerCase().replace(/^the student /i, '').slice(0, 60)}. Want to build on that?`;
      }
      return `${base} What's the big picture challenge we're solving today?`;
    }
    if (topWeak) return `Hey ${name}! I noticed you've been finding **${topWeak.topic}** tricky (${topWeak.struggle_count} struggles). Want to nail it today?`;
    if (lastSession) {
      const when = new Date(lastSession.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      return `Hey ${name}! Last time (${when}) we ${lastSession.summary.toLowerCase().replace(/^the student /i, '').slice(0, 80)}. Want to continue from there?`;
    }
    if (milestone) return `Hey ${name}! Great work on ${milestone.content.toLowerCase()}. Ready to keep that momentum going?`;
    if (struggle)  return `Hey ${name}! I remember you were working on ${struggle.topic ?? struggle.content.split(' ').slice(0, 5).join(' ')}. Want to pick that up today?`;
    return `Hey ${name}! I'm Novo in ${cfg.label} mode. What are we tackling today?`;
  }

  async function persistMessage(role: 'user' | 'assistant', content: string, p: NovoPersonality) {
    if (!user) return;
    const { error } = await supabase.from('tutor_chats').insert({
      user_id: user.id, role, content,
      mode: p === 'preceptor' ? 'friend' : 'teacher',
      personality: p });
    if (error) console.error('[ChatPage] persistMessage error:', error.message);
  }

  const fetchSmartReplies = useCallback(async (msgs: Message[]) => {
    setSmartReplies([]); setSmartRepliesLoading(true);
    try {
      const log: SmartReplyMessage[] = msgs.slice(-6).map((m, i) => ({
        text: m.displayContent ?? m.content, isLocal: m.role === 'user',
        userId: m.role === 'user' ? 'local' : 'novo', timestamp: m.timestamp.getTime() + i }));
      setSmartReplies(await getSmartReplies(log));
    } catch { setSmartReplies([]); }
    finally { setSmartRepliesLoading(false); }
  }, []);

  async function handleDismissProactive() {
    setBannerVisible(false);
    if (!proactiveMsg || !user) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.functions.invoke('novo-proactive', {
      body: { action: 'mark_read', message_id: proactiveMsg.id },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
  }

  async function changePersonality(p: NovoPersonality) {
    const previous = personality; // capture for rollback
    setPersonality(p);            // optimistic update — UI feels instant

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ novo_personality: p })
        .eq('id', user.id);

      if (error) {
        console.error('[changePersonality] DB update failed — reverting:', error.message);
        setPersonality(previous); // rollback so next session doesn't silently revert
        return;
      }
    }

    const cfg = PERSONALITIES[p];
    const switchMsg: Message = {
      id: `switch-${Date.now()}`, role: 'assistant',
      content: `Switched to **${cfg.label}**. ${
        p === 'dominie' ? `Standards are high, ${firstName}. Let's build real understanding — no shortcuts.` :
        p === 'preceptor' ? `Good choice, ${firstName}. Let's think strategically and go deep where it matters.` :
        `Ready when you are, ${firstName}!`
      }`,
      timestamp: new Date() };
    setMessages(prev => [...prev, switchMsg]);
  }

  // ── Quiz generation ──────────────────────────────────────────────────────

  async function handleQuizIntent(topic: string, _userMsgId: string) {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('gemini-chat', {
        body: {
          prompt: `Generate a 5-question multiple-choice quiz on: "${topic}".

Return ONLY valid JSON (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "...",
      "options": ["A text", "B text", "C text", "D text"],
      "correctIndex": 0,
      "explanation": "Brief explanation why the correct answer is right."
    }
  ]
}`,
          systemInstruction: 'You are an expert quiz generator. Return ONLY valid JSON. No markdown. No code blocks. No extra text.' },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });

      let parsed: { questions: QuizQuestion[] } = { questions: [] };
      try {
        const raw = (res.data?.text ?? '').trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        parsed = JSON.parse(raw);
      } catch { /* keep empty questions */ }

      if (!parsed.questions?.length) {
        throw new Error('Could not generate quiz. Try again?');
      }

      const quizMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Quiz: ${topic}`,
        displayContent: `Quiz: ${topic}`,
        quizData: { questions: parsed.questions, topic },
        concepts: [],
        timestamp: new Date() };
      setMessages(prev => [...prev, quizMsg]);
      sessionMsgs.current = [...sessionMsgs.current, quizMsg];
      Events.chatMessageSent({ personality, language, hasNcertContext: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quiz generation failed. Please try again.';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: msg, displayContent: msg, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuizComplete(score: number, total: number, wrongIndices: number[], quizData: { questions: QuizQuestion[]; topic: string }) {
    const pct = Math.round((score / total) * 100);
    const won = pct >= 60;

    // Track topic stat
    if (user) {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('novo-memory', {
        body: {
          action: 'upsert_topic_stat',
          subject: 'General',
          topic: quizData.topic,
          won },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
    }

    // Novo's follow-up after quiz
    const followUpMsg: Message = {
      id: `quiz-result-${Date.now()}`, role: 'assistant',
      content: pct >= 80
        ? `Excellent! ${score}/${total} on ${quizData.topic}. You clearly understand this. Want me to try harder questions?`
        : pct >= 60
        ? `Good effort! ${score}/${total} on ${quizData.topic}. Let's revisit the ones you missed — want a quick explanation?`
        : `${score}/${total} on ${quizData.topic}. That's okay — let's break down what tripped you up. Which one felt hardest?`,
      timestamp: new Date() };
    const { displayContent, concepts } = parseConceptsFromResponse(followUpMsg.content);
    followUpMsg.displayContent = displayContent;
    followUpMsg.concepts = concepts;
    setMessages(prev => [...prev, followUpMsg]);
  }

  // ── Snap & Solve ─────────────────────────────────────────────────────────
  // Uses gemini-vision action:'solve_problem' for structured step-by-step output.
  // The result is formatted as markdown so it renders inline with steps.

  async function handleSnapSolve(source: typeof CameraSource.Camera | typeof CameraSource.Photos = CameraSource.Camera) {
    if (snapSolving) return;
    try {
      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source,
        quality: 85,
        allowEditing: false });
      if (!photo.dataUrl) return;

      const userMsg: Message = {
        id: Date.now().toString(), role: 'user',
        content: source === CameraSource.Photos ? '[Solve this problem from my gallery]' : '[Solve this problem from my photo]',
        displayContent: source === CameraSource.Photos ? '[Solve this problem from my gallery]' : '[Solve this problem from my photo]',
        timestamp: new Date() };
      setMessages(prev => [...prev, userMsg]);
      setSmartReplies([]);
      setSnapSolving(true);
      setLoading(true);
      sessionMsgs.current = [...sessionMsgs.current, userMsg];

      const { data: { session } } = await supabase.auth.getSession();

      // Use structured solve_problem action for step-by-step output
      const res = await supabase.functions.invoke('gemini-vision', {
        body: { action: 'solve_problem', image: photo.dataUrl },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });

      let solution: string;
      if (res.data?.steps && Array.isArray(res.data.steps)) {
        // Format structured result as rich markdown for inline display
        const d = res.data as {
          subject_detected?: string;
          problem_statement?: string;
          steps: Array<{ step_number: number; title: string; explanation: string }>;
          final_answer?: string;
          concept_summary?: string;
          common_mistakes?: string[];
        };

        const parts: string[] = [];
        if (d.subject_detected) parts.push(`**${d.subject_detected}**`);
        if (d.problem_statement) parts.push(`\n${d.problem_statement}\n`);
        parts.push('**Step-by-step solution:**');
        d.steps.forEach(s => parts.push(`\n**Step ${s.step_number}: ${s.title}**\n${s.explanation}`));
        if (d.final_answer) parts.push(`\n**Answer:** ${d.final_answer}`);
        if (d.concept_summary) parts.push(`\n*${d.concept_summary}*`);
        if (d.common_mistakes?.length) {
          parts.push('\n**Common mistakes:**');
          d.common_mistakes.forEach(m => parts.push(`• ${m}`));
        }
        parts.push('\n\nWant me to quiz you on this, or explain any step further?');
        solution = parts.join('\n');
      } else {
        // Fallback if edge fn returns plain text
        solution = res.data?.text ?? "Sorry, I couldn't read the image clearly. Try a clearer photo with better lighting.";
      }

      const { displayContent, concepts } = parseConceptsFromResponse(solution);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: solution, displayContent, concepts, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
      sessionMsgs.current = [...sessionMsgs.current, assistantMsg];
      persistMessage('user', userMsg.content, personality);
      persistMessage('assistant', solution, personality);
      if (autoSpeak) speak(displayContent, assistantMsg.id);
      await fetchSmartReplies([...messages, userMsg, assistantMsg]);
    } catch (err) {
      // User cancelled camera — silent
      if ((err as Error)?.message?.includes('cancelled') || (err as Error)?.message?.includes('dismissed')) return;
      if (Capacitor.isNativePlatform()) {
        Toast.show({ text: 'Could not open camera. Please try again.' });
      }
    } finally {
      setSnapSolving(false);
      setLoading(false);
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading || rateLimitCountdown > 0) return;

    // Check free-tier daily AI limit
    const proActive = (!!profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()))
      || (user?.created_at ? isInFreeTrial(user.created_at) : false);
    if (!proActive && aiUsageCount >= FREE_AI_DAILY_LIMIT) {
      setShowAiLimitSheet(true);
      return;
    }

    const sendStartMs = Date.now();

    // Detect quiz intent — handle separately
    const quizCheck = detectQuizIntent(content);

    const userMsg: Message = {
      id: Date.now().toString(), role: 'user',
      content, displayContent: content, timestamp: new Date() };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInput('');
    setSmartReplies([]);
    setLoading(true);
    sessionMsgs.current = [...sessionMsgs.current, userMsg];
    persistMessage('user', content, personality);

    // Increment follow_up_count on the previous AI response (follow-up signal for flywheel)
    if (lastInteractionId.current && user) {
      void supabase.rpc('increment_follow_up', { p_interaction_id: lastInteractionId.current }).then(undefined, () => {});
    }

    if (quizCheck.detected) {
      await handleQuizIntent(quizCheck.topic, userMsg.id);
      return;
    }

    try {
      // Mood detection from last 5 user messages
      const recentUserMsgs = updatedMsgs
        .filter(m => m.role === 'user')
        .slice(-5)
        .map(m => m.content);
      const mood = detectMood(recentUserMsgs);
      setMoodState(mood);

      // Language + NCERT pipeline
      const isEnglish = language === 'en';
      const englishContent = isEnglish ? content : await translateText(content, 'en', language);
      const ncertContext = await fetchNcertContext(englishContent);

      const studyCtxBlock = buildStudyContextBlock(studyCtx);
      let systemPrompt = buildSystemPrompt(personality, memCtx, mood, checkInMood, studyCtxBlock, profile);
      if (ncertContext.text) {
        systemPrompt += `\n\n=== Relevant NCERT Reference ===\n${ncertContext.text}\n\nCite chapter/subject naturally when relevant.`;
      }
      if (!isEnglish) {
        systemPrompt += `\n\nIMPORTANT: Reply in ${language}. You may include key English terms/formulas in parentheses.`;
      }

      const history = updatedMsgs.slice(-10, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model',
        text: m.displayContent ?? m.content }));

      // Insert a streaming placeholder so words appear token-by-token
      const streamingId = `streaming_${Date.now()}`;
      setMessages(prev => [...prev, {
        id: streamingId, role: 'assistant',
        content: '', displayContent: '', concepts: [], timestamp: new Date() }]);

      const reply = await streamMessage(englishContent, {
        systemInstruction: systemPrompt,
        history,
        personality,
        last_chunk_ids: lastChunkIdsRef.current,
        onChunkIds:     (ids) => { lastChunkIdsRef.current = ids; } });
      const rawReply = resolveDrawTags(reply);
      const resolvedReply = user ? await parseAndExecuteActions(rawReply, user.id) : rawReply;
      const { displayContent, concepts } = parseConceptsFromResponse(resolvedReply);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: resolvedReply, displayContent, concepts,
        ncertSources: ncertContext.sources.length ? ncertContext.sources : undefined,
        timestamp: new Date() };
      // Replace the streaming placeholder with the final processed message
      const finalMsgs = [...updatedMsgs, assistantMsg];
      setMessages(finalMsgs);
      sessionMsgs.current = [...sessionMsgs.current, assistantMsg];
      persistMessage('assistant', resolvedReply, personality);

      // Increment daily usage counter for free users
      if (!proActive && user) {
        const key = `edora_ai_daily_${user.id}_${new Date().toISOString().slice(0, 10)}`;
        const next = aiUsageCount + 1;
        setAiUsageCount(next);
        localStorage.setItem(key, String(next));
        if (next >= FREE_AI_DAILY_LIMIT) setTimeout(() => setShowAiLimitSheet(true), 900);
      }

      // Log to ai_interactions flywheel — async, non-blocking
      if (user) {
        logAIInteraction({
          userId:      user.id,
          sessionType: 'chat',
          userQuery:   content,
          aiResponse:  resolvedReply,
          subject:     studyCtx?.recentQuizTopics?.[0]?.topic?.split(' ')?.[0] ?? undefined,
          topic:       concepts[0] ?? undefined,
          modelUsed:   'gemini-2.0-flash',
          responseMs:  Date.now() - sendStartMs,
          language }).then(interactionId => {
          if (interactionId) {
            lastInteractionId.current = interactionId;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, interactionId } : m
            ));
          }
        });
      }

      // Cache response for offline fallback
      writeSessionCache(content, resolvedReply).catch(() => {});

      // Auto-speak
      if (autoSpeak) speak(displayContent, assistantMsg.id);

      // Track concept explorations
      if (concepts.length && user) {
        const { data: { session } } = await supabase.auth.getSession();
        concepts.forEach(c => {
          supabase.functions.invoke('novo-memory', {
            body: { action: 'track_concept', concept: c },
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
        });
      }

      Events.chatMessageSent({ personality, language, hasNcertContext: !!ncertContext.text });
      await fetchSmartReplies(finalMsgs);
    } catch (err) {
      // ── Tier 4a/4b: IndexedDB session cache + seed QA ──
      const offlineHit = await getOfflineFallback(content).catch(() => null);
      if (offlineHit) {
        const offlineMsg: Message = {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: offlineHit, displayContent: offlineHit, concepts: [], timestamp: new Date() };
        setMessages(prev => [...prev.filter(m => m.id !== `streaming_${Date.now()}`), offlineMsg]);
        sessionMsgs.current = [...sessionMsgs.current, offlineMsg];
        setLoading(false);
        return;
      }

      // ── Tier 4c: Static BM25 question bank ──
      const bm25Hit = getBestFallbackAnswer(content);
      if (bm25Hit) {
        const bm25Msg: Message = {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: bm25Hit, displayContent: bm25Hit, concepts: [], timestamp: new Date() };
        setMessages(prev => [...prev.filter(m => m.id !== `streaming_${Date.now()}`), bm25Msg]);
        sessionMsgs.current = [...sessionMsgs.current, bm25Msg];
        setLoading(false);
        return;
      }

      // ── Tier 5: ONNX offline model ──
      if (isModelReady()) {
        try {
          const offlineAnswer = await inferOffline(content);
          if (offlineAnswer.trim()) {
            const onnxText = `${offlineAnswer.trim()}\n\n---\n_Offline AI (Tier 5) — limited reasoning. Reconnect for full Novo._`;
            const onnxMsg: Message = {
              id: (Date.now() + 1).toString(), role: 'assistant',
              content: onnxText, displayContent: onnxText, concepts: [], timestamp: new Date() };
            setMessages(prev => [...prev.filter(m => m.id !== `streaming_${Date.now()}`), onnxMsg]);
            sessionMsgs.current = [...sessionMsgs.current, onnxMsg];
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }

      // ── All tiers exhausted — show error + model download prompt ──
      let msg = 'Connection issue. Please try again.';
      const errMsg = err instanceof Error ? err.message : '';
      if (err instanceof GeminiRateLimitError) msg = 'Too many requests. Please wait a moment.';
      else if (err instanceof GeminiTimeoutError) msg = 'The AI is taking too long. Please try again.';
      else if (err instanceof GeminiNetworkError) msg = 'No internet connection. Check your network.';
      else if (errMsg.includes('high demand') || errMsg.includes('wait')) {
        const secs = 30;
        setRateLimitCountdown(secs);
        if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = setInterval(() => {
          setRateLimitCountdown(prev => {
            if (prev <= 1) { clearInterval(rateLimitTimerRef.current!); return 0; }
            return prev - 1;
          });
        }, 1000);
        msg = errMsg;
      } else if (err instanceof Error) msg = errMsg;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: msg, displayContent: msg, timestamp: new Date() }]);
      // Nudge user to download offline model if not already available
      if (!isModelReady()) setShowModelPrompt(true);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const cfg = PERSONALITIES[personality];
  const isPro = (!!profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()))
    || (user?.created_at ? isInFreeTrial(user.created_at) : false);

  // Mood indicator color
  const moodColor = moodState === 'frustrated' ? '#F87171' : moodState === 'flow' ? '#10B981' : undefined;

  return (
    <div className="flex flex-col h-full" data-feature="chat" style={{ background: 'transparent' }}>

      {/* ── Header ── */}
      <div className="page-hero px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/home" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90"
            style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-100)' }}>
            <ArrowLeft size={18} className="text-white" strokeWidth={1.75} />
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-extrabold text-white text-lg leading-tight">Novo AI</h2>
            <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: moodColor ?? '#10B981' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: moodColor ?? '#10B981' }} />
              {cfg.label} Mode
              {moodState === 'frustrated' && ' · Encouragement on'}
              {moodState === 'flow' && ' · You\'re in flow!'}
            </p>
          </div>

          {/* Auto-speak toggle */}
          <button
            onClick={() => setAutoSpeak(v => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-all"
            style={{
              background: autoSpeak ? 'rgba(16,185,129,0.15)' : 'var(--ink-060)',
              border: `1px solid ${autoSpeak ? 'rgba(16,185,129,0.4)' : 'var(--ink-100)'}` }}
            aria-label={autoSpeak ? 'Auto-speak on' : 'Auto-speak off'}>
            {autoSpeak
              ? <Volume2 size={15} color="#10B981" />
              : <VolumeX size={15} color="var(--ink-400)" />
            }
          </button>

          {/* Memory panel button */}
          <button
            onClick={() => setMemPanelOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 relative active:scale-90 transition-all"
            style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.25)' }}
            aria-label="Novo's memory">
            <Sparkles size={15} className="text-primary" />
            {(memCtx?.top_weaknesses?.length ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: '#EF4444' }}>
                {memCtx!.top_weaknesses.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Personality cards ── */}
      <PersonalityCards current={personality} onSelect={p => {
        setPersonality(p);
        const welcomeMsg = buildWelcomeMessage(p, firstName, memories, memCtx);
        setMessages([{ id: `welcome-${p}`, role: 'assistant', content: welcomeMsg, displayContent: welcomeMsg, concepts: [], timestamp: new Date() }]);
        setSmartReplies([]);
      }} />

      {/* ── Proactive Banner ── */}
      <AnimatePresence>
        {bannerVisible && proactiveMsg && (
          <ProactiveBanner msg={proactiveMsg} onDismiss={handleDismissProactive} />
        )}
      </AnimatePresence>

      {/* ── Messages ── */}
      <div className="flex-1 native-scroll px-4 py-3 flex flex-col gap-3"
        style={{ background: 'transparent' }}>

        {!historyLoaded && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {/* ── Rich empty state: shown when only welcome msg exists ── */}
        <AnimatePresence>
          {historyLoaded && messages.length === 1 && messages[0].id.startsWith('welcome') && (() => {
            const weakTopics = (memCtx?.top_weaknesses ?? [])
              .map(w => w.topic ?? w.content.split(' ').slice(0, 3).join(' '))
              .filter(Boolean);
            const chips = getPersonalisedChips(studyCtx, weakTopics, profile?.exam_name ?? null);
            return (
              <NovoEmptyState
                key="empty-state"
                firstName={firstName}
                examName={profile?.exam_name ?? null}
                streak={profile?.streak_count ?? 0}
                personality={personality}
                personalityLabel={cfg.label}
                personalityGradient={cfg.gradient}
                studyCtx={studyCtx}
                memCtx={memCtx}
                chips={chips}
                onChipSelect={text => { setInput(text); }}
              />
            );
          })()}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {messages.map((msg, msgIdx) => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>

              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-1"
                  style={{ background: cfg.gradient }}>
                  <cfg.icon size={14} className="text-white" strokeWidth={2} />
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[78%]">
                {/* Quiz embed */}
                {msg.role === 'assistant' && msg.quizData ? (
                  <InlineQuizEmbed
                    questions={msg.quizData.questions}
                    topic={msg.quizData.topic}
                    onComplete={(score, total, wrongIndices) =>
                      handleQuizComplete(score, total, wrongIndices, msg.quizData!)
                    }
                  />
                ) : (
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'text-white rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={msg.role === 'user'
                      ? {
                          background: 'var(--v2-primary-tint-2)',
                          border: '1px solid var(--v2-primary)',
                          color: 'var(--v2-text-1)' }
                      : {
                          background: 'var(--v2-card)',
                          border: '1px solid var(--v2-border)',
                          color: 'var(--v2-text-1)' }
                    }>
                    {msg.id.startsWith('streaming_') ? (
                      streamingText
                        ? <NovoMarkdown content={streamingText} isStreaming={true} />
                        : <span className="opacity-40 animate-pulse">●●●</span>
                    ) : (
                      <NovoMarkdown
                        content={msg.displayContent ?? msg.content}
                        isUser={msg.role === 'user'}
                      />
                    )}
                    {msg.id.startsWith('streaming_') && isStreaming && streamingText && (
                      <span className="inline-block w-0.5 h-3.5 bg-white/70 ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                )}

                {/* Assistant action row: TTS + Flashcard save + AI Feedback */}
                {msg.role === 'assistant' && !msg.quizData && (() => {
                  const ttsState = getState(msg.id);
                  // Find the previous user message for flashcard front
                  const prevUserMsg = messages.slice(0, msgIdx).reverse().find(m => m.role === 'user');
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* TTS button */}
                      <button onClick={() => speak(msg.displayContent ?? msg.content, msg.id)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all active:scale-95"
                        style={{
                          color: ttsState === 'playing' ? '#5B6AF5' : '#94a3b8',
                          background: ttsState !== 'idle' ? 'rgba(91,106,245,0.08)' : 'transparent' }}>
                        {ttsState === 'loading' && <Loader2 size={12} className="animate-spin" />}
                        {ttsState === 'playing' && <><Square size={11} fill="currentColor" /><span>Stop</span></>}
                        {ttsState === 'idle'    && <><AiAudioIcon size={12} /><span>Listen</span></>}
                      </button>

                      {/* Save as flashcard */}
                      {msg.id !== 'welcome' && prevUserMsg && (
                        <button
                          onClick={() => setFlashcardSheet({
                            messageId: msg.id,
                            front: prevUserMsg.content,
                            back: msg.displayContent ?? msg.content })}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all active:scale-95"
                          style={{ color: '#94a3b8' }}>
                          <BookOpen size={11} />
                          <span>Save</span>
                        </button>
                      )}

                      {/* AI Feedback — only for logged interactions */}
                      {msg.interactionId && (
                        <AIFeedback
                          interactionId={msg.interactionId}
                          topic={msg.concepts?.[0] ?? undefined}
                          compact
                        />
                      )}
                    </div>
                  );
                })()}

                {/* NCERT sourcing — trust signal: show exactly where the answer is grounded */}
                {msg.role === 'assistant' && (msg.ncertSources?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {msg.ncertSources!.map((s, i) => (
                      <span key={i}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(91,106,245,0.1)', color: '#A0AEFF', border: '1px solid rgba(91,106,245,0.2)' }}>
                        <BookOpen size={10} />
                        Sourced from NCERT{s.class_num ? ` Class ${s.class_num}` : ''} — {s.subject}, {s.chapter_title}
                      </span>
                    ))}
                  </div>
                )}

                {/* Concept pills */}
                {msg.role === 'assistant' && (msg.concepts?.length ?? 0) > 0 && (
                  <ConceptPills
                    concepts={msg.concepts!}
                    onTap={concept => {
                      // Track concept visit via edge function
                      if (user) {
                        supabase.auth.getSession().then(({ data: { session } }) => {
                          supabase.functions.invoke('novo-memory', {
                            body: { action: 'track_concept', concept },
                            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).catch(() => {});
                        });
                      }
                      sendMessage(`Tell me more about ${concept}`);
                    }}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: cfg.gradient }}>
              <span className="text-sm">{cfg.emoji}</span>
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center"
              style={{
                background: 'var(--ink-055)',
                backdropFilter: 'blur(28px) saturate(160%)',
                WebkitBackdropFilter: 'blur(28px) saturate(160%)',
                border: '1px solid var(--ink-100)',
                boxShadow: 'inset 0 1px 0 var(--ink-100)' }}>
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

      <div className="relative z-10 shrink-0">
        <SmartReplyChips suggestions={smartReplies} onSelect={s => { setSmartReplies([]); sendMessage(s); }} loading={smartRepliesLoading} />
      </div>

      {/* ── Offline AI download prompt ── */}
      <AnimatePresence>
        {showModelPrompt && offlineModelStatus !== 'ready' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="mx-4 mb-2 px-3 py-2 rounded-xl flex items-center gap-2 text-xs"
            style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.25)' }}>
            <Download size={14} style={{ color: '#A0AEFF' }} strokeWidth={1.8} />
            <span className="flex-1 text-white/70">
              {offlineModelStatus === 'downloading'
                ? `Downloading offline AI… ${modelDownloadPct}%`
                : 'Download offline AI (~80MB) for answers without internet.'}
            </span>
            {offlineModelStatus === 'downloading' ? (
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-100)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${modelDownloadPct}%`, background: '#5B6AF5' }} />
              </div>
            ) : (
              <button
                onClick={() => { initOfflineModel().catch(() => {}); }}
                className="px-2.5 py-1 rounded-lg font-semibold text-white transition-all active:scale-95"
                style={{ background: '#5B6AF5', fontSize: 12 }}>
                Download
              </button>
            )}
            <button onClick={() => setShowModelPrompt(false)} className="text-white/30 hover:text-white/60 ml-1">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Free AI usage counter pill ── */}
      {!isPro && aiUsageCount > 0 && aiUsageCount < FREE_AI_DAILY_LIMIT && (
        <div className="px-4 pb-1.5 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--ink-300)' }}>
            {FREE_AI_DAILY_LIMIT - aiUsageCount} of {FREE_AI_DAILY_LIMIT} free answers left today
          </span>
          <button
            onClick={() => navigate('/pro')}
            className="text-xs font-semibold active:opacity-60 transition-opacity"
            style={{ color: '#A855F7' }}
          >
            Go unlimited →
          </button>
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-4 py-3 shrink-0 pb-nav"
        style={{
          background: 'var(--surface-scrim)',
          backdropFilter: 'blur(48px) saturate(180%) brightness(1.04)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%) brightness(1.04)',
          borderTop: '1px solid var(--ink-080)',
          boxShadow: '0 -1px 0 var(--ink-050), 0 -8px 32px rgba(0,0,0,0.45)' }}>
        <div className="flex items-center gap-2">
          {/* Camera / Snap & Solve — long-press or hold opens gallery option */}
          <button
            onClick={() => handleSnapSolve(CameraSource.Camera)}
            onContextMenu={e => { e.preventDefault(); handleSnapSolve(CameraSource.Photos); }}
            disabled={snapSolving || loading}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 shrink-0 disabled:opacity-40 v2-card"
            style={{ background: snapSolving ? 'var(--v2-primary-tint-2)' : 'var(--v2-card)', border: `1px solid ${snapSolving ? 'var(--v2-primary)' : 'var(--v2-border)'}` }}
            aria-label="Snap & Solve — long-press for gallery">
            {snapSolving ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--v2-text-1)' }} /> : <Camera size={16} color="var(--v2-text-4)" />}
          </button>

          {/* Voice mic */}
          {voiceAvailable && (isPro ? (
            <button onClick={() => setVoiceOpen(true)}
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 shrink-0"
              style={{ background: cfg.gradient, boxShadow: '0 4px 14px rgba(91,106,245,0.35)' }}
              aria-label="Voice study mode">
              <Mic size={18} className="text-white" strokeWidth={2} />
            </button>
          ) : (
            <div
              className="w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 relative opacity-40"
              style={{ background: 'linear-gradient(135deg, #94a3b8, #64748b)' }}
              aria-label="Voice mode">
              <Mic size={14} className="text-white" strokeWidth={2} />
            </div>
          ))}

          {/* Text input */}
          <div className="rounded-2xl flex items-center gap-2 px-4 h-11 flex-1"
            style={{ background: 'var(--v2-card)', border: '1px solid var(--v2-border)' }}>
            <input
              type="text"
              placeholder="Ask Novo or say &quot;quiz me on…&quot;"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--v2-text-4)]"
              style={{ color: 'var(--v2-text-1)', WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            {rateLimitCountdown > 0 ? (
              <span className="text-xs px-2 v2-tnum" style={{ color: 'var(--v2-text-4)' }}>{rateLimitCountdown}s</span>
            ) : (
              <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 v2-btn-primary">
                <SendIcon size={14} className="text-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showPersonalitySheet && (
          <PersonalitySheet
            current={personality}
            onSelect={changePersonality}
            onClose={() => setShowPersonalitySheet(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memPanelOpen && memCtx && (
          <NovoMemoryPanel
            context={memCtx}
            onClose={() => setMemPanelOpen(false)}
            onRefresh={() => { setMemoriesLoaded(false); setMemPanelOpen(false); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flashcardSheet && user && (
          <FlashcardSaveSheet
            messageId={flashcardSheet.messageId}
            front={flashcardSheet.front}
            back={flashcardSheet.back}
            userId={user.id}
            onClose={() => setFlashcardSheet(null)}
            onSaved={() => {
              setFlashcardSheet(null);
              if (Capacitor.isNativePlatform()) {
                Toast.show({ text: '✅ Flashcard saved!' });
              }
            }}
          />
        )}
      </AnimatePresence>

      <VoiceStudyOverlay
        visible={voiceOpen}
        mode={personality === 'preceptor' ? 'friend' : 'teacher'}
        userId={user?.id ?? null}
        onClose={() => setVoiceOpen(false)}
        langOption={langOption}
      />

      {/* ── AI limit paywall sheet ── */}
      <AnimatePresence>
        {showAiLimitSheet && !isPro && (
          <motion.div className="fixed inset-0 z-[9000] flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowAiLimitSheet(false)} />
            <motion.div
              className="relative w-full rounded-t-3xl px-5 pt-5 pb-10 flex flex-col gap-5"
              style={{ background: 'var(--hdr-a-960)', borderTop: '1px solid rgba(124,58,237,0.25)' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
              <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'var(--ink-100)' }} />
              <button onClick={() => setShowAiLimitSheet(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--ink-060)' }}>
                <Square size={14} className="text-white/50" />
              </button>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)' }}>
                  <Crown size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Crown size={11} style={{ color: '#A855F7' }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A855F7' }}>Pro Feature</span>
                  </div>
                  <h3 className="font-heading text-lg font-bold text-white leading-tight">Unlimited AI Answers</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-500)' }}>
                    You've used all {FREE_AI_DAILY_LIMIT} free AI answers today. Upgrade for unlimited daily conversations with Novo.
                  </p>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => { setShowAiLimitSheet(false); navigate('/pro'); }}
                className="w-full h-12 rounded-2xl font-heading font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}>
                <Crown size={15} /> Upgrade to Pro
              </motion.button>
              <p className="text-center text-xs" style={{ color: 'var(--ink-300)' }}>
                From ₹58/month · Cancel anytime
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Emotional Check-In ── */}
      <AnimatePresence>
        {showCheckIn && user && (
          <EmotionalCheckIn
            userId={user.id}
            firstName={firstName}
            onComplete={(mood) => {
              setCheckInMood(mood);
              setShowCheckIn(false);
              // Surface a mood-aware welcome message after check-in
              const moodWelcomes: Record<CheckInMood, string> = {
                focused:   `Focused mode activated! Let's make today count. What are we working on?`,
                motivated: `I love the energy! Let's go hard today. What's first on the list?`,
                tired:     `Totally get it — we'll keep sessions short and sharp today. Small wins count. What do you want to start with?`,
                stressed:  `Hope that helped a little. We'll take it one step at a time. What's weighing on you academically?` };
              const welcomeMsg = moodWelcomes[mood];
              setMessages(prev => [...prev, {
                id: `checkin-${Date.now()}`, role: 'assistant',
                content: welcomeMsg, displayContent: welcomeMsg, concepts: [], timestamp: new Date() }]);
            }}
            onSkip={() => setShowCheckIn(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
