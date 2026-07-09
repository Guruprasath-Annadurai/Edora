import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {Search, Star, StarOff, ChevronDown, ChevronUp,
  Download, X, BookMarked, Calculator, Atom,
  FlaskConical, Microscope, Lightbulb, AlertTriangle, Copy, Check} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Toast } from '@capacitor/toast';

// ── KaTeX CDN loader (loads once, shared across all FormulaCards) ─────────────
let _katexLoaded  = false;
let _katexLoading = false;
const _katexCbs: Array<() => void> = [];

function loadKaTeX(cb: () => void) {
  if (_katexLoaded) { cb(); return; }
  _katexCbs.push(cb);
  if (_katexLoading) return;
  _katexLoading = true;

  const css = document.createElement('link');
  css.rel  = 'stylesheet';
  css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
  css.crossOrigin = 'anonymous';
  document.head.appendChild(css);

  const js = document.createElement('script');
  js.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
  js.crossOrigin = 'anonymous';
  js.onload = () => {
    _katexLoaded = true;
    _katexCbs.forEach(fn => fn());
    _katexCbs.length = 0;
  };
  js.onerror = () => { _katexLoading = false; _katexCbs.length = 0; };
  document.head.appendChild(js);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Formula {
  id: string;
  subject: 'Mathematics' | 'Physics' | 'Chemistry' | 'Biology';
  topic: string;
  name: string;
  formula: string;       // ASCII/Unicode representation
  latex?: string;        // LaTeX (for display hint)
  derivation: string;
  usage: string;
  mistakes: string[];
  related: string[];     // other formula ids
  mnemonic?: string;
  tags: string[];
  class?: string;        // 'JEE' | 'NEET' | '11' | '12'
}

// ── Formula database — 80+ formulas hardcoded for offline use ─────────────────
const FORMULAS: Formula[] = [
  // ── Mathematics ──────────────────────────────────────────────────────────
  { id:'quad', subject:'Mathematics', topic:'Algebra', name:'Quadratic Formula',
    formula:'x = (−b ± √(b²−4ac)) / 2a', latex:'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}',
    derivation:'Complete the square in ax²+bx+c=0: divide by a, move c/a, add (b/2a)² both sides.',
    usage:'Find roots of any quadratic. If b²−4ac > 0 → 2 real roots; = 0 → 1 root; < 0 → no real roots.',
    mistakes:['Forgetting ±','Dividing only the numerator by 2a','Sign error on −b'],
    related:['discriminant','vieta'], mnemonic:'Negative b, plus-or-minus the square root, of b-squared minus 4ac, all over 2a.',
    tags:['roots','quadratic','algebra'], class:'11' },

  { id:'discriminant', subject:'Mathematics', topic:'Algebra', name:'Discriminant',
    formula:'Δ = b² − 4ac',
    derivation:'Extracted from the quadratic formula numerator under the radical.',
    usage:'Determines nature of roots without solving. Use before applying the full formula.',
    mistakes:['Using a instead of 4ac','Forgetting the sign: it is b² MINUS 4ac'],
    related:['quad'], tags:['roots','nature'], class:'11' },

  { id:'vieta', subject:'Mathematics', topic:'Algebra', name:"Vieta's Formulas",
    formula:'α+β = −b/a  |  α·β = c/a',
    derivation:'Expand (x−α)(x−β) = x²−(α+β)x+αβ and compare with ax²+bx+c.',
    usage:'Find sum and product of roots without solving. Essential for JEE MCQs asking about roots.',
    mistakes:['Sign error on sum: it is NEGATIVE b/a'],
    related:['quad'], tags:['roots','sum','product'], class:'11' },

  { id:'ap_sum', subject:'Mathematics', topic:'Sequences & Series', name:'Sum of AP',
    formula:'Sₙ = n/2 × (2a + (n−1)d)  OR  Sₙ = n/2 × (a + l)',
    derivation:'Pair first and last terms: each pair sums to (a+l). There are n/2 such pairs.',
    usage:'Sum of n terms when first term a, common difference d, last term l are known.',
    mistakes:['Using n instead of n/2','Forgetting to use l only when last term is given'],
    related:['gp_sum'], mnemonic:'n over 2, times (twice the first term, plus (n−1) times d)',
    tags:['AP','sum','series'], class:'11' },

  { id:'gp_sum', subject:'Mathematics', topic:'Sequences & Series', name:'Sum of GP',
    formula:'Sₙ = a(rⁿ−1)/(r−1)  [r≠1]  |  S∞ = a/(1−r)  [|r|<1]',
    derivation:'Multiply Sₙ by r and subtract to cancel middle terms.',
    usage:'Sum of finite GP; infinite GP converges only when |r|<1.',
    mistakes:['Using S∞ when |r|≥1','Sign error in (rⁿ−1)/(r−1)'],
    related:['ap_sum'], tags:['GP','sum','series'], class:'11' },

  { id:'binomial', subject:'Mathematics', topic:'Binomial Theorem', name:'Binomial Theorem',
    formula:'(a+b)ⁿ = Σ C(n,r) aⁿ⁻ʳ bʳ  [r=0 to n]',
    derivation:'Each term chooses r copies of b from n brackets, rest are a.',
    usage:'Expand (a+b)ⁿ, find specific term T(r+1) = C(n,r)aⁿ⁻ʳbʳ.',
    mistakes:['T(r+1) is the (r+1)th term, not the rth','Forgetting to count from r=0'],
    related:[], tags:['expansion','combinatorics'], class:'11' },

  { id:'log_laws', subject:'Mathematics', topic:'Logarithms', name:'Laws of Logarithms',
    formula:'log(ab)=log a+log b  |  log(a/b)=log a−log b  |  log(aⁿ)=n·log a  |  log_b(a)=ln(a)/ln(b)',
    derivation:'From definition: b^x=a ⟹ log_b(a)=x. Laws follow from exponent laws.',
    usage:'Simplify expressions, solve exponential equations, change base.',
    mistakes:['log(a+b)≠log a+log b (very common!)','log(a)·log(b)≠log(ab)'],
    related:[], tags:['log','exponent'], class:'11' },

  { id:'limits_lhop', subject:'Mathematics', topic:'Calculus', name:"L'Hôpital's Rule",
    formula:'If lim f(x)/g(x) → 0/0 or ∞/∞, then lim f(x)/g(x) = lim f′(x)/g′(x)',
    derivation:'Based on Cauchy Mean Value Theorem — differentiate numerator and denominator independently.',
    usage:'Resolve indeterminate forms 0/0, ∞/∞. Apply repeatedly if needed.',
    mistakes:['Differentiating f(x)/g(x) as a quotient (use quotient rule only if NOT 0/0)'],
    related:['derivative_chain'], tags:['limit','indeterminate'], class:'12' },

  { id:'derivative_chain', subject:'Mathematics', topic:'Calculus', name:'Chain Rule',
    formula:'d/dx[f(g(x))] = f′(g(x)) · g′(x)',
    derivation:'Leibniz: dy/dx = (dy/du)(du/dx). Compose inner and outer function derivatives.',
    usage:'Differentiating composite functions like sin(x²), e^(3x), ln(cos x).',
    mistakes:['Forgetting to multiply by derivative of inner function'],
    related:['derivative_product','derivative_quotient'], tags:['differentiation','chain'], class:'11' },

  { id:'derivative_product', subject:'Mathematics', topic:'Calculus', name:'Product Rule',
    formula:'d/dx[u·v] = u′v + uv′',
    derivation:'From first principles: limit of [u(x+h)v(x+h)−u(x)v(x)]/h.',
    usage:'Differentiating products: x²·sin(x), eˣ·ln(x).',
    mistakes:['(uv)′ ≠ u′·v′ (this is the most common error!)'],
    related:['derivative_quotient','derivative_chain'], tags:['differentiation'], class:'11' },

  { id:'integration_by_parts', subject:'Mathematics', topic:'Calculus', name:'Integration by Parts',
    formula:'∫u dv = uv − ∫v du',
    derivation:'Reverse of the product rule: integrate both sides of d(uv) = u dv + v du.',
    usage:'Integrate products: ∫x·eˣ dx, ∫ln(x) dx, ∫x·sin(x) dx. Choose u by LIATE order.',
    mistakes:['Wrong LIATE choice','Not re-applying when ∫v du is still a product'],
    mnemonic:'LIATE: Log, Inverse trig, Algebraic, Trig, Exponential — pick u in this order.',
    related:[], tags:['integration','product'], class:'12' },

  { id:'integration_substitution', subject:'Mathematics', topic:'Calculus', name:'Substitution Rule',
    formula:'∫f(g(x))·g′(x) dx = ∫f(u) du  [u=g(x)]',
    derivation:'Reverse chain rule. If u=g(x) then du=g′(x)dx.',
    usage:'When integrand contains a composite function and its derivative.',
    mistakes:['Forgetting to substitute dx in terms of du','Not changing limits in definite integrals'],
    related:['integration_by_parts'], tags:['integration','substitution'], class:'12' },

  // ── Physics ──────────────────────────────────────────────────────────────
  { id:'newton2', subject:'Physics', topic:'Mechanics', name:"Newton's Second Law",
    formula:'F = ma',
    derivation:'Defined: Force is rate of change of momentum. F=dp/dt=d(mv)/dt=m·dv/dt=ma (constant m).',
    usage:'Find net force, acceleration, or mass. Always use NET force.',
    mistakes:['Using individual forces instead of net force','Forgetting direction (vector equation)'],
    related:['momentum','friction'], tags:['force','Newton','mechanics'], class:'11' },

  { id:'momentum', subject:'Physics', topic:'Mechanics', name:'Impulse-Momentum Theorem',
    formula:'J = Δp = FΔt = m(v−u)',
    derivation:'Integrate F=dp/dt over time: ∫F dt = Δp.',
    usage:'Collision problems, force applied for short time, variable force over time interval.',
    mistakes:['Confusing impulse (FΔt) with work (F·d)'],
    related:['newton2','conservation_momentum'], tags:['impulse','momentum'], class:'11' },

  { id:'conservation_momentum', subject:'Physics', topic:'Mechanics', name:'Conservation of Momentum',
    formula:'m₁u₁ + m₂u₂ = m₁v₁ + m₂v₂  [no external force]',
    derivation:'Newton\'s 3rd law: internal forces cancel in pairs. Total momentum constant.',
    usage:'All collision problems. Elastic: KE also conserved. Inelastic: KE lost.',
    mistakes:['Applying in presence of external forces (friction, gravity component)'],
    related:['momentum','elastic_collision'], tags:['collision','momentum'], class:'11' },

  { id:'elastic_collision', subject:'Physics', topic:'Mechanics', name:'Elastic Collision Velocities',
    formula:'v₁ = ((m₁−m₂)u₁+2m₂u₂)/(m₁+m₂)  |  v₂ = ((m₂−m₁)u₂+2m₁u₁)/(m₁+m₂)',
    derivation:'Solve simultaneously: momentum conservation + KE conservation.',
    usage:'Perfect elastic collisions. Special case: equal masses → velocities exchange.',
    mistakes:['Using these for inelastic collisions'],
    related:['conservation_momentum'], tags:['elastic','collision'], class:'11' },

  { id:'gravitation', subject:'Physics', topic:'Gravitation', name:"Newton's Law of Gravitation",
    formula:'F = G·m₁·m₂ / r²',
    derivation:'Empirical law. G = 6.674×10⁻¹¹ N·m²/kg².',
    usage:'Force between any two masses. Gravity is always attractive.',
    mistakes:['Using r as diameter','Confusing G (universal) with g (local acceleration)'],
    related:['orbital_velocity','escape_velocity'], tags:['gravity','gravitation'], class:'11' },

  { id:'orbital_velocity', subject:'Physics', topic:'Gravitation', name:'Orbital Velocity',
    formula:'v_orb = √(GM/r)',
    derivation:'Set centripetal force = gravitational force: mv²/r = GMm/r² → v = √(GM/r).',
    usage:'Speed of satellite at orbit radius r. Independent of satellite mass.',
    mistakes:['Using R (Earth radius) when orbit is at height h above surface: r = R+h'],
    related:['escape_velocity','gravitation'], tags:['satellite','orbital'], class:'11' },

  { id:'escape_velocity', subject:'Physics', topic:'Gravitation', name:'Escape Velocity',
    formula:'v_esc = √(2GM/R) = √(2gR)',
    derivation:'Set KE = gravitational PE at surface: ½mv² = GMm/R. Solve for v.',
    usage:'Minimum speed to escape planet\'s gravity. Earth: 11.2 km/s.',
    mistakes:['Not squaring the √2 factor','Confusing with orbital velocity (escape = √2 × orbital)'],
    related:['orbital_velocity'], tags:['escape','velocity'], class:'11' },

  { id:'waves', subject:'Physics', topic:'Waves', name:'Wave Equation',
    formula:'v = fλ  |  T = 1/f  |  ω = 2πf  |  k = 2π/λ',
    derivation:'From the travelling wave y = A·sin(kx−ωt), v = ω/k = fλ.',
    usage:'Relate wave speed, frequency, wavelength, period, angular frequency, wave number.',
    mistakes:['Confusing T (period) with time elapsed','Using frequency in Hz vs angular frequency ω'],
    related:['doppler'], tags:['wave','frequency','wavelength'], class:'11' },

  { id:'doppler', subject:'Physics', topic:'Waves', name:'Doppler Effect',
    formula:'f_obs = f_src × (v±v_obs)/(v∓v_src)',
    derivation:'Count wavefronts per second reaching observer as source/observer move.',
    usage:'Upper sign when approaching, lower when receding. Remember: approach → higher pitch.',
    mistakes:['Getting ± wrong: observer moving toward source → add in numerator'],
    mnemonic:'Observer on top (numerator), Source on bottom (denominator). Approach = +/−.',
    related:['waves'], tags:['Doppler','sound'], class:'11' },

  { id:'electric_field', subject:'Physics', topic:'Electrostatics', name:"Coulomb's Law",
    formula:'F = kq₁q₂/r²  where k = 1/(4πε₀) ≈ 9×10⁹ N·m²/C²',
    derivation:'Empirical law analogous to gravitation but with charge instead of mass.',
    usage:'Force between point charges. Can be repulsive (unlike gravitation).',
    mistakes:['Forgetting direction — repulsive for like charges, attractive for unlike'],
    related:['electric_potential','gauss_law'], tags:['electrostatics','Coulomb','charge'], class:'12' },

  { id:'gauss_law', subject:'Physics', topic:'Electrostatics', name:"Gauss's Law",
    formula:'Φ = ∮E·dA = Q_enc/ε₀',
    derivation:'From Coulomb\'s law + principle of superposition. Total flux equals enclosed charge/ε₀.',
    usage:'Find E field for symmetric charge distributions (sphere, cylinder, plane).',
    mistakes:['Using Q_total not Q_enclosed','Applying to non-symmetric distributions'],
    related:['electric_field'], tags:['Gauss','flux','electrostatics'], class:'12' },

  { id:'ohms_law', subject:'Physics', topic:'Current Electricity', name:"Ohm's Law",
    formula:'V = IR  |  P = VI = I²R = V²/R',
    derivation:'Empirical. Resistance R = ρL/A where ρ is resistivity.',
    usage:'Circuits. Use Kirchhoff\'s laws for multi-loop. Power dissipation in resistors.',
    mistakes:['Confusing series (same I) and parallel (same V) rules'],
    related:['kirchhoff'], tags:['resistance','current','Ohm'], class:'12' },

  { id:'kirchhoff', subject:'Physics', topic:'Current Electricity', name:"Kirchhoff's Laws",
    formula:'KCL: ΣI_in = ΣI_out  |  KVL: ΣV around any loop = 0',
    derivation:'KCL: charge conservation. KVL: energy conservation (no net work in closed loop).',
    usage:'Solve any circuit. Apply at each node (KCL) and each loop (KVL).',
    mistakes:['Sign errors in KVL — use consistent direction for traversal'],
    related:['ohms_law'], tags:['circuit','Kirchhoff'], class:'12' },

  { id:'em_induction', subject:'Physics', topic:'Electromagnetic Induction', name:'Faraday\'s Law',
    formula:'EMF = −dΦ/dt  |  Φ = B·A·cos θ',
    derivation:'Empirical. The negative sign (Lenz\'s law) means induced EMF opposes flux change.',
    usage:'Find EMF in rotating coils, moving conductors, changing B field.',
    mistakes:['Forgetting the negative sign (Lenz\'s law)','Not differentiating — EMF ≠ Φ itself'],
    related:['ohms_law'], tags:['EMF','Faraday','induction'], class:'12' },

  { id:'lens_formula', subject:'Physics', topic:'Optics', name:'Lens & Mirror Formula',
    formula:'1/f = 1/v − 1/u  |  m = v/u',
    derivation:'From geometry of ray diagrams using similar triangles.',
    usage:'All lens/mirror problems. Sign convention: distances measured from pole/optical center.',
    mistakes:['Cartesian sign: object to left → u negative','f positive for convex lens/concave mirror'],
    mnemonic:'1/f = 1/v − 1/u. Remember "f is the boss" (defines focal length).',
    related:[], tags:['optics','lens','mirror'], class:'12' },

  // ── Chemistry ────────────────────────────────────────────────────────────
  { id:'ideal_gas', subject:'Chemistry', topic:'States of Matter', name:'Ideal Gas Law',
    formula:'PV = nRT  |  R = 8.314 J/(mol·K)',
    derivation:'Combined gas law (Boyle + Charles + Gay-Lussac) + Avogadro\'s hypothesis.',
    usage:'Any gas problem at standard or non-standard conditions.',
    mistakes:['Using T in °C instead of Kelvin (always add 273)','Using wrong R unit — match to P units'],
    related:['vant_hoff'], tags:['gas','PV','ideal'], class:'11' },

  { id:'raoults_law', subject:'Chemistry', topic:'Solutions', name:"Raoult's Law",
    formula:"P_solution = χ_solvent × P°_solvent",
    derivation:'Each solvent molecule at surface contributes proportionally to its mole fraction.',
    usage:'Vapour pressure of ideal solutions. Basis for all colligative property derivations.',
    mistakes:['Applying to non-ideal solutions','Confusing χ_solvent vs χ_solute'],
    related:['boiling_point_elevation'], tags:["Raoult","vapour pressure","solution"], class:'12' },

  { id:'boiling_point_elevation', subject:'Chemistry', topic:'Solutions', name:'Colligative Properties',
    formula:'ΔTb = Kb·m  |  ΔTf = Kf·m  |  π = MRT',
    derivation:'Thermodynamic: lowering chemical potential of solvent raises boiling point.',
    usage:'Molecular weight determination, antifreeze, osmotic pressure calculations.',
    mistakes:['Using molarity (M) instead of molality (m) for ΔTb and ΔTf'],
    mnemonic:'BFO: Boiling up, Freezing down, Osmotic pressure. Kb for Boiling (Kb > Kf usually).',
    related:['raoults_law'], tags:['colligative','boiling point','freezing'], class:'12' },

  { id:'rate_law', subject:'Chemistry', topic:'Chemical Kinetics', name:'Rate Law & Orders',
    formula:'Rate = k[A]^m[B]^n  |  k = A·e^(−Ea/RT)  (Arrhenius)',
    derivation:'Empirical from experiments. Arrhenius: fraction of molecules with E ≥ Ea.',
    usage:'Determine rate, find order from initial rate data, effect of temperature on k.',
    mistakes:['Assuming order = stoichiometric coefficient (experimental, not theoretical!)'],
    mnemonic:'Arrhenius: Activate! k = A × e^(−Ea/RT). Temperature up → k up.',
    related:['equilibrium'], tags:['kinetics','rate','Arrhenius'], class:'12' },

  { id:'equilibrium', subject:'Chemistry', topic:'Equilibrium', name:'Equilibrium Constants',
    formula:'Kc = [products]/[reactants]  |  Kp = Kc(RT)^Δn  |  ΔG° = −RT ln K',
    derivation:'From thermodynamics: at equilibrium ΔG=0, relate G° to ln K.',
    usage:'Predict direction of reaction, find equilibrium concentrations, Le Chatelier\'s.',
    mistakes:['Including solids/liquids in expression','Using partial pressures in Kc'],
    related:['rate_law'], tags:['equilibrium','Kc','Kp'], class:'11' },

  { id:'nernst', subject:'Chemistry', topic:'Electrochemistry', name:'Nernst Equation',
    formula:'E = E° − (RT/nF)·ln Q  ≈  E° − (0.0592/n)·log Q  at 25°C',
    derivation:'From ΔG = ΔG° + RT ln Q and ΔG = −nFE.',
    usage:'EMF of cell under non-standard conditions, concentration cells.',
    mistakes:['Using ln vs log — factor 2.303 difference','Wrong sign on the equation'],
    related:['equilibrium'], tags:['electrochemistry','EMF','Nernst'], class:'12' },

  { id:'hess_law', subject:'Chemistry', topic:'Thermodynamics', name:"Hess's Law",
    formula:'ΔH_rxn = Σ ΔH_f(products) − Σ ΔH_f(reactants)',
    derivation:'Enthalpy is a state function — path independent. Can add/subtract reactions.',
    usage:'Calculate ΔH of reactions that can\'t be measured directly.',
    mistakes:['Not multiplying ΔH by stoichiometric coefficient when scaling reaction'],
    related:['gibbs'], tags:['thermodynamics','enthalpy','Hess'], class:'11' },

  { id:'gibbs', subject:'Chemistry', topic:'Thermodynamics', name:'Gibbs Free Energy',
    formula:'ΔG = ΔH − TΔS  |  ΔG < 0 → spontaneous',
    derivation:'Combines 1st (ΔH) and 2nd (ΔS) laws. G is the "useful work" available.',
    usage:'Predict spontaneity. At equilibrium ΔG=0. ΔG° = −nFE° = −RT ln K.',
    mistakes:['Forgetting T in Kelvin in TΔS'],
    mnemonic:'ΔG tells you "Go?" Negative = Go!',
    related:['hess_law','nernst'], tags:['Gibbs','thermodynamics','spontaneous'], class:'11' },

  // ── Biology ──────────────────────────────────────────────────────────────
  { id:'hardy_weinberg', subject:'Biology', topic:'Genetics', name:'Hardy-Weinberg Principle',
    formula:'p² + 2pq + q² = 1  |  p + q = 1',
    derivation:'Binomial expansion of allele frequencies under five equilibrium conditions.',
    usage:'Calculate allele/genotype frequencies, detect evolution in populations.',
    mistakes:['Forgetting q² is recessive homozygous (not just recessive phenotype)'],
    mnemonic:'p-square (AA) + 2pq (Aa) + q-square (aa) = 1. Like (p+q)² = 1.',
    related:[], tags:['genetics','evolution','population'], class:'12' },

  { id:'beer_lambert', subject:'Biology', topic:'Biochemistry', name:'Beer-Lambert Law',
    formula:'A = εcl  |  A = log(I₀/I)',
    derivation:'Absorbance is proportional to concentration (c) and path length (l).',
    usage:'Spectrophotometry — measure concentration of biological molecules.',
    mistakes:['Transmittance T = I/I₀, NOT A. A = −log T.'],
    related:[], tags:['spectrophotometry','absorbance','biochemistry'], class:'12' },

  { id:'cardiac_output', subject:'Biology', topic:'Physiology', name:'Cardiac Output',
    formula:'CO = SV × HR',
    derivation:'Cardiac Output = Stroke Volume × Heart Rate. Rest: ~5L/min.',
    usage:'Exercise physiology, clinical medicine questions in NEET.',
    mistakes:['Confusing SV (per beat, ~70mL) with CO (per minute, ~5000mL)'],
    related:[], tags:['heart','physiology','cardiovascular'], class:'12' },

  { id:'photosynthesis_rate', subject:'Biology', topic:'Plant Physiology', name:'Factors in Photosynthesis',
    formula:'Rate ∝ Light intensity (until saturation)  |  CO₂ fixation: 6CO₂+6H₂O → C₆H₁₂O₆+6O₂',
    derivation:'Blackman\'s Law of Limiting Factors — slowest factor limits the rate.',
    usage:'Understand light compensation point, saturation point, CO₂ concentration effects.',
    mistakes:['Thinking more light always helps — above saturation it doesn\'t change rate'],
    related:[], tags:['photosynthesis','plant','limiting factor'], class:'11' },
];

const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology'] as const;
const SUBJECT_ICONS = { Mathematics: Calculator, Physics: Atom, Chemistry: FlaskConical, Biology: Microscope };
const SUBJECT_COLORS = { Mathematics: '#93C5FD', Physics: '#C4B5FD', Chemistry: '#6EE7B7', Biology: '#86EFAC' };
const STORAGE_KEY = 'edora_pinned_formulas';

function getPinned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')); }
  catch { return new Set(); }
}
function togglePin(id: string, pinned: Set<string>) {
  const next = new Set(pinned);
  if (next.has(id)) next.delete(id); else next.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  return next;
}

