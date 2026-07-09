-- ═══════════════════════════════════════════════════════════════════════════════
-- Corpus Layer 6 — Multi-source RAG corpus
--
-- Sources (in retrieval priority order):
--   1. ncert_content    — NCERT Class 6–12 (existing, extended)
--   2. pyq_content      — JEE/NEET PYQs + official solutions 2000–2024 (NEW)
--   3. user_content_index — per-user private notes + flashcard backs (NEW)
--   4. school_content_index — institution-scoped teacher uploads (NEW)
--
-- Unified search: search_corpus_unified() queries all 4 with per-source weights,
-- applies study-level class filter, weak subtopic boost, seen chunk penalty,
-- and returns results with corpus_source attribution.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add source_type to ncert_content (back-compat default = 'ncert') ───────
ALTER TABLE public.ncert_content
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'ncert'
    CHECK (source_type IN ('ncert','novo_insight','novo_read'));

CREATE INDEX IF NOT EXISTS ncert_source_type_idx ON public.ncert_content (source_type);

-- ── 2. pyq_content — JEE/NEET Past Year Questions with solutions ──────────────
CREATE TABLE IF NOT EXISTS public.pyq_content (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam             TEXT        NOT NULL CHECK (exam IN ('JEE_MAIN','JEE_ADV','NEET','BITSAT','BOARDS')),
  year             SMALLINT    NOT NULL,
  subject          TEXT        NOT NULL,    -- 'Physics' | 'Chemistry' | 'Math' | 'Biology'
  chapter          TEXT        NOT NULL,
  question_text    TEXT        NOT NULL,
  solution_text    TEXT,
  options          JSONB       NOT NULL DEFAULT '[]',  -- [{label:'A',text:'...',correct:true}]
  correct_option   TEXT,
  question_type    TEXT        NOT NULL DEFAULT 'mcq'
                   CHECK (question_type IN ('mcq','integer','subjective')),
  difficulty       TEXT        NOT NULL DEFAULT 'medium'
                   CHECK (difficulty IN ('easy','medium','hard')),
  marks            SMALLINT    NOT NULL DEFAULT 4,
  content_hash     TEXT,       -- SHA-256[:16] for dedup
  content_tsv      tsvector    GENERATED ALWAYS AS (
    to_tsvector('english',
      question_text || ' ' || chapter || ' ' || subject ||
      ' ' || COALESCE(solution_text, ''))
  ) STORED,
  embedding        vector(768),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_exam_year_idx      ON public.pyq_content (exam, year);
CREATE INDEX IF NOT EXISTS pyq_subject_idx         ON public.pyq_content (subject);
CREATE INDEX IF NOT EXISTS pyq_chapter_idx         ON public.pyq_content (chapter);
CREATE INDEX IF NOT EXISTS pyq_tsv_idx             ON public.pyq_content USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS pyq_content_hash_idx    ON public.pyq_content (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS pyq_embedding_idx       ON public.pyq_content USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.pyq_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pyq_public_read" ON public.pyq_content FOR SELECT USING (true);
-- Write: service_role only (bypasses RLS)

-- ── 3. user_content_index — per-user private notes + flashcard backs ──────────
CREATE TABLE IF NOT EXISTS public.user_content_index (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type  TEXT        NOT NULL CHECK (source_type IN ('flashcard','study_note','sr_card')),
  source_id    UUID        NOT NULL,
  content      TEXT        NOT NULL,    -- combined front+back or note content
  subject      TEXT,
  topic        TEXT,
  content_tsv  tsvector    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding    vector(768),
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS uci_user_idx       ON public.user_content_index (user_id);
CREATE INDEX IF NOT EXISTS uci_tsv_idx        ON public.user_content_index USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS uci_embedding_idx  ON public.user_content_index USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.user_content_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uci_own"          ON public.user_content_index FOR ALL   USING (auth.uid() = user_id);
-- Service role can write (for indexing edge function)

-- ── 4. school_content_index — institution-scoped teacher uploads ──────────────
CREATE TABLE IF NOT EXISTS public.school_content_index (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  uploaded_by      UUID        NOT NULL REFERENCES auth.users(id),
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL,
  subject          TEXT,
  grade            TEXT,       -- e.g. 'Class 11'
  file_url         TEXT,       -- Supabase Storage URL for original file
  chunk_index      INT         NOT NULL DEFAULT 0,  -- chunk number within the doc
  parent_doc_id    UUID,       -- groups all chunks from one upload
  content_tsv      tsvector    GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || content)
  ) STORED,
  embedding        vector(768),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sci_institution_idx  ON public.school_content_index (institution_id);
CREATE INDEX IF NOT EXISTS sci_subject_idx      ON public.school_content_index (subject);
CREATE INDEX IF NOT EXISTS sci_tsv_idx          ON public.school_content_index USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS sci_embedding_idx    ON public.school_content_index USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.school_content_index ENABLE ROW LEVEL SECURITY;
-- Students can read their institution's content
CREATE POLICY "sci_member_read" ON public.school_content_index FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.institution_members m
    WHERE m.institution_id = school_content_index.institution_id
      AND m.user_id = auth.uid()
  ));
