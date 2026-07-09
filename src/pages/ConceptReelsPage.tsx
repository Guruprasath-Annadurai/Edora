import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, BookMarked, Share2, X, Zap, CheckCircle2, Atom, FlaskConical, Calculator, Dna,
  type LucideIcon,
} from 'lucide-react';

const SUBJECT_ICON: Record<string, LucideIcon> = {
  Physics: Atom, Chemistry: FlaskConical, Mathematics: Calculator, Biology: Dna,
};
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { indexUserItem } from '@/lib/userContentIndex';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConceptReel {
  id: string;
  subject: string;
  chapter: string;
  concept: string;
  summary: string;     // 1-2 line hook
  explanation: string; // 3-4 sentences
  key_points: string[];
  animation_type: 'wave' | 'orbit' | 'gradient' | 'circuit' | 'dna' | 'pendulum';
  color1: string;
  color2: string;
  liked?: boolean;
  saved?: boolean;
}

// ── Seeded reels for instant display (no network needed) ──────────────────────
const SEED_REELS: ConceptReel[] = [
  { id:'r1', subject:'Physics', chapter:'Electrostatics', concept:"Gauss's Law",
    summary:'A closed surface can reveal hidden charges — no matter the shape.',
    explanation:"Gauss's Law states that the total electric flux through any closed surface equals the enclosed charge divided by ε₀. The genius: the surface's shape doesn't matter — only what's inside counts. This makes solving E-field problems for spheres, cylinders, and planes trivially easy.",
    key_points:['Φ = Q_enc/ε₀','Shape of surface doesn\'t matter','Only enclosed charge matters','Use for symmetric distributions'],
    animation_type:'circuit', color1:'#5B6AF5', color2:'#8B5CF6' },

  { id:'r2', subject:'Chemistry', chapter:'Chemical Kinetics', concept:'Arrhenius Equation',
    summary:'Why reactions speed up when you heat them — it\'s all about probability.',
    explanation:'The Arrhenius equation k = A·e^(−Ea/RT) tells us that only molecules with energy above Ea (activation energy) can react. Heating up doubles or triples the reaction rate because the fraction of energetic molecules grows exponentially. The "A" factor is how often molecules collide.',
    key_points:['k = A·e^(−Ea/RT)','Ea = activation energy','Higher T → more energetic molecules','Catalyst lowers Ea (not T)'],
    animation_type:'gradient', color1:'#F59E0B', color2:'#EF4444' },

  { id:'r3', subject:'Mathematics', chapter:'Calculus', concept:'Chain Rule',
    summary:'Differentiating a function inside another function — go outside in.',
    explanation:"The chain rule says: differentiate the outer function first, keep the inner unchanged, then multiply by the derivative of the inner. Think of it as peeling an onion. d/dx[f(g(x))] = f'(g(x)) · g'(x). The second factor (g'(x)) is the part students most often forget.",
    key_points:["d/dx[f(g(x))] = f'(g(x))·g'(x)",'Work outside → inside','Multiply by inner derivative','Applies to any composition'],
    animation_type:'wave', color1:'#06B6D4', color2:'#3B82F6' },

  { id:'r4', subject:'Biology', chapter:'Genetics', concept:'Hardy-Weinberg Equilibrium',
    summary:'A population with no evolution: the mathematical baseline.',
    explanation:"Hardy-Weinberg tells us that allele frequencies stay constant across generations if: no mutation, no migration, no selection, random mating, and large population. Real populations always violate these — that's how evolution happens. p²+2pq+q²=1 is the genotype frequency formula.",
    key_points:['p² + 2pq + q² = 1','5 conditions for equilibrium','Deviations = evolution','q² = recessive phenotype frequency'],
    animation_type:'dna', color1:'#10B981', color2:'#059669' },

  { id:'r5', subject:'Physics', chapter:'Waves', concept:'Doppler Effect',
    summary:'Why an ambulance sounds higher-pitched coming toward you.',
    explanation:'When a sound source moves toward you, wavefronts bunch up — wavelength decreases, frequency rises. Moving away, they stretch out — lower pitch. f_obs = f_src × (v±v_obs)/(v∓v_src). The same effect works for light: approaching stars appear blue-shifted, receding ones red-shifted.',
    key_points:['Approach → higher frequency','Recede → lower frequency','Observer numerator, Source denominator','Red shift = universe expanding'],
    animation_type:'wave', color1:'#8B5CF6', color2:'#EC4899' },

  { id:'r6', subject:'Chemistry', chapter:'Equilibrium', concept:"Le Chatelier's Principle",
    summary:'Disturb a system at equilibrium — it fights back.',
    explanation:"Le Chatelier's principle: if you stress an equilibrium (change concentration, pressure, or temperature), the system shifts to oppose the stress. Increase reactants → equilibrium shifts right (more products). Increase temperature in exothermic reaction → shifts left (opposes heat addition). Catalyst: speeds up both directions equally — no shift.",
    key_points:['Stress → system opposes it','Increase reactant → shift right','Add heat to exothermic → shift left','Catalyst: no shift, just faster'],
    animation_type:'gradient', color1:'#A78BFA', color2:'#F472B6' },

  { id:'r7', subject:'Mathematics', chapter:'Vectors', concept:'Dot Product & Cross Product',
    summary:'Two ways to multiply vectors — one gives a number, one gives direction.',
    explanation:'Dot product A·B = |A||B|cosθ gives a scalar — how much A points in the direction of B. Cross product A×B = |A||B|sinθ n̂ gives a vector perpendicular to both. Dot product for work (F·d), angles between vectors. Cross product for torque (r×F), area of parallelogram.',
    key_points:['A·B = |A||B|cosθ (scalar)','A×B = |A||B|sinθ n̂ (vector)','Dot: work, angles','Cross: torque, area'],
    animation_type:'orbit', color1:'#F59E0B', color2:'#84CC16' },

  { id:'r8', subject:'Biology', chapter:'Photosynthesis', concept:'Z-Scheme of Light Reactions',
    summary:'How plants split water and capture the sun\'s energy in a zigzag path.',
    explanation:"The Z-scheme describes electron flow in the light reactions. Water is split at PSII (releasing O₂), electrons travel through the electron transport chain to PSI, where they're re-energized by light and used to reduce NADP⁺ to NADPH. The pathway looks like a 'Z' when drawn as an energy diagram.",
    key_points:['PSII → splits water, releases O₂','ETC → generates ATP','PSI → makes NADPH','Z-shape on energy diagram'],
    animation_type:'dna', color1:'#22C55E', color2:'#16A34A' },
];

