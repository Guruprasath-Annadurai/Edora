import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Filter, Flame, Trophy, BarChart2, CheckCircle, XCircle, Lock, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isInFreeTrial } from '@/lib/trial';
import { useGeminiStream } from '@/lib/useGeminiStream';
import { ProGate } from '@/components/ui/ProGate';
import { track } from '@/lib/analytics';

type ExamDisplay = 'JEE_Main' | 'JEE_Advanced' | 'NEET' | 'CBSE_10' | 'CBSE_12';
type Phase = 'browse' | 'heatmap' | 'quiz' | 'result';

// Maps display type → pyq_content.exam values
const EXAM_DB_MAP: Record<ExamDisplay, string> = {
  JEE_Main:     'JEE_MAIN',
  JEE_Advanced: 'JEE_ADV',
  NEET:         'NEET',
  CBSE_10:      'BOARDS',
  CBSE_12:      'BOARDS',
};

// CBSE_10 and CBSE_12 share the same exam value ('BOARDS') — without this,
// Class 10 Maths and Class 12 Maths would be indistinguishable in the same
// query (both subject='Maths', exam='BOARDS'). Non-board exams don't need it.
const CLASS_LEVEL_MAP: Record<ExamDisplay, string | null> = {
  JEE_Main: null, JEE_Advanced: null, NEET: null,
  CBSE_10: '10', CBSE_12: '12',
};

interface PYQOption {
  label: string;
  text:  string;
  correct: boolean;
}

interface PYQQuestion {
  id:            string;
  exam:          string;
  year:          number;
  subject:       string;
  chapter:       string;
  question_text: string;
  solution_text: string;
  options:       PYQOption[];
  correct_option: string;
  difficulty:    string;
  marks:         number;
}

interface TopicFreq {
  subject:         string;
  chapter:         string;
  concept:         string;
  total_questions: number;
  years_appeared:  number;
  avg_difficulty:  number;
  last_year:       number;
}

const EXAM_OPTIONS: { id: ExamDisplay; label: string; color: string; subjects: string[] }[] = [
  { id: 'JEE_Main',     label: 'JEE Main',     color: '#60A5FA', subjects: ['Physics','Chemistry','Maths'] },
  { id: 'JEE_Advanced', label: 'JEE Advanced',  color: '#A78BFA', subjects: ['Physics','Chemistry','Maths'] },
  { id: 'NEET',         label: 'NEET',          color: '#34D399', subjects: ['Physics','Chemistry','Biology'] },
  { id: 'CBSE_10',      label: 'CBSE Class 10', color: '#FBBF24', subjects: ['Maths','Science','Social Science'] },
  { id: 'CBSE_12',      label: 'CBSE Class 12', color: '#FB923C', subjects: ['Physics','Chemistry','Biology','Maths'] },
];

const FREE_DAILY_LIMIT = 5;

function difficultyColor(d: string) {
  if (d === 'easy')   return '#34D399';
  if (d === 'medium') return '#FBBF24';
  return '#F87171';
}

function heatColor(intensity: number): string {
  const r = Math.round(30  + intensity * 225);
  const g = Math.round(144 - intensity * 100);
  const b = Math.round(255 - intensity * 220);
  return `rgb(${r},${g},${b})`;
}

function todayKey(userId: string) {
  return `edora_pyq_daily_${userId}_${new Date().toISOString().slice(0, 10)}`;
}

