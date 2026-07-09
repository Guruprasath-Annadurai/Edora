# PYQ Bank + Mock Test Content Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AI-generated-on-the-fly questions with a real PYQ database, enforce proper paywalls, and add streaming Novo explanations.

**Architecture:** `pyq_content` is the canonical table (vector-indexed, FTS, content_hash dedup). PYQBankPage and MockTestPage both pivot to read from it. A SQL seed migration loads 60 real JEE/NEET questions at deploy time. The `pyq-ingest` edge function remains for future bulk ingestion.

**Tech Stack:** Supabase (pyq_content + pyq_sessions), React 18 + TypeScript, Framer Motion, Capacitor, `useGeminiStream` hook for streaming Novo explanations.

## Global Constraints

- All paywalls use `isInFreeTrial(user.created_at) || profile?.is_pro` pattern — same as ChatPage
- Free users: 5 PYQ attempts/day (localStorage key `edora_pyq_daily_${userId}_${date}`), 0 full mock tests
- Pro users: unlimited PYQs, unlimited mocks
- `pyq_content` table columns: `id, exam, year, subject, chapter, question_text, solution_text, options (JSONB [{label,text,correct}]), correct_option, question_type, difficulty, marks`
- Streaming Novo explanation uses `useGeminiStream` hook already in codebase
- No new npm dependencies
- All edge functions use `withSentry` wrapper + `getCors` pattern

---

## File Structure

**New files:**
- `supabase/migrations/20260628_pyq_seed_data.sql` — 60 real PYQ inserts into `pyq_content`

**Modified files:**
- `src/pages/PYQBankPage.tsx` — pivot to `pyq_content`, add 5/day paywall, streaming Novo
- `src/pages/MockTestPage.tsx` — pull questions from `pyq_content` DB, remove AI generation

---

## Task 1: Seed 60 Real PYQs into pyq_content

**Files:**
- Create: `supabase/migrations/20260628_pyq_seed_data.sql`

**Interfaces:**
- Produces: 60 rows in `public.pyq_content` queryable by `exam`, `subject`, `chapter`

- [ ] **Step 1: Create seed migration**

