// CAT syllabus — curated, static topic tree backing a persistent "covered vs.
// remaining" checklist (see cat_syllabus_progress table, CATSyllabusPage.tsx).
//
// IMPORTANT — read before editing: IIM does NOT publish an official CAT
// syllabus. There is no such document. What follows was compiled by
// cross-referencing three independent, reputable CAT-prep sources
// (cracku.in, mbauniverse.com, mba.hitbullseye.com) in August 2026, all of
// which independently converge on the same section/topic breakdown derived
// from analysing the last 10 years of actual CAT papers. Where sources
// listed overlapping sub-topics under slightly different names, the more
// specific/common naming was kept. CAT_SYLLABUS_DISCLAIMER below must be
// shown wherever this data renders — don't strip it out or soften it into
// implying this is an official IIM document.

export interface SyllabusItem {
  id: string;
  label: string;
}

export interface SyllabusGroup {
  id: string;
  label: string;
  /** Approximate share of that section's questions, from 5-year weightage analysis. Omitted where sources didn't give a stable number. */
  weight?: string;
  items: SyllabusItem[];
}

export interface SyllabusSection {
  id: 'VARC' | 'DILR' | 'QA';
  label: string;
  color: string;
  groups: SyllabusGroup[];
}

export const CAT_SYLLABUS_DISCLAIMER =
  "IIM does not publish an official CAT syllabus — there is no such document. This list is compiled from analysing the last 10 years of actual CAT papers, cross-checked across multiple independent exam-prep sources. Treat it as a strong, evidence-based study guide, not an official IIM document.";

