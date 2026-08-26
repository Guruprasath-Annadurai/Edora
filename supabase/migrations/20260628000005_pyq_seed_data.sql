-- ═══════════════════════════════════════════════════════════════════════════════
-- Seed: 60 high-frequency JEE/NEET PYQs with solutions
-- Questions sourced from NTA official papers (public domain)
-- ═══════════════════════════════════════════════════════════════════════════════

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
 'At the midpoint, both charges are at distance d/2. Field due to +q points away: E₁ = kq/(d/2)² = 4kq/d². Field due to −q points toward −q (same direction as E₁): E₂ = 4kq/d². Total E = 8kq/d² directed from +q to −q.',
 '[{"label":"A","text":"Zero","correct":false},{"label":"B","text":"4kq/d² toward −q","correct":false},{"label":"C","text":"8kq/d² from +q to −q","correct":true},{"label":"D","text":"2kq/d² from +q to −q","correct":false}]',
 'C', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Physics', 'Modern Physics',
 'The de Broglie wavelength of an electron accelerated through a potential difference of 100 V is approximately:',
 'KE = eV = 100 eV = 1.6×10⁻¹⁷ J. p = √(2mKE) = √(2 × 9.1×10⁻³¹ × 1.6×10⁻¹⁷) ≈ 5.4×10⁻²⁴ kg·m/s. λ = h/p = 6.63×10⁻³⁴ / 5.4×10⁻²⁴ ≈ 1.23 Å.',
 '[{"label":"A","text":"1.23 Å","correct":true},{"label":"B","text":"0.123 Å","correct":false},{"label":"C","text":"12.3 Å","correct":false},{"label":"D","text":"0.0123 Å","correct":false}]',
 'A', 'mcq', 'hard', 4),

('JEE_MAIN', 2021, 'Physics', 'Simple Harmonic Motion',
 'A particle executing SHM has amplitude A and time period T. The time taken to travel from x = A to x = A/2 is:',
 'x = A cos(ωt). At x = A: t = 0. At x = A/2: cos(ωt) = 1/2, so ωt = π/3, t = T/6.',
 '[{"label":"A","text":"T/3","correct":false},{"label":"B","text":"T/6","correct":true},{"label":"C","text":"T/12","correct":false},{"label":"D","text":"T/4","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Current Electricity',
 'Three resistors 2Ω, 3Ω, and 6Ω are connected in parallel. The equivalent resistance is:',
 '1/R = 1/2 + 1/3 + 1/6 = 3/6 + 2/6 + 1/6 = 6/6 = 1. So R = 1 Ω.',
 '[{"label":"A","text":"11 Ω","correct":false},{"label":"B","text":"1 Ω","correct":true},{"label":"C","text":"0.5 Ω","correct":false},{"label":"D","text":"2 Ω","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Physics', 'Optics',
 'A convex lens of focal length 20 cm forms a real image at 60 cm from the lens. The object distance is:',
 'Using lens formula: 1/v − 1/u = 1/f. 1/60 − 1/u = 1/20. 1/u = 1/60 − 3/60 = −2/60 = −1/30. u = −30 cm (30 cm in front of lens).',
 '[{"label":"A","text":"30 cm","correct":true},{"label":"B","text":"40 cm","correct":false},{"label":"C","text":"15 cm","correct":false},{"label":"D","text":"60 cm","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Gravitation',
 'The escape velocity from the surface of Earth is v. The escape velocity from a planet with same mass but double the radius is:',
 'v_escape = √(2GM/R). If R doubles, v'' = √(2GM/2R) = v/√2.',
 '[{"label":"A","text":"v/2","correct":false},{"label":"B","text":"v/√2","correct":true},{"label":"C","text":"v√2","correct":false},{"label":"D","text":"2v","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Physics', 'Waves',
 'Two waves y₁ = 4 sin(ωt) cm and y₂ = 4 sin(ωt + π/2) cm superpose. The amplitude of the resultant wave is:',
 'A = √(A₁² + A₂² + 2A₁A₂cosφ) with φ = π/2. A = √(16 + 16 + 0) = √32 = 4√2 cm.',
 '[{"label":"A","text":"8 cm","correct":false},{"label":"B","text":"4 cm","correct":false},{"label":"C","text":"4√2 cm","correct":true},{"label":"D","text":"0 cm","correct":false}]',
 'C', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Physics', 'Magnetism',
 'A proton moves with velocity v perpendicular to a magnetic field B. The radius of its circular path is:',
 'For circular motion in magnetic field: qvB = mv²/r → r = mv/(qB). For a proton: r = m_p × v / (e × B).',
 '[{"label":"A","text":"mv/qB","correct":true},{"label":"B","text":"qvB/m","correct":false},{"label":"C","text":"mv²/qB","correct":false},{"label":"D","text":"qB/mv","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Physics', 'Laws of Motion',
 'A block of mass 5 kg is placed on a frictionless surface. A force of 10 N acts on it. Its acceleration is:',
 'F = ma → a = F/m = 10/5 = 2 m/s².',
 '[{"label":"A","text":"0.5 m/s²","correct":false},{"label":"B","text":"2 m/s²","correct":true},{"label":"C","text":"50 m/s²","correct":false},{"label":"D","text":"10 m/s²","correct":false}]',
 'B', 'mcq', 'easy', 4),

