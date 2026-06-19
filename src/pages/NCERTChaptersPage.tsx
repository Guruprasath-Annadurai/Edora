import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, BookOpen, CheckCircle, XCircle, ChevronRight, Sparkles, Flag } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiCall, geminiJSON } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
import { track } from '@/lib/analytics';

type Phase = 'browse' | 'chapter' | 'quiz' | 'result';

interface NCERTChapter {
  id: string;
  class_num: number;
  subject: string;
  chapter_num: number;
  chapter_title: string;
  description: string | null;
  concepts: string[];
}

interface NCERTQuestion {
  id: string;
  concept: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: string;
  is_exemplar: boolean;
}

interface ChapterProgress {
  questions_attempted: number;
  questions_correct: number;
  flashcards_reviewed: number;
  completed_at: string | null;
}

const SUBJECTS = ['Maths', 'Science', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Civics', 'Economics'];
const CLASSES = [6, 7, 8, 9, 10, 11, 12];

const SUBJECT_COLORS: Record<string, string> = {
  Maths: '#A78BFA', Science: '#38BDF8', Physics: '#60A5FA',
  Chemistry: '#34D399', Biology: '#4ADE80',
  History: '#FBBF24', Geography: '#FB923C', Civics: '#F472B6', Economics: '#E879F9',
};
function sColor(s: string) { return SUBJECT_COLORS[s] ?? '#A0AEFF'; }

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function NCERTChaptersPage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [phase, setPhase]         = useState<Phase>('browse');
  const [classNum, setClassNum]   = useState<number>(searchParams.get('class') ? Number(searchParams.get('class')) : 10);
  const [subject, setSubject]     = useState(searchParams.get('subject') ?? 'Science');
  const [chapters, setChapters]   = useState<NCERTChapter[]>([]);
  const [progress, setProgress]   = useState<Record<string, ChapterProgress>>({});
  const [selectedChapter, setSelectedChapter] = useState<NCERTChapter | null>(null);
  const [questions, setQuestions] = useState<NCERTQuestion[]>([]);
  const [current, setCurrent]     = useState(0);
  const [answers, setAnswers]     = useState<(number | null)[]>([]);
  const [revealed, setRevealed]   = useState(false);
  const [novoExp, setNovoExp]     = useState('');
  const [loadingExp, setLoadingExp] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [genMode, setGenMode]     = useState(false);  // true = AI-generated questions
  const [flashcards, setFlashcards] = useState<{ front: string; back: string }[]>([]);
  const [fcIdx, setFcIdx]         = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);

  useEffect(() => { loadChapters(); }, [classNum, subject]);

  async function loadChapters() {
    setLoading(true);
    const { data } = await supabase
      .from('ncert_chapters')
      .select('*')
      .eq('class_num', classNum)
      .eq('subject', subject)
      .order('chapter_num');
    setChapters((data ?? []) as NCERTChapter[]);

    if (data?.length && profile) {
      const ids = data.map(c => c.id);
      const { data: prog } = await supabase
        .from('ncert_chapter_progress')
        .select('*')
        .eq('user_id', profile.id)
        .in('chapter_id', ids);
      const progMap: Record<string, ChapterProgress> = {};
      (prog ?? []).forEach((p: ChapterProgress & { chapter_id: string }) => {
        progMap[p.chapter_id] = p;
      });
      setProgress(progMap);
    }
    setLoading(false);
  }

  async function openChapter(chapter: NCERTChapter) {
    setSelectedChapter(chapter);
    setPhase('chapter');
    setLoading(true);

    // Try DB first
    const { data } = await supabase
      .from('ncert_chapter_questions')
      .select('*')
      .eq('chapter_id', chapter.id)
      .order('difficulty')
      .limit(20);

    if (data?.length) {
      setQuestions(data as NCERTQuestion[]);
      setGenMode(false);
    } else {
      // Generate via Gemini
      await generateChapterQuestions(chapter);
    }

    // Generate flashcards
    await generateFlashcards(chapter);
    setLoading(false);
  }

  async function generateChapterQuestions(chapter: NCERTChapter) {
    setGenMode(true);
    const langInstr = getLangInstruction(profile?.preferred_language);
    const prompt = `You are an expert Class ${chapter.class_num} ${chapter.subject} teacher.
Generate 15 MCQ questions for NCERT Chapter ${chapter.chapter_num}: "${chapter.chapter_title}".
Include: 5 easy questions on basic concepts, 7 medium on application, 3 hard/exemplar-level.
Key concepts to cover: ${chapter.concepts.slice(0, 5).join(', ')}.${langInstr}
Return ONLY valid JSON array: [{"concept":"...","question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","difficulty":"medium","is_exemplar":false}]`;
    try {
      const parsed = await geminiJSON<NCERTQuestion[]>(prompt);
      const qs: NCERTQuestion[] = (parsed ?? []).map((q, i) => ({ ...q, id: `gen_${i}` }));
      setQuestions(qs);
    } catch {
      setQuestions([]);
    }
  }

  async function generateFlashcards(chapter: NCERTChapter) {
    const langInstr = getLangInstruction(profile?.preferred_language);
    const prompt = `Create 8 concise flashcards for NCERT Class ${chapter.class_num} ${chapter.subject} Chapter ${chapter.chapter_num}: "${chapter.chapter_title}".${langInstr}
Return ONLY JSON array: [{"front":"Term or Question (max 10 words)","back":"Definition or Answer (max 25 words)"}]`;
    try {
      const cards = await geminiJSON<{ front: string; back: string }[]>(prompt);
      setFlashcards(cards ?? []);
      setFcIdx(0); setFcFlipped(false);
    } catch { setFlashcards([]); }
  }

  async function fetchNovoExp(q: NCERTQuestion) {
    if (novoExp || loadingExp) return;
    setLoadingExp(true);
    const langInstr = getLangInstruction(profile?.preferred_language);
    const prompt = `You are Novo, an expert Class ${selectedChapter?.class_num} ${selectedChapter?.subject} tutor.
Question: ${q.question}
Correct answer: ${q.options[q.correct_idx]}
Explain WHY this is correct using simple language a student would understand. Include a memory tip.${langInstr}
Keep it under 100 words. Be warm and encouraging.`;
    try {
      const resp = await geminiCall(prompt);
      setNovoExp(resp);
    } catch { /* silent */ }
    setLoadingExp(false);
  }

  function startQuiz() {
    if (!questions.length) return;
    setCurrent(0); setAnswers(new Array(questions.length).fill(null));
    setRevealed(false); setNovoExp('');
    setPhase('quiz');
    track('ncert_quiz_started', { class: classNum, subject, chapter: selectedChapter?.chapter_title });
  }

  function selectAnswer(idx: number) {
    if (answers[current] !== null) return;
    const updated = [...answers]; updated[current] = idx;
    setAnswers(updated);
    setRevealed(true);
    fetchNovoExp(questions[current]);
  }

  async function nextQuestion() {
    if (current >= questions.length - 1) {
      await saveProgress();
      const correct = answers.filter((a, i) => a === questions[i]?.correct_idx).length;
      track('ncert_quiz_completed', { class: classNum, subject, correct, total: questions.length });
      setPhase('result');
    } else {
      setCurrent(c => c + 1);
      setRevealed(false); setNovoExp('');
    }
  }

  async function saveProgress() {
    if (!profile || !selectedChapter) return;
    const correct = answers.filter((a, i) => a === questions[i]?.correct_idx).length;
    await supabase.from('ncert_chapter_progress').upsert({
      user_id: profile.id,
      chapter_id: selectedChapter.id,
      questions_attempted: answers.filter(a => a !== null).length,
      questions_correct: correct,
      flashcards_reviewed: flashcards.length > 0 ? fcIdx + 1 : 0,
      completed_at: correct / questions.length >= 0.7 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,chapter_id' });
  }

  const q = questions[current];
  const correctCount = answers.filter((a, i) => a === questions[i]?.correct_idx).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3"
           style={{ borderBottom: '1px solid var(--color-border)' }}>
        <motion.button whileTap={{ scale: 0.92 }}
          onClick={() => {
            if (phase === 'quiz' || phase === 'chapter') { setPhase('browse'); setQuestions([]); }
            else if (phase === 'result') setPhase('chapter');
          }}
          className="p-2 rounded-xl" style={{ background: 'var(--color-surface)' }}>
          {phase === 'browse' ? (
            <Link aria-label="Go back" to="/tools"><ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} /></Link>
          ) : (
            <ChevronLeft size={20} style={{ color: 'var(--color-text-secondary)' }} />
          )}
        </motion.button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {phase === 'browse' ? 'NCERT Chapters' : phase === 'chapter' ? selectedChapter?.chapter_title ?? '' : 'Quiz'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {phase === 'browse' ? `Class ${classNum} · ${subject}` : `Class ${classNum} ${subject}`}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Browse ── */}
        {phase === 'browse' && (
          <motion.div key="browse" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-4 py-4 space-y-5">
            {/* Class selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CLASSES.map(c => (
                <button key={c} onClick={() => setClassNum(c)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
                  style={{
                    background: classNum === c ? 'rgba(91,106,245,0.2)' : 'var(--color-surface)',
                    color: classNum === c ? '#A0AEFF' : 'var(--color-text-secondary)',
                    border: `1px solid ${classNum === c ? '#5B6AF5' : 'var(--color-border)'}`,
                  }}>
                  Class {c}
                </button>
              ))}
            </div>
            {/* Subject selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SUBJECTS.map(s => (
                <button key={s} onClick={() => setSubject(s)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 transition-all"
                  style={{
                    background: subject === s ? `${sColor(s)}20` : 'var(--color-surface)',
                    color: subject === s ? sColor(s) : 'var(--color-text-secondary)',
                    border: `1px solid ${subject === s ? sColor(s) : 'var(--color-border)'}`,
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>
            ) : chapters.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <BookOpen size={40} className="mx-auto opacity-30" style={{ color: 'var(--color-text-secondary)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Chapters for Class {classNum} {subject} not yet loaded.
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Content is being added. Try another subject or class.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {chapters.map((ch, i) => {
                  const prog = progress[ch.id];
                  const done = !!prog?.completed_at;
                  return (
                    <motion.button key={ch.id} whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => openChapter(ch)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all"
                      style={{ background: 'var(--color-surface)', border: `1px solid ${done ? sColor(subject) + '50' : 'var(--color-border)'}` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                           style={{ background: done ? `${sColor(subject)}20` : 'var(--color-border)' }}>
                        {done ? <CheckCircle size={18} color={sColor(subject)} /> :
                          <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>{ch.chapter_num}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                          {ch.chapter_title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {ch.concepts.slice(0, 3).join(' · ')}
                          {prog ? ` · ${prog.questions_correct}/${prog.questions_attempted} correct` : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Chapter Detail ── */}
        {phase === 'chapter' && selectedChapter && (
          <motion.div key="chapter" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-4 py-4 space-y-5">
            {loading ? (
              <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                     style={{ borderColor: `${sColor(subject)}40`, borderTopColor: sColor(subject) }} />
                Generating questions…
              </div>
            ) : (
              <>
                {/* Chapter info */}
                <div className="p-4 rounded-2xl"
                     style={{ background: `${sColor(subject)}10`, border: `1px solid ${sColor(subject)}40` }}>
                  <p className="text-xs font-semibold" style={{ color: sColor(subject) }}>
                    Chapter {selectedChapter.chapter_num}
                  </p>
                  <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--color-text)' }}>
                    {selectedChapter.chapter_title}
                  </h2>
                  {selectedChapter.description && (
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {selectedChapter.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selectedChapter.concepts.map(c => (
                      <span key={c} className="text-xs px-2 py-0.5 rounded-lg"
                        style={{ background: `${sColor(subject)}20`, color: sColor(subject) }}>{c}</span>
                    ))}
                  </div>
                </div>

                {genMode && (
                  <div className="flex items-center gap-2 text-xs"
                       style={{ color: 'var(--color-text-secondary)' }}>
                    <Sparkles size={12} color="#FBBF24" />
                    AI-generated questions — not from NCERT database yet
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <Button onClick={startQuiz} className="w-full h-12 rounded-2xl font-bold"
                    style={{ background: sColor(subject), color: '#0A0A0F' }}
                    disabled={!questions.length}>
                    Practice {questions.length} Questions
                  </Button>

                  {flashcards.length > 0 && (
                    <Button onClick={() => setShowFlashcards(true)} variant="outline"
                      className="w-full h-12 rounded-2xl"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                      📇 Review {flashcards.length} Flashcards
                    </Button>
                  )}
                </div>

                {/* Flashcard modal */}
                <AnimatePresence>
                  {showFlashcards && flashcards[fcIdx] && (
                    <motion.div key="fc-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="fixed inset-0 z-50 flex flex-col px-4 py-8"
                      style={{ background: 'var(--color-bg)' }}>
                      <div className="flex items-center justify-between mb-6">
                        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {fcIdx + 1} / {flashcards.length}
                        </span>
                        <button onClick={() => setShowFlashcards(false)}>
                          <XCircle size={24} style={{ color: 'var(--color-text-secondary)' }} />
                        </button>
                      </div>
                      <motion.div key={fcIdx} whileTap={{ scale: 0.98 }}
                        onClick={() => setFcFlipped(f => !f)}
                        className="flex-1 flex items-center justify-center p-8 rounded-3xl text-center cursor-pointer"
                        style={{ background: 'var(--color-surface)', border: `2px solid ${sColor(subject)}` }}>
                        <div>
                          <p className="text-xs font-semibold mb-3 uppercase tracking-wider"
                             style={{ color: sColor(subject) }}>
                            {fcFlipped ? 'Answer' : 'Question'}
                          </p>
                          <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                            {fcFlipped ? flashcards[fcIdx].back : flashcards[fcIdx].front}
                          </p>
                          {!fcFlipped && (
                            <p className="text-xs mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                              Tap to reveal
                            </p>
                          )}
                        </div>
                      </motion.div>
                      <div className="flex gap-3 mt-6">
                        <Button onClick={() => { setFcIdx(i => Math.max(0, i-1)); setFcFlipped(false); }}
                          variant="outline" className="flex-1 rounded-2xl" disabled={fcIdx === 0}
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>← Prev</Button>
                        <Button onClick={() => {
                          if (fcIdx < flashcards.length - 1) { setFcIdx(i => i + 1); setFcFlipped(false); }
                          else setShowFlashcards(false);
                        }} className="flex-1 rounded-2xl"
                          style={{ background: sColor(subject), color: '#0A0A0F' }}>
                          {fcIdx < flashcards.length - 1 ? 'Next →' : 'Done ✓'}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
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
              <div className="flex gap-1.5">
                {q.is_exemplar && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>Exemplar</span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {q.difficulty}
                </span>
              </div>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: 'var(--color-border)' }}>
              <div className="h-1.5 rounded-full"
                   style={{ width: `${((current + 1) / questions.length) * 100}%`, background: sColor(subject) }} />
            </div>
            <p className="text-xs font-medium" style={{ color: sColor(subject) }}>{q.concept}</p>
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
                  if (isCorrect)        { bg = 'rgba(52,211,153,0.15)'; border = '#34D399'; textCol = '#34D399'; }
                  else if (isSelected)  { bg = 'rgba(248,113,113,0.15)'; border = '#F87171'; textCol = '#F87171'; }
                }
                return (
                  <motion.button key={i} whileTap={{ scale: 0.98 }}
                    onClick={() => selectAnswer(i)} disabled={revealed}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left"
                    style={{ background: bg, border: `1.5px solid ${border}` }}>
                    <span className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: `${sColor(subject)}20`, color: sColor(subject) }}>
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
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{novoExp || q.explanation}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {revealed && (
              <Button onClick={nextQuestion} className="w-full h-12 rounded-2xl font-bold"
                style={{ background: sColor(subject), color: '#0A0A0F' }}>
                {current >= questions.length - 1 ? 'See Results' : 'Next →'}
              </Button>
            )}
          </motion.div>
        )}

        {/* ── Result ── */}
        {phase === 'result' && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="px-4 py-8 space-y-6 text-center">
            <div>
              {correctCount / questions.length >= 0.7
                ? <CheckCircle size={52} color="#34D399" className="mx-auto mb-3" />
                : <BookOpen size={52} color={sColor(subject)} className="mx-auto mb-3" />}
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                {correctCount} / {questions.length}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {selectedChapter?.chapter_title}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <p className="text-2xl font-bold" style={{ color: '#34D399' }}>{correctCount}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Correct</p>
              </div>
              <div className="p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <p className="text-2xl font-bold" style={{ color: '#F87171' }}>{questions.length - correctCount}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Wrong</p>
              </div>
            </div>
            <div className="space-y-3">
              <Button onClick={startQuiz} className="w-full h-12 rounded-2xl font-bold"
                style={{ background: sColor(subject), color: '#0A0A0F' }}>Retry Quiz</Button>
              <Button onClick={() => { setPhase('chapter'); setCurrent(0); }} variant="outline"
                className="w-full h-12 rounded-2xl"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>← Back to Chapter</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
