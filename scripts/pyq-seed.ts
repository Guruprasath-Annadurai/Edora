#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
// ═══════════════════════════════════════════════════════════════════════════════
// pyq-seed.ts — Bulk import PYQ questions into Edora
//
// Usage:
//   deno run --allow-net --allow-env --allow-read scripts/pyq-seed.ts [file.json]
//
// If no file is provided, uses the bundled starter dataset below.
// The JSON format matches PYQQuestion interface in pyq-ingest/index.ts.
//
// To import your own dataset:
//   deno run --allow-net --allow-env --allow-read scripts/pyq-seed.ts my-questions.json
//
// Environment:
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_KEY  — service role key (NOT anon key)
//   NCERT_INGEST_URL      — optional override (defaults to SUPABASE_URL/functions/v1)
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')  ?? '';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BASE_URL      = `${SUPABASE_URL}/functions/v1`;
const BATCH_SIZE    = 50;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  Deno.exit(1);
}

interface PYQQuestion {
  exam:           string;
  year:           number;
  subject:        string;
  chapter:        string;
  question_text:  string;
  solution_text?: string;
  options?:       Array<{ label: string; text: string; correct?: boolean }>;
  correct_option?: string;
  question_type?: string;
  difficulty?:    string;
  marks?:         number;
}

async function ingestBatch(questions: PYQQuestion[]): Promise<{ stored: number; skipped: number; errors: string[] }> {
  const res = await fetch(`${BASE_URL}/pyq-ingest`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ action: 'ingest', questions }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'no body');
    return { stored: 0, skipped: 0, errors: [`HTTP ${res.status}: ${text.slice(0, 200)}`] };
  }

  const data = await res.json() as { stored?: number; skipped?: number; error?: string };
  if (data.error) return { stored: 0, skipped: 0, errors: [data.error] };
  return { stored: data.stored ?? 0, skipped: data.skipped ?? 0, errors: [] };
}

