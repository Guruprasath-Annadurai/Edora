import {useState, useEffect, useMemo} from 'react';
import { SkeletonNcertCards } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChevronLeft, BookOpen, Lightbulb, AlertTriangle,
  Globe, Zap, BookMarked, ChevronRight, X, Sparkles,
  Calculator, Atom, FlaskConical, Microscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { Toast } from '@capacitor/toast';
import { SpeedReaderOverlay } from '@/components/study/SpeedReaderOverlay';

// ── Types ─────────────────────────────────────────────────────────────────────
interface NcertParagraph {
  id: string;
  subject: string;
  class_num: number;
  chapter_title: string;
  para_order: number;
  paragraph_text: string;
  concept: string;
  exam_question: string;
  misconception: string;
  real_world_example: string;
  bookmarked?: boolean;
}

interface SubjectChapter { subject: string; chapters: string[]; }

// ── Subjects & chapters ───────────────────────────────────────────────────────
const SUBJECT_DATA: SubjectChapter[] = [
  { subject: 'Physics', chapters: ['Physical World','Motion in a Straight Line','Motion in a Plane','Laws of Motion','Work, Energy & Power','Gravitation','Thermodynamics','Waves','Electric Charges','Current Electricity','Electromagnetic Induction','Ray Optics','Wave Optics','Atoms','Nuclei'] },
  { subject: 'Chemistry', chapters: ['Basic Concepts','Structure of Atom','Chemical Bonding','Thermodynamics','Equilibrium','Redox Reactions','Organic Chemistry Basics','Hydrocarbons','Solutions','Electrochemistry','Chemical Kinetics','Coordination Compounds','Aldehydes & Ketones','Polymers'] },
  { subject: 'Mathematics', chapters: ['Sets','Functions','Trigonometry','Complex Numbers','Sequences & Series','Straight Lines','Conic Sections','Limits','Derivatives','Integration','Differential Equations','Vectors','3D Geometry','Probability'] },
  { subject: 'Biology', chapters: ['Living World','Cell Biology','Photosynthesis','Respiration','Plant Growth','Human Physiology','Digestion','Circulation','Excretion','Nervous System','Genetics','Evolution','Ecosystem','Biotechnology'] },
];

const SUBJECT_ICONS = { Physics: Atom, Chemistry: FlaskConical, Mathematics: Calculator, Biology: Microscope };
const SUBJECT_COLORS = { Physics:'#C4B5FD', Chemistry:'#6EE7B7', Mathematics:'#93C5FD', Biology:'#86EFAC' };

// ── Seeded paragraphs (for immediate display before DB load) ──────────────────
const SEED_PARAGRAPHS: NcertParagraph[] = [
  { id:'p1', subject:'Physics', class_num:11, chapter_title:'Laws of Motion', para_order:1,
    paragraph_text:"Newton's first law of motion states that every object continues in its state of rest or uniform motion in a straight line unless acted upon by an external force. This is also known as the law of inertia.",
    concept:'Law of Inertia — objects resist changes to their state of motion.',
    exam_question:'A car suddenly brakes. The passengers lurch forward. Explain using Newton\'s first law.',
    misconception:'Students often think a moving object needs a continuous force to keep moving. In reality, no force is needed for uniform motion — only to change it.',
    real_world_example:'Seat belts in cars protect passengers because inertia keeps the body moving forward when the car stops.' },

  { id:'p2', subject:'Chemistry', class_num:11, chapter_title:'Equilibrium', para_order:1,
    paragraph_text:"Many reactions are reversible in nature. In a closed system, when the forward and reverse reaction rates become equal, the reaction is said to be in a state of chemical equilibrium.",
    concept:'Dynamic Equilibrium — forward and reverse rates are equal, concentrations constant but not zero.',
    exam_question:'Why is chemical equilibrium called dynamic even when concentrations don\'t change?',
    misconception:'Equilibrium does NOT mean the reaction has stopped. Both forward and reverse reactions continue at equal rates.',
    real_world_example:'The Haber process (N₂+3H₂⇌2NH₃) operates at high pressure to shift equilibrium toward ammonia production.' },

  { id:'p3', subject:'Mathematics', class_num:11, chapter_title:'Limits', para_order:1,
    paragraph_text:"The limit of a function f(x) as x approaches a value c is the value that f(x) tends to as x gets closer and closer to c, but does not necessarily equal f(c). This is written as lim(x→c) f(x).",
    concept:'Limit — the value a function approaches (not necessarily reaches) at a point.',
    exam_question:'Find lim(x→2) (x²-4)/(x-2) without substitution.',
    misconception:'A limit can exist even if the function is not defined at that point. The limit is about what value the function approaches, not what it equals at that point.',
    real_world_example:'Speed at an instant (instantaneous speed) is a limit — you can\'t measure speed at a single instant without the concept of limits.' },

  { id:'p4', subject:'Biology', class_num:11, chapter_title:'Photosynthesis', para_order:1,
    paragraph_text:"Photosynthesis is the process by which green plants and other autotrophs convert light energy, usually from the sun, into chemical energy stored in glucose. The overall equation is: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.",
    concept:'Photosynthesis converts light energy to chemical energy (glucose) using CO₂ and H₂O.',
    exam_question:'Where does the oxygen released in photosynthesis come from — CO₂ or H₂O? How is this proved?',
    misconception:'Plants don\'t just photosynthesize — they also respire 24/7. At the light compensation point, photosynthesis rate = respiration rate.',
    real_world_example:'Variegated leaves (with white patches) show that chlorophyll (green) is essential — white portions cannot photosynthesize and produce starch.' },

  { id:'p5', subject:'Physics', class_num:12, chapter_title:'Electric Charges', para_order:1,
    paragraph_text:"Electric charge is a fundamental property of matter that causes it to experience a force when placed in an electromagnetic field. Charge is quantised — it exists only in integer multiples of the elementary charge e = 1.6 × 10⁻¹⁹ C.",
    concept:'Charge quantisation — all charges are multiples of e. Charge is also conserved.',
    exam_question:'A conductor has 10 million extra electrons. What is its charge?',
    misconception:'Charge can be transferred but never created or destroyed. Rubbing doesn\'t create charge — it transfers electrons from one object to another.',
    real_world_example:'Lightning is a massive transfer of charge between clouds and Earth when the potential difference becomes large enough to ionise air.' },
];

