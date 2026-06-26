import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Filter, Flame, Trophy, BookOpen, CheckCircle, XCircle, BarChart2, Clock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiCall } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';

type ExamType = 'JEE_Main' | 'JEE_Advanced' | 'NEET' | 'CBSE_10' | 'CBSE_12';
type Phase = 'browse' | 'heatmap' | 'quiz' | 'result';

interface PYQQuestion {
  id: string;
  exam_type: string;
  year: number;
  subject: string;
  chapter: string;
  concept: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: string;
  marks_positive: number;
  marks_negative: number;
}

interface TopicFreq {
  subject: string;
  chapter: string;
  concept: string;
  total_questions: number;
  years_appeared: number;
  avg_difficulty: number;
  last_year: number;
}

const EXAM_OPTIONS: { id: ExamType; label: string; color: string; subjects: string[] }[] = [
  { id: 'JEE_Main',     label: 'JEE Main',     color: '#60A5FA', subjects: ['Physics','Chemistry','Maths'] },
  { id: 'JEE_Advanced', label: 'JEE Advanced',  color: '#A78BFA', subjects: ['Physics','Chemistry','Maths'] },
  { id: 'NEET',         label: 'NEET',          color: '#34D399', subjects: ['Physics','Chemistry','Biology'] },
  { id: 'CBSE_10',      label: 'CBSE Class 10', color: '#FBBF24', subjects: ['Maths','Science','Social Science'] },
  { id: 'CBSE_12',      label: 'CBSE Class 12', color: '#FB923C', subjects: ['Physics','Chemistry','Biology','Maths'] },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function difficultyColor(d: string) {
  if (d === 'easy')   return '#34D399';
  if (d === 'medium') return '#FBBF24';
  return '#F87171';
}

function heatColor(intensity: number): string {
  // 0–1 intensity → blue to orange-red
  const r = Math.round(30  + intensity * 225);
  const g = Math.round(144 - intensity * 100);
  const b = Math.round(255 - intensity * 220);
  return `rgb(${r},${g},${b})`;
}

export default function PYQBankPage() {
  const { profile } = useAuth();
  const [phase, setPhase]       = useState<Phase>('browse');
  const [examType, setExamType] = useState<ExamType>('JEE_Main');
  const [subject, setSubject]   = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [diffFilter, setDiffFilter] = useState<string>('');
  const [questions, setQuestions]   = useState<PYQQuestion[]>([]);
  const [heatData, setHeatData]     = useState<TopicFreq[]>([]);
  const [loading, setLoading]       = useState(false);
  const [current, setCurrent]       = useState(0);
  const [answers, setAnswers]       = useState<(number | null)[]>([]);
  const [revealed, setRevealed]     = useState(false);
  const [novoExp, setNovoExp]       = useState('');
  const [loadingExp, setLoadingExp] = useState(false);
  const [score, setScore]           = useState({ correct: 0, marks: 0, max: 0 });

  const examConfig = EXAM_OPTIONS.find(e => e.id === examType)!;
  const years = Array.from({ length: 11 }, (_, i) => 2024 - i);

  async function loadHeatmap() {
    setLoading(true);
    setPhase('heatmap');
    const { data } = await supabase
      .from('pyq_topic_frequency')
      .select('*')
      .eq('exam_type', examType)
      .order('total_questions', { ascending: false })
      .limit(50);
    setHeatData((data ?? []) as TopicFreq[]);
    setLoading(false);
    track('pyq_heatmap_viewed', { exam_type: examType });
  }

  async function startPractice() {
    if (!profile) return;
    setLoading(true);
    let query = supabase
      .from('pyq_questions')
      .select('*')
      .eq('exam_type', examType)
      .order('year', { ascending: false })
      .limit(20);
    if (subject)     query = query.eq('subject', subject);
    if (yearFilter)  query = query.eq('year', yearFilter);
    if (diffFilter)  query = query.eq('difficulty', diffFilter);

    const { data, error } = await query;
    if (error || !data?.length) {
      // No real PYQs yet — generate sample via Gemini with language support
      setLoading(false);
      await generateSamplePYQs();
      return;
    }
    setQuestions(data as PYQQuestion[]);
    setAnswers(new Array(data.length).fill(null));
    setCurrent(0); setRevealed(false); setNovoExp('');
    setPhase('quiz');
    setLoading(false);
    track('pyq_practice_started', { exam_type: examType, subject, count: data.length });
  }

  async function generateSamplePYQs() {
    setLoading(true);
    const langInstr = getLangInstruction(profile?.preferred_language);
    const subj = subject || examConfig.subjects[0];
    const prompt = `Generate 10 realistic ${examType.replace('_', ' ')} previous year MCQ questions about ${subj}.${yearFilter ? ` Year: ${yearFilter}.` : ' Mix years 2015-2024.'}
Each should feel like a real exam question with 4 options and detailed explanation.${langInstr}
Return ONLY JSON array: [{"question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","difficulty":"medium","year":2023,"subject":"${subj}","chapter":"Chapter Name","concept":"Concept Name"}]`;
    try {
      const raw = await geminiCall(prompt);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('no json');
      const parsed: PYQQuestion[] = JSON.parse(match[0]).map((q: PYQQuestion, i: number) => ({
        ...q, id: `gen_${i}`, exam_type: examType,
        marks_positive: 4, marks_negative: 1,
      }));
      setQuestions(parsed);
      setAnswers(new Array(parsed.length).fill(null));
      setCurrent(0); setRevealed(false); setNovoExp('');
      setPhase('quiz');
    } catch {
      alert('Failed to load questions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchNovoExplanation(q: PYQQuestion) {
    if (novoExp || loadingExp) return;
    setLoadingExp(true);
    const langInstr = getLangInstruction(profile?.preferred_language);
    const prompt = `You are Novo, an expert ${examType.replace('_',' ')} tutor.
Question: ${q.question}
Correct answer: ${q.options[q.correct_idx]}
Explain WHY this answer is correct, the underlying concept, and a memory trick to never forget it.${langInstr}
Keep it under 120 words. Be encouraging and conversational.`;
    try {
      const resp = await geminiCall(prompt);
      setNovoExp(resp);
    } catch { /* silently ignore */ }
    setLoadingExp(false);
  }

  function selectAnswer(idx: number) {
    if (answers[current] !== null) return;
    const updated = [...answers]; updated[current] = idx;
    setAnswers(updated);
    setRevealed(true);
    const q = questions[current];
    fetchNovoExplanation(q);
  }

  function nextQuestion() {
    if (current >= questions.length - 1) {
      finishSession();
    } else {
      setCurrent(c => c + 1);
      setRevealed(false);
      setNovoExp('');
    }
  }

  function finishSession() {
    let correct = 0, marks = 0;
    questions.forEach((q, i) => {
      const a = answers[i];
      if (a === null) return;
      if (a === q.correct_idx) { correct++; marks += q.marks_positive; }
      else marks -= q.marks_negative;
    });
    setScore({ correct, marks: Math.max(0, marks), max: questions.reduce((s, q) => s + q.marks_positive, 0) });
    setPhase('result');
    track('pyq_session_completed', { exam_type: examType, correct, total: questions.length });
  }

  const q = questions[current];

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
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>PYQ Bank</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>10-year question archive</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-nav">
      <AnimatePresence mode="wait">
        {/* ── Browse Phase ── */}
        {phase === 'browse' && (
          <motion.div key="browse" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-4 py-5 space-y-6">

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
                    className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
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
                    className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
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
                    className="px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all"
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
              <Button onClick={startPractice} disabled={loading} className="w-full h-12 rounded-2xl font-bold"
                style={{ background: examConfig.color, color: '#0A0A0F' }}>
                {loading ? 'Loading...' : '▶ Start Practice'}
              </Button>
              <Button onClick={loadHeatmap} disabled={loading} variant="outline" className="w-full h-12 rounded-2xl font-semibold"
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
                  No data yet — start practicing to build your heatmap.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {heatData.map((t, i) => {
                  const maxQ  = Math.max(...heatData.map(x => x.total_questions));
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

            {/* Meta */}
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
                {q.question}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const ans = answers[current];
                const isSelected = ans === i;
                const isCorrect  = i === q.correct_idx;
                const showResult = revealed && ans !== null;
                let bg = 'var(--color-surface)';
                let border = 'var(--color-border)';
                let textCol = 'var(--color-text)';
                if (showResult) {
                  if (isCorrect)              { bg = 'rgba(52,211,153,0.15)'; border = '#34D399'; textCol = '#34D399'; }
                  else if (isSelected)        { bg = 'rgba(248,113,113,0.15)'; border = '#F87171'; textCol = '#F87171'; }
                }
                return (
                  <motion.button key={i} whileTap={{ scale: 0.98 }}
                    onClick={() => selectAnswer(i)} disabled={revealed}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                    style={{ background: bg, border: `1.5px solid ${border}` }}>
                    <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: `${examConfig.color}20`, color: examConfig.color }}>
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="text-sm font-medium" style={{ color: textCol }}>{opt}</span>
                    {showResult && isCorrect && <CheckCircle size={16} color="#34D399" className="ml-auto flex-shrink-0" />}
                    {showResult && isSelected && !isCorrect && <XCircle size={16} color="#F87171" className="ml-auto flex-shrink-0" />}
                  </motion.button>
                );
              })}
            </div>

            {/* Novo explanation */}
            <AnimatePresence>
              {revealed && (
                <motion.div key="exp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl space-y-2"
                  style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}>
                  <p className="text-xs font-semibold" style={{ color: '#A0AEFF' }}>Novo explains</p>
                  {loadingExp ? (
                    <p className="text-xs animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>Thinking…</p>
                  ) : novoExp ? (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{novoExp}</p>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{q.explanation}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {revealed && (
              <Button onClick={nextQuestion} className="w-full h-12 rounded-2xl font-bold"
                style={{ background: examConfig.color, color: '#0A0A0F' }}>
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
                style={{ background: examConfig.color, color: '#0A0A0F' }}>
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
    </div>
  );
}
