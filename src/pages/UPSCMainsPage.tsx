// ═══════════════════════════════════════════════════════════════
// UPSCMainsPage — answer-writing practice for subjective/long-answer papers:
// UPSC Mains (Essay/GS1-4) and CBSE Class 10/12 board long-answer questions.
// No MCQ scoring reuse: student writes a full answer, Nemotron/Gemini gives
// band-based feedback (not a fake-precise numeric score — subjective grading
// is holistic and we have no official calibration data) against a real model
// answer's key points.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, PenLine, CheckCircle2, XCircle, Loader2, Clock, ChevronRight, BookOpen, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

interface MainsQuestion {
  id: string;
  exam: 'UPSC' | 'CBSE';
  class_level: string | null;
  paper: string;
  topic: string;
  question_text: string;
  word_limit: number;
  marks: number;
  difficulty: string;
}

interface Evaluation {
  band: 'needs_work' | 'developing' | 'good' | 'excellent';
  covered_points: string[];
  missed_points: string[];
  structure_feedback: string;
  suggestions: string[];
  word_count: number;
}

const BAND_META: Record<string, { label: string; color: string }> = {
  needs_work: { label: 'Needs Work', color: '#EF4444' },
  developing: { label: 'Developing', color: '#F59E0B' },
  good:       { label: 'Good',       color: '#34D399' },
  excellent:  { label: 'Excellent',  color: '#5B6AF5' },
};

const PAPER_COLORS: Record<string, string> = {
  Essay: '#A78BFA', GS1: '#60A5FA', GS2: '#34D399', GS3: '#F59E0B', GS4: '#F87171',
  Science: '#34D399', 'Social Science': '#F59E0B', Physics: '#60A5FA', Biology: '#4ADE80', Maths: '#F87171',
};

