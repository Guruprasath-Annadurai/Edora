import { useState, useEffect, useRef, memo } from 'react';
import { SkeletonTopWeakness } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronLeft, CheckCircle, XCircle, Zap, Star, Flame, AlertTriangle, Lightbulb, HelpCircle, Clock, Dices, Trophy, Meh, Loader2 } from 'lucide-react';
import { PeerPercentile } from '@/components/quiz/PeerPercentile';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Toast } from '@capacitor/toast';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON, geminiCall } from '@/lib/gemini';
import { OfflineCache } from '@/lib/offlineCache';
import { SyncQueue } from '@/lib/syncQueue';
import { track } from '@/lib/analytics';
import { loadUnlockedIds, checkAchievements } from '@/lib/achievements';
import { scoreQuiz } from '@/lib/quizScoring';
import type { QuizQuestion } from '@/types';

interface QuizDraft {
  topic: string;
  count: number;
  questions: QuizQuestion[];
  current: number;
  answers: number[];
  savedAt: number;
}

function draftKey(userId: string) { return `edora_quiz_draft_${userId}`; }

type Phase = 'setup' | 'loading' | 'quiz' | 'result';

// ── Option letter labels ──────────────────────────────────────────────────────
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ── Subject colour map (used for topic chip) ──────────────────────────────────
function subjectColor(topic: string): { bg: string; text: string; border: string } {
  const t = topic.toLowerCase();
  if (t.includes('math') || t.includes('algebra') || t.includes('calculus'))
    return { bg: 'rgba(59,130,246,0.12)', text: '#93C5FD', border: 'rgba(59,130,246,0.3)' };
  if (t.includes('physics') || t.includes('motion') || t.includes('force') || t.includes('wave'))
    return { bg: 'rgba(124,58,237,0.12)', text: '#C4B5FD', border: 'rgba(124,58,237,0.3)' };
  if (t.includes('chem') || t.includes('reaction') || t.includes('element'))
    return { bg: 'rgba(16,185,129,0.12)', text: '#6EE7B7', border: 'rgba(16,185,129,0.3)' };
  if (t.includes('bio') || t.includes('cell') || t.includes('genetics'))
    return { bg: 'rgba(34,197,94,0.12)', text: '#86EFAC', border: 'rgba(34,197,94,0.3)' };
  if (t.includes('history') || t.includes('civil'))
    return { bg: 'rgba(251,191,36,0.12)', text: '#FDE68A', border: 'rgba(251,191,36,0.3)' };
  return { bg: 'rgba(91,106,245,0.12)', text: '#A0AEFF', border: 'rgba(91,106,245,0.3)' };
}

// ── Score colour helper ───────────────────────────────────────────────────────
function scoreColor(score: number, total: number) {
  const pct = score / total;
  if (pct >= 0.8) return { label: 'Excellent!', color: '#34D399', gradient: 'linear-gradient(135deg,#10B981,#059669)' };
  if (pct >= 0.6) return { label: 'Good job!',  color: '#A0AEFF', gradient: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' };
  return           { label: 'Keep going!',       color: '#FBBF24', gradient: 'linear-gradient(135deg,#F59E0B,#EF4444)' };
}

// Memoized option button — avoids re-rendering all 4 options on every tick
// of unrelated state (XP pop animation, concept modal, etc.)
const QuizOptionButton = memo(function QuizOptionButton({
  option, index, isCorrect, isSelected, revealed, onSelect,
}: {
  option: string; index: number; isCorrect: boolean; isSelected: boolean; revealed: boolean;
  onSelect: (i: number) => void;
}) {
  let bg = 'var(--v2-card)';
  let border = 'var(--v2-border)';
  let textColor = 'var(--v2-text-1)';
  let labelBg = 'var(--v2-primary-tint-2)';
  let labelColor = 'var(--v2-primary)';

  if (revealed) {
    if (isCorrect) {
      bg = 'rgba(16,185,129,0.10)';
      border = 'var(--v2-success)';
      labelBg = 'var(--v2-success)';
      labelColor = '#fff';
    } else if (isSelected) {
      bg = 'rgba(239,68,68,0.10)';
      border = 'var(--v2-error)';
      labelBg = 'var(--v2-error)';
      labelColor = '#fff';
      textColor = 'var(--v2-error-text)';
    }
  }

  return (
    <motion.button onClick={() => onSelect(index)}
      disabled={revealed}
      whileTap={{ scale: revealed ? 1 : 0.97 }}
      animate={revealed && isSelected && !isCorrect ? {
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.4 }
      } : {}}
      className="w-full text-left rounded-2xl p-4 transition-all"
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
      }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0 transition-all"
          style={{ background: labelBg, color: labelColor }}>
          {OPTION_LABELS[index]}
        </div>
        <span className="flex-1 text-sm font-semibold leading-snug" style={{ color: textColor }}>
          {option}
        </span>
        {revealed && isCorrect  && <CheckCircle size={18} className="shrink-0" style={{ color: '#34D399' }} />}
        {revealed && isSelected && !isCorrect && <XCircle size={18} className="shrink-0" style={{ color: '#F87171' }} />}
      </div>
    </motion.button>
  );
});

