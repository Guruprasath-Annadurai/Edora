-- ═══════════════════════════════════════════════════════════════════════════════
-- Knowledge Graph + PYQ Difficulty Bias — upgrade 8
--
-- 11. concept_graph: adjacency table for JEE/NEET prerequisite chains
--     expand_weak_concepts(): expands weak subtopics to include prereqs + unlocks
-- 12. search_corpus_unified: p_mode param; PYQ difficulty/year bias for sprint
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Concept graph table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_graph (
  concept  TEXT PRIMARY KEY,
  requires TEXT[] NOT NULL DEFAULT '{}',
  unlocks  TEXT[] NOT NULL DEFAULT '{}'
);

-- Bidirectional index so both requires/unlocks are searchable
CREATE INDEX IF NOT EXISTS concept_graph_requires_idx ON public.concept_graph USING gin(requires);
CREATE INDEX IF NOT EXISTS concept_graph_unlocks_idx  ON public.concept_graph USING gin(unlocks);

-- ── 2. Seed data — JEE/NEET prerequisite chains ───────────────────────────────
-- Physics — Mechanics
INSERT INTO public.concept_graph (concept, requires, unlocks) VALUES
  ('vectors',              '{}',                                   ARRAY['kinematics_2d','torque','work_energy','electric_field','magnetic_effects']),
  ('kinematics_1d',        '{}',                                   ARRAY['kinematics_2d','newton_laws']),
  ('kinematics_2d',        ARRAY['kinematics_1d','vectors'],       ARRAY['projectile_motion','circular_motion','relative_motion']),
  ('projectile_motion',    ARRAY['kinematics_2d'],                 '{}'),
  ('newton_laws',          ARRAY['kinematics_2d'],                 ARRAY['friction','work_energy','circular_motion','torque','gravitation']),
  ('friction',             ARRAY['newton_laws'],                   ARRAY['work_energy']),
  ('work_energy',          ARRAY['newton_laws','vectors'],         ARRAY['power','collision','simple_harmonic_motion']),
  ('power',                ARRAY['work_energy'],                   '{}'),
  ('collision',            ARRAY['work_energy'],                   '{}'),
  ('circular_motion',      ARRAY['kinematics_2d','newton_laws'],   ARRAY['rotational_motion','simple_harmonic_motion','gravitation']),
  ('torque',               ARRAY['newton_laws','vectors'],         ARRAY['rotational_motion','angular_momentum']),
  ('rotational_motion',    ARRAY['circular_motion','torque'],      ARRAY['moment_of_inertia','angular_momentum','rolling_motion']),
  ('moment_of_inertia',    ARRAY['rotational_motion'],             ARRAY['angular_momentum','rolling_motion']),
  ('angular_momentum',     ARRAY['torque','moment_of_inertia'],    '{}'),
  ('rolling_motion',       ARRAY['rotational_motion','moment_of_inertia'], '{}'),
  ('gravitation',          ARRAY['newton_laws','circular_motion'], ARRAY['satellite_motion']),
  ('satellite_motion',     ARRAY['gravitation'],                   '{}'),
  ('simple_harmonic_motion', ARRAY['work_energy','circular_motion'], ARRAY['waves','pendulum']),
  ('pendulum',             ARRAY['simple_harmonic_motion'],        '{}'),
-- Physics — Waves & Thermodynamics
  ('waves',                ARRAY['simple_harmonic_motion'],        ARRAY['sound','optics_wave','doppler_effect']),
  ('sound',                ARRAY['waves'],                         ARRAY['doppler_effect']),
  ('doppler_effect',       ARRAY['sound','waves'],                 '{}'),
  ('kinetic_theory',       '{}',                                   ARRAY['thermodynamics']),
  ('thermodynamics',       ARRAY['kinetic_theory'],                ARRAY['heat_transfer','carnot_cycle']),
  ('heat_transfer',        ARRAY['thermodynamics'],                '{}'),
  ('carnot_cycle',         ARRAY['thermodynamics'],                '{}'),
