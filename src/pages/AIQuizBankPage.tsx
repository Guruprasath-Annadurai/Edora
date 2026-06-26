import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Brain, Sparkles, CheckCircle, XCircle, Flag, ChevronDown, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';
import { AIFeedback, logAIInteraction } from '@/components/ui/AIFeedback';

type Phase = 'setup' | 'generating' | 'quiz' | 'result';
type FlagReason = 'wrong_answer' | 'unclear' | 'too_easy' | 'too_hard' | 'duplicate' | 'other';

interface AIQuestion {
  id: string;
  subject: string;
  chapter: string;
  concept: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: string;
  ability_target: number | null;
  language: string;
}

const SUBJECTS = [
  { name: 'Physics',   color: '#60A5FA', icon: '⚛️' },
  { name: 'Chemistry', color: '#34D399', icon: '🧪' },
  { name: 'Maths',     color: '#A78BFA', icon: '📐' },
  { name: 'Biology',   color: '#4ADE80', icon: '🧬' },
  { name: 'History',   color: '#FBBF24', icon: '📜' },
  { name: 'Geography', color: '#FB923C', icon: '🌏' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const FLAG_REASONS: { id: FlagReason; label: string }[] = [
  { id: 'wrong_answer', label: 'Wrong answer key' },
  { id: 'unclear',      label: 'Question is unclear' },
  { id: 'too_easy',     label: 'Too easy for level' },
  { id: 'too_hard',     label: 'Way too hard' },
  { id: 'duplicate',    label: 'Already seen this' },
  { id: 'other',        label: 'Other issue' },
];

export default function AIQuizBankPage() {
  const { profile }  = useAuth();
  const [phase, setPhase]     = useState<Phase>('setup');
  const [subject, setSubject] = useState('Physics');
  const [chapter, setChapter] = useState('');
  const [count, setCount]     = useState(10);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [novoExp, setNovoExp] = useState('');
  const [loadingExp, setLoadingExp] = useState(false);
  const [flagModal, setFlagModal] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [expInteractionId, setExpInteractionId] = useState<string | null>(null);
  const [abilityScore, setAbilityScore] = useState(0); // IRT theta
  const [streak, setStreak]   = useState(0);
  const subjectConfig = SUBJECTS.find(s => s.name === subject) ?? SUBJECTS[0];

  // Estimate ability from previous quiz performances
  useEffect(() => {
    if (!profile) return;
    supabase.from('topic_performance')
      .select('accuracy_pct, total_attempts')
      .eq('user_id', profile.id)
      .eq('subject', subject)
      .limit(10)
      .then(({ data }) => {
        if (!data?.length) return;
        const avg = data.reduce((s, d) => s + (d.accuracy_pct ?? 50), 0) / data.length;
        // Map 0-100% accuracy to -2 to +2 IRT theta
        setAbilityScore(((avg - 50) / 50) * 2);
      });
  }, [profile, subject]);

  async function generateQuestions() {
    if (!profile) return;
    setPhase('generating');
    const langInstr = getLangInstruction(profile.preferred_language);
    // Calibrate difficulty to IRT theta
    const diffMap: Record<string, string> = {
      hard: 'hard (advanced level)',
      medium: 'medium (moderate application)',
      easy: 'easy (basic recall)',
    };
    const targetDiff = abilityScore > 0.5 ? 'hard' : abilityScore < -0.5 ? 'easy' : 'medium';
    const prompt = `Generate ${count} novel ${diffMap[targetDiff]} ${subject} MCQ questions${chapter ? ` on "${chapter}"` : ' covering diverse topics'}.
These must be ORIGINAL questions — not copied from any textbook. Test deep conceptual understanding.${langInstr}
Return ONLY valid JSON array: [{"subject":"${subject}","chapter":"Chapter Name","concept":"Key Concept","question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","difficulty":"${targetDiff}"}]`;

    try {
      const resp = await fetch('/api/ai-questions', {
        method: 'POST',
        body: JSON.stringify({ prompt, count }),
      }).then(r => r.json()).catch(() => null);

      let parsed: AIQuestion[] | null = null;
      if (resp?.questions) {
        parsed = resp.questions;
      } else {
        // Fallback: generate via supabase edge function
        const { data: fnData } = await supabase.functions.invoke('ai-question-gen', {
          body: { subject, chapter, count, ability_score: abilityScore, language: profile.preferred_language ?? 'en' },
        });
        parsed = fnData?.questions ?? null;
      }

      if (!parsed?.length) throw new Error('No questions');
      const qs: AIQuestion[] = parsed.map((q, i) => ({ ...q, id: `ai_${i}_${Date.now()}`, ability_target: abilityScore, language: profile.preferred_language ?? 'en' }));
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setCurrent(0); setRevealed(false); setNovoExp(''); setExpInteractionId(null); setStreak(0);
      setPhase('quiz');
      track('ai_quiz_started', { subject, count, difficulty: targetDiff, ability: abilityScore });
    } catch {
      alert('Failed to generate questions. Please try again.');
      setPhase('setup');
    }
  }

  async function fetchNovoExp(q: AIQuestion) {
    if (novoExp || loadingExp) return;
    setLoadingExp(true);
    setExpInteractionId(null);
    const langInstr = getLangInstruction(profile?.preferred_language);
    const startMs = Date.now();
    try {
      const { data } = await supabase.functions.invoke('gemini-chat', {
        body: {
          prompt: `Explain why "${q.options[q.correct_idx]}" is correct for: ${q.question}. Be concise (80 words max).${langInstr}`,
        },
      });
      const explanation = data?.text ?? q.explanation;
      setNovoExp(explanation);

      // Log to AI flywheel — non-blocking
      if (profile) {
        logAIInteraction({
          userId:      profile.id,
          sessionType: 'quiz_explain',
          userQuery:   q.question,
          aiResponse:  explanation,
          subject:     q.subject,
          topic:       q.concept,
          modelUsed:   'gemini-2.0-flash',
          responseMs:  Date.now() - startMs,
          language:    profile.preferred_language ?? 'en',
        }).then(id => { if (id) setExpInteractionId(id); });
      }
    } catch { setNovoExp(q.explanation); }
    setLoadingExp(false);
  }

  function selectAnswer(idx: number) {
    if (answers[current] !== null) return;
    const updated = [...answers]; updated[current] = idx;
    setAnswers(updated);
    setRevealed(true);
    const q = questions[current];
    if (idx === q.correct_idx) {
      setStreak(s => s + 1);
      // Update IRT: correct → increase ability estimate
      setAbilityScore(a => Math.min(2, a + 0.15));
    } else {
      setStreak(0);
      setAbilityScore(a => Math.max(-2, a - 0.1));
    }
    fetchNovoExp(q);
  }

  async function flagQuestion(reason: FlagReason) {
    if (!profile || flagging) return;
    const q = questions[current];
    setFlagging(true);
    // Insert into unified question_reports for moderation dashboard
    const reportType = reason === 'wrong_answer' ? 'wrong_answer'
      : reason === 'unclear'   ? 'ambiguous'
      : reason === 'other'     ? 'other'
      : 'other';
    await Promise.allSettled([
      supabase.from('question_reports').insert({
        user_id:       profile.id,
        question_id:   q.id.startsWith('ai_') ? null : q.id,
        question_text: q.question,
        report_type:   reportType,
        details:       `Flagged as: ${reason}. Subject: ${subject}, Chapter: ${q.chapter ?? 'N/A'}`,
      }),
      // Legacy table — keep for backwards compat
      !q.id.startsWith('ai_') && supabase.from('ai_question_flags').upsert({
        question_id: q.id, user_id: profile.id, reason,
      }, { onConflict: 'question_id,user_id' }),
    ]);
    setFlagging(false);
    setFlagModal(false);
    track('ai_question_flagged', { subject, reason });
    await import('@capacitor/toast').then(({ Toast }) =>
      Toast.show({ text: 'Thanks for the report! We\'ll review it.', duration: 'short' })
    );
  }

  function nextQuestion() {
    if (current >= questions.length - 1) {
      const correct = answers.filter((a, i) => a === questions[i]?.correct_idx).length;
      track('ai_quiz_completed', { subject, correct, total: questions.length, ability: abilityScore });
      setPhase('result');
    } else {
      setCurrent(c => c + 1);
      setRevealed(false); setNovoExp(''); setExpInteractionId(null);
    }
  }

  const q = questions[current];
  const correctCount = answers.filter((a, i) => a === questions[i]?.correct_idx).length;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <motion.button whileTap={{ scale: 0.92 }}
          onClick={() => phase !== 'setup' ? setPhase('setup') : undefined}
          className="p-2 rounded-xl" style={{ background: 'var(--color-surface)' }}>
          {phase === 'setup' ? (
            <Link aria-label="Go back" to="/tools"><ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} /></Link>
          ) : (
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          )}
        </motion.button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>AI Question Bank</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Infinite practice, calibrated to your level
          </p>
        </div>
        {phase === 'quiz' && streak >= 3 && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="ml-auto px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: 'rgba(251,191,36,0.2)', color: '#FBBF24' }}>
            🔥 {streak} streak!
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Setup ── */}
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-4 py-5 space-y-5">
            <div className="p-4 rounded-2xl flex items-start gap-3"
                 style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}>
              <Sparkles size={20} color="#A0AEFF" className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#A0AEFF' }}>Adaptive AI Questions</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Questions calibrated to your current level · ability score: {abilityScore.toFixed(2)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-3 uppercase tracking-wider"
                 style={{ color: 'var(--color-text-secondary)' }}>Subject</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SUBJECTS.map(s => (
                  <motion.button key={s.name} whileTap={{ scale: 0.95 }}
                    onClick={() => setSubject(s.name)}
                    className="p-2 rounded-2xl text-center transition-all"
                    style={{
                      background: subject === s.name ? `${s.color}20` : 'var(--color-surface)',
                      border: `1.5px solid ${subject === s.name ? s.color : 'var(--color-border)'}`,
                    }}>
                    <span className="text-2xl">{s.icon}</span>
                    <p className="text-xs font-semibold mt-1" style={{ color: subject === s.name ? s.color : 'var(--color-text)' }}>
                      {s.name}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider"
                     style={{ color: 'var(--color-text-secondary)' }}>
                Chapter / Topic (optional)
              </label>
              <input value={chapter} onChange={e => setChapter(e.target.value)}
                placeholder="e.g. Thermodynamics, Organic Chemistry…"
                className="w-full mt-2 px-4 py-3 rounded-2xl text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
            </div>

            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider"
                 style={{ color: 'var(--color-text-secondary)' }}>Number of Questions</p>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: count === n ? `${subjectConfig.color}20` : 'var(--color-surface)',
                      color: count === n ? subjectConfig.color : 'var(--color-text-secondary)',
                      border: `1px solid ${count === n ? subjectConfig.color : 'var(--color-border)'}`,
                    }}>{n}</button>
                ))}
              </div>
            </div>

            <Button onClick={generateQuestions} className="w-full h-12 rounded-2xl font-bold"
              style={{ background: subjectConfig.color, color: '#0A0A0F' }}>
              <Brain size={18} className="mr-2" /> Generate Questions
            </Button>
          </motion.div>
        )}

        {/* ── Generating ── */}
        {phase === 'generating' && (
          <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 rounded-full border-4 border-t-transparent"
              style={{ borderColor: `${subjectConfig.color}40`, borderTopColor: subjectConfig.color }} />
            <div className="text-center">
              <p className="font-bold" style={{ color: 'var(--color-text)' }}>Generating {count} questions…</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Calibrated to ability score {abilityScore.toFixed(1)}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Quiz ── */}
        {phase === 'quiz' && q && (
          <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {current + 1} / {questions.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {q.difficulty}
                </span>
                <button onClick={() => setFlagModal(true)} className="p-1.5 rounded-xl"
                  style={{ background: 'var(--color-surface)' }}>
                  <Flag size={14} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
              </div>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: 'var(--color-border)' }}>
              <div className="h-1.5 rounded-full transition-all"
                   style={{ width: `${((current + 1) / questions.length) * 100}%`, background: subjectConfig.color }} />
            </div>
            <p className="text-xs font-medium" style={{ color: subjectConfig.color }}>
              {q.chapter} · {q.concept}
            </p>
            <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-base font-medium leading-relaxed" style={{ color: 'var(--color-text)' }}>{q.question}</p>
            </div>
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const ans = answers[current];
                const showResult = revealed && ans !== null;
                const isCorrect = i === q.correct_idx;
                const isSelected = ans === i;
                let bg = 'var(--color-surface)', border = 'var(--color-border)', textCol = 'var(--color-text)';
                if (showResult) {
                  if (isCorrect)       { bg = 'rgba(52,211,153,0.15)'; border = '#34D399'; textCol = '#34D399'; }
                  else if (isSelected) { bg = 'rgba(248,113,113,0.15)'; border = '#F87171'; textCol = '#F87171'; }
                }
                return (
                  <motion.button key={i} whileTap={{ scale: 0.98 }}
                    onClick={() => selectAnswer(i)} disabled={revealed}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left"
                    style={{ background: bg, border: `1.5px solid ${border}` }}>
                    <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: `${subjectConfig.color}20`, color: subjectConfig.color }}>
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="text-sm font-medium" style={{ color: textCol }}>{opt}</span>
                    {showResult && isCorrect && <CheckCircle size={16} color="#34D399" className="ml-auto" />}
                    {showResult && isSelected && !isCorrect && <XCircle size={16} color="#F87171" className="ml-auto" />}
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence>
              {revealed && (
                <motion.div key="exp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl"
                  style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.3)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#A0AEFF' }}>Novo explains</p>
                  {loadingExp ? (
                    <p className="text-xs animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>Thinking…</p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{novoExp || q.explanation}</p>
                      {expInteractionId && (
                        <AIFeedback
                          interactionId={expInteractionId}
                          subject={q.subject}
                          topic={q.concept}
                          compact
                        />
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {revealed && (
              <Button onClick={nextQuestion} className="w-full h-12 rounded-2xl font-bold"
                style={{ background: subjectConfig.color, color: '#0A0A0F' }}>
                {current >= questions.length - 1 ? 'See Results' : 'Next →'}
              </Button>
            )}

            {/* Flag modal */}
            <AnimatePresence>
              {flagModal && (
                <motion.div key="flag" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl p-5 space-y-3"
                  style={{ background: 'rgba(8,6,20,0.90)', backdropFilter: 'blur(64px) saturate(200%) brightness(1.04)', WebkitBackdropFilter: 'blur(64px) saturate(200%) brightness(1.04)', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Report this question</p>
                  {FLAG_REASONS.map(r => (
                    <button key={r.id} onClick={() => flagQuestion(r.id)}
                      className="w-full p-3 rounded-xl text-left text-sm"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                      {r.label}
                    </button>
                  ))}
                  <button onClick={() => setFlagModal(false)}
                    className="w-full p-3 text-center text-sm font-semibold"
                    style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Result ── */}
        {phase === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="px-4 py-8 space-y-6 text-center">
            <div>
              <Sparkles size={52} color={subjectConfig.color} className="mx-auto mb-3" />
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                {correctCount} / {questions.length}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{subject} · AI Questions</p>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                Ability score updated to {abilityScore.toFixed(2)} — next batch will adjust difficulty.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: 'Correct',  v: correctCount,                     c: '#34D399' },
                { l: 'Wrong',    v: questions.length - correctCount,   c: '#F87171' },
                { l: 'Streak',   v: `${streak}🔥`,                    c: '#FBBF24' },
              ].map(s => (
                <div key={s.l} className="p-3 rounded-2xl"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xl font-bold" style={{ color: s.c }}>{s.v}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{s.l}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <Button onClick={() => { setPhase('setup'); setQuestions([]); setAnswers([]); }}
                className="w-full h-12 rounded-2xl font-bold"
                style={{ background: subjectConfig.color, color: '#0A0A0F' }}>
                <Brain size={16} className="mr-2" /> Generate More
              </Button>
              <Link to="/tools">
                <Button variant="outline" className="w-full h-12 rounded-2xl"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  Back to Tools
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