export const CAT_SYLLABUS: SyllabusSection[] = [
  {
    id: 'VARC',
    label: 'Verbal Ability & Reading Comprehension',
    color: '#F59E0B',
    groups: [
      {
        id: 'varc.rc',
        label: 'Reading Comprehension',
        weight: '~65-70% of VARC (16 of 24 Qs)',
        items: [
          { id: 'varc.rc.literature',       label: 'Literature & fiction passages' },
          { id: 'varc.rc.business_econ',    label: 'Business & economics passages' },
          { id: 'varc.rc.science_tech',     label: 'Science & technology passages' },
          { id: 'varc.rc.philosophy',       label: 'Philosophy & abstract-idea passages' },
          { id: 'varc.rc.social_science',   label: 'Social science & sociology passages' },
          { id: 'varc.rc.environment',      label: 'Environment & ecology passages' },
          { id: 'varc.rc.history',          label: 'History passages' },
          { id: 'varc.rc.arts_culture',     label: 'Arts & culture passages' },
          { id: 'varc.rc.main_idea',        label: 'Main idea / central theme questions' },
          { id: 'varc.rc.inference',        label: 'Inference-based questions' },
          { id: 'varc.rc.tone_purpose',      label: "Tone & author's-purpose questions" },
          { id: 'varc.rc.detail',           label: 'Detail-based / fact-retrieval questions' },
        ],
      },
      {
        id: 'varc.va',
        label: 'Verbal Ability',
        weight: '~30-35% of VARC (8 of 24 Qs)',
        items: [
          { id: 'varc.va.para_jumbles',     label: 'Para Jumbles (TITA)' },
          { id: 'varc.va.para_summary',     label: 'Para Summary (MCQ)' },
          { id: 'varc.va.odd_sentence',     label: 'Odd Sentence / Odd One Out (TITA)' },
          { id: 'varc.va.para_completion',  label: 'Paragraph / Sentence Completion (MCQ)' },
        ],
      },
    ],
  },
  {
    id: 'DILR',
    label: 'Data Interpretation & Logical Reasoning',
    color: '#818CF8',
    groups: [
      {
        id: 'dilr.di',
        label: 'Data Interpretation',
        items: [
          { id: 'dilr.di.tables',          label: 'Data Tables' },
          { id: 'dilr.di.bar_graphs',      label: 'Bar Graphs' },
          { id: 'dilr.di.line_charts',     label: 'Line Charts / Graphs' },
          { id: 'dilr.di.pie_charts',      label: 'Pie Charts' },
          { id: 'dilr.di.venn',            label: 'Venn Diagrams (DI)' },
          { id: 'dilr.di.mixed_graphs',    label: 'Mixed / Combination Graphs' },
          { id: 'dilr.di.caselets',        label: 'Caselets' },
          { id: 'dilr.di.data_sufficiency', label: 'Data Sufficiency' },
        ],
      },
      {
        id: 'dilr.lr',
        label: 'Logical Reasoning',
        items: [
          { id: 'dilr.lr.seating',         label: 'Seating Arrangements (linear, circular, rectangular)' },
          { id: 'dilr.lr.blood_relations', label: 'Blood Relations' },
          { id: 'dilr.lr.syllogisms',      label: 'Syllogisms' },
          { id: 'dilr.lr.coding_decoding', label: 'Coding–Decoding' },
          { id: 'dilr.lr.direction_sense', label: 'Direction Sense' },
          { id: 'dilr.lr.puzzles',         label: 'Constraint-based & matching puzzles' },
          { id: 'dilr.lr.venn_set_theory', label: 'Venn Diagrams & Set Theory (LR)' },
          { id: 'dilr.lr.input_output',    label: 'Input–Output' },
          { id: 'dilr.lr.clocks_calendars', label: 'Clocks & Calendars' },
          { id: 'dilr.lr.games_tournaments', label: 'Games & Tournaments' },
          { id: 'dilr.lr.truth_lie',       label: 'Truth & Lie problems' },
          { id: 'dilr.lr.quant_based_lr',  label: 'Quant-based LR' },
          { id: 'dilr.lr.scheduling',      label: 'Scheduling' },
          { id: 'dilr.lr.logical_sequences', label: 'Logical Sequences' },
        ],
      },
    ],
  },
  {
    id: 'QA',
    label: 'Quantitative Aptitude',
    color: '#34D399',
    groups: [
      {
        id: 'qa.arithmetic',
        label: 'Arithmetic',
        weight: '~38% of QA',
        items: [
          { id: 'qa.arith.ratio_proportion', label: 'Ratio & Proportion' },
          { id: 'qa.arith.percentages',      label: 'Percentages, Profit & Loss, Discounts' },
          { id: 'qa.arith.averages',         label: 'Averages (simple, weighted, combined)' },
          { id: 'qa.arith.time_work',        label: 'Time & Work, Pipes & Cisterns' },
          { id: 'qa.arith.tsd',              label: 'Time, Speed & Distance, Trains, Boats & Streams' },
          { id: 'qa.arith.interest',         label: 'Simple & Compound Interest' },
          { id: 'qa.arith.mixtures',         label: 'Mixtures & Allegations' },
          { id: 'qa.arith.lcm_hcf',          label: 'LCM & HCF' },
        ],
      },
      {
        id: 'qa.algebra',
        label: 'Algebra',
        weight: '~34% of QA',
        items: [
          { id: 'qa.algebra.linear_eq',      label: 'Linear Equations (single & multi-variable)' },
          { id: 'qa.algebra.quadratic_eq',   label: 'Quadratic Equations (roots, nature, formation)' },
          { id: 'qa.algebra.polynomials',    label: 'Polynomials (Remainder & Factor theorems)' },
          { id: 'qa.algebra.inequalities',   label: 'Inequalities (linear, quadratic, modulus)' },
          { id: 'qa.algebra.logs_surds',     label: 'Logarithms, Surds & Indices' },
          { id: 'qa.algebra.functions',      label: 'Functions (domain, range, composition, inverse)' },
          { id: 'qa.algebra.progressions',   label: 'Progressions (AP, GP, HP, AGP)' },
          { id: 'qa.algebra.complex_numbers', label: 'Complex Numbers' },
        ],
      },
      {
        id: 'qa.geometry',
        label: 'Geometry & Mensuration',
        weight: '~15% of QA',
        items: [
          { id: 'qa.geo.triangles_lines',    label: 'Triangles, Lines & Angles' },
          { id: 'qa.geo.quadrilaterals',     label: 'Quadrilaterals' },
          { id: 'qa.geo.circles',            label: 'Circles' },
          { id: 'qa.geo.theorems',           label: 'Key theorems (Pythagoras, Midpoint, Apollonius, Basic Proportionality, Angle Bisector)' },
          { id: 'qa.geo.coordinate',         label: 'Coordinate Geometry' },
          { id: 'qa.geo.mensuration',        label: 'Mensuration — 2D & 3D solids (cubes, cylinders, cones, spheres, frustum)' },
          { id: 'qa.geo.trigonometry',       label: 'Trigonometry (ratios, identities, heights & distances)' },
        ],
      },
      {
        id: 'qa.number_systems',
        label: 'Number Systems',
        weight: '~8% of QA',
        items: [
          { id: 'qa.ns.digits_remainders',  label: 'Digits & Remainders' },
          { id: 'qa.ns.factors_divisors',   label: 'Factors & Divisors' },
          { id: 'qa.ns.base_systems',       label: 'Base Systems' },
          { id: 'qa.ns.eulers_function',    label: "Euler's function & applications" },
        ],
      },
      {
        id: 'qa.modern_math',
        label: 'Modern Math',
        weight: '~5% of QA',
        items: [
          { id: 'qa.mm.permutation_combination', label: 'Permutation & Combination' },
          { id: 'qa.mm.probability',         label: 'Probability' },
          { id: 'qa.mm.set_theory',          label: 'Set Theory' },
          { id: 'qa.mm.sequence_series',     label: 'Sequence & Series (applications)' },
          { id: 'qa.mm.binomial_theorem',    label: 'Binomial Theorem' },
        ],
      },
    ],
  },
];

export const CAT_SYLLABUS_TOTAL_ITEMS = CAT_SYLLABUS.reduce(
  (sum, section) => sum + section.groups.reduce((s, g) => s + g.items.length, 0),
  0
);