// ── SVG Animations ────────────────────────────────────────────────────────────
function WaveAnimation({ color1, color2 }: { color1: string; color2: string }) {
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      {[0,1,2,3].map(i => (
        <motion.path key={i}
          d={`M-50 100 Q 25 ${60-i*15} 100 100 Q 175 ${140+i*15} 250 100 Q 325 ${60-i*15} 400 100`}
          fill="none" stroke={i % 2 === 0 ? color1 : color2} strokeWidth={2-i*0.3} strokeOpacity={0.6-i*0.1}
          animate={{ d: [`M-50 100 Q 25 ${60-i*15} 100 100 Q 175 ${140+i*15} 250 100 Q 325 ${60-i*15} 400 100`,
                         `M-50 100 Q 25 ${140+i*15} 100 100 Q 175 ${60-i*15} 250 100 Q 325 ${140+i*15} 400 100`] }}
          transition={{ duration: 2+i*0.5, repeat: Infinity, repeatType:'reverse', ease:'easeInOut' }} />
      ))}
    </svg>
  );
}

function OrbitAnimation({ color1, color2 }: { color1: string; color2: string }) {
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      <circle cx="150" cy="100" r="30" fill={color1} fillOpacity="0.3" />
      <circle cx="150" cy="100" r="30" fill="none" stroke={color1} strokeWidth="1.5" strokeOpacity="0.6" />
      {[{r:60,dur:3,offset:0},{r:85,dur:5,offset:1},{r:110,dur:8,offset:2}].map((o,i) => (
        <g key={i}>
          <ellipse cx="150" cy="100" rx={o.r} ry={o.r*0.4} fill="none" stroke={i%2===0?color1:color2} strokeWidth="0.8" strokeOpacity="0.3" />
          <motion.circle r="7" fill={i%2===0?color1:color2} fillOpacity="0.9"
            animate={{ rotate: 360 }} transition={{ duration: o.dur, repeat: Infinity, ease:'linear' }}
            style={{ originX:'150px', originY:'100px' }}>
            <animateMotion dur={`${o.dur}s`} repeatCount="indefinite"
              path={`M ${150+o.r} 100 A ${o.r} ${o.r*0.4} 0 1 1 ${150-o.r} 100 A ${o.r} ${o.r*0.4} 0 1 1 ${150+o.r} 100`} />
          </motion.circle>
        </g>
      ))}
    </svg>
  );
}