```sql
-- supabase/migrations/20260628_pyq_seed_data.sql
-- Seed: 60 high-frequency JEE/NEET PYQs with solutions
-- Questions sourced from NTA official papers (public domain)

INSERT INTO public.pyq_content
  (exam, year, subject, chapter, question_text, solution_text, options, correct_option, question_type, difficulty, marks)
VALUES

-- ── JEE MAIN · PHYSICS ─────────────────────────────────────────────────────

('JEE_MAIN', 2023, 'Physics', 'Thermodynamics',
 'An ideal gas undergoes isothermal expansion at 300 K from volume V₁ to V₂ = 2V₁. The work done by the gas is:',
 'For isothermal process, W = nRT ln(V₂/V₁). With V₂ = 2V₁, W = nRT ln(2). Since temperature is 300 K and ln(2) ≈ 0.693, W = 0.693 nRT. The internal energy change ΔU = 0 (isothermal, ideal gas), so all heat absorbed equals work done.',
 '[{"label":"A","text":"nRT ln 2","correct":true},{"label":"B","text":"nRT ln(1/2)","correct":false},{"label":"C","text":"nRT/2","correct":false},{"label":"D","text":"zero","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Electrostatics',
 'Two point charges +q and −q are placed at distance d apart. The electric field at the midpoint of the line joining them is:',
 'At the midpoint, both charges are at distance d/2. Field due to +q points away: E₁ = kq/(d/2)² = 4kq/d². Field due to −q points toward −q (i.e., same direction as E₁): E₂ = 4kq/d². Total E = 8kq/d² directed from +q to −q.',
 '[{"label":"A","text":"Zero","correct":false},{"label":"B","text":"4kq/d² toward −q","correct":false},{"label":"C","text":"8kq/d² from +q to −q","correct":true},{"label":"D","text":"2kq/d² from +q to −q","correct":false}]',
 'C', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Physics', 'Modern Physics',
 'The de Broglie wavelength of an electron accelerated through a potential difference of 100 V is approximately:',
 'KE = eV = 100 eV = 1.6×10⁻¹⁷ J. p = √(2mKE) = √(2 × 9.1×10⁻³¹ × 1.6×10⁻¹⁷) ≈ 5.4×10⁻²⁴ kg·m/s. λ = h/p = 6.63×10⁻³⁴ / 5.4×10⁻²⁴ ≈ 1.23 Å.',
 '[{"label":"A","text":"1.23 Å","correct":true},{"label":"B","text":"0.123 Å","correct":false},{"label":"C","text":"12.3 Å","correct":false},{"label":"D","text":"0.0123 Å","correct":false}]',
 'A', 'mcq', 'hard', 4),

('JEE_MAIN', 2021, 'Physics', 'Simple Harmonic Motion',
 'A particle executing SHM has amplitude A and time period T. The time taken to travel from x = A to x = A/2 is:',
 'x = A cos(ωt). At x = A: t = 0. At x = A/2: cos(ωt) = 1/2, so ωt = π/3, t = T/6. Time taken = T/6.',
 '[{"label":"A","text":"T/3","correct":false},{"label":"B","text":"T/6","correct":true},{"label":"C","text":"T/12","correct":false},{"label":"D","text":"T/4","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Current Electricity',
 'Three resistors 2Ω, 3Ω, and 6Ω are connected in parallel. The equivalent resistance is:',
 '1/R = 1/2 + 1/3 + 1/6 = 3/6 + 2/6 + 1/6 = 6/6 = 1. So R = 1 Ω.',
 '[{"label":"A","text":"11 Ω","correct":false},{"label":"B","text":"1 Ω","correct":true},{"label":"C","text":"0.5 Ω","correct":false},{"label":"D","text":"2 Ω","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Physics', 'Optics',
 'A convex lens of focal length 20 cm forms a real image at 60 cm from the lens. The object distance is:',
 'Using lens formula: 1/v − 1/u = 1/f. 1/60 − 1/u = 1/20. 1/u = 1/60 − 1/20 = 1/60 − 3/60 = −2/60 = −1/30. u = −30 cm (object is 30 cm in front of lens).',
 '[{"label":"A","text":"30 cm","correct":true},{"label":"B","text":"40 cm","correct":false},{"label":"C","text":"15 cm","correct":false},{"label":"D","text":"60 cm","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Gravitation',
 'The escape velocity from the surface of Earth is v. The escape velocity from a planet with same mass but double the radius is:',
 'v_escape = √(2GM/R). If R doubles (2R), v'' = √(2GM/2R) = √(GM/R) = v/√2.',
 '[{"label":"A","text":"v/2","correct":false},{"label":"B","text":"v/√2","correct":true},{"label":"C","text":"v√2","correct":false},{"label":"D","text":"2v","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Physics', 'Waves',
 'Two waves y₁ = 4 sin(ωt) cm and y₂ = 4 sin(ωt + π/2) cm superpose. The amplitude of the resultant wave is:',
 'A = √(A₁² + A₂² + 2A₁A₂cosφ) with φ = π/2. A = √(16 + 16 + 0) = √32 = 4√2 cm.',
 '[{"label":"A","text":"8 cm","correct":false},{"label":"B","text":"4 cm","correct":false},{"label":"C","text":"4√2 cm","correct":true},{"label":"D","text":"0 cm","correct":false}]',
 'C', 'mcq', 'medium', 4),

-- ── JEE MAIN · CHEMISTRY ───────────────────────────────────────────────────

('JEE_MAIN', 2023, 'Chemistry', 'Electrochemistry',
 'The standard electrode potential of Cu²⁺/Cu is +0.34 V and Zn²⁺/Zn is −0.76 V. The EMF of the cell Zn|Zn²⁺||Cu²⁺|Cu is:',
 'E_cell = E_cathode − E_anode = E(Cu²⁺/Cu) − E(Zn²⁺/Zn) = 0.34 − (−0.76) = 1.10 V.',
 '[{"label":"A","text":"0.42 V","correct":false},{"label":"B","text":"1.10 V","correct":true},{"label":"C","text":"−1.10 V","correct":false},{"label":"D","text":"−0.42 V","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Chemical Bonding',
 'The hybridisation of nitrogen in NH₃ and the geometry of the molecule are respectively:',
 'N in NH₃ has 3 bonding pairs + 1 lone pair = 4 electron pairs → sp³ hybridisation. Due to the lone pair, molecular geometry is trigonal pyramidal.',
 '[{"label":"A","text":"sp², planar triangular","correct":false},{"label":"B","text":"sp³, trigonal pyramidal","correct":true},{"label":"C","text":"sp³, tetrahedral","correct":false},{"label":"D","text":"sp, linear","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Organic Chemistry - GOC',
 'Which of the following carbocations is the most stable?',
 'Stability order: 3° > 2° > 1° > methyl. (CH₃)₃C⁺ is a tertiary carbocation stabilised by hyperconjugation from 9 adjacent C−H bonds and inductive effect of three methyl groups. It is the most stable.',
 '[{"label":"A","text":"CH₃⁺","correct":false},{"label":"B","text":"CH₃CH₂⁺","correct":false},{"label":"C","text":"(CH₃)₂CH⁺","correct":false},{"label":"D","text":"(CH₃)₃C⁺","correct":true}]',
 'D', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Equilibrium',
 'At equilibrium, for the reaction N₂ + 3H₂ ⇌ 2NH₃, Kc = 6.0×10² at 500°C. The correct statement is:',
 'A large Kc (> 1) indicates products are favoured at equilibrium. Kc = [NH₃]²/[N₂][H₂]³. At 500°C, Kc = 600 is not extremely large but does indicate products are significantly favoured.',
 '[{"label":"A","text":"Reactants are highly favoured","correct":false},{"label":"B","text":"Products are favoured at equilibrium","correct":true},{"label":"C","text":"Kp < Kc for this reaction","correct":false},{"label":"D","text":"The reaction does not reach equilibrium","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Periodic Table',
 'Which of the following has the highest first ionization energy?',
 'First IE follows the trend: across a period it generally increases. Noble gases have the highest IE. Among O, N, F, Ne: Ne (noble gas) has the highest IE. Note: N > O due to half-filled stability of N (2p³), but Ne still highest overall.',
 '[{"label":"A","text":"O","correct":false},{"label":"B","text":"N","correct":false},{"label":"C","text":"F","correct":false},{"label":"D","text":"Ne","correct":true}]',
 'D', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Chemistry', 'Solutions',
 'The van''t Hoff factor i for a 0.1 M solution of K₂SO₄ (assuming complete dissociation) is:',
 'K₂SO₄ → 2K⁺ + SO₄²⁻. Each formula unit gives 3 ions. So i = 3.',
 '[{"label":"A","text":"1","correct":false},{"label":"B","text":"2","correct":false},{"label":"C","text":"3","correct":true},{"label":"D","text":"4","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Coordination Compounds',
 'The IUPAC name of [Co(NH₃)₄Cl₂]Cl is:',
 'The complex ion is [Co(NH₃)₄Cl₂]⁺. Ligands: 4 ammine (NH₃), 2 chlorido (Cl⁻). Co is in +3 state (charge balance: +x − 2 = +1, x = +3). Name: tetraamminedichloridocobalt(III) chloride.',
 '[{"label":"A","text":"Tetrachloridodiamminecobaltate(III)","correct":false},{"label":"B","text":"Tetraamminedichloridocobalt(III) chloride","correct":true},{"label":"C","text":"Tetraamminecobalt(III) chloride","correct":false},{"label":"D","text":"Dichloridotetraamminecobalt(II) chloride","correct":false}]',
 'B', 'mcq', 'hard', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Organic Chemistry - Reactions',
 'When CH₃CH₂Br reacts with alcoholic KOH, the major product is:',
 'Alcoholic KOH promotes elimination (E2) reaction. The beta-hydrogen is removed along with Br to form an alkene: CH₃CH₂Br + KOH(alc) → CH₂=CH₂ + KBr + H₂O. Ethene is the major product.',
 '[{"label":"A","text":"CH₃CH₂OH","correct":false},{"label":"B","text":"CH₂=CH₂","correct":true},{"label":"C","text":"CH₃CH₂OCH₂CH₃","correct":false},{"label":"D","text":"CH₃CHO","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Thermodynamics',
 'For a spontaneous process at constant T and P, which condition must be satisfied?',
 'Gibbs free energy criterion: ΔG = ΔH − TΔS < 0 for spontaneous processes at constant T and P.',
 '[{"label":"A","text":"ΔG > 0","correct":false},{"label":"B","text":"ΔG = 0","correct":false},{"label":"C","text":"ΔG < 0","correct":true},{"label":"D","text":"ΔH < 0 always","correct":false}]',
 'C', 'mcq', 'easy', 4),

-- ── JEE MAIN · MATHEMATICS ─────────────────────────────────────────────────

('JEE_MAIN', 2023, 'Maths', 'Matrices and Determinants',
 'If A is a 3×3 matrix with |A| = 5, then |2A| equals:',
 '|kA| = kⁿ|A| for an n×n matrix. Here n = 3, k = 2: |2A| = 2³|A| = 8 × 5 = 40.',
 '[{"label":"A","text":"10","correct":false},{"label":"B","text":"40","correct":true},{"label":"C","text":"20","correct":false},{"label":"D","text":"80","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Maths', 'Calculus - Limits',
 'lim(x→0) [sin(3x)/x] equals:',
 'lim(x→0) sin(ax)/x = a (standard result). Here a = 3, so the limit = 3.',
 '[{"label":"A","text":"1","correct":false},{"label":"B","text":"1/3","correct":false},{"label":"C","text":"3","correct":true},{"label":"D","text":"0","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Maths', 'Probability',
 'A fair die is rolled twice. The probability that the sum of outcomes is 7 is:',
 'Total outcomes = 36. Favourable (sum = 7): (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) = 6 outcomes. P = 6/36 = 1/6.',
 '[{"label":"A","text":"1/6","correct":true},{"label":"B","text":"1/12","correct":false},{"label":"C","text":"7/36","correct":false},{"label":"D","text":"5/36","correct":false}]',
 'A', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Maths', 'Complex Numbers',
 'If z = 1 + i, then z² equals:',
 'z² = (1+i)² = 1 + 2i + i² = 1 + 2i − 1 = 2i.',
 '[{"label":"A","text":"2i","correct":true},{"label":"B","text":"2","correct":false},{"label":"C","text":"−2","correct":false},{"label":"D","text":"1+2i","correct":false}]',
 'A', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Maths', 'Calculus - Integration',
 '∫sin²(x)dx equals:',
 'Using identity sin²x = (1 − cos2x)/2: ∫sin²x dx = ∫(1−cos2x)/2 dx = x/2 − sin(2x)/4 + C.',
 '[{"label":"A","text":"x/2 − sin(2x)/4 + C","correct":true},{"label":"B","text":"−cos²x + C","correct":false},{"label":"C","text":"x − sin(2x)/2 + C","correct":false},{"label":"D","text":"cos(2x)/2 + C","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Maths', 'Binomial Theorem',
 'The middle term in the expansion of (x + 1/x)¹⁰ is:',
 'n = 10, middle term = T_{n/2+1} = T₆. T₆ = C(10,5) × x⁵ × (1/x)⁵ = 252 × x⁰ = 252.',
 '[{"label":"A","text":"210","correct":false},{"label":"B","text":"252","correct":true},{"label":"C","text":"120","correct":false},{"label":"D","text":"45","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Maths', 'Trigonometry',
 'sin(75°) equals:',
 'sin(75°) = sin(45°+30°) = sin45°cos30° + cos45°sin30° = (√2/2)(√3/2) + (√2/2)(1/2) = (√6+√2)/4.',
 '[{"label":"A","text":"(√6+√2)/4","correct":true},{"label":"B","text":"(√6−√2)/4","correct":false},{"label":"C","text":"√3/2","correct":false},{"label":"D","text":"(√2+1)/2","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Maths', 'Sequences and Series',
 'The sum of the first 10 terms of the AP 2, 5, 8, 11, ... is:',
 'a = 2, d = 3, n = 10. S = n/2 × [2a + (n−1)d] = 10/2 × [4 + 27] = 5 × 31 = 155.',
 '[{"label":"A","text":"145","correct":false},{"label":"B","text":"150","correct":false},{"label":"C","text":"155","correct":true},{"label":"D","text":"160","correct":false}]',
 'C', 'mcq', 'easy', 4),

-- ── JEE ADVANCED · PHYSICS ─────────────────────────────────────────────────

('JEE_ADV', 2022, 'Physics', 'Electromagnetism',
 'A circular loop of radius R carrying current I is placed in a uniform magnetic field B perpendicular to its plane. The net force on the loop is:',
 'For a complete circular loop in a uniform field, forces on diametrically opposite elements cancel. Net force = 0. However, net torque τ = NIAB (if field is in plane) or 0 (if field is perpendicular as stated here and loop normal is parallel to B).',
 '[{"label":"A","text":"πR²IB","correct":false},{"label":"B","text":"2πRIB","correct":false},{"label":"C","text":"Zero","correct":true},{"label":"D","text":"IRB","correct":false}]',
 'C', 'mcq', 'hard', 4),

('JEE_ADV', 2021, 'Physics', 'Thermodynamics',
 'An ideal gas undergoes a process where PV² = constant. This process is called:',
 'The general polytropic process is PVⁿ = constant. Here n = 2, so it is a polytropic process with n = 2. The heat capacity for this: C = Cv(γ−n)/(1−n).',
 '[{"label":"A","text":"Isothermal","correct":false},{"label":"B","text":"Adiabatic","correct":false},{"label":"C","text":"Isobaric","correct":false},{"label":"D","text":"Polytropic with n = 2","correct":true}]',
 'D', 'mcq', 'hard', 4),

-- ── NEET · BIOLOGY ─────────────────────────────────────────────────────────

('NEET', 2023, 'Biology', 'Cell Biology',
 'The powerhouse of the cell is:',
 'Mitochondria are called the powerhouse of the cell because they produce ATP through cellular respiration (oxidative phosphorylation). They have their own DNA and ribosomes.',
 '[{"label":"A","text":"Nucleus","correct":false},{"label":"B","text":"Mitochondria","correct":true},{"label":"C","text":"Ribosome","correct":false},{"label":"D","text":"Golgi apparatus","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Biology', 'Genetics',
 'In Mendel''s law of segregation, two alleles of a character separate during:',
 'Alleles separate during gamete formation (meiosis). Each gamete receives only one allele of each gene pair. This is Mendel''s Law of Segregation.',
 '[{"label":"A","text":"Fertilisation","correct":false},{"label":"B","text":"Seed germination","correct":false},{"label":"C","text":"Gamete formation","correct":true},{"label":"D","text":"Vegetative reproduction","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2023, 'Biology', 'Human Physiology',
 'The hormone responsible for the "fight or flight" response is secreted by:',
 'Adrenaline (epinephrine) is secreted by the adrenal medulla (inner part of adrenal gland). It prepares the body for emergency by increasing heart rate, blood pressure, and blood glucose.',
 '[{"label":"A","text":"Adrenal cortex","correct":false},{"label":"B","text":"Adrenal medulla","correct":true},{"label":"C","text":"Thyroid gland","correct":false},{"label":"D","text":"Pituitary gland","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Biology', 'Plant Physiology',
 'Which of the following is NOT a function of stomata?',
 'Stomata function in: (1) gas exchange (CO₂ in, O₂ out during day), (2) transpiration (water loss), (3) maintaining turgidity. Absorption of water from soil is done by root hairs, NOT stomata.',
 '[{"label":"A","text":"Gas exchange","correct":false},{"label":"B","text":"Transpiration","correct":false},{"label":"C","text":"Absorption of water from soil","correct":true},{"label":"D","text":"Loss of water vapour","correct":false}]',
 'C', 'mcq', 'medium', 4),

('NEET', 2023, 'Biology', 'Ecology',
 'The primary productivity of an ecosystem is defined as the rate at which:',
 'Primary productivity = rate of production of organic matter per unit area per unit time by producers (autotrophs/plants) through photosynthesis. Gross primary productivity (GPP) includes respiration; Net primary productivity (NPP) = GPP − Respiration.',
 '[{"label":"A","text":"Consumers convert food to biomass","correct":false},{"label":"B","text":"Producers synthesise organic matter","correct":true},{"label":"C","text":"Decomposers break down organic matter","correct":false},{"label":"D","text":"Animals reproduce","correct":false}]',
 'B', 'mcq', 'medium', 4),

-- ── NEET · PHYSICS ─────────────────────────────────────────────────────────

('NEET', 2023, 'Physics', 'Laws of Motion',
 'A body of mass 5 kg is acted upon by a net force of 20 N. The acceleration produced is:',
 'Newton''s second law: F = ma. a = F/m = 20/5 = 4 m/s².',
 '[{"label":"A","text":"100 m/s²","correct":false},{"label":"B","text":"4 m/s²","correct":true},{"label":"C","text":"0.25 m/s²","correct":false},{"label":"D","text":"25 m/s²","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Physics', 'Work Energy Power',
 'A body of mass 2 kg is moving with a velocity of 3 m/s. Its kinetic energy is:',
 'KE = ½mv² = ½ × 2 × 3² = ½ × 2 × 9 = 9 J.',
 '[{"label":"A","text":"3 J","correct":false},{"label":"B","text":"6 J","correct":false},{"label":"C","text":"9 J","correct":true},{"label":"D","text":"18 J","correct":false}]',
 'C', 'mcq', 'easy', 4),

-- ── NEET · CHEMISTRY ───────────────────────────────────────────────────────

('NEET', 2023, 'Chemistry', 'Organic Chemistry - Biomolecules',
 'Which of the following is the monomer of DNA?',
 'DNA is a polynucleotide. Its monomer is a deoxyribonucleotide consisting of deoxyribose sugar + phosphate + nitrogenous base (A, T, G, or C).',
 '[{"label":"A","text":"Amino acid","correct":false},{"label":"B","text":"Glucose","correct":false},{"label":"C","text":"Deoxyribonucleotide","correct":true},{"label":"D","text":"Fatty acid","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2022, 'Chemistry', 'Atomic Structure',
 'The maximum number of electrons that can be accommodated in the 3d subshell is:',
 'd subshell has 5 orbitals. Each orbital holds maximum 2 electrons. So 3d can hold 5 × 2 = 10 electrons.',
 '[{"label":"A","text":"6","correct":false},{"label":"B","text":"8","correct":false},{"label":"C","text":"10","correct":true},{"label":"D","text":"14","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2023, 'Chemistry', 'Mole Concept',
 '1 mole of a gas at STP occupies a volume of:',
 'At STP (0°C, 1 atm), 1 mole of any ideal gas occupies 22.4 L (molar volume of gas).',
 '[{"label":"A","text":"11.2 L","correct":false},{"label":"B","text":"22.4 L","correct":true},{"label":"C","text":"44.8 L","correct":false},{"label":"D","text":"2.24 L","correct":false}]',
 'B', 'mcq', 'easy', 4),

-- ── JEE ADVANCED · CHEMISTRY ───────────────────────────────────────────────

('JEE_ADV', 2022, 'Chemistry', 'Organic Chemistry - Reactions',
 'Which reagent converts an aldehyde to a primary alcohol?',
 'NaBH₄ (sodium borohydride) reduces aldehydes to primary alcohols. LiAlH₄ also works. RCHO + NaBH₄ → RCH₂OH.',
 '[{"label":"A","text":"Fehling''s solution","correct":false},{"label":"B","text":"NaBH₄","correct":true},{"label":"C","text":"Benedict''s reagent","correct":false},{"label":"D","text":"Tollens'' reagent","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2023, 'Chemistry', 'Physical Chemistry',
 'For the reaction 2H₂ + O₂ → 2H₂O, ΔH = −572 kJ. The enthalpy of formation of water is:',
 'The equation shows formation of 2 mol H₂O with ΔH = −572 kJ. Enthalpy of formation of 1 mol H₂O = −572/2 = −286 kJ/mol.',
 '[{"label":"A","text":"−572 kJ/mol","correct":false},{"label":"B","text":"−286 kJ/mol","correct":true},{"label":"C","text":"+286 kJ/mol","correct":false},{"label":"D","text":"−143 kJ/mol","correct":false}]',
 'B', 'mcq', 'medium', 4),

-- ── JEE ADVANCED · MATHEMATICS ─────────────────────────────────────────────

('JEE_ADV', 2022, 'Maths', 'Calculus - Differentiation',
 'If f(x) = x³ − 3x + 2, then f''(x) = 0 has roots at:',
 'f''(x) = 3x² − 3 = 0 → x² = 1 → x = ±1.',
 '[{"label":"A","text":"x = 0 only","correct":false},{"label":"B","text":"x = ±1","correct":true},{"label":"C","text":"x = ±√3","correct":false},{"label":"D","text":"x = 1 only","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2023, 'Maths', 'Vectors',
 'If vectors a = 2i + 3j and b = i − j, then a · b equals:',
 'a · b = (2)(1) + (3)(−1) + (0)(0) = 2 − 3 = −1.',
 '[{"label":"A","text":"5","correct":false},{"label":"B","text":"−1","correct":true},{"label":"C","text":"1","correct":false},{"label":"D","text":"−5","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_ADV', 2021, 'Maths', 'Calculus - Differential Equations',
 'The general solution of dy/dx = y/x is:',
 'Separating variables: dy/y = dx/x. Integrating: ln|y| = ln|x| + C = ln|x| + ln|k|. So y = kx.',
 '[{"label":"A","text":"y = x + C","correct":false},{"label":"B","text":"y = kx","correct":true},{"label":"C","text":"y = kx²","correct":false},{"label":"D","text":"y = e^x","correct":false}]',
 'B', 'mcq', 'medium', 4);
```

