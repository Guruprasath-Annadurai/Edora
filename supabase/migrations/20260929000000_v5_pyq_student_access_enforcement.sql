-- V5 Backend: PYQ Student Access Enforcement & RLS Hardening
--
-- V5 Requirement: UNREVIEWED PYQ CONTENT MUST BE UNREACHABLE FROM STUDENT-FACING ACCESS.
--
-- 1. Replaces permissive `pyq_public_read` policy (which only checked `is_active = true`)
--    with strict `pyq_student_reviewed_read` policy for anon & authenticated roles.
--    Students can ONLY read questions that are active, unflagged, and validated as
--    'ai_reviewed_ok' or 'human_verified'.
-- 2. Grants full access to `service_role` for administration, auditing, and ingestion.
-- 3. Hardens `search_corpus_unified` SECURITY DEFINER RPC to enforce the strict
--    PYQ trust predicate in both candidate CTEs (pyq_vec, pyq_fts) and final join.
-- 4. Hardens `pyq_topic_frequency` view to count only active, reviewed PYQs.

-- ── 1. RLS Policies on public.pyq_content ────────────────────────────────────

ALTER TABLE public.pyq_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pyq_public_read ON public.pyq_content;
DROP POLICY IF EXISTS "pyq_public_read" ON public.pyq_content;
DROP POLICY IF EXISTS "pyq_student_reviewed_read" ON public.pyq_content;

CREATE POLICY "pyq_student_reviewed_read"
  ON public.pyq_content
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND flagged_for_review = false
    AND is_reviewed = true
    AND validation_state IN ('ai_reviewed_ok', 'human_verified')
  );

DROP POLICY IF EXISTS "pyq_service_admin_all" ON public.pyq_content;
CREATE POLICY "pyq_service_admin_all"
  ON public.pyq_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "pyq_student_reviewed_read" ON public.pyq_content IS
  'V5 Student Protection: Restricts student and public reads strictly to active, unflagged, reviewed PYQs.';

COMMENT ON POLICY "pyq_service_admin_all" ON public.pyq_content IS
  'Allows service_role unrestricted access to audit, ingest, and manage PYQ content.';

-- ── 2. Harden search_corpus_unified (SECURITY DEFINER) ────────────────────────
-- gemini-chat invokes search_corpus_unified via serviceDb (service_role). Because
-- the function is SECURITY DEFINER, RLS does NOT filter pyq_content inside it.
-- Defense-in-depth: strict trust predicate applied in pyq_vec, pyq_fts, and final join.

CREATE OR REPLACE FUNCTION public.search_corpus_unified(
  p_embedding        vector(768),
  p_query_text       TEXT,
  p_user_id          UUID,
  p_institution_id   UUID        DEFAULT NULL,
  p_filter_subj      TEXT        DEFAULT NULL,
  p_min_class        INTEGER     DEFAULT NULL,
  p_max_class        INTEGER     DEFAULT NULL,
  p_weak_subtopics   TEXT[]      DEFAULT '{}',
  p_seen_chunk_ids   UUID[]      DEFAULT '{}',
  p_include_pyq      BOOLEAN     DEFAULT true,
  p_include_user     BOOLEAN     DEFAULT true,
  p_include_school   BOOLEAN     DEFAULT true,
  p_top_k            INTEGER     DEFAULT 10,
  p_rrf_k            INTEGER     DEFAULT 60,
  p_embedding_q      vector(768) DEFAULT NULL,
  p_embedding_c      vector(768) DEFAULT NULL,
  p_mode             TEXT        DEFAULT 'study'
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
SET search_path = public, extensions
AS $$
#variable_conflict use_column
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
  -- ── PYQ source (STRICT TRUST: active, unflagged, reviewed, verified only) ───
  pyq_vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   pyq_content
    WHERE  embedding IS NOT NULL AND p_include_pyq
      AND  is_active = true
      AND  flagged_for_review = false
      AND  is_reviewed = true
      AND  validation_state IN ('ai_reviewed_ok', 'human_verified')
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 10
  ),
  pyq_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   pyq_content
    WHERE  v_safe_query IS NOT NULL AND p_include_pyq
      AND  is_active = true
      AND  flagged_for_review = false
      AND  is_reviewed = true
      AND  validation_state IN ('ai_reviewed_ok', 'human_verified')
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
      -- PYQ difficulty-aware bias
      + CASE
          WHEN p_mode = 'sprint' AND p.difficulty = 'hard'   AND p.year >= 2020 THEN 0.15
          WHEN p_mode = 'sprint' AND p.difficulty = 'hard'                       THEN 0.08
          WHEN p_mode = 'sprint' AND p.difficulty = 'medium'                     THEN 0.03
          WHEN p_mode = 'study'  AND p.difficulty IN ('easy','medium')            THEN 0.05
          ELSE 0
        END
      - CASE WHEN p.id = ANY(p_seen_chunk_ids) THEN 0.06 ELSE 0 END
    FROM pyq_rrf r
    JOIN pyq_content p ON p.id = r.id
      -- Defense-in-depth: guarantee no untrusted PYQ ever passes final join
      AND p.is_active = true
      AND p.flagged_for_review = false
      AND p.is_reviewed = true
      AND p.validation_state IN ('ai_reviewed_ok', 'human_verified')
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
    corpus_source, source_meta, final_score::float8
  FROM all_scored
  ORDER BY final_score DESC
  LIMIT p_top_k;
END;
$$;

-- Preserve permissions: service_role only (revoked from authenticated in RISK-034)
REVOKE EXECUTE ON FUNCTION public.search_corpus_unified(
  vector, text, uuid, uuid, text, integer, integer, text[], uuid[],
  boolean, boolean, boolean, integer, integer, vector, vector, text
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_corpus_unified(
  vector, text, uuid, uuid, text, integer, integer, text[], uuid[],
  boolean, boolean, boolean, integer, integer, vector, vector, text
) TO service_role;

COMMENT ON FUNCTION public.search_corpus_unified IS
  'V5 Hardened: RAG corpus search with triple-layer defense-in-depth restricting PYQs to active, unflagged, reviewed content.';

-- ── 3. Harden pyq_topic_frequency view ────────────────────────────────────────
-- PYQBankPage displays frequency heatmap from pyq_topic_frequency.
-- Filter view to active, unflagged, reviewed questions so counts truthfully reflect trusted content.

CREATE OR REPLACE VIEW public.pyq_topic_frequency AS
SELECT
  exam AS exam_type,
  subject,
  chapter,
  chapter AS concept,
  class_level,
  count(*) AS total_questions,
  count(DISTINCT year) AS years_appeared,
  avg(CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 2 END) AS avg_difficulty,
  max(year) AS last_year
FROM public.pyq_content
WHERE is_active = true
  AND flagged_for_review = false
  AND is_reviewed = true
  AND validation_state IN ('ai_reviewed_ok', 'human_verified')
GROUP BY exam, subject, chapter, class_level;

GRANT SELECT ON public.pyq_topic_frequency TO anon, authenticated, service_role;