-- Teachers/admins can write
CREATE POLICY "sci_teacher_write" ON public.school_content_index FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

-- ── 5. Corpus ingest status ─────────────────────────────────────────────────
-- Quick status check: how many chunks per source are embedded
CREATE OR REPLACE FUNCTION public.get_corpus_status()
RETURNS TABLE (source TEXT, total_chunks BIGINT, embedded_chunks BIGINT, pct_embedded NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ncert'  AS source,
         COUNT(*)                               AS total_chunks,
         COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_chunks,
         ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS pct_embedded
  FROM ncert_content
  UNION ALL
  SELECT 'pyq',
         COUNT(*), COUNT(*) FILTER (WHERE embedding IS NOT NULL),
         ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*),0), 1)
  FROM pyq_content
  UNION ALL
  SELECT 'user_notes',
         COUNT(*), COUNT(*) FILTER (WHERE embedding IS NOT NULL),
         ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*),0), 1)
  FROM user_content_index
  UNION ALL
  SELECT 'school',
         COUNT(*), COUNT(*) FILTER (WHERE embedding IS NOT NULL),
         ROUND(100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*),0), 1)
  FROM school_content_index;
$$;

-- ── 6. Unified corpus search ─────────────────────────────────────────────────
-- Queries all 4 sources, applies personalization signals, returns ranked results
-- with corpus_source attribution.
--
-- Source weights (applied to RRF score before final rank):
--   user notes  × 1.3  — personal, highest relevance
--   school      × 1.2  — curated teacher content
--   ncert       × 1.0  — standard corpus
--   pyq         × 0.95 — supplementary Q&A
--
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
  p_rrf_k            INTEGER   DEFAULT 60
)
RETURNS TABLE (
  id             UUID,
  content        TEXT,
  subject        TEXT,
  chapter_title  TEXT,    -- or question_text for pyq, title for school
  section_title  TEXT,
  content_type   TEXT,
  chunk_level    TEXT,
  parent_id      UUID,
  corpus_source  TEXT,    -- 'ncert' | 'pyq' | 'user' | 'school'
  source_meta    JSONB,   -- {year?, exam?, difficulty?, source_type?}
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
  -- ── NCERT source ─────────────────────────────────────────────────────────
  ncert_vec AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   ncert_content
    WHERE  embedding IS NOT NULL
      AND  (p_min_class IS NULL OR class_num >= p_min_class)
      AND  (p_max_class IS NULL OR class_num <= p_max_class)
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
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
  -- ── PYQ source ──────────────────────────────────────────────────────────
  pyq_vec AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   pyq_content
    WHERE  embedding IS NOT NULL
      AND  p_include_pyq
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 10
  ),
  pyq_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   pyq_content
    WHERE  v_safe_query IS NOT NULL
      AND  p_include_pyq
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
  -- ── User private source ─────────────────────────────────────────────────
  user_vec AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   user_content_index
    WHERE  embedding IS NOT NULL
      AND  p_include_user
      AND  user_id = p_user_id
    ORDER BY embedding <=> p_embedding
    LIMIT 8
  ),
  user_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   user_content_index
    WHERE  v_safe_query IS NOT NULL
      AND  p_include_user
      AND  user_id = p_user_id
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
  -- ── School source ───────────────────────────────────────────────────────
  school_vec AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM   school_content_index
    WHERE  embedding IS NOT NULL
      AND  p_include_school
      AND  p_institution_id IS NOT NULL
      AND  institution_id = p_institution_id
      AND  (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 8
  ),
  school_fts AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', v_safe_query)) DESC) AS rank
    FROM   school_content_index
    WHERE  v_safe_query IS NOT NULL
      AND  p_include_school
      AND  p_institution_id IS NOT NULL
      AND  institution_id = p_institution_id
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
  -- ── Union all sources with personalization adjustments ──────────────────
  all_scored AS (
    -- NCERT
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
    FROM ncert_rrf r
    JOIN ncert_content nc ON nc.id = r.id

    UNION ALL

    -- PYQ
    SELECT
      p.id,
      p.question_text || E'\n\n**Solution:**\n' || COALESCE(p.solution_text, '') AS content,
      p.subject, p.chapter AS chapter_title, NULL AS section_title,
      'pyq'::TEXT AS content_type, 'paragraph'::TEXT AS chunk_level, NULL::UUID AS parent_id,
      'pyq'::TEXT AS corpus_source,
      jsonb_build_object('exam', p.exam, 'year', p.year, 'difficulty', p.difficulty) AS source_meta,
      r.rrf
      + CASE WHEN array_length(p_weak_subtopics,1) > 0 AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) ws(term)
            WHERE lower(p.chapter||' '||p.subject) LIKE '%'||lower(ws.term)||'%')
          THEN 0.08 ELSE 0 END
      - CASE WHEN p.id = ANY(p_seen_chunk_ids) THEN 0.06 ELSE 0 END AS final_score
    FROM pyq_rrf r
    JOIN pyq_content p ON p.id = r.id

    UNION ALL

    -- User notes / flashcards
    SELECT
      u.id, u.content, u.subject,
      COALESCE(u.topic, u.source_type) AS chapter_title, NULL AS section_title,
      u.source_type AS content_type, 'paragraph'::TEXT AS chunk_level, NULL::UUID AS parent_id,
      'user'::TEXT AS corpus_source,
      jsonb_build_object('source_type', u.source_type) AS source_meta,
      r.rrf AS final_score
    FROM user_rrf r
    JOIN user_content_index u ON u.id = r.id

    UNION ALL

    -- School teacher content
    SELECT
      s.id, s.content, s.subject, s.title AS chapter_title, NULL AS section_title,
      'teacher_upload'::TEXT AS content_type, 'paragraph'::TEXT AS chunk_level,
      s.parent_doc_id AS parent_id,
      'school'::TEXT AS corpus_source,
      jsonb_build_object('grade', s.grade, 'institution_id', s.institution_id) AS source_meta,
      r.rrf
      + CASE WHEN array_length(p_weak_subtopics,1) > 0 AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) ws(term)
            WHERE lower(s.title||' '||COALESCE(s.subject,'')) LIKE '%'||lower(ws.term)||'%')
          THEN 0.08 ELSE 0 END AS final_score
    FROM school_rrf r
    JOIN school_content_index s ON s.id = r.id
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

-- ── 7. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT  ON public.pyq_content          TO authenticated;
GRANT SELECT  ON public.user_content_index   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_content_index TO authenticated;
GRANT SELECT  ON public.school_content_index TO authenticated;

GRANT EXECUTE ON FUNCTION public.search_corpus_unified TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_corpus_status     TO authenticated, service_role;