// ── Formula card ─────────────────────────────────────────────────────────────
function FormulaCard({ f, pinned, onPin }: { f: Formula; pinned: boolean; onPin: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [katexReady, setKatexReady] = useState(_katexLoaded);
  const latexRef = useRef<HTMLDivElement>(null);
  const SubIcon = SUBJECT_ICONS[f.subject];

  // Load KaTeX on demand when this card has a latex field
  useEffect(() => {
    if (!f.latex || _katexLoaded) return;
    loadKaTeX(() => setKatexReady(true));
  }, [f.latex]);

  // Render LaTeX into the ref container after KaTeX is ready
  useEffect(() => {
    if (!katexReady || !f.latex || !latexRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).katex.render(f.latex, latexRef.current, {
        throwOnError: false,
        displayMode: true,
        output: 'html' });
    } catch { /* fall back to ASCII text already shown */ }
  }, [katexReady, f.latex]);

  async function copyFormula() {
    await navigator.clipboard.writeText(f.formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--ink-060)', border: '1px solid var(--ink-070)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <SubIcon size={10} style={{ color: SUBJECT_COLORS[f.subject] }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: SUBJECT_COLORS[f.subject] }}>
                {f.subject}
              </span>
              <span className="text-xs text-white/30 font-medium">·</span>
              <span className="text-xs text-white/30 font-medium">{f.topic}</span>
              {f.class && (
                <>
                  <span className="text-xs text-white/30">·</span>
                  <span className="text-xs font-bold text-amber-400/70">{f.class}</span>
                </>
              )}
            </div>
            <p className="text-sm font-bold text-white leading-tight">{f.name}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={copyFormula} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: 'var(--ink-060)' }} aria-label="Copy formula">
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-white/40" />}
            </button>
            <button onClick={onPin} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: pinned ? 'rgba(234,179,8,0.15)' : 'var(--ink-060)' }} aria-label={pinned ? 'Unpin' : 'Pin formula'}>
              {pinned ? <Star size={13} className="text-yellow-400" /> : <StarOff size={13} className="text-white/40" />}
            </button>
          </div>
        </div>

        {/* Formula box — renders KaTeX when available, falls back to ASCII */}
        <div className="mt-3 px-4 py-3 rounded-xl text-white leading-relaxed overflow-x-auto"
          style={{ background: 'rgba(91,106,245,0.12)', border: '1px solid rgba(91,106,245,0.2)' }}>
          {f.latex ? (
            <div ref={latexRef} className={!katexReady ? 'font-mono text-sm whitespace-pre-wrap' : undefined}>
              {/* KaTeX renders into this div; fallback text shown until it loads */}
              {!katexReady && f.formula}
            </div>
          ) : (
            <div className="font-mono text-sm whitespace-pre-wrap">{f.formula}</div>
          )}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        className="w-full px-4 pb-3 flex items-center gap-1.5 text-xs text-white/40 font-medium active:opacity-70"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? 'Show less' : 'Derivation, usage, mistakes & mnemonic'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              {/* Derivation */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-1">Derivation</p>
                <p className="text-xs text-white/70 leading-relaxed">{f.derivation}</p>
              </div>

              {/* Usage */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-1">When to use</p>
                <p className="text-xs text-white/70 leading-relaxed">{f.usage}</p>
              </div>

              {/* Common mistakes */}
              {f.mistakes.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-1.5">Common mistakes</p>
                  <div className="space-y-1">
                    {f.mistakes.map((m, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle size={10} className="text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-300/80 leading-relaxed">{m}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mnemonic */}
              {f.mnemonic && (
                <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Lightbulb size={10} className="text-violet-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Mnemonic</p>
                  </div>
                  <p className="text-xs text-violet-200 leading-relaxed italic">{f.mnemonic}</p>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {f.tags.map(tag => (
                  <span key={tag} className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--ink-070)', color: 'var(--ink-400)' }}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FormulaSheetPage() {
  const [search, setSearch]     = useState('');
  const [subject, setSubject]   = useState<typeof SUBJECTS[number]>('All');
  const [pinned, setPinned]     = useState<Set<string>>(getPinned);
  const [showPinned, setShowPinned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = FORMULAS;
    if (showPinned) list = list.filter(f => pinned.has(f.id));
    if (subject !== 'All') list = list.filter(f => f.subject === subject);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.topic.toLowerCase().includes(q) ||
        f.formula.toLowerCase().includes(q) ||
        f.tags.some(t => t.includes(q)) ||
        f.subject.toLowerCase().includes(q)
      );
    }
    // Pinned first
    return [...list].sort((a, b) => (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0));
  }, [search, subject, pinned, showPinned]);

  function handlePin(id: string) {
    setPinned(prev => togglePin(id, prev));
    Toast.show({ text: pinned.has(id) ? 'Unpinned' : 'Pinned to top', duration: 'short' });
  }

  function printPDF() {
    window.print();
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-4">
          <Link to="/tools" className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--ink-080)' }}>
            <ChevronDown size={18} className="text-white rotate-90" />
          </Link>
          <h1 className="font-heading text-base font-bold text-white">Formula Sheet</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPinned(s => !s)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: showPinned ? 'rgba(234,179,8,0.2)' : 'var(--ink-080)' }}
              aria-label="Show pinned"
            >
              <Star size={15} style={{ color: showPinned ? '#EAB308' : 'var(--ink-500)' }} />
            </button>
            <button onClick={printPDF} className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--ink-080)' }} aria-label="Download PDF">
              <Download size={15} className="text-white/60" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search formulas, topics, tags…"
            className="w-full pl-9 pr-9 py-2.5 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
            style={{ background: 'var(--ink-070)', border: '1px solid var(--ink-090)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={14} className="text-white/40" />
            </button>
          )}
        </div>

        {/* Subject tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {SUBJECTS.map(s => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: subject === s ? (s === 'All' ? '#5B6AF5' : SUBJECT_COLORS[s as keyof typeof SUBJECT_COLORS] + '33') : 'var(--ink-070)',
                color: subject === s ? (s === 'All' ? 'white' : SUBJECT_COLORS[s as keyof typeof SUBJECT_COLORS]) : 'var(--ink-450)',
                border: subject === s && s !== 'All' ? `1px solid ${SUBJECT_COLORS[s as keyof typeof SUBJECT_COLORS]}44` : '1px solid transparent' }}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-xs text-white/30 mt-2">{filtered.length} formulas</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-fluid pb-nav space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BookMarked size={36} className="text-white/15" />
            <p className="text-sm text-white/40">{showPinned ? 'No pinned formulas yet' : 'No formulas match your search'}</p>
          </div>
        ) : (
          filtered.map(f => (
            <FormulaCard
              key={f.id}
              f={f}
              pinned={pinned.has(f.id)}
              onPin={() => handlePin(f.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
