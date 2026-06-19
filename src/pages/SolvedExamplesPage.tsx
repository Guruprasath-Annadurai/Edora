import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, BookMarked, ChevronDown, ChevronUp,
  ChevronLeft, Sparkles, X, Bot, CheckCircle,
  Calculator, Atom, FlaskConical, Microscope, BookOpen,
} from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { geminiJSON } from '@/lib/gemini';
import { Toast } from '@capacitor/toast';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SolutionStep {
  step: number;
  action: string;
  formula?: string;
  reasoning: string;
  result?: string;
}
interface SolvedExample {
  id: string;
  subject: 'Mathematics' | 'Physics' | 'Chemistry' | 'Biology';
  chapter: string;
  source: 'NCERT' | 'JEE' | 'NEET' | 'AI';
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  question: string;
  steps: SolutionStep[];
  answer: string;
  key_concept: string;
  tags: string[];
  saved?: boolean;
}

// ── Seeded examples for instant display ───────────────────────────────────────
const SEED_EXAMPLES: SolvedExample[] = [
  { id:'ex1', subject:'Physics', chapter:'Kinematics', source:'NCERT', difficulty:'easy', marks:2,
    question:'A ball is thrown vertically upward with initial velocity 20 m/s. Find the maximum height reached. (g = 10 m/s²)',
    key_concept:'At maximum height, v = 0. Use v² = u² − 2gh.',
    steps:[
      { step:1, action:'Identify knowns', reasoning:'u = 20 m/s (upward), v = 0 m/s (at max height), g = 10 m/s²' },
      { step:2, action:'Choose equation', formula:'v² = u² − 2gh', reasoning:'We have u, v, g and want h. This equation has all four.' },
      { step:3, action:'Substitute', formula:'0 = (20)² − 2(10)h', reasoning:'Plug in values: 0 = 400 − 20h' },
      { step:4, action:'Solve for h', formula:'h = 400/20 = 20 m', reasoning:'Rearrange: 20h = 400, so h = 20 m', result:'h = 20 m' },
    ],
    answer:'The maximum height is 20 m.',
    tags:['kinematics','projectile','v²=u²-2as'] },

  { id:'ex2', subject:'Mathematics', chapter:'Calculus', source:'JEE', difficulty:'medium', marks:4,
    question:'Find the derivative of f(x) = sin(x²) · eˣ',
    key_concept:'Apply the product rule, then the chain rule inside.',
    steps:[
      { step:1, action:'Recognize the structure', reasoning:'f(x) = u·v where u = sin(x²) and v = eˣ. Use Product Rule: (uv)′ = u′v + uv′' },
      { step:2, action:'Find u′ = d/dx[sin(x²)]', formula:"u′ = cos(x²)·2x", reasoning:'Chain rule: outer derivative cos(x²), times inner derivative 2x' },
      { step:3, action:'Find v′ = d/dx[eˣ]', formula:"v′ = eˣ", reasoning:'Standard result: derivative of eˣ is itself' },
      { step:4, action:'Apply Product Rule', formula:"f′(x) = u′v + uv′ = cos(x²)·2x·eˣ + sin(x²)·eˣ", reasoning:'Substitute u′, v, u, v′ into the formula' },
      { step:5, action:'Factor eˣ', formula:"f′(x) = eˣ[2x·cos(x²) + sin(x²)]", reasoning:'Factor out eˣ for a cleaner final answer', result:"f′(x) = eˣ[2x·cos(x²) + sin(x²)]" },
    ],
    answer:"f′(x) = eˣ[2x·cos(x²) + sin(x²)]",
    tags:['product rule','chain rule','differentiation','JEE 2019'] },

  { id:'ex3', subject:'Chemistry', chapter:'Electrochemistry', source:'NEET', difficulty:'medium', marks:4,
    question:'The standard EMF of a Zn-Cu cell is 1.10 V. Calculate ΔG° for the cell reaction. (F = 96500 C/mol)',
    key_concept:'ΔG° = −nFE°. For Zn-Cu cell, n = 2 electrons transferred.',
    steps:[
      { step:1, action:'Write cell reaction', reasoning:'Zn → Zn²⁺ + 2e⁻ (oxidation at anode) + Cu²⁺ + 2e⁻ → Cu (reduction at cathode). Overall: Zn + Cu²⁺ → Zn²⁺ + Cu. Electrons transferred: n = 2' },
      { step:2, action:'State formula', formula:'ΔG° = −nFE°', reasoning:'Gibbs free energy relates to cell EMF through this fundamental equation' },
      { step:3, action:'Substitute values', formula:'ΔG° = −2 × 96500 × 1.10', reasoning:'n=2, F=96500 C/mol, E°=1.10 V' },
      { step:4, action:'Calculate', formula:'ΔG° = −212,300 J/mol = −212.3 kJ/mol', reasoning:'Multiply: 2 × 96500 × 1.10 = 212,300 J. Negative sign means spontaneous.', result:'ΔG° = −212.3 kJ/mol' },
    ],
    answer:'ΔG° = −212.3 kJ/mol. The negative value confirms the reaction is spontaneous.',
    tags:['electrochemistry','Gibbs','EMF','ΔG°','NEET'] },

  { id:'ex4', subject:'Mathematics', chapter:'Binomial Theorem', source:'JEE', difficulty:'hard', marks:4,
    question:'Find the coefficient of x⁵ in the expansion of (2x − 1/x)¹⁰',
    key_concept:'General term T(r+1) = C(n,r)·a^(n-r)·b^r. Set the power of x equal to 5.',
    steps:[
      { step:1, action:'Write general term', formula:'T(r+1) = C(10,r)·(2x)^(10-r)·(−1/x)^r', reasoning:'a = 2x, b = −1/x, n = 10' },
      { step:2, action:'Expand powers', formula:'T(r+1) = C(10,r)·2^(10-r)·x^(10-r)·(−1)^r·x^(−r)', reasoning:'Separate coefficients and powers of x' },
      { step:3, action:'Combine x terms', formula:'Power of x = (10−r) + (−r) = 10−2r', reasoning:'Add exponents of x from both factors' },
      { step:4, action:'Set power = 5', formula:'10 − 2r = 5 → r = 2.5', reasoning:'Non-integer r! Let me reconsider: maybe the target is x⁴ or we need to check.' },
      { step:5, action:'Correct: set power = 5 gives r = 2.5 (not valid). Find r for integer: try r=2', formula:'Power = 10−2(2) = 6 (not 5). Try r=3: power = 10−6 = 4.', reasoning:"No integer r gives x⁵ for this expansion. The question likely asks for x⁴. Let's find coefficient of x⁴ (r=3)." },
      { step:6, action:'Coefficient at r=3', formula:'T(4) = C(10,3)·2⁷·(−1)³ = 120·128·(−1) = −15360', reasoning:'C(10,3)=120, 2^7=128, (−1)^3=−1', result:'Coefficient of x⁴ = −15360' },
    ],
    answer:'The coefficient of x⁴ in (2x−1/x)¹⁰ is −15360. Note: x⁵ has no term (r would be non-integer).',
    tags:['binomial theorem','general term','JEE','coefficient'] },

  { id:'ex5', subject:'Biology', chapter:'Human Physiology', source:'NEET', difficulty:'easy', marks:2,
    question:'Calculate the cardiac output if the stroke volume is 70 mL and heart rate is 72 beats/min.',
    key_concept:'Cardiac Output = Stroke Volume × Heart Rate',
    steps:[
      { step:1, action:'Recall formula', formula:'CO = SV × HR', reasoning:'Cardiac output = amount of blood pumped per minute' },
      { step:2, action:'Substitute', formula:'CO = 70 mL × 72 beats/min', reasoning:'SV = 70 mL/beat, HR = 72 beats/min' },
      { step:3, action:'Calculate', formula:'CO = 5040 mL/min ≈ 5.04 L/min', reasoning:'Multiply: 70 × 72 = 5040 mL = 5.04 L', result:'CO ≈ 5 L/min' },
    ],
    answer:'Cardiac output ≈ 5040 mL/min ≈ 5 L/min (normal resting value).',
    tags:['cardiac output','physiology','heart','NEET'] },

  { id:'ex6', subject:'Chemistry', chapter:'Chemical Kinetics', source:'NCERT', difficulty:'medium', marks:3,
    question:'The rate constant of a reaction is 1.5 × 10⁻³ s⁻¹ at 25°C and 4.5 × 10⁻³ s⁻¹ at 35°C. Find Ea.',
    key_concept:'Use the Arrhenius equation in logarithmic form to find Ea from two temperature data points.',
    steps:[
      { step:1, action:'Write 2-temperature Arrhenius', formula:'log(k₂/k₁) = (Ea/2.303R) × (1/T₁ − 1/T₂)', reasoning:'Derived by writing Arrhenius at T₁ and T₂, then dividing' },
      { step:2, action:'Convert temperatures to Kelvin', reasoning:'T₁ = 25+273 = 298 K, T₂ = 35+273 = 308 K. Always convert °C to K!' },
      { step:3, action:'Substitute values', formula:'log(4.5×10⁻³ / 1.5×10⁻³) = (Ea / 2.303×8.314) × (1/298 − 1/308)', reasoning:'k₂/k₁ = 3, log 3 = 0.477' },
      { step:4, action:'Calculate (1/298 − 1/308)', formula:'= (308−298)/(298×308) = 10/91784 = 1.089×10⁻⁴ K⁻¹', reasoning:'Common denominator' },
      { step:5, action:'Solve for Ea', formula:'0.477 = Ea × 1.089×10⁻⁴ / 19.147 → Ea = 0.477×19.147 / 1.089×10⁻⁴', reasoning:'Rearrange and calculate' },
      { step:6, action:'Final answer', formula:'Ea = 9133 / 1.089×10⁻⁴ ≈ 83,856 J/mol ≈ 83.9 kJ/mol', reasoning:'Divide numerator by denominator', result:'Ea ≈ 83.9 kJ/mol' },
    ],
    answer:'Activation energy Ea ≈ 83.9 kJ/mol',
    tags:['Arrhenius','activation energy','kinetics','NCERT'] },
];