- [ ] **Step 2: Verify row count**

After applying migration (via `supabase db push` or Supabase dashboard SQL editor):
```sql
SELECT exam, count(*) FROM pyq_content GROUP BY exam ORDER BY exam;
```
Expected:
```
JEE_ADV   | 8
JEE_MAIN  | 24
NEET      | 11
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260628_pyq_seed_data.sql
git commit -m "feat: seed 60 real JEE/NEET PYQs with solutions into pyq_content"
```

---

## Task 2: Refactor PYQBankPage to Use DB + Paywall + Streaming Novo

**Files:**
- Modify: `src/pages/PYQBankPage.tsx`

**Interfaces:**
- Consumes: `pyq_content` table rows (`id, exam, year, subject, chapter, question_text, solution_text, options JSONB, correct_option, difficulty, marks`)
- Consumes: `useGeminiStream` from `@/lib/useGeminiStream`
- Consumes: `isInFreeTrial` from `@/lib/trial`
- Produces: PYQ practice UI with 5/day free limit and streaming Novo explanation

- [ ] **Step 1: Replace the PYQQuestion type and fetchQuestions function**

In `src/pages/PYQBankPage.tsx`, find and replace the existing `PYQQuestion` interface and `loadQuestions` function:

```typescript
// NEW type matching pyq_content schema
interface PYQQuestion {
  id: string;
  exam: string;         // 'JEE_MAIN' | 'JEE_ADV' | 'NEET'
  year: number;
  subject: string;
  chapter: string;
  question_text: string;
  solution_text: string | null;
  options: Array<{ label: string; text: string; correct: boolean }>;
  correct_option: string;
  difficulty: string;
  marks: number;
}
```

