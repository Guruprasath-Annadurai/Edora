import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Brain, ChevronLeft, CheckCircle, XCircle, Trophy, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { track } from '@/lib/analytics';
import type { QuizQuestion } from '@/types';

type Phase = 'setup' | 'loading' | 'exam' | 'result';

const TIME_OPTIONS  = [10, 15, 20, 30];
const COUNT_OPTIONS = [10, 15, 20];

export default function ExamSimulatorPage() {
  const { profile } = useAuth();
  const [phase, setPhase]     = useState<Phase>('setup');
  const [topic, setTopic]     = useState('');
  const [count, setCount]     = useState(10);
  const [minutes, setMinutes] = useState(15);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent]     = useState(0);
  const [answers, setAnswers]     = useState<(number | null)[]>([]);
  const [selected, setSelected]   = useState<number | null>(null);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [genError, setGenError]   = useState('');
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  // answersRef always mirrors answers state — avoids stale closure in timer
  const answersRef    = useRef<(number | null)[]>([]);
  // submittingRef prevents double-submit when timer fires at t=1 AND user clicks Submit simultaneously
  const submittingRef = useRef(false);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // countdown timer
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); submitExam(answersRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function generateExam() {
    if (!topic.trim() || !profile) return;
    submittingRef.current = false; // reset guard for new exam
    setGenError('');
    setPhase('loading');
    try {
      const parsed = await geminiJSON<QuizQuestion[]>(
        `Create ${count} challenging MCQ exam questions about "${topic}". Return ONLY valid JSON array with NO markdown: [{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}]. correct_answer is 0-indexed.`
      );
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No questions returned');
      const qs = parsed.map((q, i) => ({ ...q, id: `q${i}` }));
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setCurrent(0); setSelected(null);
      setTimeLeft(minutes * 60);
      setPhase('exam');
    } catch (err) {
      console.error('[ExamSimulator] generateExam error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to generate exam. Please try again.';
      setGenError(msg);
      setPhase('setup');
    }
  }

  function selectAnswer(idx: number) {
    if (answers[current] !== null) return;
    setSelected(idx);
    const updated = [...answers]; updated[current] = idx;
    setAnswers(updated);
  }

  function goNext() {
    if (current + 1 >= questions.length) { clearInterval(timerRef.current!); submitExam(answers); }
    else { setCurrent(c => c + 1); setSelected(answers[current + 1]); }
  }

  function goPrev() { if (current > 0) { setCurrent(c => c - 1); setSelected(answers[current - 1]); } }

  async function submitExam(finalAnswers: (number | null)[]) {
    // Guard: prevent double-submission from timer + manual submit race condition
    if (submittingRef.current) return;
    submittingRef.current = true;
    const score = finalAnswers.filter((a, i) => a === questions[i]?.correct_answer).length;
    setPhase('result');
    track('exam_complete', { topic, score, total: questions.length, duration_min: minutes });
    if (profile) {
      const { error: insertError } = await supabase.from('quiz_sessions').insert({
        user_id: profile.id, subject: topic, topic, questions,
        user_answers: finalAnswers, score,
        completed_at: new Date().toISOString(),
      });
      // Only award XP if the session was successfully persisted
      if (!insertError) {
        await supabase.rpc('increment_xp', { user_id: profile.id, amount: score * 15 });
      }
    }
  }

  const score   = answers.filter((a, i) => a === questions[i]?.correct_answer).length;
  const q       = questions[current];
  const pct     = Math.round((score / questions.length) * 100);
  const mm      = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss      = String(timeLeft % 60).padStart(2, '0');
  const timerUrgent = timeLeft < 60 && timeLeft > 0;

  return (
    <div className="flex flex-col h-full bg-gradient-page">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ background: 'rgba(10,12,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <Link aria-label="Go back" to="/tools"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} className="text-white" />
        </Link>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
          <Clock size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-bold text-white text-sm">Exam Simulator</h2>
          <p className="text-xs text-muted-foreground">Timed mock test with AI</p>
        </div>
        {phase === 'exam' && (
          <div className="px-3 py-1.5 rounded-xl font-mono font-bold text-sm"
            style={timerUrgent
              ? { background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }
              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {mm}:{ss}
          </div>
        )}
      </div>

      <div className="flex-1 native-scroll pb-nav">
        <AnimatePresence mode="wait">

          {/* SETUP */}
          {phase === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5 px-4 py-5">
              <div className="rounded-3xl p-5 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(59,130,246,0.12))', border: '1px solid rgba(124,58,237,0.2)' }}>
                <Clock size={36} className="mx-auto mb-3" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
                <h3 className="font-heading text-lg font-bold text-white">Simulate Real Exam Conditions</h3>
                <p className="text-sm text-muted-foreground mt-1">Timed questions · AI analysis · XP rewards</p>
              </div>

              <input type="text" placeholder="Subject / Topic (e.g. Organic Chemistry)"
                value={topic} onChange={e => setTopic(e.target.value)}
                className="rounded-2xl px-4 h-14 text-white placeholder:text-white/30 outline-none w-full"
                style={{ background: 'rgba(15,20,45,0.7)', border: '1px solid rgba(255,255,255,0.08)', WebkitUserSelect: 'text', userSelect: 'text' }} />

              <div>
                <p className="text-sm font-semibold text-white mb-2">Questions</p>
                <div className="flex gap-2">
                  {COUNT_OPTIONS.map(n => (
                    <button key={n} onClick={() => setCount(n)}
                      className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all"
                      style={count === n
                        ? { background: 'linear-gradient(135deg, #7C3AED, #3B82F6)', color: '#fff' }
                        : { background: 'rgba(15,20,45,0.7)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-2">Time Limit</p>
                <div className="flex gap-2">
                  {TIME_OPTIONS.map(m => (
                    <button key={m} onClick={() => setMinutes(m)}
                      className="flex-1 py-3 rounded-2xl text-xs font-semibold transition-all"
                      style={minutes === m
                        ? { background: 'linear-gradient(135deg, #7C3AED, #3B82F6)', color: '#fff' }
                        : { background: 'rgba(15,20,45,0.7)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              {genError && (
                <div className="rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <p className="text-sm text-red-400">{genError}</p>
                </div>
              )}

              <Button size="lg" onClick={generateExam} disabled={!topic.trim()} className="w-full">
                <Play size={18} /> Start Exam
              </Button>
            </motion.div>
          )}

          {/* LOADING */}
          {phase === 'loading' && (
            <motion.div key="loading" className="flex flex-col items-center justify-center h-full gap-6 px-4">
              <div className="relative w-20 h-20">
                <div className="w-20 h-20 rounded-full border-4 border-secondary border-t-primary animate-spin" />
                <Brain size={28} className="text-primary absolute inset-0 m-auto" />
              </div>
              <div className="text-center">
                <h2 className="font-heading text-xl font-bold text-white">Generating Exam…</h2>
                <p className="text-muted-foreground text-sm mt-1">AI is crafting {count} questions on {topic}</p>
              </div>
            </motion.div>
          )}

          {/* EXAM */}
          {phase === 'exam' && q && (
            <motion.div key={`q-${current}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4 px-4 py-4">
              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${((current + 1) / questions.length) * 100}%`, background: 'linear-gradient(135deg,#7C3AED,#3B82F6)' }} />
                </div>
                <span className="text-xs text-muted-foreground font-medium shrink-0">{current + 1}/{questions.length}</span>
              </div>

              {/* Question navigator dots */}
              <div className="flex gap-1 flex-wrap">
                {questions.map((_, i) => (
                  <button key={i} onClick={() => { setCurrent(i); setSelected(answers[i]); }}
                    className="w-6 h-6 rounded-full text-[10px] font-bold transition-all flex items-center justify-center"
                    style={{
                      background: answers[i] !== null
                        ? answers[i] === questions[i].correct_answer ? '#10B981' : '#EF4444'
                        : i === current ? '#7C3AED' : 'rgba(255,255,255,0.1)',
                      color: answers[i] !== null || i === current ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}>
                    {i + 1}
                  </button>
                ))}
              </div>

              <div className="rounded-3xl p-5"
                style={{ background: 'rgba(15,20,45,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#A78BFA' }}>Question {current + 1}</p>
                <p className="font-heading text-base font-semibold text-white leading-snug">{q.question}</p>
              </div>

              <div className="flex flex-col gap-2.5">
                {q.options?.map((opt, i) => {
                  const answered   = answers[current] !== null;
                  const isCorrect  = i === q.correct_answer;
                  const isSelected = i === answers[current];
                  let optBg = 'rgba(15,20,45,0.7)';
                  let optBorder = 'rgba(255,255,255,0.08)';
                  if (answered) {
                    if (isCorrect)       { optBg = 'rgba(16,185,129,0.12)'; optBorder = 'rgba(16,185,129,0.4)'; }
                    else if (isSelected) { optBg = 'rgba(239,68,68,0.12)';  optBorder = 'rgba(239,68,68,0.4)'; }
                  } else if (i === selected) { optBg = 'rgba(91,106,245,0.15)'; optBorder = 'rgba(91,106,245,0.5)'; }
                  return (
                    <button key={i} onClick={() => selectAnswer(i)}
                      className="w-full text-left p-4 rounded-2xl transition-all"
                      style={{ background: optBg, border: `1px solid ${optBorder}` }}>
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                          style={{
                            background: answered && isCorrect ? '#10B981'
                              : answered && isSelected ? '#EF4444'
                              : 'rgba(255,255,255,0.1)',
                          }}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-sm text-white/85 flex-1">{opt}</span>
                        {answered && isCorrect  && <CheckCircle size={15} style={{ color: '#34D399' }} className="shrink-0" />}
                        {answered && isSelected && !isCorrect && <XCircle size={15} style={{ color: '#F87171' }} className="shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {answers[current] !== null && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="rounded-2xl p-4 mb-3"
                    style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
                    <p className="text-xs text-primary font-semibold mb-1">Explanation</p>
                    <p className="text-sm text-white/80">{q.explanation}</p>
                  </div>
                </motion.div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={goPrev} disabled={current === 0} className="flex-1">← Prev</Button>
                <Button onClick={goNext} className="flex-1">
                  {current + 1 === questions.length ? 'Submit Exam' : 'Next →'}
                </Button>
              </div>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col gap-5 px-4 py-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <Trophy size={64} className="text-yellow-400" strokeWidth={1.5} />
                <div>
                  <p className="font-heading text-4xl font-bold text-white">{score}/{questions.length}</p>
                  <p className="text-muted-foreground mt-1">
                    {pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good effort!' : 'Keep practising!'}
                  </p>
                  <p className="text-primary font-semibold mt-2">+{score * 15} XP earned</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Score', value: `${pct}%` },
                  { label: 'Correct', value: score },
                  { label: 'Wrong', value: questions.length - score },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl p-3 text-center"
                    style={{ background: 'rgba(15,20,45,0.75)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="font-heading font-bold text-lg text-white">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Per-question breakdown */}
              <div className="flex flex-col gap-2">
                <p className="font-semibold text-sm text-white">Question Breakdown</p>
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-2xl"
                    style={answers[i] === q.correct_answer
                      ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }
                      : { background: 'rgba(239,68,68,0.08)',  border: '1px solid rgba(239,68,68,0.25)' }}>
                    {answers[i] === q.correct_answer
                      ? <CheckCircle size={16} style={{ color: '#34D399' }} className="shrink-0 mt-0.5" />
                      : <XCircle    size={16} style={{ color: '#F87171' }} className="shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white/85 leading-snug line-clamp-2">{q.question}</p>
                      {answers[i] !== q.correct_answer && (
                        <p className="text-[10px] mt-0.5" style={{ color: '#34D399' }}>Correct: {q.options?.[q.correct_answer]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => { setPhase('setup'); setAnswers([]); setCurrent(0); }}>New Exam</Button>
                <Link to="/tools"><Button className="w-full">Done</Button></Link>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