-- Physics — Electromagnetism
  ('electrostatics',       '{}',                                   ARRAY['electric_field','electric_potential','coulombs_law']),
  ('coulombs_law',         ARRAY['electrostatics'],                ARRAY['electric_field']),
  ('electric_field',       ARRAY['electrostatics','vectors'],      ARRAY['electric_potential','gauss_law']),
  ('gauss_law',            ARRAY['electric_field'],                '{}'),
  ('electric_potential',   ARRAY['electric_field','work_energy'],  ARRAY['capacitors','equipotential_surfaces']),
  ('capacitors',           ARRAY['electric_potential'],            ARRAY['current_electricity','dielectrics']),
  ('dielectrics',          ARRAY['capacitors'],                    '{}'),
  ('current_electricity',  ARRAY['electric_potential','capacitors'], ARRAY['magnetic_effects','ohms_law']),
  ('ohms_law',             ARRAY['current_electricity'],           ARRAY['kirchhoffs_laws']),
  ('kirchhoffs_laws',      ARRAY['ohms_law'],                      '{}'),
  ('magnetic_effects',     ARRAY['current_electricity','vectors'], ARRAY['electromagnetic_induction','lorentz_force','biot_savart']),
  ('biot_savart',          ARRAY['magnetic_effects'],              '{}'),
  ('lorentz_force',        ARRAY['magnetic_effects'],              '{}'),
  ('electromagnetic_induction', ARRAY['magnetic_effects'],         ARRAY['alternating_current','lenzs_law','faradays_law']),
  ('faradays_law',         ARRAY['electromagnetic_induction'],     '{}'),
  ('lenzs_law',            ARRAY['electromagnetic_induction'],     '{}'),
  ('alternating_current',  ARRAY['electromagnetic_induction','capacitors'], ARRAY['lc_circuits','transformers']),
  ('lc_circuits',          ARRAY['alternating_current'],           '{}'),
  ('transformers',         ARRAY['alternating_current'],           '{}'),
-- Physics — Optics & Modern
  ('optics_ray',           '{}',                                   ARRAY['reflection','refraction','lenses_mirrors']),
  ('reflection',           ARRAY['optics_ray'],                    ARRAY['mirrors']),
  ('refraction',           ARRAY['optics_ray'],                    ARRAY['lenses','total_internal_reflection','prism']),
  ('lenses_mirrors',       ARRAY['refraction','reflection'],       '{}'),
  ('total_internal_reflection', ARRAY['refraction'],               ARRAY['optical_fibre']),
  ('prism',                ARRAY['refraction'],                    ARRAY['dispersion_of_light']),
  ('optics_wave',          ARRAY['waves','optics_ray'],            ARRAY['interference','diffraction','polarisation']),
  ('interference',         ARRAY['optics_wave'],                   ARRAY['young_double_slit']),
  ('young_double_slit',    ARRAY['interference'],                  '{}'),
  ('diffraction',          ARRAY['optics_wave'],                   '{}'),
  ('polarisation',         ARRAY['optics_wave'],                   '{}'),
  ('photoelectric_effect', ARRAY['optics_wave'],                   ARRAY['atomic_structure_physics','wave_particle_duality']),
  ('wave_particle_duality',ARRAY['photoelectric_effect'],          '{}'),
  ('atomic_structure_physics', ARRAY['electrostatics','photoelectric_effect'], ARRAY['nuclear_physics','bohr_model']),
  ('bohr_model',           ARRAY['atomic_structure_physics'],      '{}'),
  ('nuclear_physics',      ARRAY['atomic_structure_physics'],      ARRAY['radioactivity','nuclear_fission_fusion']),
  ('radioactivity',        ARRAY['nuclear_physics'],               '{}'),
  ('nuclear_fission_fusion', ARRAY['nuclear_physics'],             '{}'),