function GradientAnimation({ color1, color2 }: { color1: string; color2: string }) {
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      <defs>
        <radialGradient id={`rg_${color1.slice(1)}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor={color1} stopOpacity="0.8" />
          <stop offset="100%" stopColor={color2} stopOpacity="0.1" />
        </radialGradient>
      </defs>
      {[{cx:80,cy:80,r:60},{cx:200,cy:130,r:70},{cx:150,cy:50,r:50}].map((c,i) => (
        <motion.circle key={i} cx={c.cx} cy={c.cy} r={c.r}
          fill={`url(#rg_${color1.slice(1)})`}
          animate={{ cx:[c.cx,c.cx+20,c.cx-15,c.cx], cy:[c.cy,c.cy-25,c.cy+20,c.cy], scale:[1,1.2,0.9,1] }}
          transition={{ duration: 4+i, repeat:Infinity, ease:'easeInOut' }} />
      ))}
    </svg>
  );
}

function DNAAnimation({ color1, color2 }: { color1: string; color2: string }) {
  const points = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      {points.map(i => {
        const y = 20 + i * 15;
        const phase = (i / 12) * Math.PI * 2;
        return (
          <g key={i}>
            <motion.circle cx={150} cy={y} r={5} fill={color1} fillOpacity={0.8}
              animate={{ cx:[150+30*Math.cos(phase), 150-30*Math.cos(phase), 150+30*Math.cos(phase)] }}
              transition={{ duration:2, repeat:Infinity, ease:'easeInOut', delay: i*0.05 }} />
            <motion.circle cx={150} cy={y} r={5} fill={color2} fillOpacity={0.8}
              animate={{ cx:[150-30*Math.cos(phase), 150+30*Math.cos(phase), 150-30*Math.cos(phase)] }}
              transition={{ duration:2, repeat:Infinity, ease:'easeInOut', delay: i*0.05 }} />
            <motion.line y1={y} y2={y} stroke="var(--ink-150)" strokeWidth={1}
              animate={{
                x1:[150+30*Math.cos(phase), 150-30*Math.cos(phase)],
                x2:[150-30*Math.cos(phase), 150+30*Math.cos(phase)]
              }}
              transition={{ duration:2, repeat:Infinity, ease:'easeInOut', delay: i*0.05 }} />
          </g>
        );
      })}
    </svg>
  );
}

function AnimationCanvas({ reel }: { reel: ConceptReel }) {
  const props = { color1: reel.color1, color2: reel.color2 };
  switch (reel.animation_type) {
    case 'wave':    return <WaveAnimation {...props} />;
    case 'orbit':   return <OrbitAnimation {...props} />;
    case 'dna':     return <DNAAnimation {...props} />;
    default:        return <GradientAnimation {...props} />;
  }
}

