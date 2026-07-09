// ═══════════════════════════════════════════════════════════════════════════════
// fallbackQA — Tier 4c static question bank with BM25 scoring
//
// Used when both Groq primary and Flash are unreachable.
// Returns closest match with "offline Q&A bank" disclaimer.
// ═══════════════════════════════════════════════════════════════════════════════

export interface QAPair {
  q: string;
  a: string;
  tags: string[];   // subject:Physics | subject:Chemistry | subject:Math | subject:Biology
}

// ── BM25 constants ────────────────────────────────────────────────────────────
const K1 = 1.5;
const B  = 0.75;

// ── Static question bank ──────────────────────────────────────────────────────
// Coverage: Physics (mechanics, electro, modern), Chemistry (organic, inorganic, physical),
//           Math (calculus, algebra, coord geo, vectors), Biology (cell, genetics, physiology)

export const QA_BANK: QAPair[] = [
  // ── PHYSICS: Mechanics ─────────────────────────────────────────────────────
  { q: 'State Newton\'s first law of motion',
    a: 'An object remains at rest or in uniform motion in a straight line unless acted upon by an external net force. This is the law of inertia.',
    tags: ['Physics','mechanics'] },
  { q: 'What is Newton\'s second law of motion?',
    a: 'F = ma — net force equals mass times acceleration. In vector form: **F⃗ = ma⃗**. The direction of acceleration is the same as the net force.',
    tags: ['Physics','mechanics'] },
  { q: 'Newton\'s third law — action reaction',
    a: 'Every action has an equal and opposite reaction. Forces always come in pairs acting on *different* bodies. Key exam trap: action–reaction pairs never cancel because they act on different objects.',
    tags: ['Physics','mechanics'] },
  { q: 'What is projectile motion? What is the range formula?',
    a: 'Projectile motion combines uniform horizontal velocity with uniformly accelerated vertical motion. Range **R = u²sin2θ / g**. Maximum range at θ = 45°. Time of flight T = 2u sinθ / g. Maximum height H = u²sin²θ / 2g.',
    tags: ['Physics','mechanics','projectile'] },
  { q: 'Explain conservation of momentum',
    a: 'In a closed system with no external forces, total momentum is conserved: **p₁ + p₂ = p₁\' + p₂\'**. Used in collision problems: elastic (KE conserved), inelastic (KE not conserved), perfectly inelastic (objects stick together).',
    tags: ['Physics','mechanics','momentum','collision'] },
  { q: 'What is the work-energy theorem?',
    a: 'Net work done on an object equals its change in kinetic energy: **W_net = ΔKE = ½mv² − ½mu²**. This holds even for variable forces if you integrate F·dx.',
    tags: ['Physics','mechanics','energy','work'] },
  { q: 'What is gravitational potential energy?',
    a: '**U = mgh** near Earth\'s surface. For general case: U = −GMm/r. The negative sign means work is done by gravity when r decreases. At infinity, U = 0.',
    tags: ['Physics','mechanics','gravitation'] },
  { q: 'Escape velocity formula and derivation',
    a: 'Set KE = gravitational PE: ½mv² = GMm/R → v_escape = √(2GM/R) = √(2gR) ≈ 11.2 km/s for Earth. Independent of mass of the object.',
    tags: ['Physics','gravitation','escape velocity'] },
  { q: 'What is simple harmonic motion SHM?',
    a: 'SHM: restoring force ∝ displacement (F = −kx). Solutions: x = A sin(ωt + φ). Angular frequency ω = √(k/m) for spring, √(g/L) for pendulum. Period T = 2π/ω.',
    tags: ['Physics','SHM','oscillation'] },
  { q: 'What are Kepler\'s laws of planetary motion?',
    a: '1. Planets move in ellipses with the Sun at one focus.\n2. Equal areas in equal times (conservation of angular momentum).\n3. T² ∝ a³ where a is semi-major axis. For circular orbits: T² = 4π²r³/GM.',
    tags: ['Physics','gravitation','Kepler'] },
  { q: 'Derive kinematic equations of motion',
    a: 'v = u + at | s = ut + ½at² | v² = u² + 2as | s_nth = u + a(2n−1)/2. All derived from constant acceleration assumption. Zero initial velocity: v = at, s = ½at².',
    tags: ['Physics','kinematics','mechanics'] },
  { q: 'What is the moment of inertia? Give formulas',
    a: 'I = Σmr² (resistance to rotational acceleration). Thin rod (center): ML²/12. Disk: ½MR². Sphere solid: 2MR²/5. Ring: MR². Parallel axis theorem: I = I_cm + Md².',
    tags: ['Physics','rotational motion','moment of inertia'] },
  { q: 'Angular momentum and torque relation',
    a: 'L = Iω = r × p. Torque τ = dL/dt = Iα. Conservation of angular momentum: if τ_net = 0, L is constant. Example: ice skater pulling arms in → ω increases.',
    tags: ['Physics','rotational motion','angular momentum'] },
  { q: 'What is Bernoulli\'s principle?',
    a: 'P + ½ρv² + ρgh = constant along a streamline. Applications: aircraft lift, venturi meter, spray guns. Faster flow = lower pressure. Derived from energy conservation per unit volume.',
    tags: ['Physics','fluid mechanics','Bernoulli'] },
  { q: 'Stress, strain, and Young\'s modulus',
    a: 'Stress = F/A (Pa). Strain = ΔL/L (dimensionless). Young\'s modulus Y = Stress/Strain = FL₀/AΔL. Hooke\'s law holds in elastic region. Beyond elastic limit → plastic deformation.',
    tags: ['Physics','elasticity','properties of matter'] },

  // ── PHYSICS: Electrostatics & Electromagnetism ────────────────────────────
  { q: 'State Coulomb\'s law',
    a: 'F = kq₁q₂/r² = q₁q₂/(4πε₀r²). k = 9×10⁹ N·m²/C². Force is along the line joining charges. In medium with permittivity ε: F = q₁q₂/(4πεr²). ε = ε₀εᵣ.',
    tags: ['Physics','electrostatics','Coulomb'] },
  { q: 'Electric field due to a point charge',
    a: 'E = kq/r² = q/(4πε₀r²). Direction: away from +ve charge, towards −ve charge. Superposition applies: E_total = ΣE_individual. Electric field lines never intersect.',
    tags: ['Physics','electrostatics','electric field'] },
  { q: 'What is Gauss\'s law?',
    a: 'Φ_E = Q_enclosed/ε₀. Total electric flux through any closed surface equals the enclosed charge divided by ε₀. Used to find E for symmetric charge distributions (sphere, cylinder, plane).',
    tags: ['Physics','electrostatics','Gauss law'] },
  { q: 'Capacitance formula for parallel plate capacitor',
    a: 'C = ε₀A/d (without dielectric). With dielectric: C = Kε₀A/d where K = dielectric constant. Energy stored: U = ½CV² = Q²/2C = QV/2. Capacitors in series: 1/C = Σ1/Cᵢ. In parallel: C = ΣCᵢ.',
    tags: ['Physics','capacitance','electrostatics'] },
  { q: 'Ohm\'s law and resistivity',
    a: 'V = IR. Resistivity ρ: R = ρL/A. Temperature: ρ = ρ₀(1 + αΔT). Resistors in series: R = ΣRᵢ. In parallel: 1/R = Σ1/Rᵢ. Power: P = VI = I²R = V²/R.',
    tags: ['Physics','current electricity','Ohm'] },
  { q: 'Kirchhoff\'s laws',
    a: 'KCL: Sum of currents at a junction = 0 (charge conservation). KVL: Sum of voltage drops in a closed loop = 0 (energy conservation). Apply KVL going around loop — drop across resistor = −IR if going with current.',
    tags: ['Physics','current electricity','Kirchhoff'] },
  { q: 'State Faraday\'s law of electromagnetic induction',
    a: 'Induced EMF = −dΦ/dt (Faraday\'s law). Φ = B·A·cosθ. The negative sign is Lenz\'s law — induced current opposes the change in flux. EMF in moving rod: ε = BLv.',
    tags: ['Physics','EMI','Faraday','induction'] },
  { q: 'What is self-inductance?',
    a: 'L = NΦ/I. EMF induced: ε = −L(dI/dt). Energy stored in inductor: U = ½LI². For solenoid: L = μ₀N²A/ℓ. Time constant in LR circuit: τ = L/R.',
    tags: ['Physics','inductance','EMI'] },
  { q: 'AC circuit: impedance, resonance',
    a: 'Z = √(R² + (X_L − X_C)²). X_L = ωL, X_C = 1/ωC. Resonance when X_L = X_C: ω₀ = 1/√(LC), f₀ = 1/(2π√LC). At resonance: Z = R (minimum), I = V/R (maximum). Power factor = R/Z.',
    tags: ['Physics','AC circuits','resonance'] },
  { q: 'Magnetic force on a moving charge — Lorentz force',
    a: 'F = q(v × B) = qvB sinθ. Circular motion in magnetic field: mv²/r = qvB → r = mv/qB. Period T = 2πm/qB (independent of v). Used in cyclotron.',
    tags: ['Physics','magnetism','Lorentz force'] },

  // ── PHYSICS: Modern Physics ───────────────────────────────────────────────
  { q: 'Photoelectric effect — Einstein\'s equation',
    a: 'KE_max = hf − φ = hf − hf₀. φ = work function. Threshold frequency f₀ = φ/h. KE depends on frequency, NOT intensity. Intensity affects current (number of electrons). Nobel Prize 1921.',
    tags: ['Physics','modern physics','photoelectric','quantum'] },
  { q: 'de Broglie wavelength formula',
    a: 'λ = h/p = h/(mv). For accelerated particle through voltage V: λ = h/√(2mqV). Electron at 100V: λ ≈ 1.23 Å. Shows wave nature of matter.',
    tags: ['Physics','modern physics','de Broglie','wave particle'] },
  { q: 'Bohr\'s model of hydrogen atom — energy levels',
    a: 'Energy E_n = −13.6/n² eV. Radius r_n = 0.529n² Å (Bohr radius). Frequency of photon: hf = E_i − E_f. Series: Lyman (UV, n→1), Balmer (visible, n→2), Paschen (IR, n→3).',
    tags: ['Physics','modern physics','Bohr model','hydrogen atom'] },
  { q: 'Radioactive decay law',
    a: 'N = N₀e^(−λt). Activity A = λN = A₀e^(−λt). Half-life t₁/₂ = ln2/λ = 0.693/λ. Mean life τ = 1/λ = t₁/₂/0.693. α decay: −2p, −2n. β⁻: +1p, −1n. γ: no change.',
    tags: ['Physics','nuclear physics','radioactivity'] },
  { q: 'Nuclear binding energy and mass defect',
    a: 'Mass defect Δm = (Zmp + Nmn) − M_nucleus. Binding energy BE = Δm·c². 1 amu = 931.5 MeV/c². Binding energy per nucleon peaks at Fe-56. Fission and fusion both release energy.',
    tags: ['Physics','nuclear physics','binding energy'] },
  { q: 'What is p-n junction and forward bias?',
    a: 'p-n junction forms depletion layer with built-in potential. Forward bias: +ve to p-side, reduces barrier → large current. Reverse bias: increases barrier → tiny leakage current. Knee voltage ~0.7V for Si.',
    tags: ['Physics','semiconductor','p-n junction'] },

  // ── PHYSICS: Optics ───────────────────────────────────────────────────────
  { q: 'Snell\'s law and total internal reflection',
    a: 'n₁sinθ₁ = n₂sinθ₂. TIR occurs when light goes from denser to rarer medium and θ₁ > critical angle. sinθ_c = n₂/n₁. Applications: optical fibre, diamond brilliance.',
    tags: ['Physics','optics','Snell','total internal reflection'] },
  { q: 'Lens maker\'s equation and mirror formula',
    a: 'Mirror: 1/v + 1/u = 1/f = 2/R. Sign convention: distances measured from pole, +ve in direction of incident light. Lens: 1/v − 1/u = 1/f. Lens maker: 1/f = (n−1)[1/R₁ − 1/R₂]. Magnification m = −v/u.',
    tags: ['Physics','optics','lens','mirror'] },
  { q: 'Young\'s double slit experiment — fringe width',
    a: 'Fringe width β = λD/d. Bright fringe at path diff = nλ. Dark fringe at (2n−1)λ/2. Fringe width independent of n (equally spaced). Coherent sources required. Monochromatic light gives distinct fringes.',
    tags: ['Physics','optics','interference','YDSE','Young'] },

  // ── CHEMISTRY: Physical Chemistry ────────────────────────────────────────
  { q: 'What is the ideal gas law?',
    a: 'PV = nRT. R = 8.314 J/mol·K = 0.0821 L·atm/mol·K. STP: 0°C, 1 atm → 22.4 L/mol. Combined: P₁V₁/T₁ = P₂V₂/T₂. Real gas corrections: van der Waals (P + an²/V²)(V − nb) = nRT.',
    tags: ['Chemistry','physical chemistry','gas laws'] },
  { q: 'What is Hess\'s law?',
    a: 'The enthalpy change of a reaction is the same regardless of the pathway taken. ΔH_rxn = ΣΔH_products − ΣΔH_reactants (using standard enthalpies of formation). Useful when direct measurement is impossible.',
    tags: ['Chemistry','thermodynamics','Hess law','enthalpy'] },
  { q: 'Gibbs free energy and spontaneity',
    a: 'ΔG = ΔH − TΔS. Spontaneous if ΔG < 0. Standard: ΔG° = −RT ln K = −nFE°. At equilibrium: ΔG = 0. ΔH < 0 and ΔS > 0 → always spontaneous. ΔH > 0 and ΔS < 0 → never spontaneous.',
    tags: ['Chemistry','thermodynamics','Gibbs energy','spontaneity'] },
  { q: 'Chemical equilibrium and Le Chatelier\'s principle',
    a: 'K_c = [products]/[reactants] (equilibrium constant). Le Chatelier: system shifts to counteract a stress. Increase pressure → shift to fewer moles of gas. Add reactant → shift forward. Increase T → shift in endothermic direction.',
    tags: ['Chemistry','equilibrium','Le Chatelier'] },
  { q: 'What is pH? How is it related to H⁺ concentration?',
    a: 'pH = −log[H⁺]. pOH = −log[OH⁻]. pH + pOH = 14 at 25°C. Kw = [H⁺][OH⁻] = 10⁻¹⁴. Strong acid HCl 0.1M: pH = 1. Weak acid: need Ka and ICE table. pH of buffer: Henderson–Hasselbalch pH = pKa + log([A⁻]/[HA]).',
    tags: ['Chemistry','ionic equilibrium','pH','acids bases'] },
  { q: 'Raoult\'s law and vapour pressure',
    a: 'p_A = x_A · p°_A (Raoult\'s law for ideal solutions). Relative lowering of vapour pressure: (p° − p)/p° = x_solute. Boiling point elevation: ΔTb = Kb·m. Freezing point depression: ΔTf = Kf·m. Osmotic pressure: π = iMRT.',
    tags: ['Chemistry','solutions','colligative properties','Raoult'] },
  { q: 'Faraday\'s laws of electrolysis',
    a: '1st law: mass deposited ∝ charge passed: m = ZQ = ZIt.\n2nd law: masses deposited by same charge ∝ equivalent weights.\nZ = M/(n·F). F = 96500 C/mol. Example: 96500 C deposits 1 mol of monovalent metal.',
    tags: ['Chemistry','electrochemistry','Faraday electrolysis'] },
  { q: 'Nernst equation for electrode potential',
    a: 'E = E° − (RT/nF)ln Q = E° − (0.0592/n)log Q at 25°C. At equilibrium: E = 0, so E° = (0.0592/n)log K. Standard hydrogen electrode (SHE): E° = 0V. EMF of cell = E°_cathode − E°_anode.',
    tags: ['Chemistry','electrochemistry','Nernst','electrode potential'] },
  { q: 'Arrhenius equation — activation energy',
    a: 'k = Ae^(−Ea/RT). ln k = ln A − Ea/(RT). Plot of ln k vs 1/T gives slope = −Ea/R. Catalyst lowers activation energy without changing ΔH. Two-point form: ln(k₂/k₁) = (Ea/R)(1/T₁ − 1/T₂).',
    tags: ['Chemistry','chemical kinetics','Arrhenius','activation energy'] },
  { q: 'First order reaction half-life',
    a: 't₁/₂ = ln2/k = 0.693/k. Constant half-life independent of initial concentration. [A] = [A]₀e^(−kt). Integrated rate law: ln([A]₀/[A]) = kt. Unit of k: s⁻¹.',
    tags: ['Chemistry','chemical kinetics','first order','half life'] },
  { q: 'What are colligative properties?',
    a: 'Properties depending only on number of solute particles, not their nature:\n1. Vapour pressure lowering\n2. Boiling point elevation: ΔTb = iKb·m\n3. Freezing point depression: ΔTf = iKf·m\n4. Osmotic pressure: π = iMRT\nVan\'t Hoff factor i accounts for dissociation.',
    tags: ['Chemistry','solutions','colligative','osmosis'] },

  // ── CHEMISTRY: Organic Chemistry ─────────────────────────────────────────
  { q: 'What is the SN1 vs SN2 mechanism?',
    a: 'SN2: one step, backside attack, inversion of configuration (Walden inversion), 2nd order, favors primary substrates, polar aprotic solvents.\nSN1: two steps, carbocation intermediate, racemization, 1st order, favors tertiary, polar protic solvents.',
    tags: ['Chemistry','organic chemistry','SN1','SN2','substitution'] },
  { q: 'What is Markovnikov\'s rule?',
    a: 'In addition of HX to an alkene, H adds to the carbon with more H atoms (or: the positive species adds to give the more stable carbocation intermediate). Anti-Markovnikov addition occurs via free radical mechanism with peroxides.',
    tags: ['Chemistry','organic chemistry','Markovnikov','alkene','addition'] },
  { q: 'Aldol condensation reaction mechanism',
    a: 'Enolate ion attacks carbonyl carbon of another aldehyde/ketone → β-hydroxy carbonyl compound (aldol product). On heating → dehydration gives α,β-unsaturated carbonyl compound. Requires α-hydrogen. Base or acid catalysis.',
    tags: ['Chemistry','organic chemistry','aldol condensation','carbonyl'] },
  { q: 'What is the difference between SN1 and elimination E1 E2?',
    a: 'E2: concerted single step, anti-periplanar geometry, 2nd order, strong base, less hindered product (Hofmann) or more substituted (Zaitsev). E1: 2-step via carbocation, weak base, Zaitsev product. Compete with SN1/SN2.',
    tags: ['Chemistry','organic chemistry','elimination','E1','E2'] },
  { q: 'What is electrophilic aromatic substitution EAS?',
    a: 'Benzene attacks electrophile → arenium ion (sigma complex) → loses H⁺ to restore aromaticity. Activators: −OH, −NH₂, −OR (ortho/para directors). Deactivators: −NO₂, −CN, −COOH (meta directors). −Halogens: deactivating but o/p director.',
    tags: ['Chemistry','organic chemistry','EAS','benzene','aromatic'] },
  { q: 'What are optical isomers? Define chirality.',
    a: 'A chiral carbon has 4 different groups attached. Enantiomers: non-superimposable mirror images, same physical properties except optical rotation. Racemic mixture: equal R and S, zero net rotation. Diastereomers: stereoisomers that are not mirror images.',
    tags: ['Chemistry','organic chemistry','stereochemistry','chirality','optical isomers'] },
  { q: 'What is the test for aldehyde vs ketone?',
    a: 'Tollens test (silver mirror): only aldehydes. Fehling test (brick red Cu₂O): only aliphatic aldehydes. Iodoform test (CHI₃, yellow ppt): methyl ketones + acetaldehyde. Benedict\'s test: reducing sugars (aldehydes in sugar).',
    tags: ['Chemistry','organic chemistry','aldehyde','ketone','tests'] },

  // ── CHEMISTRY: Inorganic Chemistry ───────────────────────────────────────
  { q: 'What is the periodic trend in ionization energy?',
    a: 'IE increases across a period (left→right) — more protons, smaller radius, stronger hold. Decreases down a group — larger radius, shielding effect. Exceptions: IE₁(N) > IE₁(O) because N has half-filled 2p (stable). IE₁(Be) > IE₁(B) (2s vs 2p).',
    tags: ['Chemistry','periodic table','ionization energy','periodicity'] },
  { q: 'What is electronegativity? Pauling scale.',
    a: 'Electronegativity = ability to attract bonding electrons. Pauling scale: F = 4.0 (highest), Cs = 0.7 (lowest). Increases across period, decreases down group. Bond polarity determined by ΔEN. ΔEN > 1.7 → predominantly ionic.',
    tags: ['Chemistry','chemical bonding','electronegativity'] },
  { q: 'Hybridization: sp sp2 sp3 examples',
    a: 'sp: linear, 180°, BeCl₂, C₂H₂. sp²: trigonal planar, 120°, BF₃, C₂H₄, benzene. sp³: tetrahedral, 109.5°, CH₄. Lone pairs reduce bond angle: NH₃ (107°, sp³), H₂O (104.5°, sp³). VSEPR used for shape.',
    tags: ['Chemistry','chemical bonding','hybridization','VSEPR'] },
  { q: 'What is the reactivity order of halogens?',
    a: 'F₂ > Cl₂ > Br₂ > I₂ (oxidizing ability, electronegativity). Reverse for reducing power of halide ions: I⁻ > Br⁻ > Cl⁻ > F⁻. HX acid strength (aqueous): HI > HBr > HCl > HF. HF weakest because of H-bonding.',
    tags: ['Chemistry','inorganic','halogens','p-block'] },
  { q: 'Explain the reactivity of alkali metals with water',
    a: 'M + H₂O → MOH + ½H₂. Reactivity increases down group: Li < Na < K < Rb < Cs. K and above react vigorously/explosively. Li reacts slowly. Na fizzes. All form strongly basic hydroxides. Li most electropositive despite being smallest.',
    tags: ['Chemistry','inorganic','alkali metals','s-block'] },
  { q: 'What is the distinction between sigma and pi bonds?',
    a: 'σ bond: head-on overlap, rotation possible, single bonds are σ. π bond: sidewise overlap, prevents rotation (cis-trans isomerism), present in double and triple bonds. C=C: one σ + one π. C≡C: one σ + two π. π bonds weaker than σ.',
    tags: ['Chemistry','chemical bonding','sigma pi bond'] },

  // ── MATHEMATICS: Calculus ─────────────────────────────────────────────────
  { q: 'What is the chain rule in differentiation?',
    a: 'If y = f(g(x)), then dy/dx = f\'(g(x))·g\'(x). Example: d/dx[sin(x²)] = cos(x²)·2x. For implicit differentiation, differentiate both sides treating y as a function of x and use chain rule on y terms.',
    tags: ['Math','calculus','differentiation','chain rule'] },
  { q: 'Integration by parts formula',
    a: '∫u dv = uv − ∫v du. ILATE rule for choosing u: Inverse trig, Logarithm, Algebraic, Trigonometric, Exponential. Example: ∫x sin x dx → u=x, dv=sin x dx → answer: −x cos x + sin x + C.',
    tags: ['Math','calculus','integration','integration by parts'] },
  { q: 'What is the fundamental theorem of calculus?',
    a: 'Part 1: If F(x) = ∫ₐˣ f(t)dt, then F\'(x) = f(x). Part 2: ∫ₐᵇ f(x)dx = F(b) − F(a) where F is any antiderivative. Connects differentiation and integration.',
    tags: ['Math','calculus','fundamental theorem'] },
  { q: 'L\'Hôpital\'s rule — when and how to use',
    a: 'Use when limit gives 0/0 or ∞/∞ form. Then lim f(x)/g(x) = lim f\'(x)/g\'(x). Can apply repeatedly. Also works for 0·∞ (rewrite as fraction), 1^∞, 0⁰, ∞⁰ forms (take logarithm first).',
    tags: ['Math','calculus','limits','L\'Hopital'] },
  { q: 'What is the condition for a function to have a maximum or minimum?',
    a: 'First derivative test: f\'(x) = 0 at critical point. f\'\'(x) < 0 → local max. f\'\'(x) > 0 → local min. f\'\'(x) = 0 → use higher derivatives or sign-change test. Global extrema: compare all local extrema plus boundary values.',
    tags: ['Math','calculus','maxima minima','differentiation'] },
  { q: 'What is a definite integral and area under a curve?',
    a: '∫ₐᵇ f(x)dx gives signed area between f(x) and x-axis from a to b. Area always positive so take |∫|. For area between two curves: ∫ₐᵇ |f(x)−g(x)|dx. Split integral where f and g intersect.',
    tags: ['Math','calculus','definite integral','area'] },

  // ── MATHEMATICS: Algebra & Coordinate Geometry ───────────────────────────
  { q: 'Quadratic formula and discriminant',
    a: 'x = (−b ± √(b²−4ac)) / 2a. Discriminant Δ = b²−4ac. Δ > 0: two real roots. Δ = 0: one repeated root. Δ < 0: two complex conjugate roots. Sum of roots: −b/a. Product of roots: c/a.',
    tags: ['Math','algebra','quadratic','discriminant'] },
  { q: 'What is the equation of a circle?',
    a: 'Standard form: (x−h)² + (y−k)² = r². General form: x² + y² + 2gx + 2fy + c = 0. Centre (−g, −f), radius √(g²+f²−c). Condition: g²+f²−c > 0. Point inside/on/outside: substitute and compare with r².',
    tags: ['Math','coordinate geometry','circle'] },
  { q: 'What is a parabola equation and its properties?',
    a: 'Standard: y² = 4ax. Focus: (a, 0). Directrix: x = −a. Vertex: (0,0). Focal chord length: minimum = 4a (latus rectum). For y = ax² + bx + c: vertex at x = −b/2a. Focus = 1/(4a) above vertex.',
    tags: ['Math','coordinate geometry','parabola','conic'] },
  { q: 'Ellipse equation and properties',
    a: 'x²/a² + y²/b² = 1 (a > b). Semi-major axis a, semi-minor b. c² = a²−b². Eccentricity e = c/a < 1. Foci at (±c, 0). Sum of distances from foci = 2a (constant). Latus rectum length = 2b²/a.',
    tags: ['Math','coordinate geometry','ellipse','conic'] },
  { q: 'Binomial theorem expansion',
    a: '(a+b)ⁿ = Σ C(n,r) aⁿ⁻ʳ bʳ for r=0 to n. General term: T_(r+1) = C(n,r) aⁿ⁻ʳ bʳ. Middle term: for even n, T_(n/2+1). C(n,r) = n!/(r!(n−r)!). Sum of coefficients: substitute a=b=1 → 2ⁿ.',
    tags: ['Math','algebra','binomial theorem','combinatorics'] },
  { q: 'What is the arithmetic progression (AP) formula?',
    a: 'AP: a, a+d, a+2d,... nth term: aₙ = a + (n−1)d. Sum Sₙ = n/2[2a + (n−1)d] = n/2(a + l). For GP: aₙ = arⁿ⁻¹. Sum = a(rⁿ−1)/(r−1). Sum to infinity (|r|<1): a/(1−r).',
    tags: ['Math','sequences','AP','GP','progression'] },
  { q: 'What is a determinant? Properties of 3×3 determinant.',
    a: '|A| for 3×3: expand along any row/column using cofactors. Properties: |A| = 0 if two rows equal or one row zero. Interchanging rows flips sign. Scalar mult of one row multiplies |A| by scalar. |AB| = |A||B|.',
    tags: ['Math','matrices','determinant','linear algebra'] },
  { q: 'Permutation and combination formulas',
    a: 'Permutation ⁿPᵣ = n!/(n−r)! (order matters). Combination ⁿCᵣ = n!/(r!(n−r)!) (order doesn\'t matter). ⁿCᵣ = ⁿCₙ₋ᵣ. Pascal\'s identity: ⁿCᵣ = ⁿ⁻¹Cᵣ₋₁ + ⁿ⁻¹Cᵣ. Circular permutation: (n−1)!.',
    tags: ['Math','combinatorics','permutation','combination'] },

  // ── MATHEMATICS: Vectors & 3D ─────────────────────────────────────────────
  { q: 'Dot product and cross product formulas',
    a: 'Dot: A·B = |A||B|cosθ = AxBx + AyBy + AzBz. Scalar result. A⊥B if A·B=0. Cross: A×B = |A||B|sinθ n̂. |A×B| = area of parallelogram. A×A = 0. A×B = −B×A. i×j=k, j×k=i, k×i=j.',
    tags: ['Math','vectors','dot product','cross product'] },
  { q: 'Equation of a line and plane in 3D',
    a: 'Line through (x₁,y₁,z₁) with direction (a,b,c): (x−x₁)/a = (y−y₁)/b = (z−z₁)/c. Plane: ax+by+cz+d=0. Normal vector (a,b,c). Angle between line and plane: sinθ = |al+bm+cn|/√(a²+b²+c²)/√(l²+m²+n²).',
    tags: ['Math','3D geometry','vectors','line plane'] },

  // ── MATHEMATICS: Probability & Statistics ─────────────────────────────────
  { q: 'Bayes\' theorem formula',
    a: 'P(A|B) = P(B|A)·P(A) / P(B). Total probability: P(B) = ΣP(B|Aᵢ)·P(Aᵢ). Used when you know P(B|A) but want P(A|B). Example: diagnostic test accuracy.',
    tags: ['Math','probability','Bayes theorem','conditional probability'] },
  { q: 'Binomial distribution — mean and variance',
    a: 'P(X=r) = ⁿCᵣ pʳ (1−p)ⁿ⁻ʳ. Mean = np. Variance = np(1−p). SD = √(np(1−p)). Conditions: fixed n trials, each independent, probability p constant, two outcomes.',
    tags: ['Math','probability','binomial distribution','statistics'] },

  // ── BIOLOGY: Cell Biology ─────────────────────────────────────────────────
  { q: 'What is mitosis and what are its stages?',
    a: 'Mitosis: cell division producing 2 identical daughter cells (diploid). Stages: Prophase (chromatin condenses, spindle forms) → Metaphase (chromosomes align at equator) → Anaphase (chromatids separate to poles) → Telophase (nuclear envelope reforms) → Cytokinesis.',
    tags: ['Biology','cell division','mitosis'] },
  { q: 'Difference between mitosis and meiosis',
    a: 'Mitosis: 2 daughter cells, same ploidy (diploid→diploid), for growth and repair, no crossing over. Meiosis: 4 daughter cells, halved ploidy (diploid→haploid), for gamete formation, crossing over in prophase I → genetic variation.',
    tags: ['Biology','cell division','meiosis','mitosis'] },
  { q: 'What is the cell cycle? What are checkpoints?',
    a: 'G1 (growth) → S phase (DNA replication) → G2 (preparation) → M phase (mitosis). Checkpoints: G1/S checkpoint (size, DNA damage), G2/M checkpoint (complete replication), spindle checkpoint (correct chromosome attachment). Cyclins and CDKs regulate progression.',
    tags: ['Biology','cell cycle','cell biology'] },
  { q: 'What is the structure of DNA?',
    a: 'Double helix with sugar-phosphate backbone and base pairs: A-T (2 H-bonds), G-C (3 H-bonds). Antiparallel strands (5\'→3\' and 3\'→5\'). Chargaff\'s rules: [A]=[T], [G]=[C]. Watson-Crick model 1953.',
    tags: ['Biology','molecular biology','DNA','genetics'] },
  { q: 'What is the central dogma of molecular biology?',
    a: 'DNA → RNA → Protein. Transcription (nucleus): DNA template → mRNA using RNA polymerase. Translation (ribosome): mRNA → protein using tRNA and codons. Reverse transcription: RNA → DNA (retroviruses like HIV).',
    tags: ['Biology','molecular biology','central dogma','transcription','translation'] },
  { q: 'Explain Mendel\'s laws of inheritance',
    a: '1. Law of Segregation: alleles separate during gamete formation; each gamete gets one allele.\n2. Law of Independent Assortment: genes on different chromosomes assort independently. Monohybrid cross: 3:1 phenotype ratio (F2). Dihybrid: 9:3:3:1 ratio. Linked genes violate independent assortment.',
    tags: ['Biology','genetics','Mendel','inheritance'] },
  { q: 'What is the Hardy-Weinberg principle?',
    a: 'p + q = 1 (allele frequencies). p² + 2pq + q² = 1 (genotype frequencies). Equilibrium maintained if: no mutation, no selection, random mating, no genetic drift, no gene flow. Deviation indicates evolution is occurring.',
    tags: ['Biology','genetics','Hardy Weinberg','evolution','population genetics'] },
  { q: 'What are the components of the electron transport chain?',
    a: 'Complexes I-IV in inner mitochondrial membrane. NADH → Complex I → Coenzyme Q → Complex III → Cytochrome c → Complex IV → O₂. Proton gradient drives ATP synthase. Net: ~32-34 ATP from one glucose. FADH₂ enters at Complex II.',
    tags: ['Biology','respiration','electron transport chain','mitochondria','ATP'] },
  { q: 'Light reactions of photosynthesis',
    a: 'Occur in thylakoid membranes. Photosystem II absorbs light → splits water (photolysis) → O₂ released, electrons excited. PS I reduces NADP⁺ to NADPH. ATP synthesized via chemiosmosis. Products: ATP + NADPH (used in Calvin cycle).',
    tags: ['Biology','photosynthesis','light reactions','chloroplast'] },
  { q: 'What is the Calvin cycle?',
    a: 'Occurs in stroma. Three phases: Carbon fixation (CO₂ + RuBP via RuBisCo → 3-PGA), Reduction (3-PGA → G3P using ATP+NADPH), Regeneration of RuBP (ATP used). Net: 3CO₂ → 1 G3P. 6 turns → 1 glucose.',
    tags: ['Biology','photosynthesis','Calvin cycle','C3 plants'] },
  { q: 'What is the action potential in neurons?',
    a: 'Resting potential: −70mV (Na-K pump). Depolarization: Na⁺ channels open → +30mV. Repolarization: K⁺ channels open → return to −70mV. Hyperpolarization brief. Refractory period prevents backward propagation. All-or-nothing principle.',
    tags: ['Biology','neural','action potential','neuroscience'] },
  { q: 'What are the differences between plant and animal cells?',
    a: 'Plant cells HAVE: cell wall (cellulose), chloroplasts, large central vacuole, plasmodesmata. Animal cells HAVE: centrioles, lysosomes, smaller vacuoles. Both have: nucleus, mitochondria, ER, Golgi, ribosomes, cell membrane.',
    tags: ['Biology','cell biology','plant cell','animal cell'] },
  { q: 'What is PCR (polymerase chain reaction)?',
    a: 'Amplifies DNA in vitro. Steps: Denaturation (94°C, strands separate) → Annealing (50-60°C, primers bind) → Extension (72°C, Taq polymerase extends). Exponential amplification: n cycles → 2ⁿ copies. Used in diagnostics, forensics.',
    tags: ['Biology','molecular biology','PCR','biotechnology'] },
  { q: 'What is the role of hormones in the human body? Name key ones.',
    a: 'Insulin (pancreas): lowers blood glucose. Glucagon: raises blood glucose. ADH: water reabsorption in kidneys. Adrenaline: fight-or-flight. Thyroxine: metabolic rate. Growth hormone (GH). FSH/LH: reproduction. All hormones act via receptors.',
    tags: ['Biology','endocrinology','hormones','human physiology'] },

  // ── Mixed JEE-style ──────────────────────────────────────────────────────
  { q: 'What is dimensional analysis? How to use it?',
    a: 'Every physical quantity has dimensions [M^a L^b T^c ...]. Use to: check equation correctness (dimensions must match), derive relations, convert units. Cannot determine dimensionless constants. Example: [Force] = [MLT⁻²], [Energy] = [ML²T⁻²].',
    tags: ['Physics','dimensional analysis','general'] },
  { q: 'What is relative density and Archimedes principle?',
    a: 'Relative density (specific gravity) = density of substance / density of water at 4°C. Archimedes: buoyant force = weight of fluid displaced = ρ_fluid × V_submerged × g. Floats if ρ_object < ρ_fluid.',
    tags: ['Physics','fluid mechanics','Archimedes','buoyancy'] },
  { q: 'What is the speed of light and refractive index?',
    a: 'c = 3×10⁸ m/s in vacuum. Refractive index n = c/v = sin(θᵢ)/sin(θᵣ). Optical density vs physical density — not the same. For a slab: lateral shift = t·sin(i-r)/cos(r). Wavelength changes in medium, frequency doesn\'t.',
    tags: ['Physics','optics','refractive index','speed of light'] },
  { q: 'What is a catalyst? Explain catalysis types.',
    a: 'Catalyst: increases reaction rate without being consumed. Lowers activation energy. Doesn\'t change equilibrium position (affects both forward and reverse equally). Homogeneous: same phase as reactants. Heterogeneous: different phase. Enzyme catalysis: biological, highly specific, lock-and-key model.',
    tags: ['Chemistry','kinetics','catalyst','catalysis'] },
  { q: 'What is the mole concept?',
    a: '1 mole = 6.022×10²³ particles (Avogadro\'s number). Molar mass in g/mol numerically equals atomic/molecular mass in amu. Moles = mass/molar mass = volume at STP / 22.4 L = particles / 6.022×10²³. Molarity M = moles/litre.',
    tags: ['Chemistry','stoichiometry','mole concept'] },
  { q: 'What is the difference between accuracy and precision in measurement?',
    a: 'Accuracy: closeness to true value. Precision: reproducibility of measurements. High precision + low accuracy = systematic error. Random errors reduce precision. Significant figures indicate precision. Absolute error, relative error = absolute/mean, percentage error.',
    tags: ['Physics','measurement','errors','significant figures'] },
];