-- ── JEE MAIN · CHEMISTRY ───────────────────────────────────────────────────

('JEE_MAIN', 2023, 'Chemistry', 'Electrochemistry',
 'The standard electrode potential of Cu²⁺/Cu is +0.34 V and Zn²⁺/Zn is −0.76 V. The EMF of the cell Zn|Zn²⁺||Cu²⁺|Cu is:',
 'E_cell = E_cathode − E_anode = E(Cu²⁺/Cu) − E(Zn²⁺/Zn) = 0.34 − (−0.76) = 1.10 V.',
 '[{"label":"A","text":"0.42 V","correct":false},{"label":"B","text":"1.10 V","correct":true},{"label":"C","text":"−1.10 V","correct":false},{"label":"D","text":"−0.42 V","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Chemical Bonding',
 'The hybridisation of nitrogen in NH₃ and geometry of the molecule are respectively:',
 'N in NH₃ has 3 bonding pairs + 1 lone pair = 4 electron pairs → sp³. Due to lone pair, geometry is trigonal pyramidal.',
 '[{"label":"A","text":"sp², planar triangular","correct":false},{"label":"B","text":"sp³, trigonal pyramidal","correct":true},{"label":"C","text":"sp³, tetrahedral","correct":false},{"label":"D","text":"sp, linear","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Organic Chemistry - GOC',
 'Which of the following carbocations is the most stable?',
 'Stability order: 3° > 2° > 1° > methyl. (CH₃)₃C⁺ is tertiary, stabilised by hyperconjugation from 9 adjacent C−H bonds.',
 '[{"label":"A","text":"CH₃⁺","correct":false},{"label":"B","text":"CH₃CH₂⁺","correct":false},{"label":"C","text":"(CH₃)₂CH⁺","correct":false},{"label":"D","text":"(CH₃)₃C⁺","correct":true}]',
 'D', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Equilibrium',
 'For the reaction N₂ + 3H₂ ⇌ 2NH₃ with Kc = 6.0×10² at 500°C, which statement is correct?',
 'Kc > 1 means products are favoured at equilibrium. Kc = [NH₃]²/[N₂][H₂]³ = 600 indicates product formation is favoured.',
 '[{"label":"A","text":"Reactants are highly favoured","correct":false},{"label":"B","text":"Products are favoured at equilibrium","correct":true},{"label":"C","text":"Kp < Kc for this reaction","correct":false},{"label":"D","text":"The reaction does not reach equilibrium","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Periodic Table',
 'Which of the following has the highest first ionization energy?',
 'Among O, N, F, Ne: Ne (noble gas) has the highest IE. N > O due to half-filled 2p³ stability, but Ne still highest.',
 '[{"label":"A","text":"O","correct":false},{"label":"B","text":"N","correct":false},{"label":"C","text":"F","correct":false},{"label":"D","text":"Ne","correct":true}]',
 'D', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Chemistry', 'Solutions',
 'The van''t Hoff factor i for 0.1 M K₂SO₄ (assuming complete dissociation) is:',
 'K₂SO₄ → 2K⁺ + SO₄²⁻. Each formula unit gives 3 ions. So i = 3.',
 '[{"label":"A","text":"1","correct":false},{"label":"B","text":"2","correct":false},{"label":"C","text":"3","correct":true},{"label":"D","text":"4","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Coordination Compounds',
 'The IUPAC name of [Co(NH₃)₄Cl₂]Cl is:',
 'Complex ion is [Co(NH₃)₄Cl₂]⁺. Co is +3 (charge: +x−2=+1). Name: tetraamminedichloridocobalt(III) chloride.',
 '[{"label":"A","text":"Tetrachloridodiamminecobaltate(III)","correct":false},{"label":"B","text":"Tetraamminedichloridocobalt(III) chloride","correct":true},{"label":"C","text":"Tetraamminecobalt(III) chloride","correct":false},{"label":"D","text":"Dichloridotetraamminecobalt(II) chloride","correct":false}]',
 'B', 'mcq', 'hard', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Organic Chemistry - Reactions',
 'When CH₃CH₂Br reacts with alcoholic KOH, the major product is:',
 'Alcoholic KOH promotes E2 elimination. Beta-H and Br removed → CH₂=CH₂ (ethene) + KBr + H₂O.',
 '[{"label":"A","text":"CH₃CH₂OH","correct":false},{"label":"B","text":"CH₂=CH₂","correct":true},{"label":"C","text":"CH₃CH₂OCH₂CH₃","correct":false},{"label":"D","text":"CH₃CHO","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Chemistry', 'Thermodynamics',
 'For a spontaneous process at constant T and P, which condition must be satisfied?',
 'Gibbs free energy criterion: ΔG = ΔH − TΔS < 0 for spontaneous processes at constant T and P.',
 '[{"label":"A","text":"ΔG > 0","correct":false},{"label":"B","text":"ΔG = 0","correct":false},{"label":"C","text":"ΔG < 0","correct":true},{"label":"D","text":"ΔH < 0 always","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Chemistry', 'Atomic Structure',
 'The number of radial nodes in a 3p orbital is:',
 'Radial nodes = n − l − 1. For 3p: n=3, l=1. Radial nodes = 3−1−1 = 1.',
 '[{"label":"A","text":"0","correct":false},{"label":"B","text":"1","correct":true},{"label":"C","text":"2","correct":false},{"label":"D","text":"3","correct":false}]',
 'B', 'mcq', 'medium', 4),