-- Maths — Algebra & Trigonometry
  ('sets_relations',       '{}',                                   ARRAY['functions','relations_types']),
  ('functions',            ARRAY['sets_relations'],                ARRAY['limits','inverse_functions','composite_functions']),
  ('trigonometry',         '{}',                                   ARRAY['inverse_trig','complex_numbers','coordinate_geometry','vectors']),
  ('inverse_trig',         ARRAY['trigonometry'],                  ARRAY['integration']),
  ('complex_numbers',      ARRAY['trigonometry'],                  ARRAY['quadratic_equations','de_moivre_theorem']),
  ('quadratic_equations',  ARRAY['complex_numbers'],               ARRAY['sequences_series','theory_of_equations']),
  ('sequences_series',     ARRAY['quadratic_equations'],           ARRAY['binomial_theorem','limits']),
  ('binomial_theorem',     ARRAY['permutations_combinations'],     ARRAY['sequences_series']),
  ('permutations_combinations', '{}',                              ARRAY['probability','binomial_theorem']),
  ('probability',          ARRAY['permutations_combinations'],     ARRAY['bayes_theorem','random_variables']),
  ('bayes_theorem',        ARRAY['probability'],                   '{}'),
  ('matrices_determinants','{}',                                   ARRAY['system_of_equations','inverse_matrices']),
  ('system_of_equations',  ARRAY['matrices_determinants'],         '{}'),
-- Maths — Calculus
  ('limits',               ARRAY['functions','sequences_series'],  ARRAY['continuity','lhopital']),
  ('continuity',           ARRAY['limits'],                        ARRAY['differentiation']),
  ('differentiation',      ARRAY['continuity'],                    ARRAY['applications_derivatives','integration','rolle_mvt']),
  ('applications_derivatives', ARRAY['differentiation'],          ARRAY['maxima_minima','tangent_normal']),
  ('maxima_minima',        ARRAY['applications_derivatives'],      '{}'),
  ('integration',          ARRAY['differentiation','inverse_trig'],ARRAY['definite_integrals','area_under_curve','differential_equations']),
  ('definite_integrals',   ARRAY['integration'],                   ARRAY['area_under_curve']),
  ('area_under_curve',     ARRAY['definite_integrals'],            '{}'),
  ('differential_equations', ARRAY['integration'],                 '{}'),
-- Maths — Coordinate Geometry
  ('straight_lines',       ARRAY['trigonometry'],                  ARRAY['circles','distance_formula','angle_bisectors']),
  ('circles',              ARRAY['straight_lines'],                ARRAY['conic_sections','radical_axis']),
  ('conic_sections',       ARRAY['circles'],                       ARRAY['parabola','ellipse','hyperbola']),
  ('parabola',             ARRAY['conic_sections'],                '{}'),
  ('ellipse',              ARRAY['conic_sections'],                '{}'),
  ('hyperbola',            ARRAY['conic_sections'],                '{}'),
  ('vectors_3d',           ARRAY['trigonometry','vectors'],        ARRAY['3d_geometry','cross_product','dot_product']),
  ('3d_geometry',          ARRAY['vectors_3d'],                    ARRAY['planes_lines_3d']),
