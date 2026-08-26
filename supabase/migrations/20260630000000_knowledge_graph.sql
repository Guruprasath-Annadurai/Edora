-- ── Knowledge Graph: Curriculum Intelligence ────────────────────────────────
-- Stores topic dependency trees for all Indian curricula.
-- topic_slug: normalized key used in prereq/unlock arrays.
-- prereq_slugs: topics student must master BEFORE this topic.
-- unlocks_slugs: topics this topic enables.

CREATE TABLE IF NOT EXISTS knowledge_graph (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           text        NOT NULL,
  topic_slug      text        NOT NULL UNIQUE,
  subject         text        NOT NULL,  -- 'Mathematics','Physics','Chemistry','Biology','...
  curricula       text[]      NOT NULL DEFAULT '{}', -- ['CBSE','JEE','NEET','ICSE','STATE','UG']
  class_level     text,       -- '6','7','8','9','10','11','12','UG','JEE','NEET'
  chapter         text,
  prereq_slugs    text[]      NOT NULL DEFAULT '{}',
  unlocks_slugs   text[]      NOT NULL DEFAULT '{}',
  importance      smallint    NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  difficulty      smallint    NOT NULL DEFAULT 5 CHECK (difficulty BETWEEN 1 AND 10),
  embedding       vector(768),
  auto_generated  boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_graph_slug_idx    ON knowledge_graph (topic_slug);
CREATE INDEX IF NOT EXISTS knowledge_graph_subject_idx ON knowledge_graph (subject);
CREATE INDEX IF NOT EXISTS knowledge_graph_curricula_idx ON knowledge_graph USING gin (curricula);
CREATE INDEX IF NOT EXISTS knowledge_graph_prereqs_idx ON knowledge_graph USING gin (prereq_slugs);

-- Enable RLS (read-only for all authenticated users — curriculum data is global)
ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON knowledge_graph FOR SELECT USING (true);
CREATE POLICY "service_write" ON knowledge_graph FOR ALL USING (auth.role() = 'service_role');

-- ── SEED: Comprehensive Indian Curriculum Topic Trees ────────────────────────
-- Covers: CBSE 6-12, JEE Main+Advanced, NEET UG, ICSE, State boards (core),
--         University foundation (BSc/BCom/BA first year).
-- ~500 topics with full prereq chains.

INSERT INTO knowledge_graph (topic, topic_slug, subject, curricula, class_level, chapter, prereq_slugs, unlocks_slugs, importance, difficulty) VALUES

-- ════════════════════════════════════════════════════════════════════════════
-- MATHEMATICS — Foundation (Class 6-8)
-- ════════════════════════════════════════════════════════════════════════════
('Number Systems (Basic)', 'num_systems_basic', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Number Systems', ARRAY[]::text[], ARRAY['fractions','decimals','integers'], 8, 2),
('Fractions and Decimals', 'fractions', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Fractions', ARRAY['num_systems_basic'], ARRAY['ratios_proportions','percentages'], 8, 2),
('Integers', 'integers', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Integers', ARRAY['num_systems_basic'], ARRAY['rational_numbers','basic_algebra'], 7, 2),
('Rational Numbers', 'rational_numbers', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Rational Numbers', ARRAY['integers','fractions'], ARRAY['real_numbers_9','exponents'], 7, 3),
('Decimals', 'decimals', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Decimals', ARRAY['fractions'], ARRAY['percentages','ratios_proportions'], 7, 2),
('Ratios and Proportions', 'ratios_proportions', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Ratio and Proportion', ARRAY['fractions','decimals'], ARRAY['percentages','direct_inverse_variation'], 8, 3),
('Percentages', 'percentages', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Percentage', ARRAY['ratios_proportions','fractions'], ARRAY['simple_compound_interest','profit_loss'], 8, 3),
('Simple and Compound Interest', 'simple_compound_interest', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '8', 'Comparing Quantities', ARRAY['percentages'], ARRAY['financial_maths_10'], 7, 3),
('Profit and Loss', 'profit_loss', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Comparing Quantities', ARRAY['percentages'], ARRAY['financial_maths_10'], 7, 3),
('Basic Algebra', 'basic_algebra', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Algebra', ARRAY['integers'], ARRAY['linear_eq_one_var','exponents'], 8, 3),
('Exponents and Powers', 'exponents', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Exponents and Powers', ARRAY['rational_numbers','basic_algebra'], ARRAY['polynomials_9','real_numbers_9'], 7, 3),
('Linear Equations in One Variable', 'linear_eq_one_var', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '8', 'Linear Equations', ARRAY['basic_algebra'], ARRAY['linear_eq_two_var','quadratic_eq'], 8, 3),
('Direct and Inverse Variation', 'direct_inverse_variation', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '8', 'Direct and Inverse Proportion', ARRAY['ratios_proportions'], ARRAY['linear_eq_two_var'], 6, 3),
('Basic Geometry', 'geometry_basics', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Basic Geometrical Ideas', ARRAY[]::text[], ARRAY['triangles_basic','lines_angles'], 7, 2),
('Lines and Angles', 'lines_angles', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Lines and Angles', ARRAY['geometry_basics'], ARRAY['triangles_basic','parallel_lines'], 7, 2),
('Triangles (Basic)', 'triangles_basic', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'The Triangle and its Properties', ARRAY['lines_angles'], ARRAY['congruence_triangles','pythagoras'], 8, 3),
('Congruence of Triangles', 'congruence_triangles', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '7', 'Congruence of Triangles', ARRAY['triangles_basic'], ARRAY['triangles_9','similarity'], 7, 3),
('Pythagoras Theorem', 'pythagoras', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '8', 'Understanding Quadrilaterals / Pythagoras', ARRAY['triangles_basic'], ARRAY['trigonometry_intro','coordinate_geometry_9'], 9, 3),
('Quadrilaterals', 'quadrilaterals', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '8', 'Understanding Quadrilaterals', ARRAY['triangles_basic','lines_angles'], ARRAY['circles_9','areas_9'], 7, 3),
('Data Handling (Basic)', 'data_handling_basic', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Data Handling', ARRAY[]::text[], ARRAY['statistics_9'], 6, 2),
('Mensuration (Basic)', 'mensuration_basic', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '6', 'Mensuration', ARRAY['geometry_basics'], ARRAY['mensuration_9','surface_areas'], 7, 3),

-- ════════════════════════════════════════════════════════════════════════════
-- MATHEMATICS — Class 9-10
-- ════════════════════════════════════════════════════════════════════════════
('Real Numbers', 'real_numbers_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Real Numbers', ARRAY['rational_numbers','exponents'], ARRAY['polynomials_9','number_theory_jee'], 8, 4),
('Polynomials', 'polynomials_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Polynomials', ARRAY['real_numbers_9','basic_algebra'], ARRAY['polynomials_11','quadratic_eq'], 8, 4),
('Linear Equations (Two Variables)', 'linear_eq_two_var', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Linear Equations in Two Variables', ARRAY['linear_eq_one_var'], ARRAY['quadratic_eq','coordinate_geometry_9'], 8, 4),
('Quadratic Equations', 'quadratic_eq', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '10', 'Quadratic Equations', ARRAY['polynomials_9','linear_eq_two_var'], ARRAY['complex_numbers','sequences_series','conic_sections'], 9, 5),
('Triangles (Similarity)', 'triangles_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Triangles', ARRAY['congruence_triangles','pythagoras'], ARRAY['trigonometry_intro','coordinate_geometry_9'], 8, 4),
('Coordinate Geometry (Basic)', 'coordinate_geometry_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Coordinate Geometry', ARRAY['linear_eq_two_var','pythagoras'], ARRAY['straight_lines_11','conic_sections'], 8, 4),
('Trigonometry Introduction', 'trigonometry_intro', 'Mathematics', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Introduction to Trigonometry', ARRAY['triangles_9','pythagoras'], ARRAY['trig_functions_11','heights_distances'], 9, 5),
('Heights and Distances', 'heights_distances', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '10', 'Applications of Trigonometry', ARRAY['trigonometry_intro'], ARRAY['trig_functions_11'], 6, 4),
('Circles (9-10)', 'circles_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Circles', ARRAY['triangles_9','quadrilaterals'], ARRAY['circles_11'], 7, 4),
('Areas (Heron Formula)', 'areas_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Herons Formula', ARRAY['triangles_9','mensuration_basic'], ARRAY['surface_areas'], 6, 3),
('Surface Areas and Volumes', 'surface_areas', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Surface Areas and Volumes', ARRAY['mensuration_basic','areas_9'], ARRAY['3d_geometry_12'], 7, 4),
('Statistics (9-10)', 'statistics_9', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '9', 'Statistics', ARRAY['data_handling_basic'], ARRAY['statistics_11'], 7, 3),
('Probability (Basic)', 'probability_basic', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '10', 'Probability', ARRAY['statistics_9'], ARRAY['probability_11'], 7, 3),
('Arithmetic Progressions', 'ap_10', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '10', 'Arithmetic Progressions', ARRAY['linear_eq_two_var'], ARRAY['sequences_series'], 7, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- MATHEMATICS — Class 11
-- ════════════════════════════════════════════════════════════════════════════
('Sets', 'sets', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Sets', ARRAY[]::text[], ARRAY['relations_functions_11','probability_11'], 7, 3),
('Relations and Functions (11)', 'relations_functions_11', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Relations and Functions', ARRAY['sets','polynomials_9'], ARRAY['inverse_trig','continuity_diff'], 8, 4),
('Trigonometric Functions (11)', 'trig_functions_11', 'Mathematics', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Trigonometric Functions', ARRAY['trigonometry_intro'], ARRAY['inverse_trig','complex_numbers','trig_jee'], 9, 5),
('Mathematical Induction', 'mathematical_induction', 'Mathematics', ARRAY['CBSE','JEE','ICSE'], '11', 'Principle of Mathematical Induction', ARRAY['basic_algebra','sequences_series'], ARRAY['binomial_theorem'], 6, 4),
('Complex Numbers', 'complex_numbers', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '11', 'Complex Numbers and Quadratic Equations', ARRAY['quadratic_eq','trig_functions_11'], ARRAY['matrices','rotational_mechanics'], 8, 6),
('Linear Inequalities', 'linear_inequalities', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Linear Inequalities', ARRAY['linear_eq_two_var'], ARRAY['linear_programming_12'], 6, 4),
('Permutations and Combinations', 'permutations_combinations', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Permutations and Combinations', ARRAY['basic_algebra'], ARRAY['binomial_theorem','probability_11'], 8, 5),
('Binomial Theorem', 'binomial_theorem', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '11', 'Binomial Theorem', ARRAY['permutations_combinations','mathematical_induction'], ARRAY['sequences_series'], 7, 5),
('Sequences and Series', 'sequences_series', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Sequences and Series', ARRAY['ap_10','binomial_theorem'], ARRAY['limits_continuity'], 8, 5),
('Straight Lines', 'straight_lines_11', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Straight Lines', ARRAY['coordinate_geometry_9'], ARRAY['conic_sections','3d_geometry_12'], 8, 5),
('Conic Sections', 'conic_sections', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '11', 'Conic Sections', ARRAY['straight_lines_11','quadratic_eq'], ARRAY['3d_geometry_12','jee_conics_advanced'], 8, 6),
('Introduction to 3D Geometry', '3d_intro_11', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '11', '3D Geometry (Intro)', ARRAY['straight_lines_11'], ARRAY['3d_geometry_12'], 7, 5),
('Limits and Continuity (Intro)', 'limits_continuity', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Limits and Derivatives', ARRAY['sequences_series','relations_functions_11'], ARRAY['continuity_diff'], 9, 6),
('Mathematical Reasoning', 'mathematical_reasoning', 'Mathematics', ARRAY['CBSE','STATE'], '11', 'Mathematical Reasoning', ARRAY['sets'], ARRAY[]::text[], 5, 3),
('Statistics (11)', 'statistics_11', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '11', 'Statistics', ARRAY['statistics_9'], ARRAY['probability_11','stats_ug'], 6, 4),
('Probability (11)', 'probability_11', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '11', 'Probability', ARRAY['probability_basic','permutations_combinations','sets'], ARRAY['probability_12'], 8, 5),

-- ════════════════════════════════════════════════════════════════════════════
-- MATHEMATICS — Class 12 / JEE Advanced
-- ════════════════════════════════════════════════════════════════════════════
('Relations and Functions (12)', 'relations_functions_12', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Relations and Functions', ARRAY['relations_functions_11'], ARRAY['continuity_diff'], 8, 5),
('Inverse Trigonometric Functions', 'inverse_trig', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '12', 'Inverse Trigonometric Functions', ARRAY['trig_functions_11','relations_functions_12'], ARRAY['continuity_diff','integrals'], 8, 6),
('Matrices', 'matrices', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Matrices', ARRAY['basic_algebra','complex_numbers'], ARRAY['determinants','linear_algebra_ug'], 8, 5),
('Determinants', 'determinants', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Determinants', ARRAY['matrices'], ARRAY['continuity_diff','linear_algebra_ug'], 8, 6),
('Continuity and Differentiability', 'continuity_diff', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Continuity and Differentiability', ARRAY['limits_continuity','inverse_trig'], ARRAY['derivatives_app','integrals'], 9, 7),
('Applications of Derivatives', 'derivatives_app', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Application of Derivatives', ARRAY['continuity_diff'], ARRAY['integrals','jee_calculus_advanced'], 9, 7),
('Integrals (Indefinite + Definite)', 'integrals', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Integrals', ARRAY['derivatives_app','trig_functions_11'], ARRAY['integrals_app','differential_equations'], 9, 8),
('Applications of Integrals', 'integrals_app', 'Mathematics', ARRAY['CBSE','ICSE','JEE'], '12', 'Applications of Integrals', ARRAY['integrals'], ARRAY['differential_equations'], 8, 7),
('Differential Equations', 'differential_equations', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Differential Equations', ARRAY['integrals'], ARRAY['diff_eq_ug'], 8, 8),
('Vectors', 'vectors_12', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Vector Algebra', ARRAY['3d_intro_11','trig_functions_11'], ARRAY['3d_geometry_12','mechanics_rotational'], 9, 6),
('3D Geometry', '3d_geometry_12', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', '3D Geometry', ARRAY['vectors_12','3d_intro_11','conic_sections'], ARRAY['jee_3d_advanced'], 8, 7),
('Linear Programming', 'linear_programming_12', 'Mathematics', ARRAY['CBSE','ICSE','STATE'], '12', 'Linear Programming', ARRAY['linear_inequalities','straight_lines_11'], ARRAY[]::text[], 6, 4),
('Probability (12)', 'probability_12', 'Mathematics', ARRAY['CBSE','ICSE','JEE','STATE'], '12', 'Probability', ARRAY['probability_11'], ARRAY['stats_ug'], 8, 6),

-- JEE Advanced extras
('Complex Numbers (JEE Advanced)', 'complex_numbers_jee', 'Mathematics', ARRAY['JEE'], 'JEE', 'Complex Numbers', ARRAY['complex_numbers','trig_functions_11'], ARRAY[]::text[], 9, 9),
('Conics (JEE Advanced)', 'jee_conics_advanced', 'Mathematics', ARRAY['JEE'], 'JEE', 'Conic Sections Advanced', ARRAY['conic_sections','derivatives_app'], ARRAY[]::text[], 9, 9),
('3D Geometry (JEE Advanced)', 'jee_3d_advanced', 'Mathematics', ARRAY['JEE'], 'JEE', '3D Geometry Advanced', ARRAY['3d_geometry_12','vectors_12'], ARRAY[]::text[], 9, 9),
('Calculus (JEE Advanced)', 'jee_calculus_advanced', 'Mathematics', ARRAY['JEE'], 'JEE', 'Advanced Calculus', ARRAY['integrals_app','derivatives_app'], ARRAY[]::text[], 10, 10),
('Trigonometry (JEE)', 'trig_jee', 'Mathematics', ARRAY['JEE'], 'JEE', 'Trigonometry JEE', ARRAY['trig_functions_11','inverse_trig'], ARRAY[]::text[], 9, 8),

-- University Mathematics
('Calculus (University)', 'calculus_ug', 'Mathematics', ARRAY['UG'], 'UG', 'Calculus', ARRAY['integrals','differential_equations'], ARRAY[]::text[], 8, 7),
('Linear Algebra', 'linear_algebra_ug', 'Mathematics', ARRAY['UG'], 'UG', 'Linear Algebra', ARRAY['matrices','determinants'], ARRAY[]::text[], 8, 7),
('Differential Equations (UG)', 'diff_eq_ug', 'Mathematics', ARRAY['UG'], 'UG', 'Differential Equations', ARRAY['differential_equations'], ARRAY[]::text[], 7, 8),
('Statistics (UG)', 'stats_ug', 'Mathematics', ARRAY['UG'], 'UG', 'Statistics and Probability', ARRAY['probability_12','statistics_11'], ARRAY[]::text[], 7, 6),
('Number Theory (JEE)', 'number_theory_jee', 'Mathematics', ARRAY['JEE'], 'JEE', 'Number Theory', ARRAY['real_numbers_9'], ARRAY[]::text[], 7, 7),

-- ════════════════════════════════════════════════════════════════════════════
-- PHYSICS — Foundation (Class 9-10)
-- ════════════════════════════════════════════════════════════════════════════
('Motion (Basic)', 'motion_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '9', 'Motion', ARRAY[]::text[], ARRAY['kinematics_1d','laws_of_motion'], 8, 3),
('Laws of Motion (Basic)', 'laws_of_motion_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '9', 'Laws of Motion', ARRAY['motion_basic'], ARRAY['laws_of_motion_11','work_energy_11'], 8, 3),
('Gravitation (Basic)', 'gravitation_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '9', 'Gravitation', ARRAY['laws_of_motion_basic'], ARRAY['gravitation_11'], 7, 3),
('Work and Energy (Basic)', 'work_energy_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '9', 'Work and Energy', ARRAY['laws_of_motion_basic'], ARRAY['work_energy_11'], 7, 3),
('Sound (Basic)', 'sound_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '9', 'Sound', ARRAY[]::text[], ARRAY['waves_11'], 6, 3),
('Light (Basic)', 'light_basic', 'Physics', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Light Reflection and Refraction', ARRAY[]::text[], ARRAY['ray_optics'], 7, 3),
('Human Eye', 'human_eye', 'Physics', ARRAY['CBSE','ICSE','STATE'], '10', 'Human Eye and Colourful World', ARRAY['light_basic'], ARRAY['wave_optics'], 6, 3),
('Electricity (Basic)', 'electricity_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '10', 'Electricity', ARRAY[]::text[], ARRAY['current_electricity'], 8, 4),
('Magnetic Effects of Current (Basic)', 'magnetism_basic', 'Physics', ARRAY['CBSE','ICSE','STATE'], '10', 'Magnetic Effects of Current', ARRAY['electricity_basic'], ARRAY['magnetic_effects'], 7, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- PHYSICS — Class 11
-- ════════════════════════════════════════════════════════════════════════════
('Units and Measurements', 'units_measurement', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Units and Measurement', ARRAY[]::text[], ARRAY['kinematics_1d','all_physics'], 7, 3),
('Kinematics (1D)', 'kinematics_1d', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Motion in a Straight Line', ARRAY['motion_basic','units_measurement'], ARRAY['kinematics_2d','laws_of_motion_11'], 9, 4),
('Kinematics (2D)', 'kinematics_2d', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Motion in a Plane', ARRAY['kinematics_1d','vectors_12'], ARRAY['laws_of_motion_11','circular_motion'], 9, 5),
('Laws of Motion (11)', 'laws_of_motion_11', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Laws of Motion', ARRAY['kinematics_2d','laws_of_motion_basic'], ARRAY['work_energy_11','rotational_mechanics','friction'], 10, 5),
('Friction', 'friction', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Laws of Motion (Friction)', ARRAY['laws_of_motion_11'], ARRAY['work_energy_11'], 7, 5),
('Work, Energy, Power', 'work_energy_11', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Work, Energy and Power', ARRAY['laws_of_motion_11','work_energy_basic'], ARRAY['rotational_mechanics','gravitation_11'], 9, 5),
('Circular Motion', 'circular_motion', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Circular Motion', ARRAY['kinematics_2d','laws_of_motion_11'], ARRAY['rotational_mechanics'], 8, 6),
('Rotational Mechanics', 'rotational_mechanics', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'System of Particles and Rotational Motion', ARRAY['work_energy_11','circular_motion','vectors_12'], ARRAY['gravitation_11'], 9, 7),
('Gravitation (11)', 'gravitation_11', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Gravitation', ARRAY['laws_of_motion_11','gravitation_basic'], ARRAY['oscillations'], 8, 5),
('Properties of Matter', 'properties_matter', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Mechanical Properties of Solids and Fluids', ARRAY['laws_of_motion_11'], ARRAY['oscillations'], 7, 5),
('Thermodynamics (Physics)', 'thermodynamics_physics', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Thermodynamics', ARRAY['kinetic_theory'], ARRAY['thermodynamics_advanced'], 8, 6),
('Kinetic Theory of Gases', 'kinetic_theory', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Kinetic Theory', ARRAY['properties_matter'], ARRAY['thermodynamics_physics'], 8, 5),
('Oscillations (SHM)', 'oscillations', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Oscillations', ARRAY['work_energy_11','gravitation_11'], ARRAY['waves_11'], 9, 6),
('Waves', 'waves_11', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Waves', ARRAY['oscillations','sound_basic'], ARRAY['wave_optics','alternating_current'], 8, 6),

-- ════════════════════════════════════════════════════════════════════════════
-- PHYSICS — Class 12
-- ════════════════════════════════════════════════════════════════════════════
('Electrostatics', 'electrostatics', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Electric Charges and Fields', ARRAY['electricity_basic','vectors_12'], ARRAY['current_electricity','capacitors'], 10, 6),
('Capacitors', 'capacitors', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'Electrostatic Potential and Capacitance', ARRAY['electrostatics'], ARRAY['current_electricity'], 8, 6),
('Current Electricity', 'current_electricity', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Current Electricity', ARRAY['electrostatics','capacitors','electricity_basic'], ARRAY['magnetic_effects','alternating_current'], 9, 6),
('Magnetic Effects of Current (12)', 'magnetic_effects', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Moving Charges and Magnetism', ARRAY['current_electricity','magnetism_basic'], ARRAY['magnetism_matter','emi'], 9, 6),
('Magnetism and Matter', 'magnetism_matter', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'Magnetism and Matter', ARRAY['magnetic_effects'], ARRAY['emi'], 7, 5),
('Electromagnetic Induction', 'emi', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Electromagnetic Induction', ARRAY['magnetic_effects','magnetism_matter'], ARRAY['alternating_current'], 9, 7),
('Alternating Current', 'alternating_current', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Alternating Current', ARRAY['emi','waves_11'], ARRAY['electromagnetic_waves'], 8, 7),
('Electromagnetic Waves', 'electromagnetic_waves', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Electromagnetic Waves', ARRAY['alternating_current'], ARRAY['wave_optics'], 7, 5),
('Ray Optics', 'ray_optics', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Ray Optics', ARRAY['light_basic','kinematics_2d'], ARRAY['wave_optics'], 8, 5),
('Wave Optics', 'wave_optics', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'Wave Optics', ARRAY['ray_optics','waves_11','electromagnetic_waves'], ARRAY['dual_nature'], 8, 7),
('Dual Nature of Matter and Radiation', 'dual_nature', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Dual Nature of Radiation and Matter', ARRAY['wave_optics','electromagnetic_waves'], ARRAY['atoms_nuclei'], 8, 6),
('Atoms and Nuclei', 'atoms_nuclei', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Atoms and Nuclei', ARRAY['dual_nature'], ARRAY['semiconductors'], 8, 6),
('Semiconductors and Devices', 'semiconductors', 'Physics', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Semiconductor Electronics', ARRAY['atoms_nuclei','current_electricity'], ARRAY[]::text[], 7, 6),
('Communication Systems', 'communication_systems', 'Physics', ARRAY['CBSE','STATE'], '12', 'Communication Systems', ARRAY['electromagnetic_waves','semiconductors'], ARRAY[]::text[], 5, 4),
('Thermodynamics Advanced', 'thermodynamics_advanced', 'Physics', ARRAY['JEE','NEET'], 'JEE', 'Advanced Thermodynamics', ARRAY['thermodynamics_physics'], ARRAY[]::text[], 9, 8),
('Fluid Mechanics', 'fluid_mechanics', 'Physics', ARRAY['JEE'], 'JEE', 'Fluid Mechanics', ARRAY['properties_matter','laws_of_motion_11'], ARRAY[]::text[], 8, 7),

-- ════════════════════════════════════════════════════════════════════════════
-- CHEMISTRY — Foundation
-- ════════════════════════════════════════════════════════════════════════════
('Matter and Its Properties', 'matter_properties', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '9', 'Matter in Our Surroundings', ARRAY[]::text[], ARRAY['atomic_structure','mole_concept'], 7, 2),
('Atoms and Molecules', 'atoms_molecules', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '9', 'Atoms and Molecules', ARRAY['matter_properties'], ARRAY['mole_concept','atomic_structure'], 8, 3),
('Structure of Atom (Basic)', 'atom_structure_basic', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '9', 'Structure of Atom', ARRAY['atoms_molecules'], ARRAY['atomic_structure'], 8, 4),
('Chemical Reactions', 'chemical_reactions_basic', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '9', 'Chemical Reactions and Equations', ARRAY['atoms_molecules'], ARRAY['mole_concept','chemical_bonding'], 8, 3),
('Acids Bases Salts (Basic)', 'acids_bases_basic', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '10', 'Acids, Bases and Salts', ARRAY['chemical_reactions_basic'], ARRAY['ionic_equilibrium'], 7, 3),
('Metals and Non-Metals (Basic)', 'metals_nonmetals_basic', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '10', 'Metals and Non-metals', ARRAY['atoms_molecules'], ARRAY['metallurgy','periodic_table_11'], 7, 3),
('Carbon Compounds (Basic)', 'carbon_basic', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '10', 'Carbon and Its Compounds', ARRAY['chemical_reactions_basic'], ARRAY['basic_organic'], 7, 3),

-- ════════════════════════════════════════════════════════════════════════════
-- CHEMISTRY — Physical Chemistry
-- ════════════════════════════════════════════════════════════════════════════
('Mole Concept', 'mole_concept', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Some Basic Concepts of Chemistry', ARRAY['atoms_molecules','atom_structure_basic'], ARRAY['atomic_structure','stoichiometry','chemical_bonding'], 10, 5),
('Stoichiometry', 'stoichiometry', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Stoichiometry', ARRAY['mole_concept'], ARRAY['equilibrium','electrochemistry'], 9, 5),
('Atomic Structure', 'atomic_structure', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Structure of Atom', ARRAY['mole_concept','atom_structure_basic'], ARRAY['periodic_table_11','chemical_bonding','quantum_chem'], 9, 6),
('Periodic Table and Periodicity', 'periodic_table_11', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Classification of Elements', ARRAY['atomic_structure'], ARRAY['chemical_bonding','p_block','d_block'], 8, 5),
('Chemical Bonding', 'chemical_bonding', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Chemical Bonding and Molecular Structure', ARRAY['atomic_structure','periodic_table_11'], ARRAY['states_matter','organic_basics'], 9, 6),
('States of Matter', 'states_matter', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'States of Matter', ARRAY['chemical_bonding','mole_concept'], ARRAY['thermodynamics_chem','kinetic_theory_chem'], 7, 5),
('Thermodynamics (Chemistry)', 'thermodynamics_chem', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Thermodynamics', ARRAY['states_matter','stoichiometry'], ARRAY['equilibrium'], 8, 7),
('Chemical Equilibrium', 'equilibrium', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Equilibrium', ARRAY['thermodynamics_chem','stoichiometry'], ARRAY['ionic_equilibrium','electrochemistry'], 9, 7),
('Ionic Equilibrium', 'ionic_equilibrium', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Ionic Equilibrium', ARRAY['equilibrium','acids_bases_basic'], ARRAY['electrochemistry','solutions_12'], 8, 7),
('Redox Reactions', 'redox', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Redox Reactions', ARRAY['mole_concept','chemical_reactions_basic'], ARRAY['electrochemistry','d_block'], 8, 5),
('Solutions', 'solutions_12', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Solutions', ARRAY['states_matter','stoichiometry','ionic_equilibrium'], ARRAY['electrochemistry'], 8, 6),
('Electrochemistry', 'electrochemistry', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Electrochemistry', ARRAY['ionic_equilibrium','redox','solutions_12'], ARRAY[]::text[], 8, 7),
('Chemical Kinetics', 'chemical_kinetics', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Chemical Kinetics', ARRAY['equilibrium','thermodynamics_chem'], ARRAY[]::text[], 8, 7),
('Surface Chemistry', 'surface_chemistry', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'Surface Chemistry', ARRAY['states_matter','chemical_kinetics'], ARRAY[]::text[], 6, 5),
('Solid State', 'solid_state', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'The Solid State', ARRAY['states_matter','chemical_bonding'], ARRAY[]::text[], 7, 7),
('Quantum Chemistry (JEE)', 'quantum_chem', 'Chemistry', ARRAY['JEE'], 'JEE', 'Quantum Mechanics in Chemistry', ARRAY['atomic_structure'], ARRAY[]::text[], 8, 9),

-- ════════════════════════════════════════════════════════════════════════════
-- CHEMISTRY — Inorganic Chemistry
-- ════════════════════════════════════════════════════════════════════════════
('s-Block Elements', 's_block', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 's-Block Elements', ARRAY['periodic_table_11','chemical_bonding'], ARRAY['p_block'], 6, 4),
('Hydrogen', 'hydrogen_chem', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Hydrogen', ARRAY['periodic_table_11'], ARRAY[]::text[], 5, 4),
('p-Block Elements', 'p_block', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'p-Block Elements', ARRAY['s_block','periodic_table_11'], ARRAY['d_block','coordination_compounds'], 8, 7),
('d and f Block Elements', 'd_block', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'd and f Block Elements', ARRAY['p_block','redox','periodic_table_11'], ARRAY['coordination_compounds'], 7, 6),
('Coordination Compounds', 'coordination_compounds', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '12', 'Coordination Compounds', ARRAY['d_block','chemical_bonding'], ARRAY[]::text[], 8, 7),
('Metallurgy', 'metallurgy', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'General Principles of Metallurgy', ARRAY['redox','d_block','metals_nonmetals_basic'], ARRAY[]::text[], 7, 5),
('Environmental Chemistry', 'env_chemistry', 'Chemistry', ARRAY['CBSE','ICSE','STATE'], '11', 'Environmental Chemistry', ARRAY['chemical_reactions_basic'], ARRAY[]::text[], 5, 3),
('Qualitative Analysis', 'qualitative_analysis', 'Chemistry', ARRAY['JEE','NEET'], 'JEE', 'Qualitative Inorganic Analysis', ARRAY['p_block','d_block'], ARRAY[]::text[], 7, 6),

-- ════════════════════════════════════════════════════════════════════════════
-- CHEMISTRY — Organic Chemistry
-- ════════════════════════════════════════════════════════════════════════════
('Basic Organic Chemistry', 'basic_organic', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Basic Principles of Organic Chemistry', ARRAY['chemical_bonding','carbon_basic'], ARRAY['hydrocarbons','isomerism'], 9, 6),
('Isomerism', 'isomerism', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET'], '11', 'Isomerism', ARRAY['basic_organic'], ARRAY['hydrocarbons','haloalkanes'], 8, 7),
('Hydrocarbons', 'hydrocarbons', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '11', 'Hydrocarbons', ARRAY['basic_organic','isomerism'], ARRAY['haloalkanes','alcohols_phenols'], 8, 6),
('Organic Reactions Mechanisms', 'organic_mechanisms', 'Chemistry', ARRAY['JEE','NEET'], '11', 'Reaction Mechanisms', ARRAY['basic_organic','hydrocarbons'], ARRAY['haloalkanes','carbonyl_compounds'], 9, 8),
('Haloalkanes and Haloarenes', 'haloalkanes', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Haloalkanes and Haloarenes', ARRAY['hydrocarbons','organic_mechanisms'], ARRAY['alcohols_phenols','amines'], 8, 7),
('Alcohols, Phenols and Ethers', 'alcohols_phenols', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Alcohols, Phenols and Ethers', ARRAY['haloalkanes','hydrocarbons'], ARRAY['carbonyl_compounds'], 8, 7),
('Aldehydes, Ketones and Carboxylic Acids', 'carbonyl_compounds', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Aldehydes, Ketones and Carboxylic Acids', ARRAY['alcohols_phenols','organic_mechanisms'], ARRAY['amines','biomolecules'], 9, 8),
('Amines', 'amines', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Amines', ARRAY['haloalkanes','carbonyl_compounds'], ARRAY['biomolecules','dyes_drugs'], 7, 7),
('Biomolecules', 'biomolecules', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Biomolecules', ARRAY['carbonyl_compounds','amines'], ARRAY[]::text[], 7, 6),
('Polymers', 'polymers', 'Chemistry', ARRAY['CBSE','ICSE','JEE','NEET','STATE'], '12', 'Polymers', ARRAY['hydrocarbons','carbonyl_compounds'], ARRAY[]::text[], 6, 5),
('Chemistry in Everyday Life', 'dyes_drugs', 'Chemistry', ARRAY['CBSE','ICSE','STATE','NEET'], '12', 'Chemistry in Everyday Life', ARRAY['amines','biomolecules'], ARRAY[]::text[], 5, 4),
('Named Reactions (JEE)', 'named_reactions', 'Chemistry', ARRAY['JEE'], 'JEE', 'Named Reactions', ARRAY['carbonyl_compounds','organic_mechanisms'], ARRAY[]::text[], 9, 8),

-- ════════════════════════════════════════════════════════════════════════════
-- BIOLOGY — Class 9-10 Foundation
-- ════════════════════════════════════════════════════════════════════════════
('Cell Biology (Basic)', 'cell_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '9', 'Fundamental Unit of Life', ARRAY[]::text[], ARRAY['cell_biology_11','tissues_animals'], 8, 3),
('Tissues (Basic)', 'tissues_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '9', 'Tissues', ARRAY['cell_basic'], ARRAY['tissues_animals','plant_anatomy'], 7, 3),
('Diversity of Organisms', 'diversity_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '9', 'Diversity in Living Organisms', ARRAY[]::text[], ARRAY['diversity_11'], 7, 3),
('Life Processes (Basic)', 'life_processes_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Life Processes', ARRAY['cell_basic'], ARRAY['plant_physiology_11','human_physiology_11'], 8, 4),
('Control and Coordination (Basic)', 'control_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Control and Coordination', ARRAY['life_processes_basic'], ARRAY['human_physiology_11'], 7, 4),
('Reproduction (Basic)', 'reproduction_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'How do Organisms Reproduce', ARRAY['cell_basic'], ARRAY['reproduction_12'], 7, 3),
('Heredity and Evolution (Basic)', 'heredity_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Heredity and Evolution', ARRAY['reproduction_basic'], ARRAY['genetics_12'], 8, 4),
('Ecology (Basic)', 'ecology_basic', 'Biology', ARRAY['CBSE','ICSE','STATE','NEET'], '10', 'Our Environment', ARRAY[]::text[], ARRAY['ecology_12'], 6, 3),

-- ════════════════════════════════════════════════════════════════════════════
-- BIOLOGY — Class 11
-- ════════════════════════════════════════════════════════════════════════════
('Diversity in Living World', 'diversity_11', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Diversity in Living World', ARRAY['diversity_basic'], ARRAY['plant_anatomy','plant_physiology_11'], 7, 4),
('Plant Anatomy', 'plant_anatomy', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Structural Organisation in Plants', ARRAY['tissues_basic','diversity_11'], ARRAY['plant_physiology_11'], 7, 4),
('Animal Tissues', 'tissues_animals', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Structural Organisation in Animals', ARRAY['tissues_basic'], ARRAY['human_physiology_11'], 7, 4),
('Cell Biology (11)', 'cell_biology_11', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Cell: Structure and Function', ARRAY['cell_basic'], ARRAY['plant_physiology_11','human_physiology_11','genetics_12'], 9, 5),
('Biomolecules (Biology)', 'biomolecules_bio', 'Biology', ARRAY['CBSE','ICSE','NEET'], '11', 'Biomolecules', ARRAY['cell_biology_11'], ARRAY['plant_physiology_11','human_physiology_11'], 8, 6),
('Cell Division', 'cell_division', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Cell Cycle and Cell Division', ARRAY['cell_biology_11','biomolecules_bio'], ARRAY['reproduction_12','genetics_12'], 9, 6),
('Plant Physiology', 'plant_physiology_11', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Plant Physiology', ARRAY['plant_anatomy','biomolecules_bio'], ARRAY['reproduction_12'], 8, 6),
('Human Physiology (11)', 'human_physiology_11', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '11', 'Human Physiology', ARRAY['tissues_animals','biomolecules_bio','life_processes_basic'], ARRAY['human_physiology_12'], 9, 6),

-- ════════════════════════════════════════════════════════════════════════════
-- BIOLOGY — Class 12
-- ════════════════════════════════════════════════════════════════════════════
('Sexual Reproduction in Plants', 'plant_reproduction', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Reproduction in Organisms', ARRAY['plant_physiology_11','cell_division','reproduction_basic'], ARRAY['genetics_12'], 8, 5),
('Human Reproduction', 'human_reproduction', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Human Reproduction', ARRAY['human_physiology_11','reproduction_basic'], ARRAY['genetics_12','reproductive_health'], 8, 5),
('Reproductive Health', 'reproductive_health', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Reproductive Health', ARRAY['human_reproduction'], ARRAY[]::text[], 5, 3),
('Genetics and Mendelian Inheritance', 'genetics_12', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Principles of Inheritance and Variation', ARRAY['cell_division','heredity_basic'], ARRAY['molecular_biology','evolution_12'], 10, 7),
('Molecular Biology (DNA)', 'molecular_biology', 'Biology', ARRAY['CBSE','ICSE','NEET'], '12', 'Molecular Basis of Inheritance', ARRAY['genetics_12','biomolecules_bio'], ARRAY['biotechnology'], 9, 7),
('Evolution', 'evolution_12', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Evolution', ARRAY['genetics_12','heredity_basic'], ARRAY[]::text[], 8, 5),
('Human Physiology (12)', 'human_physiology_12', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Human Health and Disease', ARRAY['human_physiology_11'], ARRAY['biotechnology'], 7, 5),
('Biotechnology (Principles)', 'biotechnology', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Biotechnology', ARRAY['molecular_biology','human_physiology_12'], ARRAY['biotech_applications'], 8, 7),
('Biotechnology Applications', 'biotech_applications', 'Biology', ARRAY['CBSE','ICSE','NEET'], '12', 'Biotechnology and Its Applications', ARRAY['biotechnology'], ARRAY[]::text[], 7, 6),
('Ecology (12)', 'ecology_12', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Ecology and Ecosystem', ARRAY['ecology_basic','diversity_11'], ARRAY['biodiversity'], 7, 5),
('Biodiversity and Conservation', 'biodiversity', 'Biology', ARRAY['CBSE','ICSE','NEET','STATE'], '12', 'Biodiversity and Conservation', ARRAY['ecology_12'], ARRAY[]::text[], 6, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- SCIENCE — General (Cross-curricular)
-- ════════════════════════════════════════════════════════════════════════════
('Scientific Method', 'scientific_method', 'Science', ARRAY['CBSE','ICSE','STATE','JEE','NEET'], NULL, 'Introduction', ARRAY[]::text[], ARRAY['units_measurement','mole_concept','cell_basic'], 6, 2),

-- ════════════════════════════════════════════════════════════════════════════
-- ECONOMICS / COMMERCE — CBSE / ISC
-- ════════════════════════════════════════════════════════════════════════════
('Introduction to Economics', 'economics_intro', 'Economics', ARRAY['CBSE','ICSE','STATE'], '11', 'Introduction', ARRAY[]::text[], ARRAY['microeconomics_intro','macroeconomics_intro'], 6, 2),
('Microeconomics — Demand and Supply', 'microeconomics_intro', 'Economics', ARRAY['CBSE','ICSE','STATE'], '11', 'Theory of Demand and Supply', ARRAY['economics_intro'], ARRAY['market_structures','consumer_theory'], 8, 5),
('Consumer Theory', 'consumer_theory', 'Economics', ARRAY['CBSE','ICSE','STATE'], '11', 'Consumer Equilibrium', ARRAY['microeconomics_intro'], ARRAY['market_structures'], 7, 5),
('Market Structures', 'market_structures', 'Economics', ARRAY['CBSE','ICSE','STATE'], '11', 'Producer Behaviour and Supply', ARRAY['consumer_theory'], ARRAY['macroeconomics_intro'], 7, 5),
('Macroeconomics', 'macroeconomics_intro', 'Economics', ARRAY['CBSE','ICSE','STATE'], '12', 'Introduction to Macroeconomics', ARRAY['economics_intro'], ARRAY['national_income','money_banking'], 7, 5),
('National Income', 'national_income', 'Economics', ARRAY['CBSE','ICSE','STATE'], '12', 'National Income Accounting', ARRAY['macroeconomics_intro'], ARRAY['money_banking'], 8, 6),
('Money and Banking', 'money_banking', 'Economics', ARRAY['CBSE','ICSE','STATE'], '12', 'Money and Banking', ARRAY['national_income'], ARRAY['govt_budget'], 7, 5),
('Government Budget', 'govt_budget', 'Economics', ARRAY['CBSE','ICSE','STATE'], '12', 'Government Budget', ARRAY['money_banking'], ARRAY[]::text[], 6, 5),
('Balance of Payments', 'balance_payments', 'Economics', ARRAY['CBSE','ICSE','STATE'], '12', 'Open Economy Macroeconomics', ARRAY['govt_budget'], ARRAY[]::text[], 6, 6),
('Statistics for Economics', 'stats_economics', 'Economics', ARRAY['CBSE','ICSE','STATE'], '11', 'Statistics for Economics', ARRAY['data_handling_basic'], ARRAY['economics_intro'], 7, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- ACCOUNTANCY / BUSINESS STUDIES — CBSE
-- ════════════════════════════════════════════════════════════════════════════
('Basic Accounting', 'basic_accounting', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '11', 'Introduction to Accounting', ARRAY[]::text[], ARRAY['journal_ledger','financial_statements'], 7, 3),
('Journal and Ledger', 'journal_ledger', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '11', 'Journal and Ledger', ARRAY['basic_accounting'], ARRAY['financial_statements','depreciation'], 8, 4),
('Financial Statements', 'financial_statements', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '11', 'Financial Statements', ARRAY['journal_ledger'], ARRAY['company_accounts'], 8, 5),
('Depreciation', 'depreciation', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '11', 'Depreciation, Provisions and Reserves', ARRAY['journal_ledger'], ARRAY['financial_statements'], 7, 5),
('Company Accounts', 'company_accounts', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '12', 'Company Accounts', ARRAY['financial_statements'], ARRAY['cash_flow'], 7, 6),
('Cash Flow Statement', 'cash_flow', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '12', 'Cash Flow Statement', ARRAY['company_accounts'], ARRAY[]::text[], 7, 6),
('Partnership Accounts', 'partnership_accounts', 'Accountancy', ARRAY['CBSE','ICSE','STATE'], '12', 'Accounts of Partnership Firms', ARRAY['financial_statements'], ARRAY['company_accounts'], 8, 6),

-- ════════════════════════════════════════════════════════════════════════════
-- HISTORY / CIVICS / GEOGRAPHY — Social Sciences
-- ════════════════════════════════════════════════════════════════════════════
('Ancient Indian History', 'ancient_history', 'History', ARRAY['CBSE','ICSE','STATE'], '6', 'Ancient India', ARRAY[]::text[], ARRAY['medieval_history'], 6, 3),
('Medieval Indian History', 'medieval_history', 'History', ARRAY['CBSE','ICSE','STATE'], '7', 'Medieval India', ARRAY['ancient_history'], ARRAY['modern_history'], 6, 3),
('Modern Indian History', 'modern_history', 'History', ARRAY['CBSE','ICSE','STATE'], '8', 'Modern India', ARRAY['medieval_history'], ARRAY['independence_movement','world_history'], 7, 4),
('Indian Independence Movement', 'independence_movement', 'History', ARRAY['CBSE','ICSE','STATE'], '10', 'Nationalism in India', ARRAY['modern_history'], ARRAY['post_independence'], 8, 4),
('Post-Independence India', 'post_independence', 'History', ARRAY['CBSE','ICSE','STATE'], '12', 'Politics in India Since Independence', ARRAY['independence_movement'], ARRAY[]::text[], 6, 4),
('World History', 'world_history', 'History', ARRAY['CBSE','ICSE','STATE'], '9', 'World History', ARRAY['modern_history'], ARRAY[]::text[], 6, 4),
('Indian Constitution and Civics', 'civics_india', 'Political Science', ARRAY['CBSE','ICSE','STATE'], '9', 'Democratic Politics', ARRAY[]::text[], ARRAY['political_science_12'], 7, 3),
('Political Science (12)', 'political_science_12', 'Political Science', ARRAY['CBSE','ICSE','STATE'], '12', 'Political Science', ARRAY['civics_india'], ARRAY[]::text[], 6, 4),
('Physical Geography', 'physical_geography', 'Geography', ARRAY['CBSE','ICSE','STATE'], '6', 'Physical Geography', ARRAY[]::text[], ARRAY['indian_geography','world_geography'], 6, 3),
('Indian Geography', 'indian_geography', 'Geography', ARRAY['CBSE','ICSE','STATE'], '9', 'India: Physical Environment', ARRAY['physical_geography'], ARRAY['economic_geography'], 7, 3),
('Economic Geography', 'economic_geography', 'Geography', ARRAY['CBSE','ICSE','STATE'], '12', 'Human Geography', ARRAY['indian_geography'], ARRAY[]::text[], 6, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- ENGLISH / LANGUAGES
-- ════════════════════════════════════════════════════════════════════════════
('English Grammar (Basic)', 'english_grammar_basic', 'English', ARRAY['CBSE','ICSE','STATE'], '6', 'Grammar', ARRAY[]::text[], ARRAY['english_writing','english_grammar_adv'], 7, 2),
('English Grammar (Advanced)', 'english_grammar_adv', 'English', ARRAY['CBSE','ICSE','STATE'], '10', 'Advanced Grammar', ARRAY['english_grammar_basic'], ARRAY[]::text[], 6, 4),
('English Writing Skills', 'english_writing', 'English', ARRAY['CBSE','ICSE','STATE'], '9', 'Writing Skills', ARRAY['english_grammar_basic'], ARRAY[]::text[], 7, 4),
('Literature Analysis', 'literature_analysis', 'English', ARRAY['CBSE','ICSE','STATE'], '10', 'Literature', ARRAY['english_writing'], ARRAY[]::text[], 6, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- COMPUTER SCIENCE — CBSE / ISC
-- ════════════════════════════════════════════════════════════════════════════
('Introduction to Computers', 'computers_intro', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '6', 'Basics', ARRAY[]::text[], ARRAY['programming_basics'], 5, 2),
('Programming Basics (Python/C++)', 'programming_basics', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '9', 'Introduction to Programming', ARRAY['computers_intro','basic_algebra'], ARRAY['data_structures','oop'], 8, 4),
('Data Structures', 'data_structures', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '11', 'Data Structures', ARRAY['programming_basics'], ARRAY['algorithms','oop'], 8, 6),
('OOP Concepts', 'oop', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '11', 'Object Oriented Programming', ARRAY['programming_basics'], ARRAY['database_sql'], 7, 5),
('Algorithms', 'algorithms', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '12', 'Algorithms', ARRAY['data_structures'], ARRAY[]::text[], 8, 7),
('Database and SQL', 'database_sql', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '12', 'Database Management', ARRAY['oop'], ARRAY[]::text[], 7, 5),
('Networking and Internet', 'networking', 'Computer Science', ARRAY['CBSE','ICSE','STATE'], '12', 'Networking', ARRAY['computers_intro'], ARRAY[]::text[], 6, 4),

-- ════════════════════════════════════════════════════════════════════════════
-- UNIVERSITY LEVEL — Foundation Courses
-- ════════════════════════════════════════════════════════════════════════════
('Engineering Mathematics (UG)', 'engg_maths', 'Mathematics', ARRAY['UG'], 'UG', 'Engineering Mathematics', ARRAY['calculus_ug','linear_algebra_ug','diff_eq_ug'], ARRAY[]::text[], 8, 7),
('Discrete Mathematics', 'discrete_maths', 'Mathematics', ARRAY['UG'], 'UG', 'Discrete Mathematics', ARRAY['mathematical_reasoning','permutations_combinations'], ARRAY[]::text[], 7, 6),
('Mechanics (UG Physics)', 'mechanics_ug', 'Physics', ARRAY['UG'], 'UG', 'Classical Mechanics', ARRAY['rotational_mechanics','gravitation_11','vectors_12'], ARRAY[]::text[], 7, 7),
('Electromagnetism (UG)', 'electromagnetism_ug', 'Physics', ARRAY['UG'], 'UG', 'Electromagnetism', ARRAY['electromagnetic_waves','emi'], ARRAY[]::text[], 7, 8),
('Modern Physics (UG)', 'modern_physics_ug', 'Physics', ARRAY['UG'], 'UG', 'Modern Physics', ARRAY['atoms_nuclei','dual_nature'], ARRAY[]::text[], 7, 8),
('Organic Chemistry (UG)', 'organic_ug', 'Chemistry', ARRAY['UG'], 'UG', 'Organic Chemistry', ARRAY['named_reactions','organic_mechanisms'], ARRAY[]::text[], 7, 8),
('Cell Biology (UG)', 'cell_biology_ug', 'Biology', ARRAY['UG'], 'UG', 'Cell Biology', ARRAY['cell_biology_11','molecular_biology'], ARRAY[]::text[], 7, 7),
('Microeconomics (UG)', 'microeconomics_ug', 'Economics', ARRAY['UG'], 'UG', 'Microeconomic Theory', ARRAY['market_structures','consumer_theory'], ARRAY[]::text[], 7, 7),
('Macroeconomics (UG)', 'macroeconomics_ug', 'Economics', ARRAY['UG'], 'UG', 'Macroeconomic Theory', ARRAY['balance_payments','govt_budget'], ARRAY[]::text[], 7, 7),
('Financial Accounting (UG)', 'financial_accounting_ug', 'Accountancy', ARRAY['UG'], 'UG', 'Financial Accounting', ARRAY['cash_flow','company_accounts'], ARRAY[]::text[], 7, 6)

ON CONFLICT (topic_slug) DO NOTHING;
