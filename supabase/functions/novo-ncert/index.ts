// ─────────────────────────────────────────────────────────────────────────────
// novo-ncert — NCERT Knowledge Base (RAG)
//
// Actions:
//   search — semantic search over NCERT content for relevant chunks
//   seed   — (admin) seed NCERT content with embeddings into DB
//   status — count of indexed NCERT chunks
//
// Uses Gemini text-embedding-004 (768-dim) for both indexing and query.
// Requires secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Gemini embedding ──────────────────────────────────────────────────────────
async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: 'models/embedding-001', content: { parts: [{ text }] } }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.embedding?.values ?? [];
}

// ── NCERT seed content — JEE/NEET curriculum aligned ─────────────────────────
// Covers the most tested topics across Physics, Chemistry, Biology, Maths
// Each chunk is self-contained and factually accurate to NCERT textbooks
const NCERT_SEED: Array<{
  class_num: number; subject: string; chapter_num?: number;
  chapter_title: string; section_title?: string;
  content: string; content_type: string;
}> = [

  // ════════════════ PHYSICS CLASS 11 ════════════════
  {
    class_num: 11, subject: 'Physics', chapter_num: 5,
    chapter_title: "Laws of Motion", section_title: "Newton's First Law",
    content_type: 'law',
    content: "Newton's First Law of Motion (Law of Inertia): Every object continues to be in its state of rest or of uniform motion in a straight line unless compelled to change that state by an applied external force. Inertia is the resistance of any physical object to change in its state of motion or rest. Mass is a measure of inertia — a heavier body has greater inertia. Applications: a passenger lurching forward when a bus brakes (body tries to maintain forward motion), a coin on a cardboard placed on a glass falls into the glass when cardboard is pulled quickly.",
  },
  {
    class_num: 11, subject: 'Physics', chapter_num: 5,
    chapter_title: "Laws of Motion", section_title: "Newton's Second Law",
    content_type: 'law',
    content: "Newton's Second Law: The rate of change of momentum of a body is directly proportional to the applied force, and takes place in the direction in which the force acts. Mathematically: F = ma (Force = mass × acceleration). Momentum p = mv. F = dp/dt. For variable mass systems: F = m(dv/dt) + v(dm/dt). Impulse = Force × time = Change in momentum = FΔt = Δp. Unit of force: Newton (N) = kg⋅m/s². Applications: a cricket ball is hit with a bat (force changes momentum), rocket propulsion (variable mass system).",
  },
  {
    class_num: 11, subject: 'Physics', chapter_num: 5,
    chapter_title: "Laws of Motion", section_title: "Newton's Third Law and Friction",
    content_type: 'law',
    content: "Newton's Third Law: For every action there is an equal and opposite reaction. Forces always occur in pairs. If body A exerts force F on body B, then B exerts force -F on A. Note: action and reaction forces act on different bodies. Friction: Static friction (fs ≤ μsN) opposes impending motion. Kinetic friction (fk = μkN) opposes actual motion. Always μk < μs. Rolling friction < sliding friction < static friction limiting value. Laws of friction: frictional force is independent of area of contact and proportional to normal force.",
  },
  {
    class_num: 11, subject: 'Physics', chapter_num: 6,
    chapter_title: "Work, Energy and Power", section_title: "Work-Energy Theorem",
    content_type: 'law',
    content: "Work-Energy Theorem: The net work done on a body equals the change in its kinetic energy. Wnet = ΔKE = ½mv² − ½mu². Work W = F⋅s⋅cosθ (scalar product). Work is zero when force is perpendicular to displacement (e.g., centripetal force). Conservative forces: work done is path-independent; potential energy can be defined (gravity, spring). Non-conservative forces: work done is path-dependent (friction). Conservation of mechanical energy: KE + PE = constant (when only conservative forces act). Power P = W/t = F⋅v. Unit: Watt (W) = J/s.",
  },
  {
    class_num: 11, subject: 'Physics', chapter_num: 11,
    chapter_title: "Thermal Properties of Matter", section_title: "Thermodynamics Laws",
    content_type: 'law',
    content: "Zeroth Law of Thermodynamics: If two systems are each in thermal equilibrium with a third system, they are in thermal equilibrium with each other. First Law: ΔU = Q − W (change in internal energy = heat added − work done by system). For isothermal process: ΔT=0, ΔU=0, Q=W. For adiabatic: Q=0, ΔU=−W. For isochoric: W=0, ΔU=Q. Second Law: Heat cannot spontaneously flow from a cold body to a hot body. Efficiency of Carnot engine: η = 1 − T2/T1 (maximum possible efficiency between two temperatures). Entropy always increases in an isolated system (disorder increases).",
  },
  {
    class_num: 11, subject: 'Physics', chapter_num: 15,
    chapter_title: "Waves", section_title: "Wave Properties and Speed",
    content_type: 'paragraph',
    content: "A wave is a disturbance that transfers energy without transferring matter. Transverse waves: particles vibrate perpendicular to propagation (light, string waves). Longitudinal waves: particles vibrate parallel to propagation (sound). Wave speed v = fλ = λ/T. Speed of sound in a medium: v = √(B/ρ) where B is bulk modulus, ρ is density. In air at 0°C: v ≈ 331 m/s. Speed increases with temperature: v ∝ √T. Doppler effect: apparent change in frequency when source or observer moves. For approaching source: f' = f(v+v0)/(v−vs). Standing waves: formed by superposition of two waves; nodes are points of zero amplitude, antinodes are points of maximum amplitude.",
  },
  {
    class_num: 12, subject: 'Physics', chapter_num: 1,
    chapter_title: "Electric Charges and Fields", section_title: "Coulomb's Law and Electric Field",
    content_type: 'law',
    content: "Coulomb's Law: Force between two point charges F = kq1q2/r² where k = 1/(4πε0) = 9×10⁹ N⋅m²/C². Charge is quantized: q = ne where e = 1.6×10⁻¹⁹ C. Charge is conserved. Electric Field E = F/q0 = kq/r² (due to point charge). Superposition: total field = vector sum of individual fields. Electric field lines originate from positive charges, terminate at negative charges. They never cross. The number of field lines per unit area (flux) is proportional to field strength. Electric dipole moment p = q×2l. Field on axial line: E = 2kp/r³. Field on equatorial line: E = kp/r³.",
  },
  {
    class_num: 12, subject: 'Physics', chapter_num: 2,
    chapter_title: "Electrostatic Potential and Capacitance", section_title: "Potential and Capacitors",
    content_type: 'paragraph',
    content: "Electric potential V = kq/r (due to point charge). Potential difference VAB = Work done per unit charge to move from B to A. Relation: E = −dV/dr (field = negative gradient of potential). Equipotential surfaces: surfaces where V is constant; field is perpendicular to them. Capacitance C = Q/V. Parallel plate capacitor: C = ε0A/d. With dielectric: C = Kε0A/d where K is dielectric constant. Series: 1/C = 1/C1 + 1/C2 + ... Parallel: C = C1 + C2 + ... Energy stored: U = ½CV² = Q²/2C = QV/2. Capacitors in parallel have same voltage; in series have same charge.",
  },
  {
    class_num: 12, subject: 'Physics', chapter_num: 12,
    chapter_title: "Atoms", section_title: "Bohr Model and Atomic Spectra",
    content_type: 'paragraph',
    content: "Bohr's Model of Hydrogen Atom: Electrons revolve in fixed circular orbits (stationary states). Angular momentum is quantized: mvr = nh/2π. Energy of nth orbit: En = −13.6/n² eV. Radius of nth orbit: rn = n²a0 where a0 = 0.529 Å (Bohr radius). When electron transitions from higher (n2) to lower (n1) energy level, photon emitted: hν = En2 − En1. Series: Lyman (UV, n1=1), Balmer (visible, n1=2), Paschen (IR, n1=3), Brackett (IR, n1=4), Pfund (IR, n1=5). de Broglie wavelength: λ = h/mv. Heisenberg uncertainty: Δx⋅Δp ≥ h/4π.",
  },
  {
    class_num: 12, subject: 'Physics', chapter_num: 11,
    chapter_title: "Dual Nature of Radiation", section_title: "Photoelectric Effect",
    content_type: 'law',
    content: "Photoelectric Effect (Einstein, 1905): Light behaves as particles (photons) each with energy E = hν. Work function φ: minimum energy to eject an electron. If hν > φ, photoelectric effect occurs. Threshold frequency ν0 = φ/h. Maximum KE of emitted electron: KE_max = hν − φ = eV_stop. Stopping potential V_stop = (hν − φ)/e. Key observations: KE_max depends on frequency (not intensity) of light. Number of electrons emitted depends on intensity. Effect is instantaneous. These observations cannot be explained by wave theory of light — only by particle (quantum) theory. Einstein received Nobel Prize for this explanation.",
  },

  // ════════════════ CHEMISTRY CLASS 11 ════════════════
  {
    class_num: 11, subject: 'Chemistry', chapter_num: 2,
    chapter_title: "Structure of Atom", section_title: "Quantum Numbers and Electronic Configuration",
    content_type: 'paragraph',
    content: "Quantum numbers describe the state of an electron in an atom. Principal quantum number n (1,2,3...): energy level and size of orbital. Azimuthal quantum number l (0 to n-1): shape of orbital (l=0 s, l=1 p, l=2 d, l=3 f). Magnetic quantum number ml (-l to +l): orientation in space. Spin quantum number ms (+½ or −½). Aufbau principle: electrons fill lowest energy orbitals first (1s < 2s < 2p < 3s < 3p < 4s < 3d ...). Pauli's exclusion: no two electrons in an atom can have identical set of four quantum numbers. Hund's rule: electrons are distributed among orbitals of equal energy with maximum number of unpaired electrons (all with same spin first).",
  },
  {
    class_num: 11, subject: 'Chemistry', chapter_num: 3,
    chapter_title: "Classification of Elements — Periodic Table", section_title: "Periodic Trends",
    content_type: 'paragraph',
    content: "Periodic Law: Properties of elements are a periodic function of their atomic numbers. Periodic trends: Atomic radius decreases across a period (increasing nuclear charge pulls electrons closer) and increases down a group (new shells added). Ionisation enthalpy increases across a period and decreases down a group. Exception: IE of O < N (O's paired electrons repel, N has half-filled stable configuration). Electron gain enthalpy: generally increases across a period. Electronegativity increases across period, decreases down group. Metallic character: decreases across period, increases down group. Ionic radius of cation < parent atom; anion > parent atom. Isoelectronic species: same number of electrons (O²⁻, F⁻, Ne, Na⁺, Mg²⁺).",
  },
  {
    class_num: 11, subject: 'Chemistry', chapter_num: 4,
    chapter_title: "Chemical Bonding and Molecular Structure", section_title: "VSEPR and Hybridisation",
    content_type: 'paragraph',
    content: "VSEPR Theory: electron pairs arrange themselves to minimise repulsion. Shapes: 2 bond pairs → linear (CO2, BeCl2). 3 bp → trigonal planar (BF3, 120°). 4 bp → tetrahedral (CH4, 109.5°). 3bp+1lp → pyramidal (NH3, 107°). 2bp+2lp → bent (H2O, 104.5°). Lone pair–lone pair repulsion > lone pair–bond pair > bond pair–bond pair. Hybridisation: sp → linear (180°), sp2 → trigonal planar (120°), sp3 → tetrahedral (109.5°), sp3d → trigonal bipyramidal, sp3d2 → octahedral. Bond order: O2=2, N2=3, F2=1, NO=2.5, CO=3. Bond order ↑ → bond length ↓, bond energy ↑.",
  },
  {
    class_num: 11, subject: 'Chemistry', chapter_num: 6,
    chapter_title: "Thermodynamics", section_title: "Enthalpy and Hess's Law",
    content_type: 'paragraph',
    content: "Enthalpy H = U + PV. For reactions at constant pressure: ΔH = ΔU + ΔngRT where Δng = moles of gaseous products − moles of gaseous reactants. Hess's Law: enthalpy change of a reaction is independent of path (can add thermochemical equations). Standard enthalpy of formation ΔHf°: enthalpy change when 1 mole of compound is formed from elements in standard state. ΔHrxn = Σ ΔHf°(products) − Σ ΔHf°(reactants). Bond enthalpy: energy required to break 1 mole of bonds. ΔHrxn = Σ (bond energies broken) − Σ (bond energies formed). Exothermic: ΔH < 0. Endothermic: ΔH > 0. Spontaneity: ΔG = ΔH − TΔS < 0 for spontaneous process.",
  },
  {
    class_num: 11, subject: 'Chemistry', chapter_num: 7,
    chapter_title: "Equilibrium", section_title: "Le Chatelier's Principle and Kp, Kc",
    content_type: 'law',
    content: "Chemical equilibrium: rate of forward reaction = rate of backward reaction. Equilibrium constant Kc = [products]^coefficients / [reactants]^coefficients. Kp = Kc(RT)^Δng. Le Chatelier's Principle: if a system at equilibrium is disturbed, it shifts in the direction that reduces the disturbance. Increasing concentration of reactants → shifts right. Increasing pressure → shifts towards fewer moles of gas. Increasing temperature → shifts in endothermic direction. Adding catalyst: does NOT shift equilibrium, only speeds up reaching equilibrium. Reaction quotient Q: if Q < Kc, reaction proceeds forward; if Q > Kc, backward; Q = Kc at equilibrium.",
  },
  {
    class_num: 12, subject: 'Chemistry', chapter_num: 3,
    chapter_title: "Electrochemistry", section_title: "Nernst Equation and Electrolysis",
    content_type: 'paragraph',
    content: "Nernst Equation: E_cell = E°_cell − (RT/nF)ln Q = E°_cell − (0.0592/n)log Q at 25°C. At equilibrium: E°_cell = (0.0592/n)log Kc. ΔG° = −nFE°_cell = −RT ln Kc. Electrolysis — Faraday's Laws: First law: mass deposited ∝ charge passed (m = ZIt where Z = M/nF). Second law: for same charge, masses of different substances deposited are in ratio of their equivalent weights (M/n). Standard hydrogen electrode (SHE): E° = 0.00 V. EMF = E_cathode − E_anode. Galvanic cell converts chemical energy to electrical energy. Electrolytic cell converts electrical energy to chemical energy. Specific conductance κ = 1/ρ. Molar conductance Λm = κ×1000/M.",
  },
  {
    class_num: 12, subject: 'Chemistry', chapter_num: 12,
    chapter_title: "Aldehydes, Ketones and Carboxylic Acids", section_title: "Nucleophilic Addition and Reactions",
    content_type: 'paragraph',
    content: "Aldehydes (R-CHO) and Ketones (R-CO-R') contain carbonyl group (C=O). Nucleophilic addition: Nu⁻ attacks electrophilic carbon of C=O. Aldehydes are more reactive than ketones (less steric hindrance, more electrophilic carbon). Reactions of aldehydes & ketones: HCN addition → cyanohydrin. NaBH4/LiAlH4 → alcohol. Grignard reagent. Aldol condensation (in presence of dilute NaOH). Cannizzaro reaction (no alpha-H, conc. NaOH). Tollens test (silver mirror) — aldehydes only. Fehling's test — aldehydes only (formic acid too). Carboxylic acids: acidic (pKa ~4-5), form H-bonds. Reactions: acid + base → salt, esterification (with alcohol + H2SO4), decarboxylation, Hell-Volhard-Zelinsky reaction.",
  },

  // ════════════════ BIOLOGY CLASS 11-12 (NEET) ════════════════
  {
    class_num: 11, subject: 'Biology', chapter_num: 13,
    chapter_title: "Photosynthesis in Higher Plants", section_title: "Light Reactions and Calvin Cycle",
    content_type: 'paragraph',
    content: "Photosynthesis: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2. Occurs in chloroplasts. Light reactions (thylakoid membranes): Photosystem I (P700) and Photosystem II (P680). PS II absorbs light → water splits (photolysis): 2H2O → 4H⁺ + 4e⁻ + O2. Electrons travel: PS II → plastoquinone → cytochrome b6f → plastocyanin → PS I → ferredoxin → NADP⁺ → NADPH. ATP synthesised via photophosphorylation. Cyclic photophosphorylation: only PS I involved, only ATP produced, no NADPH, no O2. Calvin cycle (dark reactions, stroma): CO2 fixation by RuBisCO onto RuBP (5C) → 2 molecules of 3-PGA (3C). G3P formed using ATP and NADPH. 3 turns of cycle fix 3CO2 → 1G3P used for glucose. C4 plants (maize, sugarcane): CO2 fixed first as 4C compound (OAA) in mesophyll → transported to bundle sheath. CAM plants: stomata open at night.",
  },
  {
    class_num: 11, subject: 'Biology', chapter_num: 8,
    chapter_title: "Cell: The Unit of Life", section_title: "Cell Organelles and their Functions",
    content_type: 'paragraph',
    content: "Prokaryotic cells: no membrane-bound nucleus, no membrane-bound organelles. Eukaryotic cells: have true nucleus and membrane-bound organelles. Nucleus: contains DNA, surrounded by nuclear envelope with pores. Nucleolus: site of rRNA synthesis. Ribosomes: site of protein synthesis; 70S (prokaryotes), 80S (eukaryotes). Mitochondria: powerhouse; inner membrane has cristae; matrix has enzymes for Krebs cycle; own DNA (semi-autonomous). Chloroplast: photosynthesis; has thylakoids and stroma; own DNA. Endoplasmic reticulum: RER (with ribosomes, protein synthesis), SER (lipid synthesis, detoxification). Golgi apparatus: modification, packaging, secretion. Lysosome: digestive enzymes (hydrolases), autophagy. Centrosome/centrioles: cell division. Vacuoles: large in plant cells (tonoplast membrane), maintain turgor pressure.",
  },
  {
    class_num: 12, subject: 'Biology', chapter_num: 5,
    chapter_title: "Principles of Inheritance and Variation", section_title: "Mendel's Laws and Exceptions",
    content_type: 'law',
    content: "Mendel's First Law (Law of Segregation): Alleles of a gene separate during gamete formation; each gamete gets only one allele. Monohybrid cross Tt × Tt → 1TT:2Tt:1tt (genotypic 1:2:1), phenotypic 3:1. Mendel's Second Law (Law of Independent Assortment): Genes on different chromosomes assort independently. Dihybrid cross: 9:3:3:1 ratio. Exceptions: Incomplete dominance (e.g., snapdragon flower: RR=red, Rr=pink, rr=white, 1:2:1 both). Codominance: both alleles expressed (ABO blood groups: IA IA=A, IB IB=B, IA IB=AB, ii=O). Multiple allelism: ABO blood groups (IA, IB, i). Linkage: genes on same chromosome tend to be inherited together (reduced recombination). Chromosomal theory of inheritance: genes are located on chromosomes (Morgan).",
  },
  {
    class_num: 12, subject: 'Biology', chapter_num: 6,
    chapter_title: "Molecular Basis of Inheritance", section_title: "DNA Replication and Transcription",
    content_type: 'paragraph',
    content: "DNA double helix: two antiparallel strands held by H-bonds between complementary bases (A=T, G≡C). Replication is semiconservative (proven by Meselson-Stahl experiment). Enzymes: Helicase (unwinds), Primase (RNA primer), DNA Polymerase III (replication, 5'→3' only), DNA Polymerase I (removes primer), DNA Ligase (joins Okazaki fragments). Leading strand (continuous) vs lagging strand (discontinuous, Okazaki fragments). Transcription: DNA → mRNA by RNA Polymerase. Template strand read 3'→5', mRNA synthesised 5'→3'. Promoter, structural gene, terminator. In eukaryotes: pre-mRNA processed — 5' capping, 3' poly-A tail, splicing (introns removed, exons joined). Translation: mRNA → protein. Ribosome, tRNA (anticodon), codons. AUG = start (methionine). UAA, UAG, UGA = stop codons. Genetic code: triplet, non-overlapping, degenerate, universal.",
  },

  // ════════════════ MATHEMATICS CLASS 11-12 (JEE) ════════════════
  {
    class_num: 11, subject: 'Mathematics', chapter_num: 3,
    chapter_title: "Trigonometric Functions", section_title: "Identities and Values",
    content_type: 'formula',
    content: "Key trigonometric identities: sin²θ + cos²θ = 1. 1 + tan²θ = sec²θ. 1 + cot²θ = cosec²θ. Addition formulas: sin(A±B) = sinA⋅cosB ± cosA⋅sinB. cos(A±B) = cosA⋅cosB ∓ sinA⋅sinB. tan(A+B) = (tanA+tanB)/(1−tanA⋅tanB). Double angle: sin2A = 2sinA⋅cosA. cos2A = cos²A − sin²A = 1−2sin²A = 2cos²A−1. tan2A = 2tanA/(1−tan²A). Product to sum: 2sinA⋅cosB = sin(A+B)+sin(A−B). Standard values: sin30°=½, sin45°=1/√2, sin60°=√3/2, cos0°=1, cos90°=0, tan45°=1, tan60°=√3. Principal values: sin⁻¹(½)=π/6, cos⁻¹(0)=π/2, tan⁻¹(1)=π/4.",
  },
  {
    class_num: 12, subject: 'Mathematics', chapter_num: 5,
    chapter_title: "Continuity and Differentiability", section_title: "Differentiation Rules",
    content_type: 'formula',
    content: "Differentiation standard results: d/dx(xⁿ) = nxⁿ⁻¹. d/dx(eˣ) = eˣ. d/dx(aˣ) = aˣ⋅lna. d/dx(ln x) = 1/x. d/dx(sinx) = cosx. d/dx(cosx) = −sinx. d/dx(tanx) = sec²x. d/dx(cotx) = −cosec²x. d/dx(secx) = secx⋅tanx. d/dx(cosecx) = −cosecx⋅cotx. d/dx(sin⁻¹x) = 1/√(1−x²). d/dx(cos⁻¹x) = −1/√(1−x²). d/dx(tan⁻¹x) = 1/(1+x²). Chain rule: d/dx[f(g(x))] = f'(g(x))⋅g'(x). Product rule: d/dx(uv) = u'v + uv'. Quotient rule: d/dx(u/v) = (u'v − uv')/v². Logarithmic differentiation: used when function is of form [f(x)]^g(x).",
  },
  {
    class_num: 12, subject: 'Mathematics', chapter_num: 7,
    chapter_title: "Integrals", section_title: "Standard Integration Results",
    content_type: 'formula',
    content: "Standard integrals: ∫xⁿdx = xⁿ⁺¹/(n+1)+C (n≠-1). ∫(1/x)dx = ln|x|+C. ∫eˣdx = eˣ+C. ∫aˣdx = aˣ/lna+C. ∫sinx dx = −cosx+C. ∫cosx dx = sinx+C. ∫sec²x dx = tanx+C. ∫cosec²x dx = −cotx+C. ∫secx⋅tanx dx = secx+C. ∫1/√(1−x²)dx = sin⁻¹x+C. ∫1/(1+x²)dx = tan⁻¹x+C. ∫1/√(x²−a²)dx = ln|x+√(x²−a²)|+C. Integration by parts: ∫u⋅v dx = u∫v dx − ∫(u'∫v dx)dx. ILATE rule for choosing u: Inverse trig, Logarithm, Algebraic, Trigonometric, Exponential. Definite integral ∫ₐᵇf(x)dx = F(b)−F(a). Properties: ∫ₐᵃf(x)dx=0, ∫ₐᵇf(x)dx = −∫ᵇₐf(x)dx.",
  },
  {
    class_num: 12, subject: 'Mathematics', chapter_num: 10,
    chapter_title: "Vector Algebra", section_title: "Dot and Cross Products",
    content_type: 'formula',
    content: "Vectors: magnitude and direction. Unit vector â = a/|a|. Position vector of point P(x,y,z): r = xî+yĵ+zk̂. Dot (scalar) product: a⋅b = |a||b|cosθ = a1b1+a2b2+a3b3. If a⊥b, a⋅b=0. Self dot product: a⋅a = |a|². Projection of a on b = (a⋅b)/|b|. Cross (vector) product: a×b = |a||b|sinθ n̂. |a×b| = area of parallelogram with sides a,b. If a∥b, a×b=0. î×ĵ=k̂, ĵ×k̂=î, k̂×î=ĵ (cyclic). a×b = |î  ĵ  k̂; a1 a2 a3; b1 b2 b3| (determinant). Triple scalar product [a b c] = a⋅(b×c) = volume of parallelepiped. Section formula: midpoint M = (a+b)/2. If point P divides AB in ratio m:n internally: P = (mb+na)/(m+n).",
  },
  {
    class_num: 12, subject: 'Mathematics', chapter_num: 13,
    chapter_title: "Probability", section_title: "Bayes Theorem and Distributions",
    content_type: 'paragraph',
    content: "Conditional probability: P(A|B) = P(A∩B)/P(B). Multiplication theorem: P(A∩B) = P(A)⋅P(B|A). Independent events: P(A∩B) = P(A)⋅P(B). Bayes Theorem: P(Ai|B) = P(Ai)⋅P(B|Ai) / Σ P(Aj)⋅P(B|Aj). Total probability theorem: P(B) = Σ P(Ai)⋅P(B|Ai). Binomial distribution: P(X=r) = ⁿCr⋅pʳ⋅qⁿ⁻ʳ where q=1−p. Mean = np, variance = npq. Bernoulli trial: exactly two outcomes (success/failure). Expectation E(X) = Σ xi⋅P(xi). Variance = E(X²) − [E(X)]² = Σ xi²P(xi) − μ². Standard deviation = √variance. For equally likely outcomes: P(E) = n(E)/n(S).",
  },
  {
    class_num: 11, subject: 'Mathematics', chapter_num: 9,
    chapter_title: "Sequences and Series", section_title: "AP, GP and Special Series",
    content_type: 'formula',
    content: "Arithmetic Progression (AP): a, a+d, a+2d... nth term: an = a+(n-1)d. Sum of n terms: Sn = n/2[2a+(n-1)d] = n/2[a+l]. Arithmetic mean A = (a+b)/2. Geometric Progression (GP): a, ar, ar²... nth term: an = arⁿ⁻¹. Sum of n terms: Sn = a(rⁿ−1)/(r−1) for r≠1. Sum to infinity: S∞ = a/(1−r) for |r|<1. Geometric mean G = √(ab). Harmonic mean H = 2ab/(a+b). Relation: AM ≥ GM ≥ HM. G² = AH. Special series: Σn = n(n+1)/2. Σn² = n(n+1)(2n+1)/6. Σn³ = [n(n+1)/2]². Σ1 = n.",
  },
];