-- Chemistry — Physical
  ('atomic_structure',     '{}',                                   ARRAY['periodic_table','quantum_numbers','orbitals']),
  ('periodic_table',       ARRAY['atomic_structure'],              ARRAY['chemical_bonding','periodic_trends']),
  ('periodic_trends',      ARRAY['periodic_table'],                '{}'),
  ('chemical_bonding',     ARRAY['periodic_table'],                ARRAY['states_of_matter','molecular_structure','vsepr']),
  ('vsepr',                ARRAY['chemical_bonding'],              '{}'),
  ('molecular_structure',  ARRAY['chemical_bonding'],              '{}'),
  ('states_of_matter',     ARRAY['chemical_bonding'],              ARRAY['thermodynamics_chem','solutions']),
  ('solutions',            ARRAY['states_of_matter'],              ARRAY['colligative_properties']),
  ('colligative_properties', ARRAY['solutions'],                   '{}'),
  ('thermodynamics_chem',  ARRAY['states_of_matter'],              ARRAY['equilibrium','hess_law','gibbs_energy']),
  ('hess_law',             ARRAY['thermodynamics_chem'],           '{}'),
  ('gibbs_energy',         ARRAY['thermodynamics_chem'],           ARRAY['equilibrium']),
  ('equilibrium',          ARRAY['thermodynamics_chem'],           ARRAY['ionic_equilibrium','le_chatelier','chemical_kinetics']),
  ('le_chatelier',         ARRAY['equilibrium'],                   '{}'),
  ('ionic_equilibrium',    ARRAY['equilibrium'],                   ARRAY['ph_buffer','solubility_product']),
  ('ph_buffer',            ARRAY['ionic_equilibrium'],             '{}'),
  ('solubility_product',   ARRAY['ionic_equilibrium'],             '{}'),
  ('chemical_kinetics',    ARRAY['equilibrium'],                   ARRAY['activation_energy','rate_laws','arrhenius']),
  ('rate_laws',            ARRAY['chemical_kinetics'],             '{}'),
  ('activation_energy',    ARRAY['chemical_kinetics'],             '{}'),
  ('redox_reactions',      ARRAY['chemical_bonding'],              ARRAY['electrochemistry','balancing_redox']),
  ('electrochemistry',     ARRAY['redox_reactions'],               ARRAY['nernst_equation','electrolysis','faraday_laws_electro']),
  ('nernst_equation',      ARRAY['electrochemistry'],              '{}'),
  ('electrolysis',         ARRAY['electrochemistry'],              '{}'),
-- Chemistry — Organic
  ('organic_basics',       ARRAY['chemical_bonding'],              ARRAY['isomerism','hybridisation','inductive_effect']),
  ('hybridisation',        ARRAY['organic_basics'],                ARRAY['hydrocarbons']),
  ('inductive_effect',     ARRAY['organic_basics'],                ARRAY['carbonyl_compounds']),
  ('isomerism',            ARRAY['organic_basics'],                ARRAY['hydrocarbons']),
  ('hydrocarbons',         ARRAY['hybridisation','isomerism'],     ARRAY['functional_groups','halogenation']),
  ('functional_groups',    ARRAY['hydrocarbons'],                  ARRAY['alcohols_ethers','carbonyl_compounds','amines','carboxylic_acids']),
  ('alcohols_ethers',      ARRAY['functional_groups'],             '{}'),
  ('carbonyl_compounds',   ARRAY['functional_groups','inductive_effect'], ARRAY['aldehydes_ketones','carboxylic_acids','biomolecules']),
  ('aldehydes_ketones',    ARRAY['carbonyl_compounds'],            '{}'),
  ('carboxylic_acids',     ARRAY['carbonyl_compounds'],            '{}'),
  ('amines',               ARRAY['functional_groups'],             '{}'),
  ('biomolecules',         ARRAY['carbonyl_compounds'],            ARRAY['proteins','carbohydrates','nucleic_acids']),
  ('polymers',             ARRAY['functional_groups'],             '{}')
ON CONFLICT (concept) DO UPDATE
  SET requires = EXCLUDED.requires,
      unlocks  = EXCLUDED.unlocks;

