import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {ChevronLeft, Clock, Trophy, CheckCircle, BarChart2, Mail} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { isInFreeTrial } from '@/lib/trial';
import { supabase } from '@/lib/supabase';
import { ProGate } from '@/components/ui/ProGate';
import { track } from '@/lib/analytics';
import { scoreMockExam } from '@/lib/mockScoring';

type ExamType = 'JEE_Main' | 'JEE_Advanced' | 'NEET' | 'CAT' | 'UPSC_Prelims';
type Phase = 'setup' | 'loading' | 'exam' | 'submitting' | 'result';

// Maps display exam type → pyq_content.exam column value
const EXAM_DB_MAP: Record<ExamType, string> = {
  JEE_Main:     'JEE_MAIN',
  JEE_Advanced: 'JEE_ADV',
  NEET:         'NEET',
  CAT:          'CAT',
  UPSC_Prelims: 'UPSC' };

interface MockQuestion {
  id: string;
  subject: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  marks_positive: number;
  marks_negative: number;
  question_type: 'mcq' | 'integer';
  correct_value: string | null; // for TITA/integer questions — the raw correct answer text
}

interface SubjectSection {
  subject: string;
  color: string;
  questions: MockQuestion[];
  durationMin?: number; // per-section timer, only used when the exam is sectional (CAT)
}

