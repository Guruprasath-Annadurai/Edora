-- ═══════════════════════════════════════════════════════════════════════════════
-- Concept Aliases + IAP store columns — upgrade 9
--
-- 1. concept_aliases table — maps free-text subtopic strings → concept_graph nodes
-- 2. expand_weak_concepts updated — checks aliases before ILIKE fallback
-- 3. subscriptions table — add store + rc_event_id for RevenueCat native IAP
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. concept_aliases table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_aliases (
  alias   TEXT PRIMARY KEY,    -- lowercased user-typed or NCERT text form
  concept TEXT NOT NULL REFERENCES public.concept_graph(concept) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS concept_aliases_concept_idx ON public.concept_aliases (concept);

-- ── 2. Seed — 250+ aliases covering JEE/NEET corpus ─────────────────────────
INSERT INTO public.concept_aliases (alias, concept) VALUES
-- ── Physics: Mechanics ───────────────────────────────────────────────────────
  ('motion in a straight line',    'kinematics_1d'),
  ('rectilinear motion',           'kinematics_1d'),
  ('1d kinematics',                'kinematics_1d'),
  ('uniform motion',               'kinematics_1d'),
  ('non-uniform motion',           'kinematics_1d'),
  ('displacement velocity acceleration', 'kinematics_1d'),
  ('equations of motion',         'kinematics_1d'),
  ('motion in a plane',           'kinematics_2d'),
  ('2d kinematics',               'kinematics_2d'),
  ('vector addition',             'vectors'),
  ('resolution of vectors',       'vectors'),
  ('dot product',                 'vectors'),
  ('cross product',               'vectors'),
  ('projectile',                  'projectile_motion'),
  ('projectile motion',           'projectile_motion'),
  ('range of projectile',         'projectile_motion'),
  ('laws of motion',              'newton_laws'),
  ('newton''s laws',              'newton_laws'),
  ('newton''s first law',         'newton_laws'),
  ('newton''s second law',        'newton_laws'),
  ('newton''s third law',         'newton_laws'),
  ('f = ma',                      'newton_laws'),
  ('inertia',                     'newton_laws'),
  ('free body diagram',           'newton_laws'),
  ('friction',                    'friction'),
  ('static friction',             'friction'),
  ('kinetic friction',            'friction'),
  ('coefficient of friction',     'friction'),
  ('work energy theorem',         'work_energy'),
  ('work and energy',             'work_energy'),
  ('kinetic energy',              'work_energy'),
  ('potential energy',            'work_energy'),
  ('conservation of energy',      'work_energy'),
  ('power',                       'power'),
  ('momentum',                    'collision'),
  ('conservation of momentum',    'collision'),
  ('elastic collision',           'collision'),
  ('inelastic collision',         'collision'),
  ('centre of mass',              'collision'),
  ('uniform circular motion',     'circular_motion'),
  ('centripetal force',           'circular_motion'),
  ('centripetal acceleration',    'circular_motion'),
  ('banking of roads',            'circular_motion'),
  ('torque',                      'torque'),
  ('moment of force',             'torque'),
  ('angular velocity',            'rotational_motion'),
  ('rotational motion',           'rotational_motion'),
  ('rotation',                    'rotational_motion'),
  ('rolling motion',              'rolling_motion'),
  ('rolling without slipping',    'rolling_motion'),
  ('moment of inertia',           'moment_of_inertia'),
  ('mi of disc',                  'moment_of_inertia'),
  ('mi of rod',                   'moment_of_inertia'),
  ('parallel axis theorem',       'moment_of_inertia'),
  ('perpendicular axis theorem',  'moment_of_inertia'),
  ('angular momentum',            'angular_momentum'),
  ('conservation of angular momentum', 'angular_momentum'),
  ('gravitation',                 'gravitation'),
  ('gravitational force',         'gravitation'),
  ('universal law of gravitation','gravitation'),
  ('kepler''s laws',              'gravitation'),
  ('gravitational potential energy', 'gravitation'),
  ('escape velocity',             'satellite_motion'),
  ('orbital velocity',            'satellite_motion'),
  ('geostationary satellite',     'satellite_motion'),
  ('simple harmonic motion',      'simple_harmonic_motion'),
  ('shm',                         'simple_harmonic_motion'),
  ('oscillations',                'simple_harmonic_motion'),
  ('spring mass system',          'simple_harmonic_motion'),
  ('time period of shm',          'simple_harmonic_motion'),
  ('simple pendulum',             'pendulum'),
  ('seconds pendulum',            'pendulum'),
-- ── Physics: Waves & Thermodynamics ──────────────────────────────────────────
  ('transverse waves',            'waves'),
  ('longitudinal waves',          'waves'),
  ('standing waves',              'waves'),
  ('beats',                       'waves'),
  ('doppler effect',              'doppler_effect'),
  ('doppler''s effect',           'doppler_effect'),
  ('apparent frequency',         'doppler_effect'),
  ('speed of sound',              'sound'),
  ('kinetic theory of gases',     'kinetic_theory'),
  ('kinetic theory',              'kinetic_theory'),
  ('rms speed',                   'kinetic_theory'),
  ('degrees of freedom',          'kinetic_theory'),
  ('first law of thermodynamics', 'thermodynamics'),
  ('second law of thermodynamics','thermodynamics'),
  ('internal energy',             'thermodynamics'),
  ('thermodynamic processes',     'thermodynamics'),
  ('isothermal',                  'thermodynamics'),
  ('adiabatic',                   'thermodynamics'),
  ('isochoric',                   'thermodynamics'),
  ('heat',                        'heat_transfer'),
  ('conduction',                  'heat_transfer'),
  ('convection',                  'heat_transfer'),
  ('radiation',                   'heat_transfer'),
  ('carnot engine',               'carnot_cycle'),
-- ── Physics: Electromagnetism ─────────────────────────────────────────────────
  ('coulomb''s law',              'coulombs_law'),
  ('coulomb law',                 'coulombs_law'),
  ('electric charge',             'electrostatics'),
  ('electrostatics',              'electrostatics'),
  ('electric field',              'electric_field'),
  ('electric field lines',        'electric_field'),
  ('dipole',                      'electric_field'),
  ('gauss law',                   'gauss_law'),
  ('gauss''s law',                'gauss_law'),
  ('electric flux',               'gauss_law'),
  ('electric potential',          'electric_potential'),
  ('potential difference',        'electric_potential'),
  ('equipotential surface',       'electric_potential'),
  ('capacitance',                 'capacitors'),
  ('capacitor',                   'capacitors'),
  ('parallel plate capacitor',    'capacitors'),
  ('dielectric',                  'dielectrics'),
  ('polarisation of dielectric',  'dielectrics'),
  ('ohm''s law',                  'ohms_law'),
  ('resistance',                  'ohms_law'),
  ('resistivity',                 'ohms_law'),
  ('current electricity',         'current_electricity'),
  ('electric current',            'current_electricity'),
  ('kirchhoff''s laws',           'kirchhoffs_laws'),
  ('kvl',                         'kirchhoffs_laws'),
  ('kcl',                         'kirchhoffs_laws'),
  ('wheatstone bridge',           'kirchhoffs_laws'),
  ('magnetic field',              'magnetic_effects'),
  ('magnetism',                   'magnetic_effects'),
  ('magnetic force',              'lorentz_force'),
  ('lorentz force',               'lorentz_force'),
  ('biot-savart law',             'biot_savart'),
  ('biot savart',                 'biot_savart'),
  ('ampere''s law',               'biot_savart'),
  ('solenoid',                    'biot_savart'),
  ('faraday''s law',              'faradays_law'),
  ('lenz''s law',                 'lenzs_law'),
  ('electromagnetic induction',   'electromagnetic_induction'),
  ('emi',                         'electromagnetic_induction'),
  ('mutual inductance',           'electromagnetic_induction'),
  ('self inductance',             'electromagnetic_induction'),
  ('alternating current',         'alternating_current'),
  ('ac circuits',                 'alternating_current'),
  ('impedance',                   'alternating_current'),
  ('resonance',                   'lc_circuits'),
  ('lc circuit',                  'lc_circuits'),
  ('transformer',                 'transformers'),
-- ── Physics: Optics ───────────────────────────────────────────────────────────
  ('reflection',                  'reflection'),
  ('mirror formula',              'reflection'),
  ('magnification',               'reflection'),
  ('refraction',                  'refraction'),
  ('snell''s law',                'refraction'),
  ('refractive index',            'refraction'),
  ('total internal reflection',   'total_internal_reflection'),
  ('tir',                         'total_internal_reflection'),
  ('critical angle',              'total_internal_reflection'),
  ('lens formula',                'lenses_mirrors'),
  ('lens maker''s formula',       'lenses_mirrors'),
  ('prism',                       'prism'),
  ('dispersion',                  'dispersion_of_light'),
  ('rainbow',                     'dispersion_of_light'),
  ('young''s double slit',        'young_double_slit'),
  ('ydse',                        'young_double_slit'),
  ('interference',                'interference'),
  ('fringe width',                'young_double_slit'),
  ('diffraction',                 'diffraction'),
  ('single slit diffraction',     'diffraction'),
  ('polarisation',                'polarisation'),
  ('brewster''s law',             'polarisation'),
  ('photoelectric effect',        'photoelectric_effect'),
  ('work function',               'photoelectric_effect'),
  ('threshold frequency',         'photoelectric_effect'),
  ('de broglie',                  'wave_particle_duality'),
  ('matter waves',                'wave_particle_duality'),
  ('bohr model',                  'bohr_model'),
  ('bohr''s model',               'bohr_model'),
  ('hydrogen spectrum',           'bohr_model'),
  ('energy levels',               'bohr_model'),
  ('radioactivity',               'radioactivity'),
  ('half life',                   'radioactivity'),
  ('nuclear fission',             'nuclear_fission_fusion'),
  ('nuclear fusion',              'nuclear_fission_fusion'),
  ('binding energy',              'nuclear_fission_fusion'),
-- ── Maths: Algebra & Trig ────────────────────────────────────────────────────
  ('sets',                        'sets_relations'),
  ('sets and relations',          'sets_relations'),
  ('functions',                   'functions'),
  ('types of functions',          'functions'),
  ('inverse functions',           'functions'),
  ('composite functions',         'functions'),
  ('trigonometric ratios',        'trigonometry'),
  ('trigonometric identities',    'trigonometry'),
  ('compound angles',             'trigonometry'),
  ('trig',                        'trigonometry'),
  ('sin cos tan',                 'trigonometry'),
  ('inverse trigonometry',        'inverse_trig'),
  ('arc functions',               'inverse_trig'),
  ('complex numbers',             'complex_numbers'),
  ('argand plane',                'complex_numbers'),
  ('modulus argument',            'complex_numbers'),
  ('de moivre theorem',           'de_moivre_theorem'),
  ('quadratic equations',         'quadratic_equations'),
  ('discriminant',                'quadratic_equations'),
  ('nature of roots',             'quadratic_equations'),
  ('ap gp hp',                    'sequences_series'),
  ('arithmetic progression',      'sequences_series'),
  ('geometric progression',       'sequences_series'),
  ('series',                      'sequences_series'),
  ('binomial theorem',            'binomial_theorem'),
  ('permutation',                 'permutations_combinations'),
  ('combination',                 'permutations_combinations'),
  ('nCr nPr',                     'permutations_combinations'),
  ('probability',                 'probability'),
  ('bayes theorem',               'bayes_theorem'),
  ('conditional probability',     'bayes_theorem'),
  ('matrices',                    'matrices_determinants'),
  ('determinants',                'matrices_determinants'),
  ('inverse of matrix',           'matrices_determinants'),
-- ── Maths: Calculus ───────────────────────────────────────────────────────────
  ('limits',                      'limits'),
  ('continuity',                  'continuity'),
  ('differentiation',             'differentiation'),
  ('derivatives',                 'differentiation'),
  ('chain rule',                  'differentiation'),
  ('product rule',                'differentiation'),
  ('maxima minima',               'maxima_minima'),
  ('application of derivatives',  'applications_derivatives'),
  ('tangent and normal',          'applications_derivatives'),
  ('integration',                 'integration'),
  ('indefinite integration',      'integration'),
  ('methods of integration',      'integration'),
  ('definite integration',        'definite_integrals'),
  ('area under curve',            'area_under_curve'),
  ('area between curves',         'area_under_curve'),
  ('differential equations',      'differential_equations'),
-- ── Maths: Coordinate ─────────────────────────────────────────────────────────
  ('straight lines',              'straight_lines'),
  ('slope of line',               'straight_lines'),
  ('angle between lines',         'straight_lines'),
  ('circle',                      'circles'),
  ('equation of circle',          'circles'),
  ('conic section',               'conic_sections'),
  ('parabola',                    'parabola'),
  ('ellipse',                     'ellipse'),
  ('hyperbola',                   'hyperbola'),
  ('3d geometry',                 '3d_geometry'),
  ('three dimensional geometry',  '3d_geometry'),
  ('direction cosines',           'vectors_3d'),
-- ── Chemistry: Physical ───────────────────────────────────────────────────────
  ('atomic structure',            'atomic_structure'),
  ('bohr''s model of atom',       'atomic_structure'),
  ('quantum numbers',             'atomic_structure'),
  ('periodic table',              'periodic_table'),
  ('periodicity',                 'periodic_table'),
  ('ionisation energy',           'periodic_trends'),
  ('electron affinity',           'periodic_trends'),
  ('electronegativity',           'periodic_trends'),
  ('chemical bonding',            'chemical_bonding'),
  ('ionic bond',                  'chemical_bonding'),
  ('covalent bond',               'chemical_bonding'),
  ('vsepr theory',                'vsepr'),
  ('hybridisation',               'hybridisation'),
  ('sp3',                         'hybridisation'),
  ('states of matter',            'states_of_matter'),
  ('ideal gas',                   'states_of_matter'),
  ('van der waals',               'states_of_matter'),
  ('molarity',                    'solutions'),
  ('molality',                    'solutions'),
  ('mole fraction',               'solutions'),
  ('colligative properties',      'colligative_properties'),
  ('raoult''s law',               'colligative_properties'),
  ('elevation of boiling point',  'colligative_properties'),
  ('depression of freezing point','colligative_properties'),
  ('thermodynamics',              'thermodynamics_chem'),
  ('enthalpy',                    'thermodynamics_chem'),
  ('entropy',                     'thermodynamics_chem'),
  ('gibbs free energy',           'gibbs_energy'),
  ('hess law',                    'hess_law'),
  ('chemical equilibrium',        'equilibrium'),
  ('le chatelier''s principle',   'le_chatelier'),
  ('kp kc',                       'equilibrium'),
  ('ph',                          'ph_buffer'),
  ('buffer solution',             'ph_buffer'),
  ('solubility product',          'solubility_product'),
  ('ksp',                         'solubility_product'),
  ('ionic equilibrium',           'ionic_equilibrium'),
  ('hydrolysis of salts',         'ionic_equilibrium'),
  ('rate of reaction',            'chemical_kinetics'),
  ('order of reaction',           'rate_laws'),
  ('molecularity',                'rate_laws'),
  ('arrhenius equation',          'activation_energy'),
  ('activation energy',           'activation_energy'),
  ('redox reactions',             'redox_reactions'),
  ('oxidation state',             'redox_reactions'),
  ('balancing redox',             'balancing_redox'),
  ('electrochemistry',            'electrochemistry'),
  ('galvanic cell',               'electrochemistry'),
  ('nernst equation',             'nernst_equation'),
  ('electrolysis',                'electrolysis'),
  ('faraday''s laws of electrolysis', 'faraday_laws_electro'),
-- ── Chemistry: Organic ────────────────────────────────────────────────────────
  ('iupac nomenclature',          'organic_basics'),
  ('organic chemistry basics',    'organic_basics'),
  ('reaction mechanisms',         'organic_basics'),
  ('inductive effect',            'inductive_effect'),
  ('resonance',                   'organic_basics'),
  ('isomerism',                   'isomerism'),
  ('structural isomerism',        'isomerism'),
  ('stereoisomerism',             'isomerism'),
  ('alkanes',                     'hydrocarbons'),
  ('alkenes',                     'hydrocarbons'),
  ('alkynes',                     'hydrocarbons'),
  ('benzene',                     'hydrocarbons'),
  ('aromatic compounds',          'hydrocarbons'),
  ('alcohols',                    'alcohols_ethers'),
  ('ethers',                      'alcohols_ethers'),
  ('aldehydes',                   'aldehydes_ketones'),
  ('ketones',                     'aldehydes_ketones'),
  ('aldol condensation',          'aldehydes_ketones'),
  ('carboxylic acids',            'carboxylic_acids'),
  ('amines',                      'amines'),
  ('amino acids',                 'biomolecules'),
  ('proteins',                    'biomolecules'),
  ('carbohydrates',               'biomolecules'),
  ('glucose',                     'biomolecules'),
  ('nucleic acids',               'biomolecules'),
  ('dna rna',                     'biomolecules'),
  ('polymers',                    'polymers'),
  ('addition polymer',            'polymers'),
  ('condensation polymer',        'polymers')
ON CONFLICT (alias) DO UPDATE SET concept = EXCLUDED.concept;

-- ── 3. Updated expand_weak_concepts — alias lookup FIRST, ILIKE fallback ──────
CREATE OR REPLACE FUNCTION public.expand_weak_concepts(
  p_concepts TEXT[]
)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Normalize inputs to lowercase, trim
  normalized AS (
    SELECT DISTINCT lower(trim(c)) AS term
    FROM   unnest(p_concepts) c
    WHERE  trim(c) <> ''
  ),
  -- Step 1: exact alias lookup (fast — indexed)
  alias_hits AS (
    SELECT ca.concept
    FROM   concept_aliases ca
    JOIN   normalized n ON ca.alias = n.term
  ),
  -- Step 2: ILIKE fallback for terms not in alias table
  ilike_hits AS (
    SELECT cg.concept
    FROM   concept_graph cg
    JOIN   normalized n ON (
      lower(cg.concept) ILIKE '%' || n.term || '%'
      OR n.term ILIKE '%' || lower(cg.concept) || '%'
    )
    WHERE  NOT EXISTS (SELECT 1 FROM alias_hits)  -- only when aliases found nothing
  ),
  -- All matched concept keys
  matched AS (
    SELECT concept FROM alias_hits
    UNION
    SELECT concept FROM ilike_hits
  ),
  -- Expand: original inputs + prerequisites + unlocks of matched nodes
  expanded AS (
    SELECT unnest(p_concepts) AS elem
    UNION
    SELECT unnest(cg.requires)
    FROM   concept_graph cg
    JOIN   matched m ON cg.concept = m.concept
    UNION
    SELECT unnest(cg.unlocks)
    FROM   concept_graph cg
    JOIN   matched m ON cg.concept = m.concept
  )
  SELECT ARRAY(
    SELECT DISTINCT elem FROM expanded
    WHERE  elem IS NOT NULL AND trim(elem) <> ''
  );
$$;

-- ── 4. subscriptions table — add store + rc_event_id for RevenueCat ───────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS store       TEXT,       -- 'PLAY_STORE' | 'APP_STORE' | 'razorpay' | 'unknown'
  ADD COLUMN IF NOT EXISTS rc_event_id TEXT;       -- RevenueCat event id for idempotency

-- Unique constraint for RC upsert (one active sub per user per store)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_store_active_idx
  ON public.subscriptions (user_id, store)
  WHERE status = 'active';

-- ── 5. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.concept_aliases TO service_role;
GRANT SELECT ON public.concept_aliases TO authenticated;
GRANT EXECUTE ON FUNCTION public.expand_weak_concepts TO authenticated, service_role;