-- ── 3. expand_weak_concepts — returns input + prerequisites + unlocked concepts ─
-- Uses ILIKE to handle partial matches between free-text subtopics and graph keys.
-- e.g. "torque (ch7)" still fuzzy-matches the "torque" node.
CREATE OR REPLACE FUNCTION public.expand_weak_concepts(
  p_concepts TEXT[]
)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT elem
    FROM (
      -- always include original inputs
      SELECT unnest(p_concepts) AS elem
      UNION
      -- prerequisites of matched concepts
      SELECT unnest(cg.requires)
      FROM concept_graph cg
      WHERE EXISTS (
        SELECT 1 FROM unnest(p_concepts) c(t)
        WHERE lower(cg.concept) ILIKE '%' || lower(trim(c.t)) || '%'
           OR lower(trim(c.t)) ILIKE '%' || lower(cg.concept) || '%'
      )
      UNION
      -- concepts unlocked by (downstream of) matched concepts
      SELECT unnest(cg.unlocks)
      FROM concept_graph cg
      WHERE EXISTS (
        SELECT 1 FROM unnest(p_concepts) c(t)
        WHERE lower(cg.concept) ILIKE '%' || lower(trim(c.t)) || '%'
           OR lower(trim(c.t)) ILIKE '%' || lower(cg.concept) || '%'
      )
    ) sub(elem)
    WHERE elem IS NOT NULL AND trim(elem) <> ''
  );
$$;