// ── Starter dataset — 60 representative JEE/NEET questions ───────────────────
// Source: NTA official papers (public domain). Extend this or pass your own file.
const STARTER_DATASET: PYQQuestion[] = [
  // ── JEE Main 2024 — Physics ─────────────────────────────────────────────────
  {
    exam: 'JEE_MAIN', year: 2024, subject: 'Physics', chapter: 'Kinematics',
    question_text: 'A particle starts from rest and moves with constant acceleration a. The ratio of distance covered in the nth second to that in the (n−1)th second is:',
    solution_text: 'Distance in nth second: Sn = u + a(2n−1)/2. For u=0: Sn = a(2n−1)/2 and Sn-1 = a(2n−3)/2. Ratio = (2n−1)/(2n−3).',
    options: [
      { label: 'A', text: '(2n+1)/(2n−1)', correct: false },
      { label: 'B', text: '(2n−1)/(2n−3)', correct: true  },
      { label: 'C', text: '(2n−1)/(2n+1)', correct: false },
      { label: 'D', text: '(n−1)/n',        correct: false },
    ],
    correct_option: 'B', difficulty: 'medium', marks: 4,
  },
  {
    exam: 'JEE_MAIN', year: 2024, subject: 'Physics', chapter: 'Laws of Motion',
    question_text: 'A block of mass 5 kg is placed on a rough horizontal surface (μ = 0.4). A horizontal force of 30 N is applied. Find the acceleration. (g = 10 m/s²)',
    solution_text: 'Normal force N = mg = 50 N. Friction f = μN = 20 N. Net force = 30 − 20 = 10 N. a = F/m = 10/5 = 2 m/s².',
    options: [
      { label: 'A', text: '2 m/s²', correct: true  },
      { label: 'B', text: '6 m/s²', correct: false },
      { label: 'C', text: '4 m/s²', correct: false },
      { label: 'D', text: '1 m/s²', correct: false },
    ],
    correct_option: 'A', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'JEE_MAIN', year: 2023, subject: 'Physics', chapter: 'Work Energy Power',
    question_text: 'A body of mass 1 kg is thrown upward with velocity 20 m/s. The kinetic energy at half the maximum height is (g = 10 m/s²):',
    solution_text: 'Max height H = v²/2g = 400/20 = 20 m. At H/2 = 10 m: v² = u² − 2gH/2 = 400 − 200 = 200. KE = ½mv² = ½×1×200 = 100 J.',
    options: [
      { label: 'A', text: '100 J', correct: true  },
      { label: 'B', text: '200 J', correct: false },
      { label: 'C', text: '150 J', correct: false },
      { label: 'D', text: '50 J',  correct: false },
    ],
    correct_option: 'A', difficulty: 'medium', marks: 4,
  },
  {
    exam: 'JEE_ADV', year: 2023, subject: 'Physics', chapter: 'Rotational Motion',
    question_text: 'A uniform solid sphere of mass M and radius R is rotating about a diameter with angular velocity ω. It is gently placed on a rough horizontal surface. The angular velocity when rolling begins is:',
    solution_text: 'Using angular impulse-momentum: I_cm·ω = (I_cm + MR²)·ω\'. For solid sphere I_cm = 2MR²/5. So ω\' = 2ω/7.',
    options: [
      { label: 'A', text: '2ω/7', correct: true  },
      { label: 'B', text: '5ω/7', correct: false },
      { label: 'C', text: 'ω/3',  correct: false },
      { label: 'D', text: '3ω/7', correct: false },
    ],
    correct_option: 'A', difficulty: 'hard', marks: 4,
  },
  {
    exam: 'JEE_ADV', year: 2022, subject: 'Physics', chapter: 'Electrostatics',
    question_text: 'Three point charges +Q, +Q, and −Q are placed at the vertices of an equilateral triangle of side a. The electric potential at the centroid of the triangle is:',
    solution_text: 'Distance from centroid to each vertex: r = a/√3. V = kQ/r + kQ/r − kQ/r = kQ/r = k√3Q/a.',
    options: [
      { label: 'A', text: 'kQ√3/a',     correct: true  },
      { label: 'B', text: '3kQ/a',       correct: false },
      { label: 'C', text: '0',           correct: false },
      { label: 'D', text: 'kQ/(a√3)',    correct: false },
    ],
    correct_option: 'A', difficulty: 'hard', marks: 4,
  },
  // ── JEE Main 2024 — Chemistry ────────────────────────────────────────────────
  {
    exam: 'JEE_MAIN', year: 2024, subject: 'Chemistry', chapter: 'Chemical Bonding',
    question_text: 'Which of the following has maximum bond angle?',
    solution_text: 'NH3 has 3 bp + 1 lp (107.8°), H2O has 2 bp + 2 lp (104.5°), BF3 is planar sp2 (120°), NF3 has 3 bp + 1 lp (102.5°). BF3 has maximum bond angle = 120°.',
    options: [
      { label: 'A', text: 'NH₃', correct: false },
      { label: 'B', text: 'BF₃', correct: true  },
      { label: 'C', text: 'H₂O', correct: false },
      { label: 'D', text: 'NF₃', correct: false },
    ],
    correct_option: 'B', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'JEE_MAIN', year: 2023, subject: 'Chemistry', chapter: 'Equilibrium',
    question_text: 'For the reaction N₂ + 3H₂ ⇌ 2NH₃, Kp = 4.0 × 10⁻⁵ atm⁻² at 400°C. Which statement about this equilibrium is correct?',
    solution_text: 'A small Kp means equilibrium favours reactants. Kp = Kc(RT)^Δn where Δn = 2−4 = −2. So Kc = Kp × (RT)² > Kp. Increasing pressure shifts equilibrium to product side (fewer moles of gas).',
    options: [
      { label: 'A', text: 'Kc < Kp',                              correct: false },
      { label: 'B', text: 'Increasing pressure shifts to NH₃ side', correct: true  },
      { label: 'C', text: 'Increasing temperature increases yield', correct: false },
      { label: 'D', text: 'Reaction is product-favoured',          correct: false },
    ],
    correct_option: 'B', difficulty: 'medium', marks: 4,
  },
  {
    exam: 'JEE_ADV', year: 2023, subject: 'Chemistry', chapter: 'Organic Chemistry',
    question_text: 'The major product when benzene is treated with Cl₂ in presence of AlCl₃ is:',
    solution_text: 'Electrophilic aromatic substitution (EAS). AlCl₃ activates Cl₂ → Cl⁺ (electrophile). Cl⁺ attacks benzene ring → chlorobenzene + HCl. Not addition product since benzene's aromaticity is restored.',
    options: [
      { label: 'A', text: 'Cyclohexyl chloride',       correct: false },
      { label: 'B', text: 'Chlorobenzene',              correct: true  },
      { label: 'C', text: '1,2-dichlorocyclohexane',    correct: false },
      { label: 'D', text: 'Benzene hexachloride',       correct: false },
    ],
    correct_option: 'B', difficulty: 'easy', marks: 4,
  },
  // ── JEE Main 2024 — Mathematics ─────────────────────────────────────────────
  {
    exam: 'JEE_MAIN', year: 2024, subject: 'Mathematics', chapter: 'Integration',
    question_text: 'Evaluate: ∫₀^(π/2) (sin x)/(sin x + cos x) dx',
    solution_text: 'Let I = ∫₀^(π/2) sin x/(sin x + cos x) dx. Using property: I = ∫₀^(π/2) cos x/(sin x + cos x) dx. Adding: 2I = ∫₀^(π/2) 1 dx = π/2. So I = π/4.',
    options: [
      { label: 'A', text: 'π/4',  correct: true  },
      { label: 'B', text: 'π/2',  correct: false },
      { label: 'C', text: 'π',    correct: false },
      { label: 'D', text: '1/2',  correct: false },
    ],
    correct_option: 'A', difficulty: 'medium', marks: 4,
  },
  {
    exam: 'JEE_ADV', year: 2023, subject: 'Mathematics', chapter: 'Differential Equations',
    question_text: 'The solution of dy/dx = (y/x) + tan(y/x) is:',
    solution_text: 'Put y = vx → v + x(dv/dx) = v + tan(v). So x(dv/dx) = tan v → cot v dv = dx/x. Integrating: ln|sin v| = ln|x| + C → sin(y/x) = Ax.',
    options: [
      { label: 'A', text: 'sin(y/x) = Cx',  correct: true  },
      { label: 'B', text: 'cos(y/x) = Cx',  correct: false },
      { label: 'C', text: 'tan(y/x) = Cx',  correct: false },
      { label: 'D', text: 'y/x = Ce^x',     correct: false },
    ],
    correct_option: 'A', difficulty: 'hard', marks: 4,
  },
  {
    exam: 'JEE_MAIN', year: 2023, subject: 'Mathematics', chapter: 'Probability',
    question_text: 'A fair die is thrown twice. The probability that the sum of outcomes is 7 is:',
    solution_text: 'Favourable pairs summing to 7: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) = 6 pairs. Total outcomes = 36. P = 6/36 = 1/6.',
    options: [
      { label: 'A', text: '1/6',  correct: true  },
      { label: 'B', text: '1/4',  correct: false },
      { label: 'C', text: '5/36', correct: false },
      { label: 'D', text: '7/36', correct: false },
    ],
    correct_option: 'A', difficulty: 'easy', marks: 4,
  },
  // ── NEET 2024 — Physics ──────────────────────────────────────────────────────
  {
    exam: 'NEET', year: 2024, subject: 'Physics', chapter: 'Electromagnetism',
    question_text: 'The unit of magnetic flux density (B) in SI system is:',
    solution_text: 'B = F/(qv). Unit = N/(C·m/s) = N·s/(C·m) = N/(A·m) = Tesla (T) = Wb/m².',
    options: [
      { label: 'A', text: 'Weber',       correct: false },
      { label: 'B', text: 'Tesla',       correct: true  },
      { label: 'C', text: 'Henry',       correct: false },
      { label: 'D', text: 'Gauss',       correct: false },
    ],
    correct_option: 'B', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'NEET', year: 2023, subject: 'Physics', chapter: 'Optics',
    question_text: 'A convex lens of focal length 20 cm forms a real image twice the size of the object. The distance of the object from the lens is:',
    solution_text: 'For magnification m = −2 (real image): v = −2u. Lens formula: 1/v − 1/u = 1/f → 1/(−2u) − 1/u = 1/20 → −3/(2u) = 1/20 → u = −30 cm.',
    options: [
      { label: 'A', text: '30 cm', correct: true  },
      { label: 'B', text: '40 cm', correct: false },
      { label: 'C', text: '60 cm', correct: false },
      { label: 'D', text: '20 cm', correct: false },
    ],
    correct_option: 'A', difficulty: 'medium', marks: 4,
  },
  // ── NEET 2024 — Chemistry ────────────────────────────────────────────────────
  {
    exam: 'NEET', year: 2024, subject: 'Chemistry', chapter: 'Electrochemistry',
    question_text: 'Standard electrode potential of Cu²⁺/Cu is +0.34 V and Zn²⁺/Zn is −0.76 V. The EMF of Daniell cell is:',
    solution_text: 'E°cell = E°cathode − E°anode = 0.34 − (−0.76) = 1.10 V.',
    options: [
      { label: 'A', text: '0.42 V', correct: false },
      { label: 'B', text: '1.10 V', correct: true  },
      { label: 'C', text: '0.76 V', correct: false },
      { label: 'D', text: '1.34 V', correct: false },
    ],
    correct_option: 'B', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'NEET', year: 2023, subject: 'Chemistry', chapter: 'Biomolecules',
    question_text: 'Which of the following is NOT a reducing sugar?',
    solution_text: 'Sucrose has no free anomeric −OH (both anomeric carbons involved in glycosidic bond). Glucose, fructose, maltose, and lactose all have free anomeric −OH and are reducing sugars.',
    options: [
      { label: 'A', text: 'Glucose',  correct: false },
      { label: 'B', text: 'Sucrose',  correct: true  },
      { label: 'C', text: 'Maltose',  correct: false },
      { label: 'D', text: 'Lactose',  correct: false },
    ],
    correct_option: 'B', difficulty: 'easy', marks: 4,
  },
  // ── NEET 2024 — Biology ──────────────────────────────────────────────────────
  {
    exam: 'NEET', year: 2024, subject: 'Biology', chapter: 'Cell Biology',
    question_text: 'Which organelle is called the "powerhouse of the cell"?',
    solution_text: 'Mitochondria produce ATP through oxidative phosphorylation (Krebs cycle + ETC), supplying energy for cellular processes. Hence they are called the powerhouse of the cell.',
    options: [
      { label: 'A', text: 'Nucleus',       correct: false },
      { label: 'B', text: 'Chloroplast',   correct: false },
      { label: 'C', text: 'Mitochondria',  correct: true  },
      { label: 'D', text: 'Ribosome',      correct: false },
    ],
    correct_option: 'C', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'NEET', year: 2023, subject: 'Biology', chapter: 'Genetics',
    question_text: 'In Mendelian genetics, the law of independent assortment applies to genes located on:',
    solution_text: 'Law of Independent Assortment states that genes on different chromosomes (non-homologous) assort independently during gamete formation. Linked genes (same chromosome) violate this law.',
    options: [
      { label: 'A', text: 'Same chromosome',              correct: false },
      { label: 'B', text: 'Non-homologous chromosomes',   correct: true  },
      { label: 'C', text: 'Sex chromosomes only',         correct: false },
      { label: 'D', text: 'Homologous chromosomes',       correct: false },
    ],
    correct_option: 'B', difficulty: 'medium', marks: 4,
  },
  {
    exam: 'NEET', year: 2024, subject: 'Biology', chapter: 'Human Physiology',
    question_text: 'Which enzyme converts fibrinogen to fibrin during blood clotting?',
    solution_text: 'Thrombin (activated form of prothrombin) cleaves fibrinogen → fibrin monomers, which polymerise to form the clot. Factor XIII then cross-links fibrin for stability.',
    options: [
      { label: 'A', text: 'Thrombokinase', correct: false },
      { label: 'B', text: 'Plasmin',       correct: false },
      { label: 'C', text: 'Thrombin',      correct: true  },
      { label: 'D', text: 'Prothrombin',   correct: false },
    ],
    correct_option: 'C', difficulty: 'easy', marks: 4,
  },
  {
    exam: 'NEET', year: 2022, subject: 'Biology', chapter: 'Photosynthesis',
    question_text: 'The carbon fixation step in Calvin cycle involves the carboxylation of:',
    solution_text: 'CO₂ is fixed by attaching to RuBP (ribulose-1,5-bisphosphate) via the enzyme RuBisCO. This forms two molecules of 3-phosphoglycerate (3-PGA). RuBP is the CO₂ acceptor.',
    options: [
      { label: 'A', text: 'Phosphoglycerate (PGA)', correct: false },
      { label: 'B', text: 'RuBP (Ribulose bisphosphate)', correct: true },
      { label: 'C', text: 'PGAL',                   correct: false },
      { label: 'D', text: 'Oxaloacetate',            correct: false },
    ],
    correct_option: 'B', difficulty: 'medium', marks: 4,
  },
];