async function callFn(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke('mains-answer-evaluator', {
    body: { action, ...body },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
}

export default function UPSCMainsPage() {
  const { user } = useAuth();
  const [exam, setExam] = useState<'UPSC' | 'CBSE'>('UPSC');
  const [classLevel, setClassLevel] = useState<'10' | '12'>('10');
  const [questions, setQuestions] = useState<MainsQuestion[]>([]);
  const [selected, setSelected] = useState<MainsQuestion | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [modelAnswer, setModelAnswer] = useState<string | null>(null);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const [error, setError] = useState('');

  const loadQuestions = useCallback(async () => {
    const { data } = await callFn('list_questions', exam === 'CBSE' ? { exam, class_level: classLevel } : { exam });
    if (data?.questions) setQuestions(data.questions);
  }, [exam, classLevel]);

  useEffect(() => { if (user) loadQuestions(); }, [user, loadQuestions]);

  function pickQuestion(q: MainsQuestion) {
    setSelected(q);
    setAnswerText('');
    setEvaluation(null);
    setModelAnswer(null);
    setShowModelAnswer(false);
    setError('');
    track('upsc_mains_question_opened', { exam: q.exam, paper: q.paper, topic: q.topic });
  }

  async function submitAnswer() {
    if (!selected || !answerText.trim()) return;
    setEvaluating(true);
    setError('');
    try {
      const { data, error: fnError } = await callFn('evaluate', {
        question_id: selected.id,
        answer_text: answerText.trim(),
      });
      if (fnError || !data?.evaluation) throw new Error(fnError?.message ?? 'No evaluation returned');
      setEvaluation(data.evaluation as Evaluation);
      setModelAnswer(typeof data.model_answer === 'string' ? data.model_answer : null);
      track('upsc_mains_answer_evaluated', { exam: selected.exam, paper: selected.paper, band: data.evaluation.band });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed. Please try again.');
    } finally {
      setEvaluating(false);
    }
  }

  const wordCount = answerText.trim() ? answerText.trim().split(/\s+/).length : 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Link aria-label="Go back" to="/tools">
          <motion.button whileTap={{ scale: 0.92 }} className="p-2 rounded-xl"
            style={{ background: 'var(--color-surface)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          </motion.button>
        </Link>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Mains &amp; Long-Answer Practice</h1>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
              FREE · BETA
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Answer writing · AI feedback, not an official grade
          </p>
        </div>
      </div>

      {/* CEO decision: starter-depth content isn't yet worth charging for —
          free during beta, no ProGate. Revisit once content depth scales. */}
      <>
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="px-4 py-5 space-y-3">
              <div className="flex gap-2">
                {(['UPSC', 'CBSE'] as const).map(e => (
                  <button key={e} onClick={() => setExam(e)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={e === exam
                      ? { background: 'rgba(91,106,245,0.15)', color: '#5B6AF5', border: '1px solid #5B6AF5' }
                      : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    {e === 'UPSC' ? 'UPSC Mains' : 'CBSE Boards'}
                  </button>
                ))}
                {exam === 'CBSE' && (['10', '12'] as const).map(c => (
                  <button key={c} onClick={() => setClassLevel(c)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={c === classLevel
                      ? { background: 'rgba(91,106,245,0.15)', color: '#5B6AF5', border: '1px solid #5B6AF5' }
                      : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    Class {c}
                  </button>
                ))}
              </div>
              <p className="text-[11px]" style={{ color: '#F59E0B' }}>
                Starter set of {questions.length} original practice questions (not real {exam === 'CBSE' ? 'CBSE board PYQs' : 'UPSC PYQs'} — those are copyrighted).
                Feedback is a coarse band + specific gaps, never a fake-precise score.
              </p>
              {questions.map(q => (
                <button key={q.id} onClick={() => pickQuestion(q)}
                  className="w-full p-4 rounded-2xl text-left transition-all"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${PAPER_COLORS[q.paper] ?? '#5B6AF5'}20`, color: PAPER_COLORS[q.paper] ?? '#5B6AF5' }}>
                      {q.paper}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {q.marks} marks · {q.word_limit} words
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--color-text)' }}>
                    {q.question_text}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{q.topic}</span>
                    <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />
                  </div>
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="answer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="px-4 py-5 space-y-4">
              <button onClick={() => setSelected(null)} className="text-xs"
                style={{ color: 'var(--color-text-secondary)' }}>← Back to questions</button>

              <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${PAPER_COLORS[selected.paper] ?? '#5B6AF5'}20`, color: PAPER_COLORS[selected.paper] ?? '#5B6AF5' }}>
                    {selected.paper}
                  </span>
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                    <Clock size={11} /> {selected.word_limit}-word limit · {selected.marks} marks
                  </span>
                </div>
                <p className="text-base font-medium leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  {selected.question_text}
                </p>
              </div>

              {!evaluation ? (
                <>
                  <textarea
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    placeholder="Write your answer here…"
                    rows={12}
                    className="w-full p-4 rounded-2xl text-sm leading-relaxed resize-none"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {wordCount} / {selected.word_limit} words
                    </span>
                  </div>
                  {error && <p className="text-xs" style={{ color: '#F87171' }}>{error}</p>}
                  <Button onClick={submitAnswer} disabled={evaluating || !answerText.trim()}
                    className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2"
                    style={{ background: '#5B6AF5', color: 'var(--color-on-accent)' }}>
                    {evaluating ? <><Loader2 size={16} className="animate-spin" /> Evaluating…</> : <><PenLine size={16} /> Submit for Feedback</>}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl text-center"
                    style={{ background: `${BAND_META[evaluation.band]?.color ?? '#5B6AF5'}15`, border: `1px solid ${BAND_META[evaluation.band]?.color ?? '#5B6AF5'}` }}>
                    <p className="text-lg font-bold" style={{ color: BAND_META[evaluation.band]?.color ?? '#5B6AF5' }}>
                      {BAND_META[evaluation.band]?.label ?? evaluation.band}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      AI practice feedback — not an official UPSC evaluation
                    </p>
                  </div>

                  {evaluation.structure_feedback && (
                    <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Structure</p>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{evaluation.structure_feedback}</p>
                    </div>
                  )}

                  {evaluation.covered_points.length > 0 && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#34D399' }}>
                        <CheckCircle2 size={13} /> Covered
                      </p>
                      <ul className="space-y-1">
                        {evaluation.covered_points.map((p, i) => (
                          <li key={i} className="text-sm" style={{ color: 'var(--color-text)' }}>• {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {evaluation.missed_points.length > 0 && (
                    <div className="p-4 rounded-2xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#F87171' }}>
                        <XCircle size={13} /> Missed
                      </p>
                      <ul className="space-y-1">
                        {evaluation.missed_points.map((p, i) => (
                          <li key={i} className="text-sm" style={{ color: 'var(--color-text)' }}>• {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {evaluation.suggestions.length > 0 && (
                    <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>Suggestions</p>
                      <ul className="space-y-1.5">
                        {evaluation.suggestions.map((s, i) => (
                          <li key={i} className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{i + 1}. {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {modelAnswer && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <button onClick={() => setShowModelAnswer(v => !v)}
                        className="w-full p-4 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                          <BookOpen size={13} /> Model Answer
                        </span>
                        {showModelAnswer ? <EyeOff size={14} style={{ color: 'var(--color-text-secondary)' }} /> : <Eye size={14} style={{ color: 'var(--color-text-secondary)' }} />}
                      </button>
                      {showModelAnswer && (
                        <div className="px-4 pb-4">
                          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>{modelAnswer}</p>
                          <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                            This is a reference answer, not the only correct approach — compare how you structured and covered the topic.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <Button onClick={() => setSelected(null)} variant="outline" className="w-full h-12 rounded-2xl"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    Practice Another Question
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    </div>
  );
}