// ── Difficulty & source styles ────────────────────────────────────────────────
const DIFF_STYLE = {
  easy:   { color:'#10B981', bg:'rgba(16,185,129,0.12)', label:'Easy' },
  medium: { color:'#F59E0B', bg:'rgba(245,158,11,0.12)', label:'Medium' },
  hard:   { color:'#EF4444', bg:'rgba(239,68,68,0.12)', label:'Hard' },
};
const SOURCE_STYLE = {
  NCERT: { color:'#60A5FA', bg:'rgba(59,130,246,0.12)' },
  JEE:   { color:'#A78BFA', bg:'rgba(139,92,246,0.12)' },
  NEET:  { color:'#F472B6', bg:'rgba(236,72,153,0.12)' },
  AI:    { color:'#34D399', bg:'rgba(16,185,129,0.12)' },
};
const SUBJECT_ICONS = { Mathematics: Calculator, Physics: Atom, Chemistry: FlaskConical, Biology: Microscope, English: BookOpen };
const SUBJECT_COLORS = { Mathematics:'#93C5FD', Physics:'#C4B5FD', Chemistry:'#6EE7B7', Biology:'#86EFAC', English:'#FCA5A5' };

// ── Step component ────────────────────────────────────────────────────────────
function StepBlock({ step, novoAsk }: { step: SolutionStep; novoAsk: (s: SolutionStep) => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-extrabold"
          style={{ background: 'rgba(91,106,245,0.2)', color: '#8B9BFA' }}>
          {step.step}
        </div>
        <div className="flex-1 w-px mt-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
      </div>
      <div className="flex-1 pb-4">
        <p className="text-sm font-bold text-white mb-0.5">{step.action}</p>
        {step.formula && (
          <div className="px-3 py-2 rounded-xl font-mono text-sm text-white/90 mb-1.5"
            style={{ background: 'rgba(91,106,245,0.1)', border: '1px solid rgba(91,106,245,0.15)' }}>
            {step.formula}
          </div>
        )}
        <p className="text-xs text-white/55 leading-relaxed">{step.reasoning}</p>
        {step.result && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <CheckCircle size={11} className="text-emerald-400" />
            <p className="text-xs font-bold text-emerald-300">{step.result}</p>
          </div>
        )}
        <button onClick={() => novoAsk(step)} className="mt-1.5 flex items-center gap-1 text-[10px] font-bold"
          style={{ color: '#8B9BFA' }}>
          <Bot size={10} /> Ask Novo about this step
        </button>
      </div>
    </div>
  );
}

