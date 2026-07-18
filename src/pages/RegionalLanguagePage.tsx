import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {Globe, ChevronLeft, ChevronRight, Search,
  Check, Languages, X, RefreshCw} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { Toast } from '@capacitor/toast';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Language {
  code: string;
  name: string;
  native: string;
  script: 'Devanagari' | 'Dravidian' | 'Bengali' | 'Gujarati' | 'Latin';
}
interface PYQQuestion {
  id: string;
  subject: string;
  year: number;
  exam: string;
  question_en: string;
  options_en: string[];
  correct_idx: number;
  explanation_en: string;
  topic: string;
}
interface Translation {
  question_id: string;
  lang_code: string;
  question_text: string;
  options: string[];
  explanation: string;
  status: 'pending' | 'done';
}

// ── Language data ─────────────────────────────────────────────────────────────
const LANGUAGES: Language[] = [
  { code:'hi', name:'Hindi',   native:'हिन्दी',   script:'Devanagari' },
  { code:'ta', name:'Tamil',   native:'தமிழ்',    script:'Dravidian' },
  { code:'te', name:'Telugu',  native:'తెలుగు',   script:'Dravidian' },
  { code:'kn', name:'Kannada', native:'ಕನ್ನಡ',    script:'Dravidian' },
  { code:'mr', name:'Marathi', native:'मराठी',    script:'Devanagari' },
  { code:'bn', name:'Bengali', native:'বাংলা',    script:'Bengali' },
  { code:'gu', name:'Gujarati',native:'ગુજરાતી',  script:'Gujarati' },
];

// ── Fallback questions ─────────────────────────────────────────────────────────
// Used only if the live pyq_content query fails (e.g. offline) — the real
// question set is loaded from the database in loadQuestions() below.
const FALLBACK_QUESTIONS: PYQQuestion[] = [
  { id:'q1', subject:'Physics', year:2023, exam:'NEET', topic:'Electrostatics',
    question_en:'The electric potential at a point due to a point charge q at distance r is:',
    options_en:['kq/r','kq/r²','kq²/r','kq/2r'], correct_idx:0,
    explanation_en:'V = kq/r. Electric potential varies as 1/r (not 1/r² like the field). k = 9×10⁹ N·m²/C².' },
  { id:'q2', subject:'Chemistry', year:2022, exam:'JEE', topic:'Chemical Kinetics',
    question_en:'For a first-order reaction, the half-life is:',
    options_en:['0.693/k','k/0.693','1/k','0.693k'], correct_idx:0,
    explanation_en:'t₁/₂ = 0.693/k for first-order reactions. This is independent of initial concentration — a unique property of first-order kinetics.' },
  { id:'q3', subject:'Mathematics', year:2023, exam:'JEE', topic:'Integration',
    question_en:'The value of ∫₀^π sin(x) dx is:',
    options_en:['0','1','2','-2'], correct_idx:2,
    explanation_en:'∫₀^π sin(x) dx = [-cos(x)]₀^π = (-cos π) - (-cos 0) = 1 - (-1) = 2.' },
  { id:'q4', subject:'Biology', year:2022, exam:'NEET', topic:'Genetics',
    question_en:'In Hardy-Weinberg equilibrium, if the frequency of recessive allele is 0.4, what is the frequency of heterozygotes?',
    options_en:['0.16','0.48','0.36','0.64'], correct_idx:1,
    explanation_en:'p + q = 1, so p = 0.6, q = 0.4. Frequency of heterozygotes (Aa) = 2pq = 2 × 0.6 × 0.4 = 0.48.' },
  { id:'q5', subject:'Physics', year:2021, exam:'NEET', topic:'Optics',
    question_en:'A ray of light passes from a denser to a rarer medium. Total internal reflection occurs when:',
    options_en:['angle of incidence > critical angle','angle of incidence < critical angle','angle of incidence = 0°','angle of refraction = 90°'], correct_idx:0,
    explanation_en:'TIR occurs when angle of incidence exceeds the critical angle (θc = sin⁻¹(1/μ)). The light is completely reflected back into the denser medium.' },
];

interface PyqContentRow {
  id: string;
  exam: string;
  year: number;
  subject: string;
  chapter: string | null;
  question_text: string;
  options: { text: string; label: string; correct: boolean }[];
  solution_text: string | null;
}

function mapPyqRow(row: PyqContentRow): PYQQuestion {
  return {
    id: row.id,
    subject: row.subject,
    year: row.year,
    exam: row.exam,
    question_en: row.question_text,
    options_en: row.options.map(o => o.text),
    correct_idx: Math.max(0, row.options.findIndex(o => o.correct)),
    explanation_en: row.solution_text ?? '',
    topic: row.chapter ?? '',
  };
}