const EXAM_CONFIG: Record<ExamType, {
  label: string; color: string; duration: number; totalMarks: number; sectional?: boolean;
  sections: { subject: string; count: number; marksPos: number; marksNeg: number; durationMin?: number }[];
}> = {
  JEE_Main: {
    label: 'JEE Main', color: '#60A5FA', duration: 180, totalMarks: 300,
    sections: [
      { subject: 'Physics',   count: 25, marksPos: 4, marksNeg: 1 },
      { subject: 'Chemistry', count: 25, marksPos: 4, marksNeg: 1 },
      { subject: 'Maths',     count: 25, marksPos: 4, marksNeg: 1 },
    ] },
  JEE_Advanced: {
    label: 'JEE Advanced', color: '#A78BFA', duration: 180, totalMarks: 360,
    sections: [
      { subject: 'Physics',   count: 18, marksPos: 4, marksNeg: 2 },
      { subject: 'Chemistry', count: 18, marksPos: 4, marksNeg: 2 },
      { subject: 'Maths',     count: 18, marksPos: 4, marksNeg: 2 },
    ] },
  NEET: {
    label: 'NEET', color: '#34D399', duration: 210, totalMarks: 720,
    sections: [
      { subject: 'Physics',   count: 45, marksPos: 4, marksNeg: 1 },
      { subject: 'Chemistry', count: 45, marksPos: 4, marksNeg: 1 },
      { subject: 'Biology',   count: 90, marksPos: 4, marksNeg: 1 },
    ] },
  CAT: {
    // Real CAT format: 3 sections, each with its OWN 40-min lock — you cannot
    // move to another section until your current one's timer expires (or you
    // submit it early). This is genuinely different from JEE/NEET's single
    // continuous timer, and it's the single most defining "is this real CAT
    // practice or a toy" signal for aspirants — so it's built as real
    // sectional behavior, not simulated with one big countdown.
    // Starter content pool only (32 original practice questions) — counts
    // below reflect what's actually seeded (VARC=10, DILR=11, QA=11; capped
    // at 10 per section to keep them even), not the full 66-question format,
    // to avoid silently repeating questions to fake a bigger paper.
    label: 'CAT', color: '#F59E0B', duration: 120, totalMarks: 90, sectional: true,
    sections: [
      { subject: 'VARC', count: 10, marksPos: 3, marksNeg: 1, durationMin: 40 },
      { subject: 'DILR', count: 10, marksPos: 3, marksNeg: 1, durationMin: 40 },
      { subject: 'QA',   count: 10, marksPos: 3, marksNeg: 1, durationMin: 40 },
    ] },
  UPSC_Prelims: {
    // Real UPSC Prelims GS-I: single continuous 2-hour paper, 1/3-mark
    // negative marking per wrong answer (2 marks/question here → 0.67 penalty).
    // Starter content pool only (16 original practice MCQs) — not a full
    // 100-question paper; real UPSC PYQs are copyrighted, so this is
    // original practice content, clearly smaller than the real exam.
    label: 'UPSC Prelims (GS)', color: '#818CF8', duration: 120, totalMarks: 32,
    sections: [
      { subject: 'Prelims_GS', count: 16, marksPos: 2, marksNeg: 0.67 },
    ] } };

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// TITA (Type-In-The-Answer) input — CAT's numeric-entry question type, no
// options to select. Locks once submitted, matching the MCQ "answer once" rule.
function TitaInput({ existing, color, onSubmit }: { existing: string; color: string; onSubmit: (val: string) => void }) {
  const [value, setValue] = useState(existing);
  const isLocked = !!existing;
  return (
    <div className="space-y-2">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={isLocked}
        onChange={e => setValue(e.target.value)}
        placeholder="Type your numeric answer"
        className="w-full p-3.5 rounded-2xl text-base font-medium"
        style={{
          background: 'var(--color-surface)',
          border: `1.5px solid ${isLocked ? color : 'var(--color-border)'}`,
          color: 'var(--color-text)' }}
      />
      {!isLocked && (
        <Button onClick={() => onSubmit(value)} disabled={!value.trim()}
          className="w-full rounded-2xl font-semibold"
          style={{ background: color, color: 'var(--color-on-accent)' }}>
          Lock Answer
        </Button>
      )}
    </div>
  );
}

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
  const [answers, setAnswers]     = useState<Record<string, number | string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [sectionTimeLeft, setSectionTimeLeft] = useState(0);
  const [result, setResult]       = useState<{
    score: number; maxScore: number; percentile: number;
    subjectScores: Record<string, { correct: number; score: number; total: number }>;
    attemptId?: string;
  } | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef   = useRef(false);

  const config = EXAM_CONFIG[examType];
  const isPro  = (profile?.is_pro ?? false) || (user?.created_at ? isInFreeTrial(user.created_at) : false);
  const [showPaywallSheet, setShowPaywallSheet] = useState(false);
  // CEO decision: CAT/UPSC content is a starter set (beta-depth, not yet
  // worth charging for) — free for everyone during beta so a paying user
  // isn't the one absorbing the "ran out of content in one sitting" risk.
  // JEE/NEET/CBSE mock stay Pro-gated as before (mature, deep content).
  const FREE_BETA_EXAMS: ExamType[] = ['CAT', 'UPSC_Prelims'];
  const requiresPro = !FREE_BETA_EXAMS.includes(examType) && !isPro;
  // "Practice Toughest" — reuses mock-paper-composer's existing difficulty_skew
  // param (already built for PYQBankPage's Advanced Mix). CAT/UPSC only for now:
  // JEE/NEET/CBSE already get a hard-skew path via PYQBankPage separately.
  const TOUGH_MODE_EXAMS: ExamType[] = ['CAT', 'UPSC_Prelims'];
  const [toughMode, setToughMode] = useState(false);

  const submitExam = useCallback(async (finalAnswers: Record<string, number | string>) => {
    if (submitRef.current || !profile) return;
    submitRef.current = true;
    clearInterval(timerRef.current!);
    setPhase('submitting');

    const { totalScore, maxScore, subjectScores, wrongQuestions: wrongAnswers } = scoreMockExam(sections, finalAnswers);

    const { data: percentileData } = await supabase.rpc('calc_mock_percentile', {
      p_score: totalScore, p_exam_type: examType });
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
      completed_at: new Date().toISOString() }).select('id').single();

    // Feed wrong answers into the spaced-repetition system — this is the
    // retention loop JEE/NEET quiz content never had wired either, and CAT/
    // UPSC/CBSE PYQ practice had none at all until now. Best-effort; never
    // blocks the result screen from showing.
    if (wrongAnswers.length > 0) {
      supabase.from('sr_cards').insert(wrongAnswers.map(q => ({
        user_id: profile.id,
        subject: q.subject,
        topic: q.subject,
        source_type: 'quiz' as const,
        source_id: attempt?.id ?? null,
        front: q.question,
        back: q.explanation || (q.question_type === 'integer' ? `Answer: ${q.correct_value}` : q.options[q.correct_idx] ?? ''),
        next_review_date: new Date().toISOString().slice(0, 10),
      }))).then(({ error }) => {
        if (error) console.error('[MockTest] failed to create sr_cards from wrong answers:', error.message);
      });
    }

    setResult({ score: totalScore, maxScore, percentile, subjectScores, attemptId: attempt?.id });
    setPhase('result');
    track('mock_test_completed', { exam_type: examType, score: totalScore, percentile });
  }, [profile, sections, allQuestions, examType]);

  // Advance to the next section when the current section's time runs out
  // (sectional exams only) — locks the current section and jumps the
  // question cursor to the start of the next one, or submits if it was the
  // last section. Real CAT behavior: you cannot go back once a section ends.
  const advanceSection = useCallback(() => {
    setSectionIdx(si => {
      const nextIdx = si + 1;
      if (nextIdx >= sections.length) {
        clearInterval(timerRef.current!);
        submitExam(answers);
        return si;
      }
      const secStart = sections.slice(0, nextIdx).reduce((s, x) => s + x.questions.length, 0);
      setCurrentIdx(secStart);
      setSectionTimeLeft((sections[nextIdx].durationMin ?? 40) * 60);
      return nextIdx;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, answers, submitExam]);

  // Countdown timer — continuous for JEE/NEET, per-section for CAT.
  useEffect(() => {
    if (phase !== 'exam') return;
    timerRef.current = setInterval(() => {
      if (config.sectional) {
        setSectionTimeLeft(t => {
          if (t <= 1) { advanceSection(); return 0; }
          return t - 1;
        });
      } else {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current!); submitExam(answers); return 0; }
          return t - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function startMock() {
    if (!profile) return;
    if (requiresPro) { setShowPaywallSheet(true); return; }
    submitRef.current = false;
    setPhase('loading');

    const subjectColors: Record<string, string> = {
      Physics: '#60A5FA', Chemistry: '#34D399', Maths: '#A78BFA', Biology: '#4ADE80',
      VARC: '#F59E0B', DILR: '#818CF8', QA: '#34D399', Prelims_GS: '#818CF8' };
    const generatedSections: SubjectSection[] = [];
    const allQ: MockQuestion[] = [];

    // Reasoned paper composition (Nemotron-selected, difficulty-curved, chapter-spread) —
    // falls back to a raw limit() pull per section if the composer call fails for any reason.
    let composedIds: Record<string, string[]> | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('mock-paper-composer', {
        body: {
          action: 'compose',
          exam: EXAM_DB_MAP[examType],
          sections: config.sections.map(s => ({ subject: s.subject, count: s.count })),
          difficulty_skew: (TOUGH_MODE_EXAMS.includes(examType) && toughMode) ? 'hard' : 'balanced',
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!error && data?.question_ids) composedIds = data.question_ids;
    } catch {
      composedIds = null;
    }

    for (const sec of config.sections) {
      const ids = composedIds?.[sec.subject];
      let rows: any[] | null = null;

      if (ids && ids.length === sec.count) {
        const { data } = await supabase
          .from('pyq_content')
          .select('id,subject,question_text,solution_text,options,correct_option,question_type,marks')
          .in('id', ids);
        // Preserve the composer's chosen order rather than whatever order `.in()` returns.
        const bySubjectId = new Map((data ?? []).map(r => [r.id, r]));
        rows = ids.map(id => bySubjectId.get(id)).filter(Boolean);
      }

      if (!rows || rows.length !== sec.count) {
        const { data } = await supabase
          .from('pyq_content')
          .select('id,subject,question_text,solution_text,options,correct_option,question_type,marks')
          .eq('exam', EXAM_DB_MAP[examType])
          .eq('subject', sec.subject)
          .limit(sec.count);
        rows = data ?? [];
      }

      const questions: MockQuestion[] = rows.map(row => {
        const opts = row.options as { label: string; text: string; correct: boolean }[];
        const isTita = row.question_type === 'integer';
        return {
          id:              row.id,
          subject:         row.subject,
          question:        row.question_text,
          options:         isTita ? [] : opts.map(o => o.text),
          correct_idx:     isTita ? -1 : opts.findIndex(o => o.correct),
          explanation:     row.solution_text,
          marks_positive:  sec.marksPos,
          // TITA questions carry no negative marking, even in a negative-marked section.
          marks_negative:  isTita ? 0 : sec.marksNeg,
          question_type:   isTita ? 'integer' : 'mcq',
          correct_value:   isTita ? row.correct_option : null };
      });

      generatedSections.push({ subject: sec.subject, color: subjectColors[sec.subject] ?? '#FBBF24', questions, durationMin: sec.durationMin });
      allQ.push(...questions);
    }

    setSections(generatedSections);
    setAllQuestions(allQ);
    setAnswers({});
    setCurrentIdx(0);
    setSectionIdx(0);
    if (config.sectional) {
      setSectionTimeLeft((config.sections[0].durationMin ?? 40) * 60);
    } else {
      setTimeLeft(config.duration * 60);
    }
    setPhase('exam');
    track('mock_test_started', { exam_type: examType, total_questions: allQ.length, tough_mode: TOUGH_MODE_EXAMS.includes(examType) && toughMode });
  }

  function selectAnswer(questionId: string, idx: number) {
    setAnswers(prev => {
      if (prev[questionId] !== undefined) return prev;
      return { ...prev, [questionId]: idx };
    });
  }

  function submitTitaAnswer(questionId: string, value: string) {
    if (!value.trim()) return;
    setAnswers(prev => ({ ...prev, [questionId]: value.trim() }));
  }

  const currentQ = allQuestions[currentIdx];
  const answered  = Object.keys(answers).length;
  const displayTime = config.sectional ? sectionTimeLeft : timeLeft;
  const timerWarning = displayTime < 300;
  const currentSection = sections[sectionIdx];
  const sectionStart = sections.slice(0, sectionIdx).reduce((s, x) => s + x.questions.length, 0);
  const sectionEnd = sectionStart + (currentSection?.questions.length ?? 0);
  const isLastQuestionOverall = currentIdx === allQuestions.length - 1;
  const isLastQuestionInSection = config.sectional && currentIdx === sectionEnd - 1;

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
              {formatTime(displayTime)}{config.sectional ? ` · ${currentSection?.subject}` : ''}
            </span>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Setup ── */}
        {phase === 'setup' && (
          <ProGate sheet featureName="Full Mock Tests" featureDesc="Unlimited timed mock tests with auto-scoring, percentile ranking, and PDF reports — Pro only."
            open={showPaywallSheet} onClose={() => setShowPaywallSheet(false)}>
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
                      border: `1.5px solid ${examType === id ? cfg.color : 'var(--color-border)'}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold" style={{ color: examType === id ? cfg.color : 'var(--color-text)' }}>
                            {cfg.label}
                          </p>
                          {FREE_BETA_EXAMS.includes(id) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
                              FREE · BETA
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {cfg.sectional
                            ? `${cfg.sections.length} sections × ${cfg.sections[0].durationMin} min (locked) · ${cfg.sections.map(s => s.subject).join(' + ')}`
                            : `${cfg.duration} min · ${cfg.totalMarks} marks · ${cfg.sections.map(s => s.subject).join(' + ')}`}
                        </p>
                        {(cfg.sectional || id === 'UPSC_Prelims') && (
                          <p className="text-[11px] mt-1" style={{ color: '#F59E0B' }}>
                            Starter practice set ({cfg.sections.reduce((s, x) => s + x.count, 0)} original questions) — smaller pool than the full real exam, not verbatim past papers
                          </p>
                        )}
                      </div>
                      <Clock size={20} color={examType === id ? cfg.color : 'var(--color-text-secondary)'} />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {TOUGH_MODE_EXAMS.includes(examType) && (
              <button onClick={() => setToughMode(v => !v)}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl"
                style={{
                  background: toughMode ? 'rgba(248,113,113,0.1)' : 'var(--color-surface)',
                  border: `1.5px solid ${toughMode ? '#F87171' : 'var(--color-border)'}` }}>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color: toughMode ? '#F87171' : 'var(--color-text)' }}>
                    Practice Toughest
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Skews the paper to hard-tagged questions, no easy-to-hard ramp
                  </p>
                </div>
                <div className="w-11 h-6 rounded-full flex items-center px-0.5 transition-all flex-shrink-0"
                  style={{ background: toughMode ? '#F87171' : 'var(--color-border)' }}>
                  <div className="w-5 h-5 rounded-full bg-white transition-all"
                    style={{ transform: toughMode ? 'translateX(20px)' : 'translateX(0)' }} />
                </div>
              </button>
            )}

            <Button onClick={startMock} className="w-full h-14 rounded-2xl font-bold text-base"
              style={{ background: config.color, color: 'var(--color-on-accent)' }}>
              {config.sectional
                ? `Start ${config.label} Mock (${config.sections.length} × ${config.sections[0].durationMin} min sections)`
                : `Start ${config.label} Mock (${config.duration} min)`}
            </Button>

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
          </ProGate>
        )}

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
            <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
                 style={{ borderColor: `${config.color}40`, borderTopColor: config.color }} />
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>Loading your mock test…</p>
          </motion.div>
        )}

        {/* ── Exam ── */}
        {phase === 'exam' && currentQ && (
          <motion.div key="exam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
            {/* Section tabs — locked to the current section only for sectional
                exams (real CAT rule: no jumping between sections). */}
            <div className="flex gap-1 px-4 py-2 overflow-x-auto"
                 style={{ borderBottom: '1px solid var(--color-border)' }}>
              {sections.map((sec, si) => {
                const secStart = sections.slice(0, si).reduce((s, x) => s + x.questions.length, 0);
                const isActive = currentIdx >= secStart && currentIdx < secStart + sec.questions.length;
                const isLocked = config.sectional && si !== sectionIdx;
                return (
                  <button key={sec.subject}
                    onClick={() => { if (!isLocked) setCurrentIdx(secStart); }}
                    disabled={isLocked}
                    className="px-3 py-1 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
                    style={{
                      background: isActive ? `${sec.color}20` : 'var(--color-surface)',
                      color: isActive ? sec.color : 'var(--color-text-secondary)',
                      opacity: isLocked ? 0.4 : 1 }}>
                    {sec.subject}{isLocked && si < sectionIdx ? ' 🔒' : ''}
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

              {currentQ.question_type === 'integer' ? (
                <TitaInput
                  key={currentQ.id}
                  existing={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] as string : ''}
                  color={config.color}
                  onSubmit={val => submitTitaAnswer(currentQ.id, val)}
                />
              ) : (
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
                          border: `1.5px solid ${isSelected ? config.color : 'var(--color-border)'}` }}>
                        <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: `${config.color}20`, color: config.color }}>
                          {OPTION_LABELS[i]}
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{opt}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                {currentIdx > (config.sectional ? sectionStart : 0) && (
                  <Button onClick={() => setCurrentIdx(i => i - 1)} variant="outline" className="flex-1 rounded-2xl"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    ← Prev
                  </Button>
                )}
                {isLastQuestionInSection ? (
                  <Button onClick={() => {
                    const isFinalSection = sectionIdx === sections.length - 1;
                    const msg = isFinalSection
                      ? `Submit exam? ${answered}/${allQuestions.length} answered.`
                      : `Submit ${currentSection?.subject} section and move to the next one? You cannot come back to this section.`;
                    if (window.confirm(msg)) {
                      if (isFinalSection) submitExam(answers);
                      else advanceSection();
                    }
                  }} className="flex-1 rounded-2xl font-bold"
                    style={{ background: '#34D399', color: 'var(--color-on-accent)' }}>
                    {sectionIdx === sections.length - 1 ? 'Submit Exam' : `Submit ${currentSection?.subject} →`}
                  </Button>
                ) : isLastQuestionOverall ? (
                  <Button onClick={() => {
                    if (window.confirm(`Submit exam? ${answered}/${allQuestions.length} answered.`))
                      submitExam(answers);
                  }} className="flex-1 rounded-2xl font-bold"
                    style={{ background: '#34D399', color: 'var(--color-on-accent)' }}>
                    Submit Exam
                  </Button>
                ) : (
                  <Button onClick={() => setCurrentIdx(i => i + 1)} className="flex-1 rounded-2xl"
                    style={{ background: config.color, color: 'var(--color-on-accent)' }}>
                    Next →
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
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                vs. other Edora aspirants who've taken this mock — not an official {config.label} percentile
              </p>
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
                    style={{ background: '#FBBF24', color: 'var(--color-on-accent)' }}>Pro</Button>
                </Link>
              </div>
            )}

            <div className="space-y-3">
              <Button onClick={() => { setPhase('setup'); setSections([]); setAllQuestions([]); setResult(null); submitRef.current = false; }}
                className="w-full h-12 rounded-2xl font-bold"
                style={{ background: config.color, color: 'var(--color-on-accent)' }}>
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