// ── BM25 implementation ───────────────────────────────────────────────────────

type InvertedIndex = Map<string, Map<number, number>>; // term → docId → term_freq

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

interface BM25Index {
  invertedIndex: InvertedIndex;
  docLengths:    number[];
  avgDocLen:     number;
  N:             number;         // total docs
}

function buildBM25Index(docs: QAPair[]): BM25Index {
  const invertedIndex: InvertedIndex = new Map();
  const docLengths: number[] = [];
  let totalLen = 0;

  for (let i = 0; i < docs.length; i++) {
    const tokens = tokenize(docs[i].q + ' ' + docs[i].tags.join(' '));
    docLengths.push(tokens.length);
    totalLen += tokens.length;

    const freqMap = new Map<string, number>();
    for (const t of tokens) freqMap.set(t, (freqMap.get(t) ?? 0) + 1);

    for (const [term, freq] of freqMap) {
      if (!invertedIndex.has(term)) invertedIndex.set(term, new Map());
      invertedIndex.get(term)!.set(i, freq);
    }
  }

  return { invertedIndex, docLengths, avgDocLen: totalLen / docs.length, N: docs.length };
}

function bm25Score(
  query: string,
  docId: number,
  idx: BM25Index,
): number {
  const terms = tokenize(query);
  const dl    = idx.docLengths[docId];
  let score   = 0;

  for (const term of terms) {
    const postings = idx.invertedIndex.get(term);
    if (!postings) continue;

    const tf  = postings.get(docId) ?? 0;
    if (!tf) continue;

    const df  = postings.size;
    const idf = Math.log((idx.N - df + 0.5) / (df + 0.5) + 1);
    const num = tf * (K1 + 1);
    const den = tf + K1 * (1 - B + B * dl / idx.avgDocLen);
    score += idf * (num / den);
  }

  return score;
}

// ── Singleton index ───────────────────────────────────────────────────────────
let _idx: BM25Index | null = null;
function getIndex(): BM25Index {
  if (!_idx) _idx = buildBM25Index(QA_BANK);
  return _idx;
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface FallbackResult {
  answer:    string;
  score:     number;
  question:  string;
}

export function searchFallbackQA(
  query:   string,
  topK:    number  = 3,
  minScore: number = 0.5,
): FallbackResult[] {
  const idx = getIndex();
  const scores: Array<{ id: number; score: number }> = [];

  // Score all docs
  for (let i = 0; i < QA_BANK.length; i++) {
    const s = bm25Score(query, i, idx);
    if (s >= minScore) scores.push({ id: i, score: s });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map(({ id, score }) => ({
    answer:   QA_BANK[id].a,
    score,
    question: QA_BANK[id].q,
  }));
}

export function getBestFallbackAnswer(query: string): string | null {
  const results = searchFallbackQA(query, 1, 0.3);
  if (!results.length) return null;
  const best = results[0];
  return `${best.answer}\n\n---\n_Offline mode — serving from pre-loaded question bank. Matched: "${best.question}"_`;
}