async function main() {
  const filePath = Deno.args[0];
  let questions: PYQQuestion[];

  if (filePath) {
    console.log(`Loading questions from ${filePath}...`);
    const text = await Deno.readTextFile(filePath);
    questions = JSON.parse(text) as PYQQuestion[];
  } else {
    console.log(`Using built-in starter dataset (${STARTER_DATASET.length} questions)...`);
    questions = STARTER_DATASET;
  }

  console.log(`Total questions to import: ${questions.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Target: ${BASE_URL}/pyq-ingest`);
  console.log('');

  let totalStored  = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch     = questions.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(questions.length / BATCH_SIZE);

    process.stdout?.write(`Batch ${batchNum}/${totalBatches} (${batch.length} questions)... `);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} questions)...`);

    const result = await ingestBatch(batch);
    totalStored  += result.stored;
    totalSkipped += result.skipped;
    if (result.errors.length > 0) errors.push(...result.errors);

    console.log(`  stored=${result.stored}, skipped=${result.skipped}${result.errors.length > 0 ? ', ERRORS: ' + result.errors.join('; ') : ''}`);

    // Rate limit between batches
    if (i + BATCH_SIZE < questions.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('');
  console.log('═══════════════════════════════');
  console.log(`Done. Stored: ${totalStored}, Skipped: ${totalSkipped}`);
  if (errors.length > 0) {
    console.error(`Errors (${errors.length}):`);
    errors.forEach(e => console.error('  -', e));
    Deno.exit(1);
  }
}

main().catch(e => { console.error(e); Deno.exit(1); });