// ── Question card ─────────────────────────────────────────────────────────────
function QuestionCard({ q, translation, lang, onTranslate }: {
  q: PYQQuestion;
  translation: Translation | null;
  lang: Language;
  onTranslate: (id: string) => void;
}) {
  const [showEn, setShowEn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const t = translation;
  const hasTranslation = t && t.status === 'done';
  const isTranslating = t && t.status === 'pending';
  const questionText = hasTranslation ? t.question_text : q.question_en;
  const options = hasTranslation ? t.options : q.options_en;
  const explanation = hasTranslation ? t.explanation : q.explanation_en;

  return (
    <div className="rounded-2xl overflow-hidden mb-3"
      style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-070)' }}>
      <div className="p-4">
        {/* Meta */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: q.exam === 'JEE' ? 'rgba(139,92,246,0.2)' : 'rgba(236,72,153,0.2)', color: q.exam === 'JEE' ? '#C4B5FD' : '#F9A8D4' }}>
              {q.exam} {q.year}
            </span>
            <span className="text-xs text-white/35">{q.subject} · {q.topic}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasTranslation && (
              <button onClick={() => setShowEn(e => !e)} className="text-xs font-bold text-white/40">
                {showEn ? lang.native : 'EN'}
              </button>
            )}
            {!hasTranslation && !isTranslating && (
              <button onClick={() => onTranslate(q.id)}
                className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(91,106,245,0.2)', color: '#8B9BFA' }}>
                <Languages size={9} /> {lang.native}
              </button>
            )}
            {isTranslating && (
              <span className="text-xs text-white/40 flex items-center gap-1">
                <RefreshCw size={9} className="animate-spin" /> Translating…
              </span>
            )}
          </div>
        </div>

        {/* Question */}
        <p className="text-sm text-white/90 leading-relaxed mb-3" dir={['ta','te','kn'].includes(lang.code) ? 'ltr' : 'auto'}>
          {(showEn || !hasTranslation) ? q.question_en : questionText}
        </p>

        {/* Options */}
        <div className="space-y-2">
          {(showEn || !hasTranslation ? q.options_en : options).map((opt, i) => (
            <button key={i} onClick={() => { setSelected(i); setRevealed(true); }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all"
              style={{
                background: !revealed ? 'var(--ink-040)' : i === q.correct_idx ? 'rgba(16,185,129,0.12)' : selected === i ? 'rgba(239,68,68,0.1)' : 'var(--ink-040)',
                border: !revealed ? '1px solid var(--ink-060)' : i === q.correct_idx ? '1px solid rgba(16,185,129,0.25)' : selected === i ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--ink-060)' }}>
              <span className="text-xs font-bold w-5 shrink-0" style={{ color: 'var(--ink-400)' }}>
                {String.fromCharCode(65+i)}
              </span>
              <span className="text-sm text-white/80 flex-1">{opt}</span>
              {revealed && i === q.correct_idx && <Check size={13} className="text-emerald-400 shrink-0" />}
            </button>
          ))}
        </div>

        {/* Explanation */}
        <AnimatePresence>
          {revealed && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} className="overflow-hidden">
              <div className="mt-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.15)' }}>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-1">Explanation</p>
                <p className="text-xs text-white/65 leading-relaxed">
                  {(showEn || !hasTranslation) ? q.explanation_en : explanation}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RegionalLanguagePage() {
  const [selLang, setSelLang]         = useState<Language | null>(null);
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [subject, setSubject]           = useState('All');
  const [search, setSearch]             = useState('');
  const [translatingAll, setTranslatingAll] = useState(false);
  const [phase, setPhase]               = useState<'pick' | 'questions'>('pick');
  const [questions, setQuestions]       = useState<PYQQuestion[]>(FALLBACK_QUESTIONS);

  const SUBJECTS = ['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'];

  // Load real PYQ questions from the DB — this page previously only ever
  // showed 5 hardcoded sample questions regardless of subject/exam, which
  // made it look permanently broken/stuck even though pyq_content has
  // hundreds of real rows across NEET/JEE/BOARDS/CAT.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('pyq_content')
        .select('id, exam, year, subject, chapter, question_text, options, solution_text')
        .eq('is_active', true)
        .limit(60);
      if (data && data.length > 0) {
        setQuestions((data as PyqContentRow[]).map(mapPyqRow));
      }
    })();
  }, []);

  // Pre-load saved translations from DB
  useEffect(() => {
    if (!selLang) return;
    (async () => {
      const { data } = await supabase.from('question_translations')
        .select('*').eq('lang_code', selLang.code);
      if (data) {
        const map: Record<string, Translation> = {};
        data.forEach((t: Translation) => { map[t.question_id] = t; });
        setTranslations(map);
      }
    })();
  }, [selLang]);

  const filtered = useMemo(() => {
    let list = questions;
    if (subject !== 'All') list = list.filter(q => q.subject === subject);
    if (search.trim()) {
      const sq = search.toLowerCase();
      list = list.filter(q => q.question_en.toLowerCase().includes(sq) || q.topic.toLowerCase().includes(sq));
    }
    return list;
  }, [questions, subject, search]);

  async function translateQuestion(questionId: string) {
    if (!selLang) return;
    const q = questions.find(q => q.id === questionId);
    if (!q) return;

    // Mark as pending
    setTranslations(prev => ({
      ...prev,
      [questionId]: { question_id: questionId, lang_code: selLang.code, question_text: '', options: [], explanation: '', status: 'pending' }
    }));

    try {
      const result = await geminiJSON(`Translate this exam question from English to ${selLang.name} (${selLang.native}).

Question: "${q.question_en}"
Options: ${JSON.stringify(q.options_en)}
Explanation: "${q.explanation_en}"

Important: Translate naturally. Keep technical terms in English where appropriate (e.g., "pH", "Newton", "DNA"). Mathematical formulas stay as-is.

Return ONLY JSON:
{
  "question_text": "...",
  "options": ["...", "...", "...", "..."],
  "explanation": "..."
}`) as { question_text: string; options: string[]; explanation: string };

      const t: Translation = { question_id: questionId, lang_code: selLang.code, ...result, status: 'done' };
      setTranslations(prev => ({ ...prev, [questionId]: t }));

      // Save to DB
      await supabase.from('question_translations').upsert({
        question_id: questionId, lang_code: selLang.code, source_table: 'pyq_content',
        translated_question: result.question_text,
        translated_options: result.options,
        translated_explanation: result.explanation,
        translated_by: 'gemini' });
    } catch {
      setTranslations(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      Toast.show({ text: 'Translation failed. Try again.', duration: 'short' });
    }
  }

  async function translateAll() {
    if (!selLang) return;
    setTranslatingAll(true);
    for (const q of filtered.slice(0, 5)) {
      if (!translations[q.id] || translations[q.id].status === 'pending') {
        await translateQuestion(q.id);
        await new Promise(r => setTimeout(r, 400));
      }
    }
    setTranslatingAll(false);
    Toast.show({ text: `Translated to ${selLang.native}!`, duration: 'short' });
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-3" style={{ paddingTop: 'max(16px,env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-4">
          <button aria-label="Go back" onClick={() => phase === 'questions' ? setPhase('pick') : undefined}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--ink-080)' }}>
            {phase === 'questions'
              ? <ChevronLeft size={18} className="text-white" onClick={() => setPhase('pick')} />
              : <Link to="/learning"><ChevronLeft size={18} className="text-white" /></Link>
            }
          </button>
          <h1 className="font-heading text-base font-bold text-white">Regional Languages</h1>
          <div className="w-8" />
        </div>

        {phase === 'questions' && selLang && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Languages size={20} style={{ color: '#A0AEFF' }} strokeWidth={1.7} />
              <div>
                <p className="text-sm font-bold text-white">{selLang.name}</p>
                <p className="text-xs text-white/40">{selLang.native}</p>
              </div>
            </div>
            <button onClick={translateAll} disabled={translatingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ background: 'rgba(91,106,245,0.25)' }}>
              {translatingAll ? <RefreshCw size={11} className="animate-spin" /> : <Languages size={11} />}
              {translatingAll ? 'Translating…' : `Translate All`}
            </button>
          </div>
        )}

        {phase === 'questions' && (
          <>
            {/* Search */}
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="w-full pl-8 pr-8 py-2.5 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
                style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-090)' }} />
              {search && <button aria-label="Close" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} className="text-white/40" /></button>}
            </div>
            {/* Subject tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {SUBJECTS.map(s => (
                <button key={s} onClick={() => setSubject(s)}
                  className="shrink-0 px-3 py-1 rounded-xl text-xs font-bold"
                  style={{ background: subject === s ? '#5B6AF5' : 'var(--ink-070)', color: subject === s ? 'white' : 'var(--ink-400)' }}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-fluid pb-nav">
        <AnimatePresence mode="wait">

          {/* Language picker */}
          {phase === 'pick' && (
            <motion.div key="pick" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <p className="text-sm text-white/50 mb-4">500M+ students deserve quality content in their mother tongue. Choose your language:</p>

              <div className="space-y-2 mb-6">
                {LANGUAGES.map(lang => (
                  <motion.button key={lang.code} whileTap={{ scale:0.97 }}
                    onClick={() => { setSelLang(lang); setPhase('questions'); }}
                    className="w-full flex items-center justify-between px-4 py-4 rounded-2xl text-left active:opacity-80"
                    style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-070)' }}>
                    <div className="flex items-center gap-3.5">
                      <Languages size={22} style={{ color: '#A0AEFF' }} strokeWidth={1.6} />
                      <div>
                        <p className="text-base font-bold text-white">{lang.name}</p>
                        <p className="text-sm" style={{ fontFamily: 'serif', color: 'var(--ink-500)' }}>{lang.native}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(91,106,245,0.15)', color:'#8B9BFA' }}>
                        {lang.script}
                      </span>
                      <ChevronRight size={14} className="text-white/25" />
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="flex items-start gap-2 p-4 rounded-2xl"
                style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.15)' }}>
                <Globe size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">Powered by Gemini AI</p>
                  <p className="text-xs text-white/50 mt-0.5">Questions are translated on-demand and cached for offline access. Technical terms preserved in English.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Questions */}
          {phase === 'questions' && selLang && (
            <motion.div key="questions" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}>
              <p className="text-xs text-white/30 mb-3">{filtered.length} questions · tap a card to translate</p>
              {filtered.map(q => (
                <QuestionCard
                  key={q.id} q={q} lang={selLang}
                  translation={translations[q.id] ?? null}
                  onTranslate={translateQuestion}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