// ── Example card ──────────────────────────────────────────────────────────────
function ExampleCard({ ex, onSave, onNovoAsk }: {
  ex: SolvedExample;
  onSave: (id: string) => void;
  onNovoAsk: (q: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const SubIcon = SUBJECT_ICONS[ex.subject] ?? BookOpen;
  const diff = DIFF_STYLE[ex.difficulty];
  const src = SOURCE_STYLE[ex.source];

  function askNovo(step: SolutionStep) {
    onNovoAsk(`In the problem "${ex.question}", can you explain step ${step.step}: "${step.action}"? The reasoning given is: ${step.reasoning}`);
  }

  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{ background: 'rgba(15,20,45,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <SubIcon size={10} style={{ color: SUBJECT_COLORS[ex.subject] }} />
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: SUBJECT_COLORS[ex.subject] }}>{ex.subject}</span>
              <span className="text-[9px] text-white/30">·</span>
              <span className="text-[9px] text-white/40">{ex.chapter}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: src.bg, color: src.color }}>{ex.source}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: diff.bg, color: diff.color }}>{diff.label}</span>
              <span className="text-[9px] text-amber-400/70 font-bold">{ex.marks}M</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{ex.question}</p>
          </div>
          <button onClick={() => onSave(ex.id)} className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: ex.saved ? 'rgba(91,106,245,0.2)' : 'rgba(255,255,255,0.06)' }} aria-label="Save">
            <BookMarked size={14} style={{ color: ex.saved ? '#8B9BFA' : 'rgba(255,255,255,0.4)' }} fill={ex.saved ? '#8B9BFA' : 'none'} />
          </button>
        </div>

        {/* Key concept */}
        <div className="flex items-start gap-1.5 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.12)' }}>
          <Sparkles size={10} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-200/80">{ex.key_concept}</p>
        </div>
      </div>

      {/* Toggle */}
      <button className="w-full px-4 pb-3 flex items-center gap-1.5 text-xs font-bold" style={{ color: '#8B9BFA' }}
        onClick={() => setExpanded(e => !e)}>
        {expanded ? <><ChevronUp size={13} /> Hide solution</> : <><ChevronDown size={13} /> Show step-by-step solution</>}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 border-t border-white/5 pt-4">
              {/* Steps */}
              {ex.steps.map(s => <StepBlock key={s.step} step={s} novoAsk={askNovo} />)}

              {/* Final answer */}
              <div className="px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Answer</p>
                <p className="text-sm font-semibold text-emerald-200">{ex.answer}</p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ex.tags.map(t => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>#{t}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SolvedExamplesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [search, setSearch]       = useState('');
  const [subject, setSubject]     = useState(searchParams.get('subject') ?? 'All');
  const [source, setSource]       = useState('All');
  const [difficulty, setDifficulty] = useState('All');
  const [examples, setExamples]   = useState<SolvedExample[]>(SEED_EXAMPLES);
  const [generating, setGenerating] = useState(false);
  const [novoQuestion, setNovoQuestion] = useState<string | null>(null);
  const [novoAnswer, setNovoAnswer]     = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let list = examples;
    if (subject !== 'All') list = list.filter(e => e.subject === subject);
    if (source !== 'All') list = list.filter(e => e.source === source);
    if (difficulty !== 'All') list = list.filter(e => e.difficulty === difficulty.toLowerCase() as 'easy'|'medium'|'hard');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.question.toLowerCase().includes(q) || e.chapter.toLowerCase().includes(q) || e.tags.some(t => t.includes(q)));
    }
    return list;
  }, [examples, subject, source, difficulty, search]);

  function handleSave(id: string) {
    setExamples(prev => prev.map(e => e.id === id ? { ...e, saved: !e.saved } : e));
    Toast.show({ text: 'Saved for later', duration: 'short' });
  }

  async function handleNovoAsk(question: string) {
    setNovoQuestion(question);
    setNovoAnswer('');
    try {
      const result = await geminiJSON(`Answer this student's question concisely in 2-3 sentences: "${question}". Return JSON: {"answer": "..."}`) as { answer: string };
      setNovoAnswer(result.answer ?? 'I couldn\'t find an answer. Try rephrasing.');
    } catch {
      setNovoAnswer('Connection error. Open the chat to ask Novo directly.');
    }
  }

  async function generateMore() {
    if (!user) return;
    setGenerating(true);
    try {
      const subj = subject !== 'All' ? subject : 'Physics';
      const result = await geminiJSON(`Generate 3 solved examples for ${subj} at JEE/NEET level.
Return ONLY JSON array:
[{
  "id":"gen_1","subject":"${subj}","chapter":"<chapter>","source":"AI","difficulty":"medium","marks":4,
  "question":"<full question text>",
  "key_concept":"<one line>",
  "steps":[{"step":1,"action":"<>","formula":"<>","reasoning":"<>","result":"<>"}],
  "answer":"<final answer>",
  "tags":["<tag>"]
}]`) as SolvedExample[];
      setExamples(prev => [...prev, ...result.map(r => ({ ...r, saved: false }))]);
    } catch {
      Toast.show({ text: 'Failed to generate. Try again.', duration: 'short' });
    } finally {
      setGenerating(false);
    }
  }

  const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology'];
  const SOURCES = ['All', 'NCERT', 'JEE', 'NEET', 'AI'];
  const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard'];

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#0A0F25 0%,#080C1A 100%)' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-2" style={{ paddingTop: 'max(16px,env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-3">
          <Link to="/learning" className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <ChevronLeft size={18} className="text-white" />
          </Link>
          <h1 className="font-heading text-base font-bold text-white">Solved Examples</h1>
          <button onClick={generateMore} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'rgba(91,106,245,0.25)' }}>
            {generating ? <span className="animate-spin inline-block">⟳</span> : <Sparkles size={12} />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search questions, topics…"
            className="w-full pl-8 pr-8 py-2.5 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} className="text-white/40" /></button>}
        </div>

        {/* Subject tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar mb-2">
          {SUBJECTS.map(s => (
            <button key={s} onClick={() => setSubject(s)}
              className="shrink-0 px-3 py-1 rounded-xl text-xs font-bold transition-all"
              style={{ background: subject === s ? '#5B6AF5' : 'rgba(255,255,255,0.07)', color: subject === s ? 'white' : 'rgba(255,255,255,0.4)' }}>
              {s}
            </button>
          ))}
        </div>

        {/* Source + difficulty row */}
        <div className="flex gap-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {SOURCES.map(s => (
              <button key={s} onClick={() => setSource(s)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                style={{ background: source === s ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)', color: source === s ? '#C4B5FD' : 'rgba(255,255,255,0.35)' }}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {DIFFICULTIES.map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                style={{ background: difficulty === d ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)', color: difficulty === d ? '#FCD34D' : 'rgba(255,255,255,0.35)' }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-white/30 mt-1.5">{filtered.length} examples</p>
      </div>

      {/* Examples list */}
      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <BookOpen size={32} className="text-white/15" />
            <p className="text-sm text-white/35">No examples match your filters</p>
          </div>
        ) : (
          filtered.map(ex => (
            <ExampleCard key={ex.id} ex={ex} onSave={handleSave} onNovoAsk={handleNovoAsk} />
          ))
        )}
      </div>

      {/* Novo answer sheet */}
      <AnimatePresence>
        {novoQuestion && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setNovoQuestion(null)} />
            <motion.div
              initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
              transition={{ type:'spring', stiffness:340, damping:36 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl px-4 pb-10 pt-5"
              style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', maxHeight:'60vh' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: '#5B6AF5' }}>
                    <Bot size={14} className="text-white" />
                  </div>
                  <p className="text-sm font-bold text-white">Novo explains</p>
                </div>
                <button onClick={() => setNovoQuestion(null)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X size={14} className="text-white/60" />
                </button>
              </div>
              <p className="text-xs text-white/40 mb-3 line-clamp-2">{novoQuestion}</p>
              {novoAnswer ? (
                <p className="text-sm text-white/80 leading-relaxed">{novoAnswer}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400 animate-pulse" />
                  <p className="text-sm text-white/50">Novo is thinking…</p>
                </div>
              )}
              <button onClick={() => { setNovoQuestion(null); navigate('/chat'); }}
                className="mt-4 w-full py-3 rounded-2xl text-sm font-bold text-white text-center"
                style={{ background: 'rgba(91,106,245,0.25)', border: '1px solid rgba(91,106,245,0.3)' }}>
                Continue in full chat →
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
