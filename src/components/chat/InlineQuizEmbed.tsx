// Inline quiz widget rendered inside a chat bubble when Novo detects "quiz me" intent

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ChevronRight, Trophy, Clock } from 'lucide-react';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  questions: QuizQuestion[];
  subject?: string;
  topic: string;
  onComplete: (score: number, total: number, wrongIndices: number[]) => void;
}

export function InlineQuizEmbed({ questions, topic, onComplete }: Props) {
  const [current, setCurrent]       = useState(0);
  const [selected, setSelected]     = useState<number | null>(null);
  const [revealed, setRevealed]     = useState(false);
  const [score, setScore]           = useState(0);
  const [wrongIndices, setWrong]    = useState<number[]>([]);
  const [done, setDone]             = useState(false);
  const [timeLeft, setTimeLeft]     = useState(20);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const q = questions[current];

  useEffect(() => {
    if (done || revealed) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleReveal(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, done, revealed]);

  function handleReveal(idx: number | null) {
    clearInterval(timerRef.current!);
    setSelected(idx);
    setRevealed(true);
    const correct = idx === q.correctIndex;
    if (correct) setScore(s => s + 1);
    else setWrong(w => [...w, current]);
  }

  function next() {
    if (current + 1 >= questions.length) {
      setDone(true);
      const finalScore = score + (selected === q.correctIndex ? 1 : 0);
      const finalWrong = selected !== q.correctIndex ? [...wrongIndices, current] : wrongIndices;
      onComplete(finalScore, questions.length, finalWrong);
    } else {
      setCurrent(c => c + 1);
      setSelected(null);
      setRevealed(false);
      setTimeLeft(20);
    }
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    const msg = pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good effort!' : 'Keep practising!';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ background: 'var(--ink-040)', borderRadius: 16, padding: '20px 18px', border: '1px solid var(--ink-080)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Trophy size={22} color="#F59E0B" />
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink-950)' }}>Quiz Complete</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: pct >= 60 ? '#10B981' : '#F87171', marginBottom: 4 }}>{pct}%</div>
        <div style={{ fontSize: 13, color: 'var(--ink-600)', marginBottom: 4 }}>{score} / {questions.length} correct · {msg}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-350)', marginTop: 8 }}>Topic: {topic}</div>
      </motion.div>
    );
  }

  const timerPct = (timeLeft / 20) * 100;
  const timerColor = timeLeft > 10 ? '#10B981' : timeLeft > 5 ? '#F59E0B' : '#F87171';

  return (
    <motion.div
      key={current}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: 'var(--ink-040)', borderRadius: 16, padding: '18px 16px', border: '1px solid var(--ink-080)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-350)', letterSpacing: 0.5 }}>
          Q {current + 1} / {questions.length} · {topic}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={12} color={timerColor} />
          <span style={{ fontSize: 12, fontWeight: 700, color: timerColor }}>{timeLeft}s</span>
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ height: 3, background: 'var(--ink-080)', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${timerPct}%` }}
          transition={{ duration: 0.4 }}
          style={{ height: '100%', background: timerColor, borderRadius: 2 }}
        />
      </div>

      {/* Question */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-950)', lineHeight: 1.55, marginBottom: 14 }}>{q.question}</div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, i) => {
          let bg = 'var(--ink-050)';
          let border = 'var(--ink-100)';
          let textColor = 'var(--ink-800)';
          if (revealed) {
            if (i === q.correctIndex) { bg = 'rgba(16,185,129,0.15)'; border = '#10B981'; textColor = '#10B981'; }
            else if (i === selected)  { bg = 'rgba(248,113,113,0.15)'; border = '#F87171'; textColor = '#F87171'; }
          } else if (selected === i) {
            bg = 'rgba(91,106,245,0.15)'; border = '#5B6AF5';
          }
          return (
            <motion.button
              key={i}
              whileTap={!revealed ? { scale: 0.98 } : {}}
              onClick={() => !revealed && handleReveal(i)}
              style={{
                width: '100%', textAlign: 'left', background: bg, border: `1px solid ${border}`,
                borderRadius: 10, padding: '10px 12px', cursor: revealed ? 'default' : 'pointer',
                color: textColor, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
              }}
            >
              <span style={{ minWidth: 20, height: 20, borderRadius: 6, background: 'var(--ink-080)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span style={{ flex: 1 }}>{opt}</span>
              {revealed && i === q.correctIndex && <Check size={14} color="#10B981" strokeWidth={3} />}
              {revealed && i === selected && i !== q.correctIndex && <X size={14} color="#F87171" strokeWidth={3} />}
            </motion.button>
          );
        })}
      </div>

      {/* Explanation + Next */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--ink-040)', borderRadius: 10, fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.6 }}>
              {q.explanation}
            </div>
            <button
              onClick={next}
              style={{ marginTop: 12, width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#5B6AF5,#818CF8)', color: 'var(--ink-950)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {current + 1 >= questions.length ? 'See Results' : 'Next Question'}
              <ChevronRight size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