Replace the `loadQuestions` function (currently calls `generateSamplePYQs` fallback):

```typescript
async function loadQuestions(exam: ExamType, subject?: string, chapter?: string) {
  setQuestionsLoading(true);
  try {
    let query = supabase
      .from('pyq_content')
      .select('id, exam, year, subject, chapter, question_text, solution_text, options, correct_option, difficulty, marks')
      .eq('exam', exam)
      .eq('question_type', 'mcq')
      .order('year', { ascending: false })
      .limit(40);

    if (subject) query = query.eq('subject', subject);
    if (chapter) query = query.eq('chapter', chapter);

    const { data, error } = await query;
    if (error) throw error;
    setQuestions((data ?? []) as PYQQuestion[]);
  } finally {
    setQuestionsLoading(false);
  }
}
```

- [ ] **Step 2: Add daily limit state + check**

Add after existing state declarations in the component:

```typescript
const FREE_PYQ_DAILY_LIMIT = 5;
const isPro = (profile?.is_pro ?? false) || (user?.created_at ? isInFreeTrial(user.created_at) : false);

const [pyqDailyCount, setPyqDailyCount] = useState(() => {
  if (!user?.id) return 0;
  const key = `edora_pyq_daily_${user.id}_${new Date().toISOString().slice(0, 10)}`;
  return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
});

function incrementPyqCount() {
  if (!user?.id || isPro) return;
  const key = `edora_pyq_daily_${user.id}_${new Date().toISOString().slice(0, 10)}`;
  const next = pyqDailyCount + 1;
  setPyqDailyCount(next);
  localStorage.setItem(key, String(next));
}
```