export default function QuizPage() {
  const { profile }       = useAuth();
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState<number | null>(null);
  const [answers, setAnswers]     = useState<number[]>([]);
  const [revealed, setRevealed]   = useState(false);
  const [genError, setGenError]   = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus,   setLoadStatus]   = useState('');
  const [xpPopVisible, setXpPopVisible] = useState(false);
  const [draft, setDraft]         = useState<QuizDraft | null>(null);

  // ── IRT / confidence tracking ─────────────────────────────────────────────
  const [confidence, setConfidence] = useState<Record<number, 'sure' | 'guessing'>>({});
  const [consecWrong, setConsecWrong] = useState(0);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [conceptExplanation, setConceptExplanation] = useState('');
  const [conceptLoading, setConceptLoading] = useState(false);

  // ── Deep explanation (Nemotron-backed cache, per question) ────────────────
  const [deepExplanations, setDeepExplanations] = useState<Record<number, string>>({});
  const [deepLoading, setDeepLoading] = useState<Record<number, boolean>>({});
  const [reportedIdx, setReportedIdx] = useState<Record<number, boolean>>({});

  // ── Per-question countdown timer ──────────────────────────────────────────
  const [qTimeLeft, setQTimeLeft] = useState<number | null>(null);
  const qTimerRef    = useRef<ReturnType<typeof setInterval>>();
  const timerPaused  = useRef(false);
  const bgEnteredAt  = useRef<number | null>(null);

  // ── App lifecycle: pause timer when backgrounded, resume when foregrounded ─
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: Promise<{ remove: () => void }> | null = null;
    listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        // App going to background — pause the per-question timer
        timerPaused.current = true;
        bgEnteredAt.current = Date.now();
        if (qTimerRef.current) clearInterval(qTimerRef.current);
      } else {
        // App coming back to foreground
        const elapsed = bgEnteredAt.current ? Math.floor((Date.now() - bgEnteredAt.current) / 1000) : 0;
        bgEnteredAt.current = null;
        timerPaused.current = false;
        // Deduct elapsed seconds — if gone > 30s treat as timeout
        setQTimeLeft(prev => {
          if (prev === null) return prev;
          const remaining = prev - elapsed;
          return remaining <= 0 ? 0 : remaining;
        });
      }
    });
    return () => { listener?.then(l => l.remove()).catch(() => {}); };
  }, []);

  // ── Novo Memory: top weakness for setup callout ───────────────────────────
  const [topWeakness, setTopWeakness]         = useState<string | null>(null);
  const [topWeaknessLoading, setTopWeaknessLoading] = useState(true);

  // ── Load draft + top weakness on mount ────────────────────────────────────
  useEffect(() => {
    if (!profile) return;

    function isValidDraft(d: QuizDraft) {
      return Date.now() - d.savedAt < 7 * 24 * 3_600_000 && d.questions.length > 0 && d.current < d.questions.length;
    }

    async function loadDraft() {
      // Try localStorage first (fast path)
      try {
        const stored = localStorage.getItem(draftKey(profile!.id));
        if (stored) {
          const d: QuizDraft = JSON.parse(stored);
          if (isValidDraft(d)) { setDraft(d); return; }
          localStorage.removeItem(draftKey(profile!.id));
        }
      } catch { /* corrupt — continue */ }

      // Fallback: Supabase user metadata (cross-device)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const remote = user?.user_metadata?.quiz_draft as QuizDraft | undefined;
        if (remote && isValidDraft(remote)) {
          setDraft(remote);
          try { localStorage.setItem(draftKey(profile!.id), JSON.stringify(remote)); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    loadDraft();

    // Load top weakness from Novo memories for setup callout
    supabase
      .from('novo_memories')
      .select('content, topic')
      .eq('user_id', profile.id)
      .eq('memory_type', 'struggle')
      .order('importance', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data?.topic) setTopWeakness(data.topic);
          else if (data?.content) setTopWeakness(data.content.slice(0, 60));
          setTopWeaknessLoading(false);
        },
        () => setTopWeaknessLoading(false),
      );
  }, [profile]);

  function saveDraft(q: QuizQuestion[], cur: number, ans: number[], tpc: string, cnt: number) {
    if (!profile) return;
    const d: QuizDraft = { topic: tpc, count: cnt, questions: q, current: cur, answers: ans, savedAt: Date.now() };
    try { localStorage.setItem(draftKey(profile.id), JSON.stringify(d)); } catch { /* storage full */ }
    // Cross-device sync via Supabase user metadata (fire-and-forget)
    supabase.auth.updateUser({ data: { quiz_draft: d } }).catch(() => {});
  }

  function clearDraft() {
    if (!profile) return;
    try { localStorage.removeItem(draftKey(profile.id)); } catch { /* ignore */ }
    supabase.auth.updateUser({ data: { quiz_draft: null } }).catch(() => {});
  }

  // ── Per-question 30s timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz') { clearInterval(qTimerRef.current); setQTimeLeft(null); return; }
    if (revealed) { clearInterval(qTimerRef.current); return; }
    setQTimeLeft(30);
    timerPaused.current = false;
    const id = setInterval(() => {
      if (timerPaused.current) return; // app is backgrounded — skip tick
      setQTimeLeft(t => {
        if (t === null || t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    qTimerRef.current = id;
    return () => clearInterval(id);
  }, [current, phase, revealed]);

  // Auto-expire when countdown reaches 0
  useEffect(() => {
    if (qTimeLeft !== 0 || revealed || phase !== 'quiz') return;
    setSelected(-1);
    setRevealed(true);
    setConsecWrong(c => c + 1);
    setConfidence(prev => ({ ...prev, [current]: 'guessing' }));
  }, [qTimeLeft, revealed, phase, current]);

  function resumeDraft() {
    if (!draft) return;
    setTopic(draft.topic);
    setCount(draft.count);
    setQuestions(draft.questions);
    setCurrent(draft.current);
    setAnswers(draft.answers);
    setSelected(null);
    setRevealed(false);
    setDraft(null);
    setPhase('quiz');
  }

  // Ground quiz generation in real NCERT textbook content when the topic
  // matches the existing curriculum corpus (274 chapters, class 6-12),
  // instead of always writing generic free-floating AI trivia. Falls back
  // to the plain prompt untouched if no real match is found — never blocks.
  async function fetchNcertGrounding(topicStr: string): Promise<string> {
    try {
      const { data } = await supabase.functions.invoke('novo-ncert', {
        body: { action: 'search', query: topicStr, count: 3 },
      });
      const results = (data?.results ?? []) as Array<{ content?: string; chapter_title?: string }>;
      if (!results.length) return '';
      return results.map(r => r.content).filter(Boolean).join('\n\n');
    } catch {
      return '';
    }
  }

  function buildQuizPrompt(topicStr: string, n: number, grounding: string): string {
    if (grounding) {
      return `Create ${n} MCQ questions about "${topicStr}", based STRICTLY on the real textbook content below — test the actual facts/concepts/examples present in this content, not generic trivia.

Textbook content:
${grounding}

Return ONLY valid JSON array with NO markdown: [{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}]. correct_answer is 0-indexed.`;
    }
    return `Create ${n} MCQ questions about "${topicStr}". Return ONLY valid JSON array with NO markdown: [{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}]. correct_answer is 0-indexed.`;
  }

  async function generateQuiz() {
    if (!topic.trim()) return;
    setGenError(''); clearDraft(); setDraft(null);
    setLoadProgress(0); setLoadStatus('Checking your cached questions…');
    setPhase('loading');
    try {
      // Try offline cache first for instant start
      const cachedQuestions = await OfflineCache.getQuizQuestions(topic, count);
      if (cachedQuestions.length >= count) {
        const qs = cachedQuestions.map((q, i) => ({
          id: q.id ?? `q${i}`, question: q.question,
          options: q.options, correct_answer: q.correct_idx,
          explanation: q.explanation,
        })) as QuizQuestion[];
        setQuestions(qs);
        setCurrent(0); setAnswers([]); setSelected(null); setRevealed(false);
        saveDraft(qs, 0, [], topic, count);
        setPhase('quiz');

        // Pre-generate fresh questions in the background for next time
        fetchNcertGrounding(topic).then(grounding =>
          geminiJSON<QuizQuestion[]>(buildQuizPrompt(topic, count, grounding))
        ).then(fresh => {
          if (Array.isArray(fresh)) {
            OfflineCache.cacheQuizQuestions(topic, fresh.map((q, i) => ({
              id: `q${i}_${Date.now()}`, topic, subject: topic,
              question: q.question, options: q.options,
              correct_idx: q.correct_answer ?? 0, explanation: q.explanation ?? '',
              difficulty: 1,
            })));
          }
        }).catch(() => {});
        return;
      }

      // No cache — draw a couple of human-approved questions from the
      // self-healed verified_question_bank as a trusted supplement, then
      // fill the rest with fresh AI generation. Never blocks the core flow.
      let verified: QuizQuestion[] = [];
      try {
        const { data: vRows } = await supabase
          .from('verified_question_bank')
          .select('id, question_text, options, correct_index, explanation')
          .eq('is_approved', true)
          .ilike('topic', `%${topic}%`)
          .limit(Math.min(2, count - 1));
        verified = (vRows ?? []).map((r, i) => ({
          id: `vqb${i}_${r.id}`,
          question: r.question_text,
          options: r.options as string[],
          correct_answer: r.correct_index,
          explanation: r.explanation,
        })) as QuizQuestion[];
      } catch {
        verified = [];
      }

      const aiCount = count - verified.length;

      // No cache — generate with AI
      setLoadProgress(20); setLoadStatus('Connecting to Novo AI…');
      // Simulate incremental progress while the AI works (real completion snaps to 100%)
      const progressTimer = setInterval(() => {
        setLoadProgress(p => {
          if (p >= 85) { clearInterval(progressTimer); return p; }
          return p + Math.random() * 8;
        });
      }, 800);
      setLoadStatus(`Writing ${aiCount} questions on "${topic}"…`);
      const grounding = await fetchNcertGrounding(topic);
      const parsed = await geminiJSON<QuizQuestion[]>(buildQuizPrompt(topic, aiCount, grounding));
      clearInterval(progressTimer);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No questions returned');
      setLoadProgress(100); setLoadStatus('Ready!');
      const qs = [...verified, ...parsed.map((q, i) => ({ ...q, id: `q${i}` }))];
      setQuestions(qs);
      setCurrent(0); setAnswers([]); setSelected(null); setRevealed(false);
      saveDraft(qs, 0, [], topic, count);
      setPhase('quiz');

      // Cache generated questions for offline use
      OfflineCache.cacheQuizQuestions(topic, qs.map((q, i) => ({
        id: `q${i}_${Date.now()}`, topic, subject: topic,
        question: q.question, options: q.options,
        correct_idx: q.correct_answer ?? 0, explanation: q.explanation ?? '',
        difficulty: 1,
      }))).catch(() => {});

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate quiz. Please try again.';
      setGenError(msg); setPhase('setup');
    }
  }

  function handleSelect(idx: number) {
    if (revealed) return;
    setSelected(idx); setRevealed(true);
    const isCorrect = idx === questions[current]?.correct_answer;
    if (isCorrect) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      setXpPopVisible(true);
      setTimeout(() => setXpPopVisible(false), 1200);
      setConsecWrong(0);
    } else {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      const newConsec = consecWrong + 1;
      setConsecWrong(newConsec);
      // After 3 consecutive wrong answers → fetch Novo concept explanation
      if (newConsec >= 3) {
        setConceptLoading(true);
        setShowConceptModal(true);
        const q = questions[current];
        geminiCall(
          `A student just got 3 consecutive wrong answers in a quiz on "${topic}". The latest question was: "${q.question}". The correct answer is: "${q.options[q.correct_answer]}". In 3-4 sentences, explain the underlying concept clearly and simply. Focus on WHY this is the correct answer and the key principle to remember.`
        ).then(explanation => {
          setConceptExplanation(explanation);
          setConceptLoading(false);
        }).catch(() => {
          setConceptExplanation(`Remember: ${q.explanation}`);
          setConceptLoading(false);
        });
      }
    }
  }

  async function fetchDeepExplanation() {
    const q = questions[current];
    if (!q || deepLoading[current] || deepExplanations[current]) return;
    setDeepLoading(prev => ({ ...prev, [current]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('question-explain', {
        body: {
          action: 'get_or_generate',
          question_text: q.question,
          options: q.options,
          correct_answer: q.options[q.correct_answer],
          subject: topic,
          topic,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !data?.explanation) throw new Error(error?.message ?? 'No explanation returned');
      setDeepExplanations(prev => ({ ...prev, [current]: data.explanation }));
    } catch {
      setDeepExplanations(prev => ({ ...prev, [current]: 'Could not load a deeper explanation right now — try again in a moment.' }));
    } finally {
      setDeepLoading(prev => ({ ...prev, [current]: false }));
    }
  }

  // Feeds the question_reports review queue (existing schema, previously
  // never written to from anywhere in the app) so wrong/bad AI-generated
  // questions can actually surface for review instead of just being a
  // silent trust problem for whoever hits them.
  async function reportQuestion() {
    const q = questions[current];
    if (!q || !profile || reportedIdx[current]) return;
    setReportedIdx(prev => ({ ...prev, [current]: true }));
    try {
      await supabase.from('question_reports').insert({
        user_id: profile.id,
        question_text: q.question,
        report_type: 'wrong_answer',
        details: `Quiz topic: ${topic}. Marked correct: "${q.options[q.correct_answer]}"`,
        status: 'pending',
      });
      Toast.show({ text: 'Thanks — we\'ll review this question.', duration: 'short' });
    } catch {
      setReportedIdx(prev => ({ ...prev, [current]: false }));
    }
  }

  function next() {
    if (selected === null) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    const newAnswers = [...answers, selected];
    const nextIdx = current + 1;
    setAnswers(newAnswers); setSelected(null); setRevealed(false);
    if (nextIdx >= questions.length) {
      finishQuiz(newAnswers);
    } else {
      setCurrent(nextIdx);
      saveDraft(questions, nextIdx, newAnswers, topic, count);
    }
  }

  function setQuestionConfidence(conf: 'sure' | 'guessing') {
    setConfidence(prev => ({ ...prev, [current]: conf }));
  }

  async function finishQuiz(finalAnswers: number[]) {
    clearDraft();
    const { score, pct } = scoreQuiz(finalAnswers, questions);
    // Haptic punctuates the result — strong success for ≥70%, warning otherwise
    if (pct >= 70) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    setPhase('result');
    setConsecWrong(0);
    track('quiz_complete', { topic, score, total: questions.length, pct,
      sure_count: Object.values(confidence).filter(c => c === 'sure').length,
      guessing_count: Object.values(confidence).filter(c => c === 'guessing').length,
    });

    if (profile) {
      const completedAt = new Date().toISOString();
      const xpGain      = score * 10;

      // ── Write-ahead: enqueue session + XP BEFORE network calls ──────────
      // These are durable — if the app dies, network drops, or session expires
      // between now and the DB write, the SyncQueue re-tries on next launch.
      await SyncQueue.enqueue({
        type: 'quiz_session',
        payload: {
          user_id: profile.id, subject: topic, topic,
          questions: questions as unknown[],
          user_answers: finalAnswers,
          score, score_pct: pct, completed_at: completedAt,
        },
      });
      await SyncQueue.enqueue({
        type: 'xp_grant',
        payload: { user_id: profile.id, amount: xpGain, reason: `quiz:${topic}` },
      });
      await SyncQueue.enqueue({
        type: 'topic_perf',
        payload: { user_id: profile.id, subject: topic, topic, correct: score, total: questions.length },
      });

      // ── Attempt live save immediately — queue handles failure ─────────────
      const { error: insertError } = await supabase.from('quiz_sessions').insert({
        user_id: profile.id, subject: topic, topic, questions,
        user_answers: finalAnswers, score, score_pct: pct, completed_at: completedAt,
      });
      if (!insertError) {
        // Live save succeeded — remove from queue so we don't double-save
        await SyncQueue.flush();

        await supabase.rpc('increment_xp', { user_id: profile.id, amount: xpGain });
        const unlocked = await loadUnlockedIds(profile.id);
        await checkAchievements({
          userId: profile.id, unlocked,
          profile: { xp: profile.xp + xpGain, streak_count: profile.streak_count },
          extras: { quizScore: score, quizTotal: questions.length },
        });
      }
      // insertError branch: queue already holds the payload — it will sync
      // when connection is restored. No action needed here.

      // ── Save confidence ratings (best-effort, not critical) ───────────────
      const confRows = Object.entries(confidence).map(([idx, conf]) => ({
        user_id:   profile.id,
        topic,
        question:  questions[parseInt(idx)]?.question ?? '',
        confidence: conf,
        correct:   finalAnswers[parseInt(idx)] === questions[parseInt(idx)]?.correct_answer,
      })).filter(r => r.question);
      if (confRows.length > 0) {
        supabase.from('quiz_confidence').insert(confRows).then(({ error }) => {
          if (error) console.warn('[QuizPage] confidence save failed (non-critical):', error.message);
        });
      }

      // ── Fire-and-forget: feed quiz result into Novo memory ───────────────
      // Runs after the XP update — never blocks the result screen.
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        const authHeader = { Authorization: `Bearer ${session.access_token}` };
        const wrongQs = questions.filter((_, i) => finalAnswers[i] !== questions[i].correct_answer);
        const struggles = wrongQs.map(q => q.question.slice(0, 120));
        const wins      = pct === 100 ? [topic] : [];

        // Session summary — always save
        supabase.functions.invoke('novo-memory', {
          body: {
            action: 'save_session_summary',
            source: 'quiz', topic,
            summary: `Quiz on "${topic}": scored ${score}/${questions.length} (${pct}%). ${wrongQs.length > 0 ? `Missed ${wrongQs.length} question${wrongQs.length > 1 ? 's' : ''}.` : 'Perfect score!'}`,
            struggles, wins,
          },
          headers: authHeader,
        }).catch(() => {});

        // Weakness memory — only if score < 70 %
        if (pct < 70) {
          supabase.functions.invoke('novo-memory', {
            body: {
              action: 'save', source: 'quiz',
              memory_type: 'struggle',
              content: `Scored ${pct}% on "${topic}" quiz — needs revision`,
              topic,
              importance: pct < 40 ? 8 : 6,
            },
            headers: authHeader,
          }).catch(() => {});
        }

        // Strength memory — only on perfect score
        if (pct === 100) {
          supabase.functions.invoke('novo-memory', {
            body: {
              action: 'save', source: 'quiz',
              memory_type: 'strength',
              content: `Aced "${topic}" quiz with a perfect score`,
              topic,
              importance: 7,
            },
            headers: authHeader,
          }).catch(() => {});
        }
      });
    }
  }

  const score     = answers.filter((a, i) => a === questions[i]?.correct_answer).length;
  const q         = questions[current];
  const qProgress = ((current) / questions.length) * 100;
  const chipStyle = subjectColor(topic);

  return (
    <div className="h-full native-scroll pb-nav" style={{ background: 'transparent' }}>
      <div className="px-4 pt-5 flex flex-col h-full">
        <AnimatePresence mode="wait">

          {/* ── SETUP ─────────────────────────────────────── */}
          {phase === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-5 flex-1">

              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-quiz"
                    style={{ boxShadow: '0 4px 16px rgba(236,72,153,0.3)' }}>
                    <Brain size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">AI-Powered</p>
                    <h1 className="font-heading text-2xl font-extrabold text-foreground leading-tight">Quiz</h1>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-1">Generate instant MCQs on any topic</p>
              </div>

              {/* Novo memory: weakness callout */}
              {topWeaknessLoading && !draft && <SkeletonTopWeakness />}
              {!topWeaknessLoading && topWeakness && !draft && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-4 flex items-start gap-3 cursor-pointer active:scale-98 transition-all"
                  style={{ background: 'rgba(251,191,36,0.07)', border: '1.5px solid rgba(251,191,36,0.25)' }}
                  onClick={() => setTopic(topWeakness)}>
                  <HelpCircle size={16} className="shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider mb-0.5" style={{ color: '#FBBF24' }}>
                      Novo remembers
                    </p>
                    <p className="text-sm text-white leading-snug">
                      Last time you struggled with <span className="font-bold">{topWeakness}</span> — let's nail it today!
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>
                    Try it →
                  </span>
                </motion.div>
              )}

              {/* Resume draft banner */}
              {draft && (
                <div className="rounded-2xl p-4 flex items-center justify-between gap-3"
                  style={{ background: 'rgba(91,106,245,0.07)', border: '1.5px solid rgba(91,106,245,0.2)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-wider mb-0.5" style={{ color: '#5B6AF5' }}>
                      Resume Quiz
                    </p>
                    <p className="text-sm font-semibold text-foreground truncate">{draft.topic}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Question {draft.current + 1} of {draft.questions.length}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={resumeDraft}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', boxShadow: '0 4px 12px rgba(91,106,245,0.3)' }}>
                      Resume
                    </button>
                    <button onClick={() => { clearDraft(); setDraft(null); }}
                      className="px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {/* Topic input */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-400)' }}>Topic</p>
                <input type="text" placeholder="e.g. Newton's Laws of Motion"
                  value={topic} onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateQuiz()}
                  className="w-full h-14 px-4 rounded-2xl text-white placeholder:text-white/30 outline-none text-sm font-medium"
                  style={{
                    background: 'var(--ink-060)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(91,106,245,0.28)',
                    boxShadow: 'inset 0 1px 0 var(--ink-100)',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }} />
              </div>

              {/* Question count */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-400)' }}>Questions</p>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map(n => (
                    <button key={n} onClick={() => setCount(n)}
                      className="flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                      style={count === n ? {
                        background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)',
                        color: 'var(--ink-950)',
                        boxShadow: '0 4px 16px rgba(91,106,245,0.35), inset 0 1px 0 var(--ink-200)',
                      } : {
                        background: 'var(--ink-055)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        color: 'var(--ink-550)',
                        border: '1px solid var(--ink-100)',
                        boxShadow: 'inset 0 1px 0 var(--ink-080)',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {genError && (
                <div className="rounded-2xl px-4 py-3.5 flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)' }}>
                  <XCircle size={16} className="shrink-0 mt-0.5" style={{ color: '#F87171' }} />
                  <p className="text-sm" style={{ color: '#F87171' }}>{genError}</p>
                </div>
              )}

              <button onClick={generateQuiz} disabled={!topic.trim()}
                className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all active:scale-98 disabled:opacity-40"
                style={{
                  background: topic.trim() ? 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' : '#E2E8F0',
                  boxShadow: topic.trim() ? '0 6px 24px rgba(91,106,245,0.35)' : 'none',
                }}>
                <div className="flex items-center justify-center gap-2">
                  <Brain size={18} />
                  Generate Quiz
                </div>
              </button>
            </motion.div>
          )}

          {/* ── LOADING ───────────────────────────────────── */}
          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center flex-1 gap-8 px-6">
              <div className="relative w-24 h-24">
                <div className="w-24 h-24 rounded-full border-4 border-secondary"
                  style={{ borderTopColor: '#5B6AF5', animation: 'spin 1s linear infinite' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Brain size={30} style={{ color: '#5B6AF5' }} />
                </div>
              </div>
              <div className="w-full max-w-xs flex flex-col gap-3 text-center">
                <h2 className="font-heading text-xl font-extrabold text-foreground">Crafting Your Quiz…</h2>
                {/* Status text — reassures users the app is working, not frozen */}
                <p className="text-sm text-muted-foreground min-h-[20px]">{loadStatus}</p>
                {/* Animated progress bar */}
                <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--ink-080)' }}>
                  <motion.div className="h-full rounded-full"
                    animate={{ width: `${Math.min(loadProgress, 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{ background: 'linear-gradient(90deg,#5B6AF5,#8B5CF6)' }} />
                </div>
                <p className="text-xs text-muted-foreground/60">This may take up to 30 seconds on a slow connection</p>
              </div>
            </motion.div>
          )}

          {/* ── QUIZ ──────────────────────────────────────── */}
          {phase === 'quiz' && q && (
            <motion.div key={`q-${current}`}
              initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="flex flex-col gap-4 flex-1">

              {/* Progress bar + nav */}
              <div className="flex items-center gap-3">
                <button aria-label="Go back" onClick={() => setPhase('setup')}
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90"
                  style={{ background: 'var(--v2-elevated)', border: '1px solid var(--v2-border)' }}>
                  <ChevronLeft size={18} style={{ color: 'var(--v2-text-1)' }} />
                </button>
                {/* Progress bar */}
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--v2-border)' }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: `${qProgress}%` }}
                    animate={{ width: `${((current + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                    style={{ background: 'var(--v2-primary)' }} />
                </div>
                <span className="text-sm font-bold v2-tnum shrink-0 min-w-[36px] text-right" style={{ color: 'var(--v2-text-4)' }}>
                  {current + 1}/{questions.length}
                </span>
              </div>

              {/* Per-question timer */}
              {qTimeLeft !== null && (
                <div className="flex items-center gap-2">
                  <Clock size={13} style={{ color: qTimeLeft <= 10 ? 'var(--v2-error)' : 'var(--v2-text-4)' }} />
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--v2-border)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      animate={{ width: `${(qTimeLeft / 30) * 100}%` }}
                      transition={{ duration: 0.9, ease: 'linear' }}
                      style={{ background: qTimeLeft <= 10 ? 'var(--v2-error)' : 'var(--v2-primary)' }}
                    />
                  </div>
                  <span className="text-xs font-extrabold v2-tnum shrink-0"
                    style={{ color: qTimeLeft <= 10 ? 'var(--v2-error)' : 'var(--v2-text-4)', minWidth: 24 }}>
                    {qTimeLeft}s
                  </span>
                </div>
              )}

              {/* Subject chip */}
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide"
                  style={{ background: chipStyle.bg, color: chipStyle.text, border: `1.5px solid ${chipStyle.border}` }}>
                  {topic}
                </span>
                {/* Streak indicator */}
                {answers.length > 0 && (() => {
                  let streak = 0;
                  for (let i = answers.length - 1; i >= 0; i--) {
                    if (answers[i] === questions[i].correct_answer) streak++;
                    else break;
                  }
                  return streak >= 2 ? (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1"
                      style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1.5px solid rgba(251,191,36,0.3)' }}>
                      <Flame size={11} /> {streak} streak
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Question card */}
              <div className="liquid-glass specular rounded-3xl p-5" style={{ position: 'relative' }}>
                <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3"
                  style={{ color: chipStyle.text }}>
                  Question {current + 1}
                </p>
                <p className="font-heading text-[17px] font-bold text-white leading-snug">
                  {q.question}
                </p>
              </div>

              {/* Options */}
              <div className="flex flex-col gap-2.5 flex-1">
                {q.options?.map((opt, i) => (
                  <QuizOptionButton
                    key={i}
                    option={opt}
                    index={i}
                    isCorrect={i === q.correct_answer}
                    isSelected={i === selected}
                    revealed={revealed}
                    onSelect={handleSelect}
                  />
                ))}
              </div>

              {/* XP pop animation */}
              <AnimatePresence>
                {xpPopVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 0, scale: 0.8 }}
                    animate={{ opacity: 1, y: -40, scale: 1.1 }}
                    exit={{ opacity: 0, y: -80, scale: 0.8 }}
                    transition={{ duration: 0.6 }}
                    className="fixed right-6 top-1/3 z-50 pointer-events-none flex items-center gap-1.5 px-4 py-2 rounded-full"
                    style={{
                      background: 'linear-gradient(135deg,#10B981,#059669)',
                      boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
                    }}>
                    <Star size={13} className="text-white fill-white" />
                    <span className="text-white text-sm font-extrabold">+10 XP</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Explanation + Next */}
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3">

                    {/* Time's up notice */}
                    {selected === -1 && (
                      <div className="rounded-2xl px-4 py-2.5 flex items-center gap-2"
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <Clock size={14} style={{ color: '#F87171' }} />
                        <span className="text-sm font-bold" style={{ color: '#F87171' }}>Time's up! No answer was selected.</span>
                      </div>
                    )}

                    {/* Confidence rating */}
                    {confidence[current] === undefined && (
                      <div className="rounded-2xl p-3" style={{ background: 'var(--ink-040)', border: '1px solid var(--ink-080)' }}>
                        <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-center"
                          style={{ color: 'var(--ink-400)' }}>
                          How confident were you?
                        </p>
                        <div className="flex gap-2">
                          {([
                            { key: 'sure' as const, label: 'I knew it', icon: CheckCircle, color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
                            { key: 'guessing' as const, label: 'Was guessing', icon: Dices, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
                          ] as const).map(opt => (
                            <button key={opt.key} onClick={() => setQuestionConfidence(opt.key)}
                              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                              style={{ background: opt.bg, color: opt.color, border: `1.5px solid ${opt.border}` }}>
                              <opt.icon size={14} strokeWidth={1.8} />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="lg-indigo rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap size={13} style={{ color: '#5B6AF5' }} />
                        <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#5B6AF5' }}>
                          Explanation
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-750)' }}>{q.explanation}</p>

                      {deepExplanations[current] ? (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--ink-100)' }}>
                          <p className="text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: '#8B5CF6' }}>
                            Deeper explanation
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-750)' }}>{deepExplanations[current]}</p>
                        </div>
                      ) : (
                        <button onClick={fetchDeepExplanation} disabled={deepLoading[current]}
                          className="mt-3 flex items-center gap-1.5 text-xs font-bold disabled:opacity-60"
                          style={{ color: '#8B5CF6' }}>
                          {deepLoading[current]
                            ? <><Loader2 size={12} className="animate-spin" /> Thinking deeper…</>
                            : <><HelpCircle size={12} /> Still confused? Get a deeper explanation</>
                          }
                        </button>
                      )}
                      <button onClick={reportQuestion} disabled={reportedIdx[current]}
                        className="mt-3 flex items-center gap-1.5 text-xs font-bold disabled:opacity-60"
                        style={{ color: reportedIdx[current] ? 'var(--ink-400)' : '#F87171' }}>
                        <AlertTriangle size={12} />
                        {reportedIdx[current] ? 'Reported — thanks!' : 'This looks wrong — report it'}
                      </button>
                    </div>
                    <button onClick={next}
                      disabled={confidence[current] === undefined}
                      className="w-full py-4 rounded-2xl font-bold text-base text-white active:scale-98 transition-all disabled:opacity-40"
                      style={{
                        background: confidence[current] !== undefined
                          ? 'linear-gradient(135deg,#5B6AF5,#8B5CF6)'
                          : 'rgba(91,106,245,0.4)',
                        boxShadow: confidence[current] !== undefined ? '0 6px 24px rgba(91,106,245,0.35)' : 'none',
                      }}>
                      {current + 1 === questions.length ? 'See Results' : 'Next Question'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── RESULT ────────────────────────────────────── */}
          {phase === 'result' && (
            <motion.div key="result"
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              className="flex flex-col items-center justify-center flex-1 gap-6">

              {/* Result icon */}
              {Math.round((score / questions.length) * 100) >= 70
                ? <Trophy size={56} style={{ color: '#FBBF24' }} strokeWidth={1.4} />
                : <Meh size={56} className="text-white/30" strokeWidth={1.4} />}

              {/* Score */}
              <div className="text-center">
                <motion.h2
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="font-heading text-5xl font-extrabold"
                  style={{ color: scoreColor(score, questions.length).color }}>
                  {score}/{questions.length}
                </motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                  className="text-lg font-bold text-white mt-1">
                  {scoreColor(score, questions.length).label}
                </motion.p>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                  className="flex items-center justify-center gap-2 mt-3 px-4 py-2 rounded-full mx-auto w-fit"
                  style={{ background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.3)' }}>
                  <Star size={14} style={{ color: '#FBBF24' }} fill="#FBBF24" />
                  <span className="font-extrabold" style={{ color: '#FBBF24' }}>+{score * 10} XP earned</span>
                </motion.div>
              </div>

              {/* Score breakdown */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="w-full grid grid-cols-3 gap-3">
                {[
                  { label: 'Correct',  value: score,                   color: '#10B981' },
                  { label: 'Wrong',    value: questions.length - score, color: '#EF4444' },
                  { label: 'Accuracy', value: `${Math.round((score/questions.length)*100)}%`, color: '#5B6AF5' },
                ].map(stat => (
                  <div key={stat.label} className="bento-cell rounded-2xl py-3 text-center">
                    <p className="font-heading text-2xl font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--ink-400)' }}>{stat.label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Peer percentile — only renders when ≥3 peers attempted same topic today */}
              <PeerPercentile topic={topic} userScore={Math.round((score / questions.length) * 100)} className="w-full" />

              {/* Actions */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                className="w-full grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setCurrent(0); setAnswers([]); setSelected(null); setRevealed(false); setPhase('quiz'); }}
                  className="py-4 rounded-2xl font-bold text-sm text-white active:scale-98 transition-all"
                  style={{ background: 'var(--ink-060)', border: '1.5px solid var(--ink-100)' }}>
                  Retry
                </button>
                <button onClick={() => setPhase('setup')}
                  className="py-4 rounded-2xl font-bold text-sm text-white active:scale-98 transition-all"
                  style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)', boxShadow: '0 6px 24px rgba(91,106,245,0.35)' }}>
                  New Quiz
                </button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Novo Concept Explanation Modal (3 consecutive wrong) ── */}
      <AnimatePresence>
        {showConceptModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowConceptModal(false)}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 380 }}
              className="w-full rounded-t-3xl p-6 flex flex-col gap-4"
              style={{ background: 'var(--surface-sheet)', border: '1.5px solid rgba(91,106,245,0.3)' }}
              onClick={e => e.stopPropagation()}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                  <Lightbulb size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5"
                    style={{ color: '#A0AEFF' }}>Novo Explains</p>
                  <h3 className="font-heading text-base font-bold text-white">
                    Let's clear this up!
                  </h3>
                </div>
              </div>

              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
                {conceptLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-purple-500 animate-spin"
                      style={{ borderTopColor: 'transparent' }} />
                    <span className="text-sm" style={{ color: 'var(--ink-600)' }}>
                      Novo is thinking…
                    </span>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-white">{conceptExplanation}</p>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-xl p-3"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <AlertTriangle size={13} style={{ color: '#FBBF24' }} />
                <p className="text-xs" style={{ color: 'var(--ink-600)' }}>
                  3 wrong in a row — this topic is being flagged for revision
                </p>
              </div>

              <button onClick={() => setShowConceptModal(false)}
                className="w-full py-4 rounded-2xl font-bold text-base text-white"
                style={{ background: 'linear-gradient(135deg,#5B6AF5,#8B5CF6)' }}>
                Got it — continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