serve(withSentry('novo-ncert', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Use GEMINI_API_KEY for embeddings; fall back to GOOGLE_CLOUD_API_KEY if it has embedding access
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_CLOUD_API_KEY') ?? '';
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── status ────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const { count } = await supabase
      .from('ncert_content').select('id', { count: 'exact', head: true });
    return json({ total_chunks: count ?? 0, seed_size: NCERT_SEED.length });
  }

  // ── search ────────────────────────────────────────────────────────────────
  if (action === 'search') {
    const { query, subject, class_num, count: limit = 4 } = body;
    if (!query) return json({ error: 'query required' }, 400);

    const filterClass   = class_num ?? null;
    const filterSubject = subject   ?? null;

    // ── Attempt vector search first (when embeddings are available) ──────────
    let vectorResults: unknown[] = [];
    try {
      const embedding = await embed(query, geminiKey);
      const { data } = await supabase.rpc('search_ncert', {
        query_embedding: embedding,
        filter_class:    filterClass,
        filter_subject:  filterSubject,
        result_count:    Math.min(limit, 6),
      });
      vectorResults = ((data ?? []) as { similarity: number }[]).filter(c => c.similarity > 0.50);
    } catch {
      // Embedding API not available — use full-text search below
    }

    if (vectorResults.length > 0) {
      return json({ results: vectorResults, mode: 'vector' });
    }

    // ── Primary: PostgreSQL full-text search via GIN-indexed tsvector ─────────
    const { data: ftsData, error: ftsError } = await supabase.rpc('search_ncert_fts', {
      query_text:     query,
      filter_class:   filterClass,
      filter_subject: filterSubject,
      result_count:   Math.min(limit, 6),
    });

    if (!ftsError && ftsData && ftsData.length > 0) {
      return json({ results: ftsData, mode: 'fts' });
    }

    return json({ results: [], mode: 'none' });
  }

  // ── seed ──────────────────────────────────────────────────────────────────
  // Inserts NCERT seed content. Tries to add embeddings via Gemini API;
  // inserts without embeddings if embedding API unavailable (FTS still works).
  // Safe to run multiple times.
  if (action === 'seed') {
    const { count } = await supabase
      .from('ncert_content').select('id', { count: 'exact', head: true });

    if ((count ?? 0) >= NCERT_SEED.length) {
      return json({ message: 'Already seeded', total: count });
    }

    // Get existing chapter titles to avoid duplicates
    const { data: existing } = await supabase
      .from('ncert_content').select('chapter_title, section_title');
    const existingKeys = new Set(
      (existing ?? []).map((e: { chapter_title: string; section_title: string }) =>
        `${e.chapter_title}::${e.section_title ?? ''}`
      )
    );

    const toInsert = NCERT_SEED.filter(
      c => !existingKeys.has(`${c.chapter_title}::${c.section_title ?? ''}`)
    );

    let inserted = 0;
    let embeddedCount = 0;
    const errors: string[] = [];

    // Process in batches of 5
    for (let i = 0; i < toInsert.length; i += 5) {
      const batch = toInsert.slice(i, i + 5);
      const withEmbeddings = await Promise.all(
        batch.map(async (chunk) => {
          try {
            const embText = `${chunk.subject} ${chunk.chapter_title} ${chunk.section_title ?? ''} ${chunk.content}`;
            const embVec = await embed(embText, geminiKey);
            embeddedCount++;
            return { ...chunk, embedding: `[${embVec.join(',')}]` };
          } catch {
            // Insert without embedding — FTS will still find it
            return { ...chunk };
          }
        })
      );

      const valid = withEmbeddings.filter(Boolean);
      if (valid.length > 0) {
        const { error } = await supabase.from('ncert_content').insert(valid);
        if (error) errors.push(error.message);
        else inserted += valid.length;
      }

      // Small delay between batches to respect rate limits
      if (i + 5 < toInsert.length) await new Promise(r => setTimeout(r, 300));
    }

    return json({
      message: `Seeded ${inserted} chunks (${embeddedCount} with vector embeddings, ${inserted - embeddedCount} text-only)`,
      inserted,
      embedded: embeddedCount,
      errors: errors.slice(0, 3),
      total: (count ?? 0) + inserted,
    });
  }

  return json({ error: 'Unknown action. Use: search | seed | status' }, 400);
}));