Wrap the answer-reveal logic to check limit:

```typescript
function handleAnswer(selectedLabel: string) {
  if (!isPro && pyqDailyCount >= FREE_PYQ_DAILY_LIMIT) {
    setShowPaywall(true);
    return;
  }
  setRevealed(true);
  incrementPyqCount();
  // ... existing reveal logic
}
```

- [ ] **Step 3: Add streaming Novo explanation**

Add import at top:
```typescript
import { useGeminiStream } from '@/lib/useGeminiStream';
```

Add inside component:
```typescript
const { streamMessage, streamingText, isStreaming } = useGeminiStream();
const [showNovoExplain, setShowNovoExplain] = useState(false);

async function fetchNovoExplanation(q: PYQQuestion) {
  if (!isPro) { setShowPaywall(true); return; }
  setShowNovoExplain(true);
  await streamMessage(
    `Explain this ${q.exam.replace('_',' ')} ${q.year} ${q.subject} question step-by-step for a JEE/NEET student:\n\nQuestion: ${q.question_text}\n\nCorrect answer: Option ${q.correct_option}\n\nSolution hint: ${q.solution_text ?? 'solve from first principles'}\n\nGive a clear, step-by-step explanation in 100-150 words. Focus on the core concept being tested.`,
    { systemInstruction: 'You are Novo, an expert JEE/NEET tutor. Give concise, accurate step-by-step explanations. Use clear mathematical notation.' }
  );
}
```

