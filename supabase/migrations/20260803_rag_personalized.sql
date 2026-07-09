-- ═══════════════════════════════════════════════════════════════════════════════
-- RAG Personalized — Layer 5 personalization signals
--
-- 1. rag_chunk_history        — per-user chunk deduplication (avoid repeating)
-- 2. upsert_chunk_history     — batch upsert after every RAG call
-- 3. get_recent_chunk_history — fetch recently seen chunk IDs (last N days)
-- 4. search_ncert_personalized — hybrid search + study-level class range +
--                                weak subtopic boost + seen chunk penalty
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Chunk history table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rag_chunk_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  chunk_id     UUID        NOT NULL REFERENCES public.ncert_content(id) ON DELETE CASCADE,
  used_count   INT         NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS rag_chunk_history_user_idx
  ON public.rag_chunk_history (user_id, last_used_at DESC);

ALTER TABLE public.rag_chunk_history ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; no public policy needed.

-- ── 2. Upsert chunk usage ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_chunk_history(
  p_user_id   UUID,
  p_chunk_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO rag_chunk_history (user_id, chunk_id, used_count, last_used_at)
  SELECT p_user_id, unnest(p_chunk_ids), 1, now()
  ON CONFLICT (user_id, chunk_id) DO UPDATE
    SET used_count   = rag_chunk_history.used_count + 1,
        last_used_at = now();
END;
$$;

-- ── 3. Fetch recent chunk history ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recent_chunk_history(
  p_user_id UUID,
  p_days    INT DEFAULT 7
)
RETURNS TABLE (chunk_id UUID, used_count INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT chunk_id, used_count
  FROM   rag_chunk_history
  WHERE  user_id      = p_user_id
    AND  last_used_at > now() - (p_days || ' days')::INTERVAL
  ORDER BY used_count DESC
  LIMIT 50;
$$;

-- ── 4. Personalized hybrid search ────────────────────────────────────────────
-- Extends search_ncert_hybrid with:
--   • p_min_class / p_max_class  — study-level class range pre-filter
--   • p_weak_subtopics TEXT[]    — boost +0.08 on title keyword match
--   • p_seen_chunk_ids UUID[]    — penalty -0.06 on recently-seen chunks
--
-- Scoring:  final = rrf_score + weak_boost - seen_penalty
--
CREATE OR REPLACE FUNCTION public.search_ncert_personalized(
  p_embedding        vector(768),
  p_query_text       TEXT,
  p_filter_subj      TEXT      DEFAULT NULL,
  p_min_class        INTEGER   DEFAULT NULL,
  p_max_class        INTEGER   DEFAULT NULL,
  p_weak_subtopics   TEXT[]    DEFAULT '{}',
  p_seen_chunk_ids   UUID[]    DEFAULT '{}',
  p_top_k            INTEGER   DEFAULT 8,
  p_rrf_k            INTEGER   DEFAULT 60
)
RETURNS TABLE (
  id             UUID,
  class_num      SMALLINT,
  subject        TEXT,
  chapter_title  TEXT,
  section_title  TEXT,
  content        TEXT,
  content_type   TEXT,
  chunk_level    TEXT,
  parent_id      UUID,
  final_score    FLOAT8
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Dense retrieval — class range + subject pre-filter applied here
  vec AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM ncert_content
    WHERE embedding IS NOT NULL
      AND (p_min_class  IS NULL OR class_num >= p_min_class)
      AND (p_max_class  IS NULL OR class_num <= p_max_class)
      AND (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 20
  ),
  -- Sparse retrieval — same pre-filters
  fts AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(content_tsv,
          websearch_to_tsquery('english', NULLIF(btrim(p_query_text), ''))) DESC
      ) AS rank
    FROM ncert_content
    WHERE NULLIF(btrim(p_query_text), '') IS NOT NULL
      AND content_tsv @@ websearch_to_tsquery('english', NULLIF(btrim(p_query_text), ''))
      AND (p_min_class  IS NULL OR class_num >= p_min_class)
      AND (p_max_class  IS NULL OR class_num <= p_max_class)
      AND (p_filter_subj IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY ts_rank_cd(content_tsv,
      websearch_to_tsquery('english', NULLIF(btrim(p_query_text), ''))) DESC
    LIMIT 20
  ),
  all_ids AS (
    SELECT id FROM vec
    UNION
    SELECT id FROM fts
  ),
  fused AS (
    SELECT
      a.id,
      COALESCE(1.0 / (p_rrf_k + vec.rank), 0.0) +
      COALESCE(1.0 / (p_rrf_k + fts.rank), 0.0) AS rrf_score
    FROM all_ids a
    LEFT JOIN vec ON vec.id = a.id
    LEFT JOIN fts ON fts.id = a.id
    ORDER BY rrf_score DESC
    LIMIT p_top_k * 2        -- over-fetch before personalization re-rank
  )
  SELECT
    nc.id,
    nc.class_num,
    nc.subject,
    nc.chapter_title,
    nc.section_title,
    nc.content,
    nc.content_type,
    nc.chunk_level,
    nc.parent_id,
    -- Personalized score
    f.rrf_score
    -- Weak subtopic boost: +0.08 when any weak term appears in title
    + CASE
        WHEN array_length(p_weak_subtopics, 1) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(p_weak_subtopics) AS ws(term)
            WHERE lower(nc.chapter_title || ' ' || COALESCE(nc.section_title, ''))
                  LIKE '%' || lower(ws.term) || '%'
          )
        THEN 0.08
        ELSE 0.0
      END
    -- Seen chunk penalty: -0.06 per chunk already served to this user recently
    - CASE WHEN nc.id = ANY(p_seen_chunk_ids) THEN 0.06 ELSE 0.0 END
    AS final_score
  FROM fused f
  JOIN ncert_content nc ON nc.id = f.id
  ORDER BY final_score DESC
  LIMIT p_top_k;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.upsert_chunk_history        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_chunk_history    TO service_role;
GRANT EXECUTE ON FUNCTION public.search_ncert_personalized   TO authenticated, service_role;