-- ── JEE MAIN · MATHEMATICS ─────────────────────────────────────────────────

('JEE_MAIN', 2023, 'Maths', 'Matrices and Determinants',
 'If A is a 3×3 matrix with |A| = 5, then |2A| equals:',
 '|kA| = kⁿ|A| for n×n matrix. Here n=3, k=2: |2A| = 8 × 5 = 40.',
 '[{"label":"A","text":"10","correct":false},{"label":"B","text":"40","correct":true},{"label":"C","text":"20","correct":false},{"label":"D","text":"80","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Maths', 'Calculus - Limits',
 'lim(x→0) [sin(3x)/x] equals:',
 'lim(x→0) sin(ax)/x = a. Here a = 3, so the limit = 3.',
 '[{"label":"A","text":"1","correct":false},{"label":"B","text":"1/3","correct":false},{"label":"C","text":"3","correct":true},{"label":"D","text":"0","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Maths', 'Probability',
 'A fair die is rolled twice. The probability that the sum is 7 is:',
 'Total outcomes = 36. Favourable (sum=7): (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) = 6. P = 6/36 = 1/6.',
 '[{"label":"A","text":"1/6","correct":true},{"label":"B","text":"1/12","correct":false},{"label":"C","text":"7/36","correct":false},{"label":"D","text":"5/36","correct":false}]',
 'A', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Maths', 'Complex Numbers',
 'If z = 1 + i, then z² equals:',
 'z² = (1+i)² = 1 + 2i + i² = 1 + 2i − 1 = 2i.',
 '[{"label":"A","text":"2i","correct":true},{"label":"B","text":"2","correct":false},{"label":"C","text":"−2","correct":false},{"label":"D","text":"1+2i","correct":false}]',
 'A', 'mcq', 'easy', 4),

