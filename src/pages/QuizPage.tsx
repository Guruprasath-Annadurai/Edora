import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronLeft, CheckCircle, XCircle, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { QuizQuestion } from '@/types';

type Phase = 'setup' | 'loading' | 'quiz' | 'result';

export default function QuizPage() {
  const { profile } = useAuth();
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);

  async function generateQuiz() {
    if (!topic.trim()) return;
    setPhase('loading');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `Create ${count} MCQ questions about "${topic}". Return ONLY valid JSON array with NO markdown: [{"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}]. correct_answer is 0-indexed.` }],
            }],
          }),
        }
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as QuizQuestion[];
      const qs = parsed.map((q, i) => ({ ...q, id: `q${i}` }));
      setQuestions(qs);
      setCurrent(0); setAnswers([]); setSelected(null); setRevealed(false);
      setPhase('quiz');
    } catch { setPhase('setup'); }
  }

  function handleSelect(idx: number) {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
  }

  function next() {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);
    setSelected(null); setRevealed(false);
    if (current + 1 >= questions.length) {
      finishQuiz(newAnswers);
    } else {
      setCurrent(c => c + 1);
    }
  }

  async function finishQuiz(finalAnswers: number[]) {
    const score = finalAnswers.filter((a, i) => a === questions[i].correct_answer).length;
    setPhase('result');
    if (profile) {
      await supabase.from('quiz_sessions').insert({
        user_id: profile.id, subject: topic, topic,
        questions, score, completed_at: new Date().toISOString(),
      });
      await supabase.rpc('increment_xp', { user_id: profile.id, amount: score * 10 });
    }
  }

  const score = answers.filter((a, i) => a === questions[i]?.correct_answer).length;
  const q = questions[current];
  const progress = ((current) / questions.length) * 100;

  return (
    <div className="h-full native-scroll px-4 py-4">
      <AnimatePresence mode="wait">

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">AI Quiz</h1>
              <p className="text-muted-foreground text-sm">Generate instant MCQs on any topic</p>
            </div>
            <input type="text" placeholder="Topic (e.g. Laws of Motion)"
              value={topic} onChange={e => setTopic(e.target.value)}
              className="glass rounded-2xl px-4 h-14 bg-transparent text-foreground placeholder:text-muted-foreground outline-none w-full"
              style={{ WebkitUserSelect: 'text', userSelect: 'text' }} />
            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Number of Questions</p>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    className={`flex-1 py-3 rounded-2xl text-sm font-semibold transition-all
                      ${count === n ? 'bg-primary text-white' : 'glass text-muted-foreground'}`}>{n}</button>
                ))}
              </div>
            </div>
            <Button size="lg" onClick={generateQuiz} disabled={!topic.trim()} className="w-full">
              <Brain size={18} /> Generate Quiz
            </Button>
          </motion.div>
        )}

        {/* ── LOADING ── */}
        {phase === 'loading' && (
          <motion.div key="loading" className="flex flex-col items-center justify-center h-full gap-6">
            <div className="relative w-20 h-20">
              <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Brain size={28} className="text-primary absolute inset-0 m-auto" />
            </div>
            <div className="text-center">
              <h2 className="font-heading text-xl font-bold text-foreground">Generating Quiz…</h2>
              <p className="text-muted-foreground text-sm mt-1">Nova is crafting your questions</p>
            </div>
          </motion.div>
        )}

        {/* ── QUIZ ── */}
        {phase === 'quiz' && q && (
          <motion.div key={`q-${current}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }} className="flex flex-col gap-4 h-full">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setPhase('setup')}><ChevronLeft size={18} /></Button>
              <div className="flex-1">
                <Progress value={progress} className="h-2" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">{current + 1}/{questions.length}</span>
            </div>

            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-primary font-semibold uppercase tracking-wide mb-3">Question {current + 1}</p>
                <p className="font-heading text-base font-semibold text-foreground leading-snug">{q.question}</p>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2.5 flex-1">
              {q.options?.map((opt, i) => {
                const isCorrect = i === q.correct_answer;
                const isSelected = i === selected;
                let bg = 'glass';
                let border = 'border-transparent';
                if (revealed) {
                  if (isCorrect) { bg = 'bg-green-500/15'; border = 'border-green-500/50'; }
                  else if (isSelected) { bg = 'bg-red-500/15'; border = 'border-red-500/50'; }
                }
                return (
                  <button key={i} onClick={() => handleSelect(i)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-98 ${bg} ${border}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                        ${revealed && isCorrect ? 'bg-green-500 text-white' : revealed && isSelected ? 'bg-red-500 text-white' : 'bg-secondary text-muted-foreground'}`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm text-foreground">{opt}</span>
                      {revealed && isCorrect && <CheckCircle size={16} className="text-green-400 ml-auto shrink-0" />}
                      {revealed && isSelected && !isCorrect && <XCircle size={16} className="text-red-400 ml-auto shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {revealed && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-primary font-semibold mb-1">Explanation</p>
                    <p className="text-sm text-foreground">{q.explanation}</p>
                  </CardContent>
                </Card>
                <Button onClick={next} className="w-full">
                  {current + 1 === questions.length ? 'See Results' : 'Next Question'}
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full gap-6">
            <Trophy size={72} className="text-yellow-400" strokeWidth={1.5} />
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold text-foreground">{score}/{questions.length}</h2>
              <p className="text-muted-foreground mt-1">
                {score === questions.length ? 'Perfect score! 🎉' : score >= questions.length * 0.7 ? 'Great job! 👏' : 'Keep practising! 💪'}
              </p>
              <p className="text-primary font-semibold mt-2">+{score * 10} XP earned</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
              <Button variant="secondary" onClick={() => { setCurrent(0); setAnswers([]); setSelected(null); setRevealed(false); setPhase('quiz'); }}>
                Retry
              </Button>
              <Button onClick={() => setPhase('setup')}>New Quiz</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