export default function PYQBankPage() {
  const { profile, user } = useAuth();
  const { streamingText, isStreaming, streamMessage } = useGeminiStream();

  const isPro = (user?.created_at ? isInFreeTrial(user.created_at) : false)
    || (!!profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()));
  const examDate = (profile as { exam_date?: string } | null)?.exam_date ? new Date((profile as { exam_date?: string }).exam_date!) : null;
  const daysToExam = examDate ? Math.ceil((examDate.getTime() - Date.now()) / 86_400_000) : null;
  const effectivelyPro = isPro || (typeof daysToExam === 'number' && daysToExam >= 0 && daysToExam <= 30);

  const [phase, setPhase]           = useState<Phase>('browse');
  const [examType, setExamType]     = useState<ExamDisplay>('JEE_Main');
  const [subject, setSubject]       = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [diffFilter, setDiffFilter] = useState<string>('');
  const [questions, setQuestions]   = useState<PYQQuestion[]>([]);
  const [heatData, setHeatData]     = useState<TopicFreq[]>([]);
  const [loading, setLoading]       = useState(false);
  const [current, setCurrent]       = useState(0);
  const [answers, setAnswers]       = useState<(number | null)[]>([]);
  const [revealed, setRevealed]     = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [score, setScore]           = useState({ correct: 0, marks: 0, max: 0 });
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const examConfig = EXAM_OPTIONS.find(e => e.id === examType)!;
  const years = Array.from({ length: 11 }, (_, i) => 2024 - i);

  // Load daily count from localStorage
  useEffect(() => {
    if (!user) return;
    const stored = parseInt(localStorage.getItem(todayKey(user.id)) ?? '0', 10);
    setDailyCount(stored);
  }, [user]);

  async function loadHeatmap() {
    setLoading(true);
    setPhase('heatmap');
    let query = supabase
      .from('pyq_topic_frequency')
      .select('*')
      .eq('exam_type', EXAM_DB_MAP[examType])
      .order('total_questions', { ascending: false })
      .limit(50);
    if (CLASS_LEVEL_MAP[examType]) query = query.eq('class_level', CLASS_LEVEL_MAP[examType]);
    const { data } = await query;
    setHeatData((data ?? []) as TopicFreq[]);
    setLoading(false);
    track('pyq_heatmap_viewed', { exam_type: examType });
  }

  async function startPractice(diffOverride?: string) {
    if (!profile) return;
    setLoading(true);
    const effectiveDiff = diffOverride ?? diffFilter;
    let query = supabase
      .from('pyq_content')
      .select('id,exam,year,subject,chapter,question_text,solution_text,options,correct_option,difficulty,marks')
      .eq('exam', EXAM_DB_MAP[examType])
      .order('year', { ascending: false })
      .limit(20);
    if (subject)       query = query.eq('subject', subject);
    if (yearFilter)    query = query.eq('year', yearFilter);
    if (effectiveDiff) query = query.eq('difficulty', effectiveDiff);
    if (CLASS_LEVEL_MAP[examType]) query = query.eq('class_level', CLASS_LEVEL_MAP[examType]);

    const { data, error } = await query;
    if (error || !data?.length) {
      setLoading(false);
      alert('No questions found for these filters. Try broadening your selection.');
      return;
    }
    setQuestions(data as PYQQuestion[]);
    setAnswers(new Array(data.length).fill(null));
    setCurrent(0); setRevealed(false);
    setPhase('quiz');
    setLoading(false);
    track('pyq_practice_started', { exam_type: examType, subject, count: data.length });
  }

  // Advanced Mix — a Nemotron-curated, consistently-hard, cross-chapter set
  // instead of a raw difficulty-tag dump. Reuses mock-paper-composer with
  // difficulty_skew:'hard'; falls back to the plain hard-filter query if the
  // composer call fails for any reason, so this never blocks practice.
  async function startAdvancedMix() {
    if (!profile || !subject) return;
    setAdvancedLoading(true);
    try {
      // mock-paper-composer's candidate pool query has no concept of
      // class_level — for CBSE exams (which share exam='BOARDS' across
      // Class 10 and 12) that would silently mix grade levels. Skip the
      // composer for boards and go straight to the class_level-aware
      // hard-filter fallback below instead.
      if (CLASS_LEVEL_MAP[examType]) throw new Error('Advanced Mix composer not class-level-aware for board exams');
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('mock-paper-composer', {
        body: {
          action: 'compose',
          exam: EXAM_DB_MAP[examType],
          sections: [{ subject, count: 15 }],
          difficulty_skew: 'hard',
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const ids: string[] | undefined = data?.question_ids?.[subject];
      if (error || !ids?.length) throw new Error(error?.message ?? 'No advanced set returned');

      const { data: rows } = await supabase
        .from('pyq_content')
        .select('id,exam,year,subject,chapter,question_text,solution_text,options,correct_option,difficulty,marks')
        .in('id', ids);
      const bySubjectId = new Map((rows ?? []).map(r => [r.id, r]));
      const ordered = ids.map(id => bySubjectId.get(id)).filter(Boolean) as PYQQuestion[];
      if (!ordered.length) throw new Error('Advanced set had no matching rows');

      setQuestions(ordered);
      setAnswers(new Array(ordered.length).fill(null));
      setCurrent(0); setRevealed(false);
      setPhase('quiz');
      track('pyq_advanced_mix_started', { exam_type: examType, subject, count: ordered.length });
    } catch (e) {
      console.error('[PYQBank] advanced mix failed, falling back to hard filter:', e);
      setDiffFilter('hard');
      await startPractice('hard');
    } finally {
      setAdvancedLoading(false);
    }
  }

  async function fetchNovoExplanation(q: PYQQuestion) {
    if (!effectivelyPro) return;
    const correctOpt = q.options.find(o => o.correct);
    await streamMessage(
      `You are Novo, an expert ${examType.replace('_',' ')} tutor.
Question: ${q.question_text}
Correct answer: ${correctOpt?.label}. ${correctOpt?.text}
Explain WHY this is correct, the underlying concept, and a memory trick. Under 100 words. Conversational and encouraging.`,
    );
  }

  function selectAnswer(idx: number) {
    if (answers[current] !== null) return;

    // Free daily limit gate
    if (!effectivelyPro && dailyCount >= FREE_DAILY_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const updated = [...answers]; updated[current] = idx;
    setAnswers(updated);
    setRevealed(true);

    if (!effectivelyPro && user) {
      const newCount = dailyCount + 1;
      setDailyCount(newCount);
      localStorage.setItem(todayKey(user.id), String(newCount));
      if (newCount >= FREE_DAILY_LIMIT) {
        // Show paywall after a brief delay so they see the answer first
        setTimeout(() => setShowPaywall(true), 1200);
      }
    }

    fetchNovoExplanation(questions[current]);
  }

  function nextQuestion() {
    if (current >= questions.length - 1) {
      finishSession();
    } else {
      setCurrent(c => c + 1);
      setRevealed(false);
    }
  }

  function finishSession() {
    let correct = 0, marks = 0;
    questions.forEach((q, i) => {
      const a = answers[i];
      if (a === null) return;
      const correctIdx = q.options.findIndex(o => o.correct);
      if (a === correctIdx) { correct++; marks += q.marks; }
      else marks -= 1;
    });
    setScore({ correct, marks: Math.max(0, marks), max: questions.reduce((s, q) => s + q.marks, 0) });
    setPhase('result');
    track('pyq_session_completed', { exam_type: examType, correct, total: questions.length });
  }

  const q = questions[current];
  const remainingFree = Math.max(0, FREE_DAILY_LIMIT - dailyCount);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 shrink-0"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link aria-label="Go back" to="/tools">
          <motion.button whileTap={{ scale: 0.92 }}
            className="p-2 rounded-xl" style={{ background: 'var(--color-surface)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          </motion.button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>PYQ Bank</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>10-year question archive</p>
        </div>
        {/* Daily usage pill (free users only, in quiz) */}
        {phase === 'quiz' && !effectivelyPro && (
          <div className="px-2.5 py-1 rounded-xl text-xs font-semibold"
               style={{ background: remainingFree <= 1 ? 'rgba(248,113,113,0.15)' : 'var(--color-surface)',
                        color: remainingFree <= 1 ? '#F87171' : 'var(--color-text-secondary)',
                        border: `1px solid ${remainingFree <= 1 ? '#F87171' : 'var(--color-border)'}` }}>
            {remainingFree} free left
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-nav">
        <AnimatePresence mode="wait">

          {/* ── Browse Phase ── */}
          {phase === 'browse' && (
            <motion.div key="browse" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-4 py-5 space-y-6">

              {/* Free limit banner */}
              {!effectivelyPro && (
                <div className="p-3 rounded-2xl flex items-center gap-3"
                     style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
                  <Lock size={14} style={{ color: '#A0AEFF', flexShrink: 0 }} />
                  <p className="text-xs" style={{ color: '#A0AEFF' }}>
                    {remainingFree > 0
                      ? `${remainingFree} free questions today · Pro unlocks unlimited + full solutions`
                      : 'Daily limit reached · Upgrade for unlimited PYQ practice'}
                  </p>
                </div>
              )}

              {/* Exam selector */}
              <div>
                <p className="text-xs font-semibold mb-3 uppercase tracking-wider"
                   style={{ color: 'var(--color-text-secondary)' }}>Select Exam</p>
                <div className="grid grid-cols-2 gap-2">
                  {EXAM_OPTIONS.map(ex => (
                    <motion.button key={ex.id} whileTap={{ scale: 0.96 }}
                      onClick={() => { setExamType(ex.id); setSubject(''); }}
                      className="p-3 rounded-2xl text-left transition-all"
                      style={{
                        background: examType === ex.id ? `${ex.color}20` : 'var(--color-surface)',
                        border: `1.5px solid ${examType === ex.id ? ex.color : 'var(--color-border)'}`,
                      }}>
                      <span className="text-sm font-semibold" style={{ color: examType === ex.id ? ex.color : 'var(--color-text)' }}>
                        {ex.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
                {/* CBSE boards content pool is much smaller than JEE/NEET
                    (4-6 questions per subject vs 100+) — same honest
                    "starter set" framing already used in MockTestPage and
                    UPSCMainsPage for beta-depth content. */}
                {(examType === 'CBSE_10' || examType === 'CBSE_12') && (
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Starter practice set — smaller question pool than JEE/NEET while we expand board coverage.
                  </p>
                )}
              </div>

              {/* Filters */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
                   style={{ color: 'var(--color-text-secondary)' }}>
                  <Filter size={13} /> Filters (optional)
                </p>
                <div className="flex gap-2 flex-wrap">
                  {examConfig.subjects.map(s => (
                    <button key={s} onClick={() => setSubject(subject === s ? '' : s)}
                      className="h-9 px-3 rounded-xl text-xs font-medium transition-all flex items-center"
                      style={{
                        background: subject === s ? `${examConfig.color}20` : 'var(--color-surface)',
                        color: subject === s ? examConfig.color : 'var(--color-text-secondary)',
                        border: `1px solid ${subject === s ? examConfig.color : 'var(--color-border)'}`,
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {years.slice(0, 6).map(y => (
                    <button key={y} onClick={() => setYearFilter(yearFilter === y ? null : y)}
                      className="h-9 px-3 rounded-xl text-xs font-medium transition-all flex items-center"
                      style={{
                        background: yearFilter === y ? 'rgba(91,106,245,0.15)' : 'var(--color-surface)',
                        color: yearFilter === y ? '#A0AEFF' : 'var(--color-text-secondary)',
                        border: `1px solid ${yearFilter === y ? '#5B6AF5' : 'var(--color-border)'}`,
                      }}>
                      {y}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {['easy','medium','hard'].map(d => (
                    <button key={d} onClick={() => setDiffFilter(diffFilter === d ? '' : d)}
                      className="h-9 px-3 rounded-xl text-xs font-medium capitalize transition-all flex items-center"
                      style={{
                        background: diffFilter === d ? `${difficultyColor(d)}20` : 'var(--color-surface)',
                        color: diffFilter === d ? difficultyColor(d) : 'var(--color-text-secondary)',
                        border: `1px solid ${diffFilter === d ? difficultyColor(d) : 'var(--color-border)'}`,
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3">
                <Button onClick={() => startPractice()} disabled={loading || remainingFree === 0 && !effectivelyPro}
                  className="w-full h-12 rounded-2xl font-bold"
                  style={{ background: examConfig.color, color: 'var(--color-on-accent)' }}>
                  {loading ? 'Loading…' : '▶ Start Practice'}
                </Button>
                <Button onClick={startAdvancedMix}
                  disabled={!subject || advancedLoading || (remainingFree === 0 && !effectivelyPro)}
                  className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #EF4444, #B91C1C)', color: '#fff' }}>
                  <Swords size={16} />
                  {advancedLoading ? 'Curating toughest set…' : subject ? `Advanced Mix — Toughest ${subject}` : 'Advanced Mix (pick a subject)'}
                </Button>
                <Button onClick={loadHeatmap} disabled={loading} variant="outline"
                  className="w-full h-12 rounded-2xl font-semibold"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  <BarChart2 size={16} className="mr-2" /> Topic Frequency Heatmap
                </Button>
              </div>

              {/* Quick stat */}
              <div className="p-4 rounded-2xl flex items-center gap-4"
                   style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <Flame size={28} color="#FB923C" />
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>10 Years of PYQs</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    JEE · NEET · CBSE — tagged by concept & difficulty
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Heatmap Phase ── */}
          {phase === 'heatmap' && (
            <motion.div key="heatmap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-4 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {examConfig.label} — Topic Frequency
                </p>
                <button onClick={() => setPhase('browse')} className="text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}>← Back</button>
              </div>
              {loading ? (
                <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>Loading heatmap…</div>
              ) : heatData.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <BarChart2 size={40} className="mx-auto opacity-30" style={{ color: 'var(--color-text-secondary)' }} />
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    No topic data yet for this exam.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {heatData.map((t, i) => {
                    const maxQ      = Math.max(...heatData.map(x => x.total_questions));
                    const intensity = t.total_questions / maxQ;
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <div className="w-2 h-10 rounded-full flex-shrink-0"
                             style={{ background: heatColor(intensity) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                            {t.concept}
                          </p>
                          <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                            {t.subject} · {t.chapter}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold" style={{ color: heatColor(intensity) }}>
                            {t.total_questions}×
                          </p>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {t.years_appeared} yrs
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              <Button onClick={() => setPhase('browse')} className="w-full rounded-2xl" variant="outline">
                ← Back to Practice
              </Button>
            </motion.div>
          )}

          {/* ── Quiz Phase ── */}
          {phase === 'quiz' && q && (
            <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-4 py-4 space-y-4">

              {/* Progress */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {current + 1} / {questions.length}
                </span>
                <div className="flex gap-1.5 items-center">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{ background: `${difficultyColor(q.difficulty)}20`, color: difficultyColor(q.difficulty) }}>
                    {q.difficulty}
                  </span>
                  {q.year && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>
                      {q.year}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: 'var(--color-border)' }}>
                <div className="h-1.5 rounded-full transition-all"
                     style={{ width: `${((current + 1) / questions.length) * 100}%`, background: examConfig.color }} />
              </div>

              {/* Meta tags */}
              <div className="flex gap-2 flex-wrap">
                {[q.subject, q.chapter].filter(Boolean).map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-lg font-medium"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Question */}
              <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <p className="text-base font-medium leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  {q.question_text}
                </p>
              </div>

              {/* Options */}
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const ans        = answers[current];
                  const isSelected = ans === i;
                  const isCorrect  = opt.correct;
                  const showResult = revealed && ans !== null;
                  let bg = 'var(--color-surface)';
                  let border = 'var(--color-border)';
                  let textCol = 'var(--color-text)';
                  if (showResult) {
                    if (isCorrect)         { bg = 'rgba(52,211,153,0.15)'; border = '#34D399'; textCol = '#34D399'; }
                    else if (isSelected)   { bg = 'rgba(248,113,113,0.15)'; border = '#F87171'; textCol = '#F87171'; }
                  }
                  return (
                    <motion.button key={opt.label} whileTap={{ scale: 0.98 }}
                      onClick={() => selectAnswer(i)} disabled={revealed}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all"
                      style={{ background: bg, border: `1.5px solid ${border}` }}>
                      <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: `${examConfig.color}20`, color: examConfig.color }}>
                        {opt.label}
                      </span>
                      <span className="text-sm font-medium flex-1" style={{ color: textCol }}>{opt.text}</span>
                      {showResult && isCorrect  && <CheckCircle size={16} color="#34D399" className="flex-shrink-0" />}
                      {showResult && isSelected && !isCorrect && <XCircle size={16} color="#F87171" className="flex-shrink-0" />}
                    </motion.button>
                  );
                })}
              </div>

              {/* Explanation / Solution */}
              <AnimatePresence>
                {revealed && (
                  <motion.div key="exp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl space-y-2"
                    style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}>
                    <p className="text-xs font-semibold" style={{ color: '#A0AEFF' }}>Novo explains</p>
                    {effectivelyPro ? (
                      isStreaming ? (
                        <p className="text-sm leading-relaxed animate-pulse" style={{ color: 'var(--color-text)' }}>
                          {streamingText || 'Thinking…'}
                        </p>
                      ) : streamingText ? (
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                          {streamingText}
                        </p>
                      ) : (
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                          {q.solution_text}
                        </p>
                      )
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-500)' }}>
                          Full solution and Novo's explanation are Pro features.
                        </p>
                        <button onClick={() => setShowPaywall(true)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-xl"
                          style={{ background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: 'var(--ink-950)' }}>
                          Unlock Full Solutions →
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {revealed && (
                <Button onClick={nextQuestion} className="w-full h-12 rounded-2xl font-bold"
                  style={{ background: examConfig.color, color: 'var(--color-on-accent)' }}>
                  {current >= questions.length - 1 ? 'See Results' : 'Next Question →'}
                </Button>
              )}
            </motion.div>
          )}

          {/* ── Result Phase ── */}
          {phase === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="px-4 py-8 space-y-6">
              <div className="text-center space-y-3">
                <Trophy size={52} color="#FBBF24" className="mx-auto" />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Session Complete!</h2>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {examConfig.label} · {questions.length} questions
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Correct', value: score.correct, color: '#34D399' },
                  { label: 'Marks',   value: `${score.marks}/${score.max}`, color: examConfig.color },
                  { label: 'Wrong',   value: questions.length - score.correct - answers.filter(a => a === null).length, color: '#F87171' },
                ].map(s => (
                  <div key={s.label} className="p-4 rounded-2xl text-center"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <Button onClick={() => { setPhase('browse'); setQuestions([]); setAnswers([]); setCurrent(0); }}
                  className="w-full h-12 rounded-2xl font-bold"
                  style={{ background: examConfig.color, color: 'var(--color-on-accent)' }}>
                  Practice Again
                </Button>
                <Button onClick={loadHeatmap} variant="outline" className="w-full h-12 rounded-2xl"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  <BarChart2 size={16} className="mr-2" /> View Topic Heatmap
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Pro paywall sheet */}
      <ProGate
        featureName="Unlimited PYQ Practice"
        featureDesc="5 free questions/day. Upgrade to unlock unlimited questions, full solutions, and Novo AI explanations."
        sheet
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
      >
        {/* children required by ProGate sheet mode — render nothing extra */}
        <></>
      </ProGate>
    </div>
  );
}