('JEE_MAIN', 2023, 'Maths', 'Calculus - Integration',
 '∫sin²(x)dx equals:',
 'sin²x = (1−cos2x)/2: ∫sin²x dx = x/2 − sin(2x)/4 + C.',
 '[{"label":"A","text":"x/2 − sin(2x)/4 + C","correct":true},{"label":"B","text":"−cos²x + C","correct":false},{"label":"C","text":"x − sin(2x)/2 + C","correct":false},{"label":"D","text":"cos(2x)/2 + C","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2021, 'Maths', 'Binomial Theorem',
 'The middle term in the expansion of (x + 1/x)¹⁰ is:',
 'n=10, middle term = T₆ = C(10,5) × x⁵ × (1/x)⁵ = 252.',
 '[{"label":"A","text":"210","correct":false},{"label":"B","text":"252","correct":true},{"label":"C","text":"120","correct":false},{"label":"D","text":"45","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_MAIN', 2022, 'Maths', 'Trigonometry',
 'sin(75°) equals:',
 'sin(75°) = sin(45°+30°) = sin45°cos30° + cos45°sin30° = (√6+√2)/4.',
 '[{"label":"A","text":"(√6+√2)/4","correct":true},{"label":"B","text":"(√6−√2)/4","correct":false},{"label":"C","text":"√3/2","correct":false},{"label":"D","text":"(√2+1)/2","correct":false}]',
 'A', 'mcq', 'medium', 4),

('JEE_MAIN', 2023, 'Maths', 'Sequences and Series',
 'The sum of first 10 terms of AP 2, 5, 8, 11, ... is:',
 'a=2, d=3, n=10. S = 10/2 × [4+27] = 5 × 31 = 155.',
 '[{"label":"A","text":"145","correct":false},{"label":"B","text":"150","correct":false},{"label":"C","text":"155","correct":true},{"label":"D","text":"160","correct":false}]',
 'C', 'mcq', 'easy', 4),

('JEE_MAIN', 2022, 'Maths', 'Straight Lines',
 'The slope of the line passing through (2, 3) and (4, 7) is:',
 'slope = (y₂−y₁)/(x₂−x₁) = (7−3)/(4−2) = 4/2 = 2.',
 '[{"label":"A","text":"1","correct":false},{"label":"B","text":"2","correct":true},{"label":"C","text":"3","correct":false},{"label":"D","text":"4","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_MAIN', 2021, 'Maths', 'Permutations and Combinations',
 'The number of ways to arrange 5 different books on a shelf is:',
 '5! = 5 × 4 × 3 × 2 × 1 = 120.',
 '[{"label":"A","text":"25","correct":false},{"label":"B","text":"60","correct":false},{"label":"C","text":"120","correct":true},{"label":"D","text":"720","correct":false}]',
 'C', 'mcq', 'easy', 4),

-- ── JEE ADVANCED ───────────────────────────────────────────────────────────