// ── Single reel card ──────────────────────────────────────────────────────────
function ReelCard({ reel, active, viewed, onLike, onSave }: {
  reel: ConceptReel; active: boolean; viewed: boolean;
  onLike: () => void; onSave: () => void;
}) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="relative w-full h-full flex flex-col" style={{
      background: `linear-gradient(180deg, ${reel.color1}18 0%, var(--surface-sheet) 60%)`,
    }}>
      {/* Animation canvas */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 opacity-60">
          {active && <AnimationCanvas reel={reel} />}
        </div>

        {/* Subject / chapter badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: `${reel.color1}30`, color: reel.color1, border: `1px solid ${reel.color1}40` }}>
            {reel.subject} · {reel.chapter}
          </span>
          {viewed && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <CheckCircle2 size={14} style={{ color: '#10B981', filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.6))' }} />
            </motion.div>
          )}
        </div>

        {/* Central subject icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={active ? { scale:[1,1.08,1], rotate:[0,3,-3,0] } : {}}
            transition={{ duration:3, repeat:Infinity, ease:'easeInOut' }}
          >
            {(() => {
              const Icon = SUBJECT_ICON[reel.subject] ?? Zap;
              return <Icon size={64} style={{ color: reel.color1 }} strokeWidth={1.3} />;
            })()}
          </motion.div>
        </div>
      </div>

      {/* Content overlay */}
      <div className="shrink-0 px-5 pb-6 pt-3"
        style={{ background: 'linear-gradient(180deg,transparent,var(--surface-scrim) 30%)' }}>
        <h2 className="font-heading text-2xl font-extrabold text-white mb-1">{reel.concept}</h2>
        <p className="text-sm font-semibold mb-3" style={{ color: reel.color1 }}>{reel.summary}</p>

        <AnimatePresence>
          {showFull && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}>
              <p className="text-sm text-white/70 leading-relaxed mb-3">{reel.explanation}</p>
              <div className="space-y-1.5 mb-3">
                {reel.key_points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Zap size={10} className="shrink-0 mt-1" style={{ color: reel.color1 }} />
                    <p className="text-xs text-white/60">{pt}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={() => setShowFull(s => !s)} className="text-xs font-bold" style={{ color: reel.color1 }}>
          {showFull ? 'Show less ↑' : 'Read more ↓'}
        </button>
      </div>

      {/* Right action bar */}
      <div className="absolute right-4 bottom-32 flex flex-col gap-5 items-center">
        <button onClick={onLike} className="flex flex-col items-center gap-1" aria-label="Like">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <Heart size={20} fill={reel.liked ? '#EF4444' : 'none'} stroke={reel.liked ? '#EF4444' : 'white'} />
          </div>
          <p className="text-xs text-white/60 font-bold">Like</p>
        </button>
        <button onClick={onSave} className="flex flex-col items-center gap-1" aria-label="Save as flashcard">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <BookMarked size={20} fill={reel.saved ? reel.color1 : 'none'} stroke={reel.saved ? reel.color1 : 'white'} />
          </div>
          <p className="text-xs text-white/60 font-bold">Save</p>
        </button>
        <button className="flex flex-col items-center gap-1" aria-label="Share" onClick={async () => {
          await Share.share({ title: reel.concept, text: `${reel.summary}\n\n${reel.key_points.join('\n')}`, dialogTitle: 'Share concept' }).catch(() => {});
        }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <Share2 size={20} className="text-white" />
          </div>
          <p className="text-xs text-white/60 font-bold">Share</p>
        </button>
      </div>
    </div>
  );
}

// ── XP session tracking ───────────────────────────────────────────────────────
function getViewedReels(uid: string): Set<string> {
  const key = `edora_reels_${uid}_${new Date().toISOString().slice(0, 10)}`;
  try { return new Set(JSON.parse(sessionStorage.getItem(key) ?? '[]')); } catch { return new Set(); }
}
function markReelViewed(uid: string, id: string): boolean {
  const key = `edora_reels_${uid}_${new Date().toISOString().slice(0, 10)}`;
  const viewed = getViewedReels(uid);
  const isNew = !viewed.has(id);
  viewed.add(id);
  sessionStorage.setItem(key, JSON.stringify([...viewed]));
  return isNew;
}

// ── XP toast ──────────────────────────────────────────────────────────────────
function XpToast({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full"
          style={{ background: 'rgba(16,185,129,0.9)', backdropFilter: 'blur(8px)' }}
        >
          <Zap size={14} className="text-white" />
          <span className="text-white text-xs font-bold">+5 XP</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ConceptReelsPage() {
  const { user } = useAuth();
  const [reels, setReels]       = useState<ConceptReel[]>(SEED_REELS);
  const [index, setIndex]       = useState(0);
  const [viewed, setViewed]     = useState<Set<string>>(new Set());
  const [showXp, setShowXp]     = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const dragStartY              = useRef<number | null>(null);
  const xpTimeoutRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init viewed set from sessionStorage
  useEffect(() => {
    if (user) setViewed(getViewedReels(user.id));
  }, [user]);

  // Award XP when index changes
  useEffect(() => {
    if (!user) return;
    const reel = reels[index];
    if (!reel) return;
    const isNew = markReelViewed(user.id, reel.id);
    setViewed(getViewedReels(user.id));
    if (isNew) {
      supabase.rpc('increment_xp', { user_id: user.id, amount: 5 }).then(() => {});
      setShowXp(true);
      if (xpTimeoutRef.current) clearTimeout(xpTimeoutRef.current);
      xpTimeoutRef.current = setTimeout(() => setShowXp(false), 1800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, user]);

  useEffect(() => () => { if (xpTimeoutRef.current) clearTimeout(xpTimeoutRef.current); }, []);

  // Load personalised reels based on user's weak topics
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: weakTopics } = await supabase.from('topic_stats')
        .select('topic,subject').eq('user_id', user.id)
        .order('struggle_count', { ascending: false }).limit(3);
      if (weakTopics && weakTopics.length > 0) {
        const weakSubjects = weakTopics.map((t: { subject: string }) => t.subject);
        setReels(prev => [...prev].sort((a, b) =>
          weakSubjects.includes(b.subject) ? 1 : weakSubjects.includes(a.subject) ? -1 : 0
        ));
      }
    })();
  }, [user]);

  function goTo(nextIndex: number) {
    if (nextIndex >= 0 && nextIndex < reels.length) setIndex(nextIndex);
  }

  // Touch drag for swipe
  function onTouchStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = dragStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) {
      if (dy > 0) goTo(index + 1);
      else goTo(index - 1);
    }
    dragStartY.current = null;
  }

  function handleLike(id: string) {
    setReels(prev => prev.map(r => r.id === id ? { ...r, liked: !r.liked } : r));
  }

  async function handleSave(reel: ConceptReel) {
    if (!user) return;
    setReels(prev => prev.map(r => r.id === reel.id ? { ...r, saved: !r.saved } : r));
    if (!reel.saved) {
      const { data: reelFc } = await supabase.from('flashcards').insert({
        user_id: user.id,
        front: reel.concept,
        back: `${reel.summary}\n\n${reel.key_points.join('\n')}`,
        subject: reel.subject,
        topic: reel.chapter,
        ease_factor: 2.5, interval: 1, repetitions: 0,
        next_review_at: new Date().toISOString(),
      }).select('id').single();
      if (reelFc?.id) indexUserItem('flashcard', reelFc.id).catch(() => {});
      Toast.show({ text: 'Saved as flashcard!', duration: 'short' });
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--surface-sheet)' }}>
      {/* XP toast */}
      <XpToast show={showXp} />

      {/* Header overlay */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4"
        style={{ paddingTop: 'max(16px,env(safe-area-inset-top))', paddingBottom: 12, background: 'linear-gradient(180deg,rgba(0,0,0,0.6),transparent)' }}>
        <Link to="/learning" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <X size={16} className="text-white" />
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-bold text-white">Concept Reels</h1>
          <p className="text-xs text-white/50">{index + 1} / {reels.length}</p>
        </div>
        <div className="w-8 h-8" />
      </div>

      {/* Progress dots (right side) */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 items-center">
        {reels.map((r, i) => (
          <div key={r.id} className="relative w-1.5 flex items-center justify-center">
            <div
              className="rounded-full transition-all duration-300"
              style={{
                width: i === index ? 6 : 4,
                height: i === index ? 18 : 4,
                background: i === index ? reels[index].color1 : viewed.has(r.id) ? 'var(--ink-500)' : 'var(--ink-150)',
              }}
            />
            {viewed.has(r.id) && i !== index && (
              <CheckCircle2 size={8} className="absolute" style={{ color: 'rgba(16,185,129,0.8)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Swipeable reel area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0"
          >
            <ReelCard
              reel={reels[index]}
              active={true}
              viewed={viewed.has(reels[index].id)}
              onLike={() => handleLike(reels[index].id)}
              onSave={() => handleSave(reels[index])}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Swipe nav buttons (for desktop / accessibility) */}
      <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-6 pointer-events-none z-20">
        {index > 0 && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => goTo(index - 1)}
            className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--ink-100)' }}
          >
            <span className="text-white/60 text-sm">↑</span>
          </motion.button>
        )}
        {index < reels.length - 1 && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => goTo(index + 1)}
            className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--ink-100)' }}
          >
            <span className="text-white/60 text-sm">↓</span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