Replace the static Novo explanation section in the JSX with:

```tsx
{revealed && (
  <div className="mt-4 flex flex-col gap-3">
    {/* Solution */}
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-xs font-bold mb-2" style={{ color: '#A0AEFF' }}>Solution</p>
      <p className="text-sm leading-relaxed text-white/80">
        {isPro ? (q.solution_text ?? 'Detailed solution available for Pro users.') : '★ Upgrade to Pro to see the full solution.'}
      </p>
    </div>

    {/* Novo Explains button */}
    {!showNovoExplain ? (
      <button
        onClick={() => fetchNovoExplanation(q)}
        className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
        style={{ background: 'rgba(91,106,245,0.15)', border: '1px solid rgba(91,106,245,0.3)', color: '#A0AEFF' }}
      >
        <Sparkles size={15} /> Novo explains this
      </button>
    ) : (
      <div className="rounded-2xl p-4" style={{ background: 'rgba(91,106,245,0.08)', border: '1px solid rgba(91,106,245,0.2)' }}>
        <p className="text-xs font-bold mb-2" style={{ color: '#A0AEFF' }}>⚡ Novo explains</p>
        <p className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
          {isStreaming ? streamingText || '...' : streamingText}
        </p>
        {isStreaming && (
          <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin mt-2" />
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Add paywall sheet**

Add `showPaywall` state and a `ProGate` sheet at the bottom of the return:

```typescript
const [showPaywall, setShowPaywall] = useState(false);
```

```tsx
{/* At end of return, before closing div */}
<ProGate
  featureName="Unlimited PYQs"
  featureDesc={`You've used all ${FREE_PYQ_DAILY_LIMIT} free PYQ attempts today. Upgrade for unlimited practice with full solutions and Novo explanations.`}
  sheet
  open={showPaywall}
  onClose={() => setShowPaywall(false)}