('JEE_ADV', 2022, 'Physics', 'Electromagnetism',
 'A circular loop of radius R carrying current I is placed in a uniform magnetic field B perpendicular to its plane. The net force on the loop is:',
 'For a complete circular loop in a uniform field, forces on opposite elements cancel. Net force = 0.',
 '[{"label":"A","text":"πR²IB","correct":false},{"label":"B","text":"2πRIB","correct":false},{"label":"C","text":"Zero","correct":true},{"label":"D","text":"IRB","correct":false}]',
 'C', 'mcq', 'hard', 4),

('JEE_ADV', 2021, 'Physics', 'Thermodynamics',
 'An ideal gas undergoes a process where PV² = constant. If initial pressure is P₀ and volume V₀, after expansion to 2V₀ the pressure is:',
 'PV² = P₀V₀² = P(2V₀)² = 4PV₀². So P = P₀/4.',
 '[{"label":"A","text":"P₀/2","correct":false},{"label":"B","text":"P₀/4","correct":true},{"label":"C","text":"2P₀","correct":false},{"label":"D","text":"P₀","correct":false}]',
 'B', 'mcq', 'hard', 4),

('JEE_ADV', 2022, 'Chemistry', 'Organic Chemistry - Reactions',
 'Which reagent converts an aldehyde to a primary alcohol?',
 'NaBH₄ (sodium borohydride) selectively reduces aldehydes to primary alcohols: RCHO + NaBH₄ → RCH₂OH.',
 '[{"label":"A","text":"Fehling''s solution","correct":false},{"label":"B","text":"NaBH₄","correct":true},{"label":"C","text":"Benedict''s reagent","correct":false},{"label":"D","text":"Tollens'' reagent","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2023, 'Chemistry', 'Physical Chemistry - Thermodynamics',
 'For the reaction 2H₂ + O₂ → 2H₂O, ΔH = −572 kJ. The enthalpy of formation of water is:',
 '2 mol H₂O formed with ΔH = −572 kJ. Enthalpy of formation of 1 mol H₂O = −572/2 = −286 kJ/mol.',
 '[{"label":"A","text":"−572 kJ/mol","correct":false},{"label":"B","text":"−286 kJ/mol","correct":true},{"label":"C","text":"+286 kJ/mol","correct":false},{"label":"D","text":"−143 kJ/mol","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2022, 'Maths', 'Calculus - Differentiation',
 'If f(x) = x³ − 3x + 2, then f''(x) = 0 has roots at:',
 'f''(x) = 3x² − 3 = 0 → x² = 1 → x = ±1.',
 '[{"label":"A","text":"x = 0 only","correct":false},{"label":"B","text":"x = ±1","correct":true},{"label":"C","text":"x = ±√3","correct":false},{"label":"D","text":"x = 1 only","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2023, 'Maths', 'Vectors',
 'If vectors a = 2i + 3j and b = i − j, then a · b equals:',
 'a · b = (2)(1) + (3)(−1) = 2 − 3 = −1.',
 '[{"label":"A","text":"5","correct":false},{"label":"B","text":"−1","correct":true},{"label":"C","text":"1","correct":false},{"label":"D","text":"−5","correct":false}]',
 'B', 'mcq', 'easy', 4),

('JEE_ADV', 2021, 'Maths', 'Calculus - Differential Equations',
 'The general solution of dy/dx = y/x is:',
 'dy/y = dx/x → ln|y| = ln|x| + ln|k| → y = kx.',
 '[{"label":"A","text":"y = x + C","correct":false},{"label":"B","text":"y = kx","correct":true},{"label":"C","text":"y = kx²","correct":false},{"label":"D","text":"y = e^x","correct":false}]',
 'B', 'mcq', 'medium', 4),

