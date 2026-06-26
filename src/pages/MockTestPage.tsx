import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Clock, Trophy, AlertTriangle, CheckCircle, XCircle, BarChart2, Lock, Mail, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { isInFreeTrial } from '@/lib/trial';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';

type ExamType = 'JEE_Main' | 'JEE_Advanced' | 'NEET';
type Phase = 'setup' | 'generating' | 'exam' | 'submitting' | 'result';

interface MockQuestion {
  id: string;
  subject: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  marks_positive: number;
  marks_negative: number;
}

interface SubjectSection {
  subject: string;
  color: string;
  questions: MockQuestion[];
}

const EXAM_CONFIG: Record<ExamType, {
  label: string; color: string; duration: number; totalMarks: number; maxFreePerMonth: number;
  sections: { subject: string; count: number; marksPos: number; marksNeg: number }[];
}> = {
  JEE_Main: {
    label: 'JEE Main', color: '#60A5FA', duration: 180, totalMarks: 300, maxFreePerMonth: 2,
    sections: [
      { subject: 'Physics',   count: 25, marksPos: 4, marksNeg: 1 },
      { subject: 'Chemistry', count: 25, marksPos: 4, marksNeg: 1 },
      { subject: 'Maths',     count: 25, marksPos: 4, marksNeg: 1 },
    ],
  },
  JEE_Advanced: {
    label: 'JEE Advanced', color: '#A78BFA', duration: 180, totalMarks: 360, maxFreePerMonth: 1,
    sections: [
      { subject: 'Physics',   count: 18, marksPos: 4, marksNeg: 2 },
      { subject: 'Chemistry', count: 18, marksPos: 4, marksNeg: 2 },
      { subject: 'Maths',     count: 18, marksPos: 4, marksNeg: 2 },
    ],
  },
  NEET: {
    label: 'NEET', color: '#34D399', duration: 210, totalMarks: 720, maxFreePerMonth: 2,
    sections: [
      { subject: 'Physics',   count: 45, marksPos: 4, marksNeg: 1 },
      { subject: 'Chemistry', count: 45, marksPos: 4, marksNeg: 1 },
      { subject: 'Biology',   count: 90, marksPos: 4, marksNeg: 1 },
    ],
  },
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default function MockTestPage() {
  const { profile, user } = useAuth();
  const [phase, setPhase]         = useState<Phase>('setup');
  const [examType, setExamType]   = useState<ExamType>('JEE_Main');
  const [sections, setSections]   = useState<SubjectSection[]>([]);
  const [allQuestions, setAllQuestions] = useState<MockQuestion[]>([]);
  const [answers, setAnswers]     = useState<Record<string, number>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [freeUsage, setFreeUsage] = useState(0);
  const [genProgress, setGenProgress] = useState('');
  const [result, setResult]       = useState<{
    score: number; maxScore: number; percentile: number;
    subjectScores: Record<string, { correct: number; score: number; total: number }>;
    attemptId?: string;
  } | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef   = useRef(false);

  const config = EXAM_CONFIG[examType];
  const isPro  = (profile?.is_pro ?? false) || (user?.created_at ? isInFreeTrial(user.created_at) : false);

  useEffect(() => {
    if (!profile) return;
    supabase.rpc('get_mock_usage_this_month', { p_user_id: profile.id })
      .then(({ data }) => setFreeUsage(data ?? 0));
  }, [profile]);

  const submitExam = useCallback(async (finalAnswers: Record<string, number>) => {
    if (submitRef.current || !profile) return;
    submitRef.current = true;
    clearInterval(timerRef.current!);
    setPhase('submitting');

    const subjectScores: Record<string, { correct: number; score: number; total: number }> = {};
    let totalScore = 0, maxScore = 0;

    for (const sec of sections) {
      let correct = 0, secScore = 0;
      for (const q of sec.questions) {
        const ans = finalAnswers[q.id];
        if (ans === undefined) continue;
        if (ans === q.correct_idx) { correct++; secScore += q.marks_positive; totalScore += q.marks_positive; }
        else { secScore -= q.marks_negative; totalScore -= q.marks_negative; }
      }
      maxScore += sec.questions.reduce((s, q) => s + q.marks_positive, 0);
      subjectScores[sec.subject] = { correct, score: Math.max(0, secScore), total: sec.questions.length };
    }
    totalScore = Math.max(0, totalScore);

    const { data: percentileData } = await supabase.rpc('calc_mock_percentile', {
      p_score: totalScore, p_exam_type: examType,
    });
    const percentile = percentileData ?? 50;

    const { data: attempt } = await supabase.from('mock_test_attempts').insert({
      user_id: profile.id,
      exam_type: examType,
      questions: allQuestions,
      answers: finalAnswers,
      score: totalScore,
      max_score: maxScore,
      percentile,
      subject_scores: subjectScores,
      completed_at: new Date().toISOString(),
    }).select('id').single();

    setResult({ score: totalScore, maxScore, percentile, subjectScores, attemptId: attempt?.id });
    setPhase('result');
    track('mock_test_completed', { exam_type: examType, score: totalScore, percentile });
  }, [profile, sections, allQuestions, examType]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); submitExam(answers); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function generateMock() {
    if (!profile) return;
    if (!isPro && freeUsage >= config.maxFreePerMonth) return;
    submitRef.current = false;
    setPhase('generating');
    const langInstr = getLangInstruction(profile.preferred_language);
    const generatedSections: SubjectSection[] = [];
    const allQ: MockQuestion[] = [];

    for (const sec of config.sections) {
      setGenProgress(`Generating ${sec.subject} questions…`);
      try {
        const prompt = `Generate ${Math.min(sec.count, 10)} challenging ${config.label} level MCQ questions on ${sec.subject}.
Mix topics across the full ${sec.subject} syllabus. Questions must be exam-accurate — no trivial questions.${langInstr}
Return ONLY valid JSON array: [{"question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"..."}]`;
        const parsed = await geminiJSON<{ question: string; options: string[]; correct_idx: number; explanation: string }[]>(prompt);
        const questions: MockQuestion[] = (parsed ?? []).slice(0, 10).map((q, i) => ({
          id: `${sec.subject}_${i}_${Date.now()}`,
          subject: sec.subject,
          question: q.question,
          options: q.options,
          correct_idx: q.correct_idx,
          explanation: q.explanation,
          marks_positive: sec.marksPos,
          marks_negative: sec.marksNeg,
        }));
        generatedSections.push({ subject: sec.subject, color: '', questions });
        allQ.push(...questions);
      } catch {
        // use placeholder if generation fails
        generatedSections.push({ subject: sec.subject, color: '', questions: [] });
      }
    }

    const subjectColors: Record<string, string> = {
      Physics: '#60A5FA', Chemistry: '#34D399', Maths: '#A78BFA', Biology: '#4ADE80',
    };
    generatedSections.forEach(s => { s.color = subjectColors[s.subject] ?? '#FBBF24'; });

    setSections(generatedSections);
    setAllQuestions(allQ);
    setAnswers({});
    setCurrentIdx(0);
    setTimeLeft(config.duration * 60);
    setFreeUsage(u => u + 1);
    setPhase('exam');
    track('mock_test_started', { exam_type: examType, total_questions: allQ.length });
  }

  function selectAnswer(questionId: string, idx: number) {
    setAnswers(prev => {
      if (prev[questionId] !== undefined) return prev;
      return { ...prev, [questionId]: idx };
    });
  }

  const currentQ = allQuestions[currentIdx];
  const answered  = Object.keys(answers).length;
  const timerWarning = timeLeft < 300;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          {phase === 'exam' ? (
            <button onClick={() => {
              if (window.confirm('Submit exam now? This cannot be undone.')) submitExam(answers);
            }} className="p-2 rounded-xl" style={{ background: 'var(--color-surface)' }}>
              <CheckCircle size={20} color="#34D399" />
            </button>
          ) : (
            <Link aria-label="Go back" to="/tools">
              <motion.button whileTap={{ scale: 0.92 }} className="p-2 rounded-xl"
                style={{ background: 'var(--color-surface)' }}>
                <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
              </motion.button>
            </Link>
          )}
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Mock Full Test</h1>
            {phase === 'exam' && (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {answered}/{allQuestions.length} answered
              </p>
            )}
          </div>
        </div>
        {phase === 'exam' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
               style={{ background: timerWarning ? 'rgba(248,113,113,0.15)' : 'var(--color-surface)',
                        border: `1px solid ${timerWarning ? '#F87171' : 'var(--color-border)'}` }}>
            <Clock size={14} color={timerWarning ? '#F87171' : 'var(--color-text-secondary)'} />
            <span className="text-sm font-mono font-bold"
                  style={{ color: timerWarning ? '#F87171' : 'var(--color-text)' }}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Setup ── */}
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 py-5 space-y-6">
            <div>
              <p className="text-xs font-semibold mb-3 uppercase tracking-wider"
                 style={{ color: 'var(--color-text-secondary)' }}>Choose Exam</p>
              <div className="space-y-2">
                {(Object.entries(EXAM_CONFIG) as [ExamType, typeof EXAM_CONFIG[ExamType]][]).map(([id, cfg]) => (
                  <motion.button key={id} whileTap={{ scale: 0.98 }}
                    onClick={() => setExamType(id)}
                    className="w-full p-4 rounded-2xl text-left transition-all"
                    style={{
                      background: examType === id ? `${cfg.color}15` : 'var(--color-surface)',
                      border: `1.5px solid ${examType === id ? cfg.color : 'var(--color-border)'}`,
                    }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ color: examType === id ? cfg.color : 'var(--color-text)' }}>
                          {cfg.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {cfg.duration} min · {cfg.totalMarks} marks · {cfg.sections.map(s => s.subject).join(' + ')}
                        </p>
                      </div>
                      <Clock size={20} color={examType === id ? cfg.color : 'var(--color-text-secondary)'} />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Free usage indicator */}
            {!isPro && (
              <div className="p-4 rounded-2xl flex items-start gap-3"
                   style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <AlertTriangle size={18} color="#FBBF24" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#FBBF24' }}>
                    {freeUsage}/{config.maxFreePerMonth} free mocks used this month
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    Go Pro for unlimited full mock tests + PDF reports to parent email.
                  </p>
                </div>
              </div>
            )}

            {!isPro && freeUsage >= config.maxFreePerMonth ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl text-center"
                     style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <Lock size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-secondary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    Free limit reached for this month
                  </p>
                </div>
                <Link to="/pro">
                  <Button className="w-full h-12 rounded-2xl font-bold"
                    style={{ background: 'linear-gradient(135deg,#5B6AF5,#A78BFA)', color: '#fff' }}>
                    <Zap size={16} className="mr-2" /> Unlock with Pro
                  </Button>
                </Link>
              </div>
            ) : (
              <Button onClick={generateMock} className="w-full h-14 rounded-2xl font-bold text-base"
                style={{ background: config.color, color: '#0A0A0F' }}>
                Start {config.label} Mock ({config.duration} min)
              </Button>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Auto-score', icon: <CheckCircle size={18} color="#34D399" /> },
                { label: 'Percentile', icon: <BarChart2 size={18} color="#A0AEFF" /> },
                { label: 'PDF Report', icon: <Mail size={18} color="#FBBF24" /> },
              ].map(f => (
                <div key={f.label} className="p-3 rounded-2xl text-center"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="flex justify-center mb-1">{f.icon}</div>
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{f.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Generating ── */}
        {phase === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
            <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
                 style={{ borderColor: `${config.color}40`, borderTopColor: config.color }} />
            <div className="text-center">
              <p className="font-bold" style={{ color: 'var(--color-text)' }}>Generating your mock test…</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{genProgress}</p>
            </div>
          </motion.div>
        )}

        {/* ── Exam ── */}
        {phase === 'exam' && currentQ && (
          <motion.div key="exam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
            {/* Section tabs */}
            <div className="flex gap-1 px-4 py-2 overflow-x-auto"
                 style={{ borderBottom: '1px solid var(--color-border)' }}>
              {sections.map((sec, si) => {
                const secStart = sections.slice(0, si).reduce((s, x) => s + x.questions.length, 0);
                const isActive = currentIdx >= secStart && currentIdx < secStart + sec.questions.length;
                return (
                  <button key={sec.subject}
                    onClick={() => setCurrentIdx(secStart)}
                    className="px-3 py-1 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
                    style={{
                      background: isActive ? `${sec.color}20` : 'var(--color-surface)',
                      color: isActive ? sec.color : 'var(--color-text-secondary)',
                    }}>
                    {sec.subject}
                  </button>
                );
              })}
            </div>

            {/* Question */}
            <div className="px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  Q{currentIdx + 1} of {allQuestions.length}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-lg"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {currentQ.subject} · +{currentQ.marks_positive}/−{currentQ.marks_negative}
                </span>
              </div>

              <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <p className="text-base font-medium leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  {currentQ.question}
                </p>
              </div>

              <div className="space-y-2">
                {currentQ.options.map((opt, i) => {
                  const isAnswered = answers[currentQ.id] !== undefined;
                  const isSelected = answers[currentQ.id] === i;
                  return (
                    <motion.button key={i} whileTap={{ scale: 0.98 }}
                      onClick={() => selectAnswer(currentQ.id, i)}
                      disabled={isAnswered}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                      style={{
                        background: isSelected ? `${config.color}15` : 'var(--color-surface)',
                        border: `1.5px solid ${isSelected ? config.color : 'var(--color-border)'}`,
                      }}>
                      <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: `${config.color}20`, color: config.color }}>
                        {OPTION_LABELS[i]}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{opt}</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                {currentIdx > 0 && (
                  <Button onClick={() => setCurrentIdx(i => i - 1)} variant="outline" className="flex-1 rounded-2xl"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    ← Prev
                  </Button>
                )}
                {currentIdx < allQuestions.length - 1 ? (
                  <Button onClick={() => setCurrentIdx(i => i + 1)} className="flex-1 rounded-2xl"
                    style={{ background: config.color, color: '#0A0A0F' }}>
                    Next →
                  </Button>
                ) : (
                  <Button onClick={() => {
                    if (window.confirm(`Submit exam? ${answered}/${allQuestions.length} answered.`))
                      submitExam(answers);
                  }} className="flex-1 rounded-2xl font-bold"
                    style={{ background: '#34D399', color: '#0A0A0F' }}>
                    Submit Exam
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Submitting ── */}
        {phase === 'submitting' && (
          <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
                 style={{ borderColor: `${config.color}40`, borderTopColor: config.color }} />
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>Scoring your exam…</p>
          </motion.div>
        )}

        {/* ── Result ── */}
        {phase === 'result' && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="px-4 py-6 space-y-6">
            <div className="text-center">
              <Trophy size={52} color="#FBBF24" className="mx-auto mb-3" />
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                {result.score} / {result.maxScore}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{config.label}</p>
              <div className="inline-block mt-3 px-4 py-1.5 rounded-full"
                   style={{ background: `${config.color}20`, border: `1px solid ${config.color}` }}>
                <span className="text-sm font-bold" style={{ color: config.color }}>
                  Top {(100 - result.percentile).toFixed(0)}% · {result.percentile.toFixed(1)} percentile
                </span>
              </div>
            </div>

            {/* Subject breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: 'var(--color-text-secondary)' }}>Subject Breakdown</p>
              {Object.entries(result.subjectScores).map(([subj, data]) => {
                const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                const secColor = sections.find(s => s.subject === subj)?.color ?? config.color;
                return (
                  <div key={subj} className="p-4 rounded-2xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{subj}</span>
                      <span className="text-sm font-bold" style={{ color: secColor }}>{data.score} marks</span>
                    </div>
                    <div className="w-full rounded-full h-1.5" style={{ background: 'var(--color-border)' }}>
                      <div className="h-1.5 rounded-full transition-all"
                           style={{ width: `${pct}%`, background: secColor }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {data.correct}/{data.total} correct ({pct.toFixed(0)}%)
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Pro: PDF report */}
            {!isPro && (
              <div className="p-4 rounded-2xl flex items-center gap-3"
                   style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <Mail size={20} color="#FBBF24" />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: '#FBBF24' }}>
                    PDF report available with Pro
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Get detailed analysis sent to parent email
                  </p>
                </div>
                <Link to="/pro">
                  <Button className="text-xs px-3 py-1.5 rounded-xl h-auto font-bold"
                    style={{ background: '#FBBF24', color: '#0A0A0F' }}>Pro</Button>
                </Link>
              </div>
            )}

            <div className="space-y-3">
              <Button onClick={() => { setPhase('setup'); setSections([]); setAllQuestions([]); setResult(null); submitRef.current = false; }}
                className="w-full h-12 rounded-2xl font-bold"
                style={{ background: config.color, color: '#0A0A0F' }}>
                Take Another Mock
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