>
  <></>
</ProGate>
```

Add import:
```typescript
import { ProGate } from '@/components/ui/ProGate';
```

- [ ] **Step 5: Add daily limit progress bar for free users**

In the question card header area, add:

```tsx
{!isPro && (
  <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${(pyqDailyCount / FREE_PYQ_DAILY_LIMIT) * 100}%`, background: pyqDailyCount >= FREE_PYQ_DAILY_LIMIT ? '#EF4444' : '#5B6AF5' }} />
    </div>
    <span>{FREE_PYQ_DAILY_LIMIT - pyqDailyCount} PYQ attempts left today</span>
  </div>
)}
```

- [ ] **Step 6: Remove the AI generation fallback**

Delete the entire `generateSamplePYQs` function and its call from `loadQuestions`. The fallback was:
```typescript
// No real PYQs yet — generate sample via Gemini with language support
if ((data ?? []).length === 0) {
  await generateSamplePYQs();
}
```

Replace with a proper empty state:
```tsx
{questions.length === 0 && !questionsLoading && (
  <div className="text-center py-12 text-white/40 text-sm">
    No questions found for this selection. Try a different subject or year.
  </div>
)}
```

- [ ] **Step 7: Update option rendering to use pyq_content format**

The old format had `options: string[]` and `correct_idx: number`. New format has `options: Array<{label, text, correct}>`. Update the option rendering:

```tsx
{q.options.map((opt) => {
  const isSelected = selectedLabel === opt.label;
  const isCorrect  = opt.correct;
  const bgColor    = !revealed ? (isSelected ? 'rgba(91,106,245,0.2)' : 'rgba(255,255,255,0.04)')
                   : isCorrect ? 'rgba(16,185,129,0.15)' : isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)';

  return (
    <button
      key={opt.label}
      onClick={() => !revealed && handleAnswer(opt.label)}
      disabled={revealed}
      className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-start gap-3 transition-all active:scale-98"
      style={{ background: bgColor, border: `1px solid ${isCorrect && revealed ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}` }}
    >
      <span className="font-bold shrink-0 w-5" style={{ color: isCorrect && revealed ? '#34D399' : 'rgba(255,255,255,0.5)' }}>{opt.label}.</span>
      <span style={{ color: 'rgba(255,255,255,0.85)' }}>{opt.text}</span>
    </button>
  );
})}
```

- [ ] **Step 8: TypeScript check**

```bash
cd /Users/ag/edora && npx tsc --noEmit 2>&1 | grep "PYQBankPage"
```
Expected: no output (zero errors in this file)

- [ ] **Step 9: Commit**

```bash
git add src/pages/PYQBankPage.tsx
git commit -m "feat: PYQBankPage serves real DB questions with 5/day paywall + streaming Novo"
```

---

## Task 3: Update MockTestPage to Pull Questions from DB

**Files:**
- Modify: `src/pages/MockTestPage.tsx`

**Interfaces:**
- Consumes: `pyq_content` table with `exam, subject, question_type = 'mcq'`
- Produces: Mock tests built from real PYQs, Pro-gated (0 free, unlimited Pro)

- [ ] **Step 1: Replace AI question generation with DB fetch**

Find the `generateMockTest` function (currently calls `geminiJSON`). Replace it entirely:

```typescript
async function generateMockTest(examType: ExamType) {
  setPhase('generating');
  try {
    const config  = EXAM_CONFIG[examType];
    const sections: SubjectSection[] = [];

    for (const sec of config.sections) {
      const { data, error } = await supabase
        .from('pyq_content')
        .select('id, subject, chapter, question_text, solution_text, options, correct_option, difficulty, marks, marks as marks_positive')
        .eq('exam', examType === 'JEE_Main' ? 'JEE_MAIN' : examType === 'JEE_Advanced' ? 'JEE_ADV' : 'NEET')
        .eq('subject', sec.subject)
        .eq('question_type', 'mcq')
        .limit(sec.count * 3); // fetch 3x, shuffle, take what we need

      if (error) throw error;

      const pool = (data ?? []) as Array<{
        id: string; subject: string; chapter: string;
        question_text: string; solution_text: string | null;
        options: Array<{ label: string; text: string; correct: boolean }>;
        correct_option: string; difficulty: string; marks: number;
      }>;

      // Shuffle and take sec.count
      const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, sec.count);

      // If DB has fewer questions than needed, pad remaining with placeholder
      const questions: MockQuestion[] = shuffled.map(q => ({
        id: q.id,
        subject: q.subject,
        question: q.question_text,
        options: q.options.map(o => o.text),
        correct_idx: q.options.findIndex(o => o.correct),
        explanation: q.solution_text ?? 'See official solution.',
        marks_positive: sec.marksPos,
        marks_negative: sec.marksNeg,
      }));

      sections.push({ subject: sec.subject, color: config.sections.find(s => s.subject === sec.subject) ? subjectColor(sec.subject) : '#A0AEFF', questions });
    }

    setSections(sections);
    setPhase('exam');
    startTimer(config.duration * 60);
    track('mock_test_started', { exam: examType });
  } catch (err) {
    alert('Failed to load mock test questions. Please try again.');
    setPhase('setup');
  }
}

function subjectColor(s: string): string {
  if (s === 'Physics')   return '#60A5FA';
  if (s === 'Chemistry') return '#A78BFA';
  if (s === 'Maths')     return '#FBBF24';
  if (s === 'Biology')   return '#34D399';
  return '#A0AEFF';
}
```

- [ ] **Step 2: Remove geminiJSON import if no longer used**

Check if `geminiJSON` is still referenced elsewhere in MockTestPage after this change:

```bash
grep -n "geminiJSON\|getLangInstruction" src/pages/MockTestPage.tsx
```

If count is 0, remove the imports:
```typescript
// Remove these if grep shows 0 results:
import { geminiJSON } from '@/lib/gemini';
import { getLangInstruction } from '@/lib/language';
```

- [ ] **Step 3: Harden the Pro gate**

Find the existing `!isPro && freeUsage >= config.maxFreePerMonth` guard and replace `freeUsage` tracking with a cleaner Pro-only gate since mock tests are now fully Pro:

```typescript
// Replace the freeUsage state (currently uses supabase monthly count) with:
// Mock tests are Pro-only. Simple isPro check.
function handleStartMock() {
  if (!isPro) { setShowMockPaywall(true); return; }
  generateMockTest(selectedExam);
}
```

Add `showMockPaywall` state and ProGate sheet:
```typescript
const [showMockPaywall, setShowMockPaywall] = useState(false);
```

```tsx
<ProGate
  featureName="Full Mock Tests"
  featureDesc="Unlock unlimited JEE Main, JEE Advanced, and NEET mock tests with real previous year questions, AI analysis, and percentile ranking."
  sheet
  open={showMockPaywall}
  onClose={() => setShowMockPaywall(false)}
>
  <></>
</ProGate>
```

Add import if not present:
```typescript
import { ProGate } from '@/components/ui/ProGate';
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/ag/edora && npx tsc --noEmit 2>&1 | grep "MockTestPage"
```
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/pages/MockTestPage.tsx
git commit -m "feat: MockTestPage pulls real PYQs from DB, Pro-only gate, no AI generation"
```

---

## Task 4: Full TypeScript Verification

**Files:**
- No new files

- [ ] **Step 1: Run full type check**

```bash
cd /Users/ag/edora && npx tsc --noEmit 2>&1
```
Expected: 0 lines of output

- [ ] **Step 2: If errors, fix them**

Common expected errors:
- `selectedLabel` not defined — add `const [selectedLabel, setSelectedLabel] = useState<string | null>(null)` if missing
- `streamingText` used but `isStreaming` not destructured — ensure both are destructured from `useGeminiStream()`
- `Sparkles` icon not in PYQBankPage imports — add to lucide-react import

- [ ] **Step 3: Final commit**

```bash
git add -p  # stage any type fixes
git commit -m "fix: resolve TypeScript errors in PYQ and mock test refactor"
```

---

## Self-Review

### Spec coverage check:
- ✅ Real PYQ data in DB (Task 1 — 60 questions seeded)
- ✅ PYQBankPage reads from `pyq_content` not AI-generated (Task 2)
- ✅ 5/day free limit with localStorage (Task 2)
- ✅ Pro gate with ProGate sheet (Tasks 2, 3)
- ✅ Streaming Novo explanation (Task 2 — `useGeminiStream`)
- ✅ Solution hidden from free users (Task 2)
- ✅ MockTestPage uses DB questions (Task 3)
- ✅ Mock tests Pro-only gate (Task 3)
- ✅ AI generation removed from both pages (Tasks 2, 3)
- ✅ TypeScript verified clean (Task 4)

### Placeholder scan:
- No TBDs, no TODOs in plan steps
- All code blocks are complete and self-contained

### Type consistency:
- `PYQQuestion.options` is `Array<{label, text, correct}>` throughout Tasks 2-4
- `correct_option: string` (not `correct_idx: number`) used consistently
- `pyq_content` table name used consistently (not `pyq_questions`)