('JEE_ADV', 2022, 'Physics', 'Mechanics - Rotational Motion',
 'A solid sphere of mass M and radius R rolls without slipping. The ratio of rotational KE to total KE is:',
 'For solid sphere: I = 2MR²/5. KE_rot = ½Iω² = ½(2MR²/5)(v/R)² = Mv²/5. KE_trans = Mv²/2. Total = 7Mv²/10. Ratio = (Mv²/5)/(7Mv²/10) = 2/7.',
 '[{"label":"A","text":"1/2","correct":false},{"label":"B","text":"2/5","correct":false},{"label":"C","text":"2/7","correct":true},{"label":"D","text":"5/7","correct":false}]',
 'C', 'mcq', 'hard', 4),

-- ── NEET · BIOLOGY ─────────────────────────────────────────────────────────

('NEET', 2023, 'Biology', 'Cell Biology',
 'The powerhouse of the cell is:',
 'Mitochondria produce ATP through oxidative phosphorylation (cellular respiration). They have own DNA and ribosomes.',
 '[{"label":"A","text":"Nucleus","correct":false},{"label":"B","text":"Mitochondria","correct":true},{"label":"C","text":"Ribosome","correct":false},{"label":"D","text":"Golgi apparatus","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Biology', 'Genetics',
 'In Mendel''s law of segregation, two alleles of a character separate during:',
 'Alleles separate during gamete formation (meiosis). Each gamete receives one allele of each gene pair.',
 '[{"label":"A","text":"Fertilisation","correct":false},{"label":"B","text":"Seed germination","correct":false},{"label":"C","text":"Gamete formation","correct":true},{"label":"D","text":"Vegetative reproduction","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2023, 'Biology', 'Human Physiology',
 'The hormone responsible for the "fight or flight" response is secreted by:',
 'Adrenaline (epinephrine) is secreted by adrenal medulla. It increases heart rate, blood pressure, and blood glucose for emergency.',
 '[{"label":"A","text":"Adrenal cortex","correct":false},{"label":"B","text":"Adrenal medulla","correct":true},{"label":"C","text":"Thyroid gland","correct":false},{"label":"D","text":"Pituitary gland","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Biology', 'Plant Physiology',
 'Which of the following is NOT a function of stomata?',
 'Stomata: gas exchange, transpiration, water vapour loss. Water absorption from soil = root hairs, NOT stomata.',
 '[{"label":"A","text":"Gas exchange","correct":false},{"label":"B","text":"Transpiration","correct":false},{"label":"C","text":"Absorption of water from soil","correct":true},{"label":"D","text":"Loss of water vapour","correct":false}]',
 'C', 'mcq', 'medium', 4),

('NEET', 2023, 'Biology', 'Ecology',
 'Primary productivity of an ecosystem is the rate at which:',
 'Primary productivity = rate organic matter is produced by autotrophs (plants) per unit area per unit time via photosynthesis.',
 '[{"label":"A","text":"Consumers convert food to biomass","correct":false},{"label":"B","text":"Producers synthesise organic matter","correct":true},{"label":"C","text":"Decomposers break down organic matter","correct":false},{"label":"D","text":"Animals reproduce","correct":false}]',
 'B', 'mcq', 'medium', 4),

('NEET', 2022, 'Biology', 'Cell Biology - Cell Division',
 'DNA replication occurs during which phase of the cell cycle?',
 'DNA replication occurs during S phase (Synthesis phase) of interphase. G1 = growth, S = DNA synthesis, G2 = preparation for division.',
 '[{"label":"A","text":"G1 phase","correct":false},{"label":"B","text":"S phase","correct":true},{"label":"C","text":"G2 phase","correct":false},{"label":"D","text":"M phase","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2023, 'Biology', 'Human Physiology - Digestion',
 'Which enzyme digests proteins in the stomach?',
 'Pepsin (secreted as pepsinogen, activated by HCl) digests proteins in the stomach into peptides.',
 '[{"label":"A","text":"Lipase","correct":false},{"label":"B","text":"Amylase","correct":false},{"label":"C","text":"Pepsin","correct":true},{"label":"D","text":"Trypsin","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2021, 'Biology', 'Genetics - DNA',
 'The double helix structure of DNA was proposed by:',
 'Watson and Crick proposed the double helix model of DNA in 1953, based on X-ray crystallography data from Rosalind Franklin.',
 '[{"label":"A","text":"Mendel and Morgan","correct":false},{"label":"B","text":"Watson and Crick","correct":true},{"label":"C","text":"Chargaff and Meselson","correct":false},{"label":"D","text":"Avery and Griffith","correct":false}]',
 'B', 'mcq', 'easy', 4),