// ── Paragraph card ────────────────────────────────────────────────────────────
function ParagraphCard({ p, onBookmark }: { p: NcertParagraph; onBookmark: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const SubIcon = SUBJECT_ICONS[p.subject as keyof typeof SUBJECT_ICONS] ?? BookOpen;
  const color = SUBJECT_COLORS[p.subject as keyof typeof SUBJECT_COLORS] ?? '#A0AEFF';

  return (
    <motion.div layout initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
      className="rounded-2xl overflow-hidden mb-3"
      style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-070)' }}>
      <div className="p-4">
        {/* Meta row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <SubIcon size={10} style={{ color }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{p.subject}</span>
            <span className="text-xs text-white/30">·</span>
            <span className="text-xs text-white/40">{p.chapter_title}</span>
            <span className="text-xs text-white/30">· Class {p.class_num}</span>
          </div>
          <button onClick={() => onBookmark(p.id)} aria-label={p.bookmarked ? 'Remove bookmark' : 'Bookmark'}
            className="flex items-center justify-center -mr-1 -my-1" style={{ width: 44, height: 44 }}>
            <BookMarked size={14} style={{ color: p.bookmarked ? color : 'var(--ink-250)' }} fill={p.bookmarked ? color : 'none'} />
          </button>
        </div>

        {/* Paragraph text */}
        <p className="text-sm text-white/80 leading-relaxed mb-3">{p.paragraph_text}</p>

        {/* Concept tag */}
        <div className="flex items-start gap-1.5 px-3 py-2 rounded-xl mb-2"
          style={{ background: `${color}12`, border: `1px solid ${color}20` }}>
          <Lightbulb size={10} style={{ color }} className="shrink-0 mt-0.5" />
          <p className="text-xs font-semibold leading-relaxed" style={{ color }}>{p.concept}</p>
        </div>
      </div>

      {/* Expand */}
      <button className="w-full px-4 pb-3 flex items-center gap-1.5 text-xs font-bold text-white/40"
        onClick={() => setExpanded(e => !e)}>
        {expanded ? '↑ Hide exam intel' : '↓ Exam question · Misconception · Real-world example'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              {/* Exam question */}
              <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.18)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={9} className="text-indigo-400" />
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Likely Exam Question</p>
                </div>
                <p className="text-xs text-indigo-200/80 leading-relaxed">{p.exam_question}</p>
              </div>

              {/* Misconception */}
              <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={9} className="text-red-400" />
                  <p className="text-xs font-bold uppercase tracking-wider text-red-400">Common Misconception</p>
                </div>
                <p className="text-xs text-red-200/70 leading-relaxed">{p.misconception}</p>
              </div>

              {/* Real-world example */}
              <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Globe size={9} className="text-emerald-400" />
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Real-World Example</p>
                </div>
                <p className="text-xs text-emerald-200/70 leading-relaxed">{p.real_world_example}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NcertDeepPage() {
  const { user } = useAuth();
  const [search, setSearch]       = useState('');
  const [selSubject, setSelSubject] = useState<string | null>(null);
  const [selChapter, setSelChapter] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<NcertParagraph[]>(SEED_PARAGRAPHS);
  const [dbParagraphs, setDbParagraphs] = useState<NcertParagraph[]>([]);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase]         = useState<'browse' | 'chapter' | 'content'>('browse');
  const [speedReaderOpen, setSpeedReaderOpen] = useState(false);

  // Load from DB
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ncert_paragraphs').select('*').limit(100);
      if (data && data.length > 0) setDbParagraphs(data as NcertParagraph[]);
    })();
  }, []);

  const allParagraphs = useMemo(() => {
    const db = dbParagraphs.filter(p =>
      (!selSubject || p.subject === selSubject) &&
      (!selChapter || p.chapter_title === selChapter)
    );
    const seed = paragraphs.filter(p =>
      (!selSubject || p.subject === selSubject) &&
      (!selChapter || p.chapter_title === selChapter)
    );
    // Merge: prefer DB data
    const dbIds = new Set(db.map(p => p.id));
    return [...db, ...seed.filter(p => !dbIds.has(p.id))];
  }, [dbParagraphs, paragraphs, selSubject, selChapter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allParagraphs;
    const q = search.toLowerCase();
    return allParagraphs.filter(p =>
      p.paragraph_text.toLowerCase().includes(q) ||
      p.concept.toLowerCase().includes(q) ||
      p.exam_question.toLowerCase().includes(q) ||
      p.chapter_title.toLowerCase().includes(q)
    );
  }, [allParagraphs, search]);

  async function generateChapterContent() {
    if (!selSubject || !selChapter) return;
    setGenerating(true);
    try {
      const result = await geminiJSON(`You are an expert NCERT teacher. Analyse Chapter "${selChapter}" from ${selSubject} (Class 11/12 NCERT).

Extract 5 key paragraphs/concepts and for each provide:
- The actual paragraph text (verbatim or close paraphrase from NCERT)
- The core concept it teaches
- A likely JEE/NEET exam question derived from this paragraph
- A common student misconception about this concept
- A real-world example that makes this concept click

Return ONLY valid JSON array:
[{
  "id": "ai_${Date.now()}_1",
  "subject": "${selSubject}",
  "class_num": 12,
  "chapter_title": "${selChapter}",
  "para_order": 1,
  "paragraph_text": "...",
  "concept": "...",
  "exam_question": "...",
  "misconception": "...",
  "real_world_example": "..."
}]`) as NcertParagraph[];

      const withIds = result.map((p, i) => ({ ...p, id: `ai_${Date.now()}_${i}`, bookmarked: false }));
      setParagraphs(prev => [...prev, ...withIds]);

      // Save to DB if user is logged in
      if (user) {
        await supabase.from('ncert_paragraphs').upsert(withIds.map(p => ({ ...p, generated_by: 'ai' })));
      }
    } catch {
      Toast.show({ text: 'Failed to generate content. Try again.', duration: 'short' });
    } finally {
      setGenerating(false);
    }
  }

  function toggleBookmark(id: string) {
    setParagraphs(prev => prev.map(p => p.id === id ? { ...p, bookmarked: !p.bookmarked } : p));
    setDbParagraphs(prev => prev.map(p => p.id === id ? { ...p, bookmarked: !p.bookmarked } : p));
  }

  const chapterParagraphCount = (subject: string, chapter: string) =>
    [...dbParagraphs, ...paragraphs].filter(p => p.subject === subject && p.chapter_title === chapter).length;

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-2" style={{ paddingTop: 'max(16px,env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (phase === 'content') { setPhase('chapter'); setSelChapter(null); }
              else if (phase === 'chapter') { setPhase('browse'); setSelSubject(null); }
              // 'browse' phase: back button navigates via the Link wrapper below, nothing to do here
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--ink-080)' }}
          >
            {phase === 'browse'
              ? <Link to="/learning"><ChevronLeft size={18} className="text-white" /></Link>
              : <ChevronLeft size={18} className="text-white" />}
          </button>
          <div className="text-center">
            <h1 className="font-heading text-base font-bold text-white">NCERT Deep Dive</h1>
            {phase !== 'browse' && (
              <p className="text-xs text-white/40">{selSubject}{selChapter ? ` · ${selChapter}` : ''}</p>
            )}
          </div>
          <div className="w-8" />
        </div>

        {/* Search (only on content view or search-all) */}
        {(phase === 'content' || search) && (
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search paragraphs, concepts…"
              className="w-full pl-8 pr-8 py-2.5 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
              style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-090)' }} />
            {search && <button aria-label="Close" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} className="text-white/40" /></button>}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-fluid pb-nav">
        <AnimatePresence mode="wait">

          {/* Browse subjects */}
          {phase === 'browse' && !search && (
            <motion.div key="browse" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Choose a subject</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {SUBJECT_DATA.map(s => {
                  const SubIcon = SUBJECT_ICONS[s.subject as keyof typeof SUBJECT_ICONS] ?? BookOpen;
                  const color = SUBJECT_COLORS[s.subject as keyof typeof SUBJECT_COLORS] ?? '#A0AEFF';
                  const total = [...dbParagraphs, ...SEED_PARAGRAPHS].filter(p => p.subject === s.subject).length;
                  return (
                    <motion.button key={s.subject} whileTap={{ scale:0.95 }}
                      onClick={() => { setSelSubject(s.subject); setPhase('chapter'); }}
                      className="flex flex-col p-5 rounded-3xl items-start gap-2 text-left"
                      style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                      <SubIcon size={24} style={{ color }} />
                      <p className="text-base font-bold text-white">{s.subject}</p>
                      <p className="text-xs" style={{ color: `${color}80` }}>{s.chapters.length} chapters · {total}+ paragraphs</p>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 p-4 rounded-2xl"
                style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.2)' }}>
                <Sparkles size={14} className="text-indigo-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">AI Deep Mapping</p>
                  <p className="text-xs text-white/50">Select any chapter → AI maps every paragraph with exam insights</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Chapter list */}
          {phase === 'chapter' && selSubject && !search && (
            <motion.div key="chapters" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}>
              <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Chapters in {selSubject}</p>
              <div className="space-y-2">
                {SUBJECT_DATA.find(s => s.subject === selSubject)?.chapters.map((ch, i) => {
                  const count = chapterParagraphCount(selSubject, ch);
                  return (
                    <button key={ch} onClick={() => { setSelChapter(ch); setPhase('content'); }}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left active:scale-98 transition-transform"
                      style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-060)' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-white/30 w-5">{i+1}</span>
                        <p className="text-sm font-semibold text-white">{ch}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {count > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(16,185,129,0.15)', color:'#34D399' }}>{count} mapped</span>}
                        <ChevronRight size={13} className="text-white/25" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Paragraph content */}
          {(phase === 'content' || search) && (
            <motion.div key="content" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}>
              {!search && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider">{filtered.length} paragraphs</p>
                  <div className="flex items-center gap-2">
                    {filtered.length > 0 && (
                      <button onClick={() => setSpeedReaderOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                        style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <Zap size={11} className="text-emerald-300" />
                        <span className="text-emerald-200">Speed Read</span>
                      </button>
                    )}
                    <button onClick={generateChapterContent} disabled={generating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                      style={{ background: 'rgba(91,106,245,0.25)' }}>
                      {generating ? <span className="animate-spin">⟳</span> : <Sparkles size={11} />}
                      {generating ? 'Generating…' : 'AI Map Chapter'}
                    </button>
                  </div>
                </div>
              )}

              {generating && (
                <div>
                  <div className="flex items-center gap-2 mb-4 px-1">
                    <Sparkles size={13} className="text-indigo-400 animate-pulse shrink-0" />
                    <p className="text-xs font-bold text-indigo-300">
                      AI mapping <span className="text-white">{selChapter}</span>…
                    </p>
                  </div>
                  <SkeletonNcertCards count={4} />
                </div>
              )}

              {filtered.length === 0 && !generating ? (
                <div className="flex flex-col items-center py-16 gap-3">
                  <BookOpen size={32} className="text-white/15" />
                  <p className="text-sm text-white/35">{search ? 'No results' : 'No paragraphs mapped yet'}</p>
                  {!search && <p className="text-xs text-white/25 text-center">Tap "AI Map Chapter" to generate deep insights</p>}
                </div>
              ) : (
                filtered.map(p => <ParagraphCard key={p.id} p={p} onBookmark={toggleBookmark} />)
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SpeedReaderOverlay
        open={speedReaderOpen}
        onClose={() => setSpeedReaderOpen(false)}
        content={filtered.map(p => p.paragraph_text).join('\n\n')}
        title={selChapter ?? 'NCERT Speed Reader'}
      />
    </div>
  );
}