-- ── 4. search_corpus_unified — add p_mode + PYQ difficulty bias ───────────────
CREATE OR REPLACE FUNCTION public.search_corpus_unified(
  p_embedding        vector(768),
  p_query_text       TEXT,
  p_user_id          UUID,
  p_institution_id   UUID      DEFAULT NULL,
  p_filter_subj      TEXT      DEFAULT NULL,
  p_min_class        INTEGER   DEFAULT NULL,
  p_max_class        INTEGER   DEFAULT NULL,
  p_weak_subtopics   TEXT[]    DEFAULT '{}',
  p_seen_chunk_ids   UUID[]    DEFAULT '{}',
  p_include_pyq      BOOLEAN   DEFAULT true,
  p_include_user     BOOLEAN   DEFAULT true,
  p_include_school   BOOLEAN   DEFAULT true,
  p_top_k            INTEGER   DEFAULT 10,
  p_rrf_k            INTEGER   DEFAULT 60,
  p_embedding_q      vector(768) DEFAULT NULL,
  p_embedding_c      vector(768) DEFAULT NULL,
  -- NEW: 'sprint' = boost JEE Advanced hard 2020-2024; 'study' = boost easy/medium
  p_mode             TEXT      DEFAULT 'study'
)
RETURNS TABLE (
  id             UUID,
  content        TEXT,
  subject        TEXT,
  chapter_title  TEXT,
  section_title  TEXT,
  content_type   TEXT,
  chunk_level    TEXT,
  parent_id      UUID,
  corpus_source  TEXT,
  source_meta    JSONB,
  final_score    FLOAT8
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_query TEXT := NULLIF(btrim(p_query_text), '');
BEGIN
  RETURN QUERY
  WITH
  -- ── NCERT source — multi-vector OR ─────────────────────────────────────────
  ncert_vec AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY LEAST(
               embedding <=> p_embedding,
               CASE WHEN p_embedding_q IS NOT NULL AND embedding_q IS NOT NULL
                    THEN embedding_q <=> p_embedding_q ELSE 1.0 END,
               CASE WHEN p_embedding_c IS NOT NULL AND embedding_c IS NOT NULL
                    THEN embedding_c <=> p_embedding_c ELSE 1.0 END
             )
           ) AS rank
    FROM   ncert_content
    WHERE  embedding IS NOT NULL
      AND  (p_min_class IS NULL OR class_num >= p_min_class)
      AND  (p_max_class IS NULL OR class_num <= p_max_class)
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY LEAST(
      embedding <=> p_embedding,
      CASE WHEN p_embedding_q IS NOT NULL AND embedding_q IS NOT NULL
           THEN embedding_q <=> p_embedding_q ELSE 1.0 END,
      CASE WHEN p_embedding_c IS NOT NULL AND embedding_c IS NOT NULL
           THEN embedding_c <=> p_embedding_c ELSE 1.0 END
    )
    LIMIT 15
  ),
  ncert_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   ncert_content
    WHERE  v_safe_query IS NOT NULL
      AND  content_tsv @@ websearch_to_tsquery('english', v_safe_query)
      AND  (p_min_class IS NULL OR class_num >= p_min_class)
      AND  (p_max_class IS NULL OR class_num <= p_max_class)
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    LIMIT 15
  ),
  ncert_rrf AS (
    SELECT COALESCE(v.id, f.id) AS id,
           (COALESCE(1.0/(p_rrf_k + v.rank), 0) + COALESCE(1.0/(p_rrf_k + f.rank), 0)) * 1.0 AS rrf
    FROM   (SELECT id FROM ncert_vec UNION SELECT id FROM ncert_fts) ids
    LEFT JOIN ncert_vec v ON v.id = ids.id
    LEFT JOIN ncert_fts f ON f.id = ids.id
  ),
  -- ── PYQ source ─────────────────────────────────────────────────────────────
  pyq_vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   pyq_content
    WHERE  embedding IS NOT NULL AND p_include_pyq
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 10
  ),
  pyq_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   pyq_content
    WHERE  v_safe_query IS NOT NULL AND p_include_pyq
      AND  content_tsv @@ websearch_to_tsquery('english', v_safe_query)
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    LIMIT 10
  ),
  pyq_rrf AS (
    SELECT COALESCE(v.id, f.id) AS id,
           (COALESCE(1.0/(p_rrf_k + v.rank), 0) + COALESCE(1.0/(p_rrf_k + f.rank), 0)) * 0.95 AS rrf
    FROM   (SELECT id FROM pyq_vec UNION SELECT id FROM pyq_fts) ids
    LEFT JOIN pyq_vec v ON v.id = ids.id
    LEFT JOIN pyq_fts f ON f.id = ids.id
  ),
  -- ── User private source ────────────────────────────────────────────────────
  user_vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   user_content_index
    WHERE  embedding IS NOT NULL AND p_include_user AND user_id = p_user_id
    ORDER BY embedding <=> p_embedding
    LIMIT 8
  ),
  user_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   user_content_index
    WHERE  v_safe_query IS NOT NULL AND p_include_user AND user_id = p_user_id
      AND  content_tsv @@ websearch_to_tsquery('english', v_safe_query)
    LIMIT 8
  ),
  user_rrf AS (
    SELECT COALESCE(v.id, f.id) AS id,
           (COALESCE(1.0/(p_rrf_k + v.rank), 0) + COALESCE(1.0/(p_rrf_k + f.rank), 0)) * 1.3 AS rrf
    FROM   (SELECT id FROM user_vec UNION SELECT id FROM user_fts) ids
    LEFT JOIN user_vec v ON v.id = ids.id
    LEFT JOIN user_fts f ON f.id = ids.id
  ),
  -- ── School source ──────────────────────────────────────────────────────────
  school_vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   school_content_index
    WHERE  embedding IS NOT NULL AND p_include_school
      AND  p_institution_id IS NOT NULL AND institution_id = p_institution_id
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 8
  ),
  school_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   school_content_index
    WHERE  v_safe_query IS NOT NULL AND p_include_school
      AND  p_institution_id IS NOT NULL AND institution_id = p_institution_id
      AND  content_tsv @@ websearch_to_tsquery('english', v_safe_query)
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    LIMIT 8
  ),
  school_rrf AS (
    SELECT COALESCE(v.id, f.id) AS id,
           (COALESCE(1.0/(p_rrf_k + v.rank), 0) + COALESCE(1.0/(p_rrf_k + f.rank), 0)) * 1.2 AS rrf
    FROM   (SELECT id FROM school_vec UNION SELECT id FROM school_fts) ids
    LEFT JOIN school_vec v ON v.id = ids.id
    LEFT JOIN school_fts f ON f.id = ids.id
  ),
  -- ── Union + personalization ────────────────────────────────────────────────
  all_scored AS (
    SELECT
      nc.id, nc.content, nc.subject, nc.chapter_title, nc.section_title,
      nc.content_type, nc.chunk_level, nc.parent_id,
      'ncert'::TEXT AS corpus_source,
      jsonb_build_object('class_num', nc.class_num, 'source_type', nc.source_type) AS source_meta,
      r.rrf
      + CASE WHEN array_length(p_weak_subtopics,1) > 0 AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) ws(term)
            WHERE lower(nc.chapter_title||' '||COALESCE(nc.section_title,'')) LIKE '%'||lower(ws.term)||'%')
          THEN 0.08 ELSE 0 END
      - CASE WHEN nc.id = ANY(p_seen_chunk_ids) THEN 0.06 ELSE 0 END AS final_score
    FROM ncert_rrf r JOIN ncert_content nc ON nc.id = r.id
    UNION ALL
    SELECT
      p.id,
      p.question_text || E'\n\n**Solution:**\n' || COALESCE(p.solution_text, '') AS content,
      p.subject, p.chapter AS chapter_title, NULL AS section_title,
      'pyq'::TEXT, 'paragraph'::TEXT, NULL::UUID,
      'pyq'::TEXT,
      jsonb_build_object('exam', p.exam, 'year', p.year, 'difficulty', p.difficulty),
      r.rrf
      + CASE WHEN array_length(p_weak_subtopics,1) > 0 AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) ws(term)
            WHERE lower(p.chapter||' '||p.subject) LIKE '%'||lower(ws.term)||'%')
          THEN 0.08 ELSE 0 END
      -- 12. PYQ difficulty-aware bias
      + CASE
          WHEN p_mode = 'sprint' AND p.difficulty = 'hard'   AND p.year >= 2020 THEN 0.15
          WHEN p_mode = 'sprint' AND p.difficulty = 'hard'                       THEN 0.08
          WHEN p_mode = 'sprint' AND p.difficulty = 'medium'                     THEN 0.03
          WHEN p_mode = 'study'  AND p.difficulty IN ('easy','medium')            THEN 0.05
          ELSE 0
        END
      - CASE WHEN p.id = ANY(p_seen_chunk_ids) THEN 0.06 ELSE 0 END
    FROM pyq_rrf r JOIN pyq_content p ON p.id = r.id
    UNION ALL
    SELECT
      u.id, u.content, u.subject,
      COALESCE(u.topic, u.source_type), NULL,
      u.source_type, 'paragraph'::TEXT, NULL::UUID,
      'user'::TEXT,
      jsonb_build_object('source_type', u.source_type),
      r.rrf
    FROM user_rrf r JOIN user_content_index u ON u.id = r.id
    UNION ALL
    SELECT
      s.id, s.content, s.subject, s.title, NULL,
      'teacher_upload'::TEXT, 'paragraph'::TEXT, s.parent_doc_id,
      'school'::TEXT,
      jsonb_build_object('grade', s.grade, 'institution_id', s.institution_id),
      r.rrf
      + CASE WHEN array_length(p_weak_subtopics,1) > 0 AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) ws(term)
            WHERE lower(s.title||' '||COALESCE(s.subject,'')) LIKE '%'||lower(ws.term)||'%')
          THEN 0.08 ELSE 0 END
    FROM school_rrf r JOIN school_content_index s ON s.id = r.id
  )
  SELECT
    id, content, subject, chapter_title, section_title,
    content_type, chunk_level, parent_id,
    corpus_source, source_meta, final_score
  FROM all_scored
  ORDER BY final_score DESC
  LIMIT p_top_k;
END;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.concept_graph TO service_role;
GRANT SELECT ON public.concept_graph TO authenticated;
GRANT EXECUTE ON FUNCTION public.expand_weak_concepts  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_corpus_unified TO authenticated, service_role;