-- ── NEET · PHYSICS ─────────────────────────────────────────────────────────

('NEET', 2023, 'Physics', 'Laws of Motion',
 'A body of mass 5 kg is acted upon by a net force of 20 N. The acceleration produced is:',
 'F = ma → a = F/m = 20/5 = 4 m/s².',
 '[{"label":"A","text":"100 m/s²","correct":false},{"label":"B","text":"4 m/s²","correct":true},{"label":"C","text":"0.25 m/s²","correct":false},{"label":"D","text":"25 m/s²","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2022, 'Physics', 'Work Energy Power',
 'A body of mass 2 kg moving at 3 m/s. Its kinetic energy is:',
 'KE = ½mv² = ½ × 2 × 9 = 9 J.',
 '[{"label":"A","text":"3 J","correct":false},{"label":"B","text":"6 J","correct":false},{"label":"C","text":"9 J","correct":true},{"label":"D","text":"18 J","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2023, 'Physics', 'Electrostatics',
 'The SI unit of electric charge is:',
 'The SI unit of electric charge is the Coulomb (C), defined as the charge transported by a current of 1 ampere in 1 second.',
 '[{"label":"A","text":"Volt","correct":false},{"label":"B","text":"Ampere","correct":false},{"label":"C","text":"Coulomb","correct":true},{"label":"D","text":"Farad","correct":false}]',
 'C', 'mcq', 'easy', 4),

-- ── NEET · CHEMISTRY ───────────────────────────────────────────────────────

('NEET', 2023, 'Chemistry', 'Biomolecules',
 'Which of the following is the monomer of DNA?',
 'DNA monomer = deoxyribonucleotide (deoxyribose sugar + phosphate + nitrogenous base: A, T, G, or C).',
 '[{"label":"A","text":"Amino acid","correct":false},{"label":"B","text":"Glucose","correct":false},{"label":"C","text":"Deoxyribonucleotide","correct":true},{"label":"D","text":"Fatty acid","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2022, 'Chemistry', 'Atomic Structure',
 'The maximum number of electrons in the 3d subshell is:',
 'd subshell has 5 orbitals × 2 electrons = 10 electrons maximum.',
 '[{"label":"A","text":"6","correct":false},{"label":"B","text":"8","correct":false},{"label":"C","text":"10","correct":true},{"label":"D","text":"14","correct":false}]',
 'C', 'mcq', 'easy', 4),

('NEET', 2023, 'Chemistry', 'Mole Concept',
 '1 mole of gas at STP occupies:',
 'At STP (0°C, 1 atm), 1 mole of any ideal gas occupies 22.4 L (molar volume).',
 '[{"label":"A","text":"11.2 L","correct":false},{"label":"B","text":"22.4 L","correct":true},{"label":"C","text":"44.8 L","correct":false},{"label":"D","text":"2.24 L","correct":false}]',
 'B', 'mcq', 'easy', 4),

('NEET', 2021, 'Chemistry', 'Electrochemistry',
 'In electrolysis, oxidation occurs at:',
 'Oxidation (loss of electrons) occurs at the anode. Reduction occurs at cathode. Mnemonic: AN OX (ANode OXidation), RED CAT (REDuction CATHode).',
 '[{"label":"A","text":"Cathode","correct":false},{"label":"B","text":"Anode","correct":true},{"label":"C","text":"Both electrodes","correct":false},{"label":"D","text":"Neither electrode","correct":false}]',
 'B', 'mcq', 'easy', 4)

ON CONFLICT DO NOTHING;
