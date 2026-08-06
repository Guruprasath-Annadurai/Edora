-- ═══════════════════════════════════════════════════════════════════════════════
-- RAG Advanced — Hierarchical chunks + Hybrid search (RRF) + Query cache
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Upgrade ncert_content with hierarchy ────────────────────────────────────
ALTER TABLE public.ncert_content
  ADD COLUMN IF NOT EXISTS chunk_level  TEXT NOT NULL DEFAULT 'paragraph'
    CHECK (chunk_level IN ('chapter','section','paragraph')),
  ADD COLUMN IF NOT EXISTS parent_id    UUID REFERENCES public.ncert_content(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,   -- SHA-256 first 16 chars for dedup
  ADD COLUMN IF NOT EXISTS token_count  INT;

CREATE INDEX IF NOT EXISTS ncert_parent_id_idx  ON public.ncert_content (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ncert_chunk_level_idx ON public.ncert_content (chunk_level);
CREATE INDEX IF NOT EXISTS ncert_content_hash_idx ON public.ncert_content (content_hash) WHERE content_hash IS NOT NULL;

-- ── 2. Query response cache ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rag_query_cache (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     TEXT        NOT NULL UNIQUE,   -- hash(normalized_query|subject|study_level)
  query_text    TEXT        NOT NULL,
  response_text TEXT        NOT NULL,
  chunk_ids     UUID[]      DEFAULT '{}',       -- which ncert_content rows were used
  subject       TEXT,
  study_level   TEXT,
  hit_count     INT         NOT NULL DEFAULT 1,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_cache_key_idx     ON public.rag_query_cache (cache_key);
CREATE INDEX IF NOT EXISTS rag_cache_expires_idx ON public.rag_query_cache (expires_at);

-- Cache is internal — only service role touches it
ALTER TABLE public.rag_query_cache ENABLE ROW LEVEL SECURITY;
-- No public policy: service role bypasses RLS

-- ── 3. Hybrid search function — pgvector + BM25 + Reciprocal Rank Fusion ──────
-- RRF formula: score = Σ 1/(k + rank_i),  k=60 (standard)
-- Runs both retrievers independently, fuses by chunk id, returns top-K.
CREATE OR REPLACE FUNCTION public.search_ncert_hybrid(
  p_embedding    vector(768),
  p_query_text   TEXT,
  p_filter_class INTEGER DEFAULT NULL,
  p_filter_subj  TEXT    DEFAULT NULL,
  p_top_k        INTEGER DEFAULT 6,
  p_rrf_k        INTEGER DEFAULT 60
)
RETURNS TABLE (
  id            UUID,
  class_num     SMALLINT,
  subject       TEXT,
  chapter_title TEXT,
  section_title TEXT,
  content       TEXT,
  content_type  TEXT,
  chunk_level   TEXT,
  parent_id     UUID,
  rrf_score     FLOAT8
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Dense retrieval: top-20 by cosine similarity
  vec AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM ncert_content
    WHERE embedding IS NOT NULL
      AND (p_filter_class IS NULL OR class_num = p_filter_class)
      AND (p_filter_subj  IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY embedding <=> p_embedding
    LIMIT 20
  ),
  -- Sparse retrieval: top-20 by BM25 (ts_rank_cd)
  fts AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', p_query_text)) DESC) AS rank
    FROM ncert_content
    WHERE content_tsv @@ websearch_to_tsquery('english', p_query_text)
      AND (p_filter_class IS NULL OR class_num = p_filter_class)
      AND (p_filter_subj  IS NULL OR subject ILIKE p_filter_subj)
    ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', p_query_text)) DESC
    LIMIT 20
  ),
  -- Union of candidate IDs
  all_ids AS (
    SELECT id FROM vec
    UNION
    SELECT id FROM fts
  ),
  -- RRF fusion
  fused AS (
    SELECT
      a.id,
      COALESCE(1.0 / (p_rrf_k + vec.rank), 0.0) +
      COALESCE(1.0 / (p_rrf_k + fts.rank), 0.0) AS rrf_score
    FROM all_ids a
    LEFT JOIN vec ON vec.id = a.id
    LEFT JOIN fts ON fts.id = a.id
    ORDER BY rrf_score DESC
    LIMIT p_top_k
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
    f.rrf_score
  FROM fused f
  JOIN ncert_content nc ON nc.id = f.id
  ORDER BY f.rrf_score DESC;
$$;

-- Parent chunk lookup (fetch chapter summary for a section hit)
CREATE OR REPLACE FUNCTION public.get_parent_chunk(p_id UUID)
RETURNS TABLE (id UUID, content TEXT, chapter_title TEXT, chunk_level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nc.id, nc.content, nc.chapter_title, nc.chunk_level
  FROM ncert_content nc
  WHERE nc.id = (SELECT parent_id FROM ncert_content WHERE id = p_id)
    AND nc.chunk_level = 'chapter';
$$;

-- ── 4. Cache management RPCs ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_rag_cache(p_key TEXT)
RETURNS TABLE (response_text TEXT, chunk_ids UUID[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bump hit stats on read
  UPDATE rag_query_cache
  SET hit_count  = hit_count + 1,
      last_hit_at = now()
  WHERE cache_key = p_key
    AND expires_at > now();

  RETURN QUERY
  SELECT rc.response_text, rc.chunk_ids
  FROM rag_query_cache rc
  WHERE rc.cache_key = p_key
    AND rc.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_rag_cache(
  p_key         TEXT,
  p_query       TEXT,
  p_response    TEXT,
  p_chunk_ids   UUID[],
  p_subject     TEXT,
  p_study_level TEXT,
  p_ttl_hours   INT DEFAULT 24
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO rag_query_cache (cache_key, query_text, response_text, chunk_ids, subject, study_level, expires_at)
  VALUES (p_key, p_query, p_response, p_chunk_ids, p_subject, p_study_level, now() + (p_ttl_hours || ' hours')::INTERVAL)
  ON CONFLICT (cache_key) DO UPDATE
    SET response_text = EXCLUDED.response_text,
        chunk_ids     = EXCLUDED.chunk_ids,
        hit_count     = rag_query_cache.hit_count + 1,
        expires_at    = EXCLUDED.expires_at,
        last_hit_at   = now();
END;
$$;

-- Purge expired cache rows (run via cron or manually)
CREATE OR REPLACE FUNCTION public.purge_rag_cache()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rows_deleted INT;
BEGIN
  DELETE FROM rag_query_cache WHERE expires_at < now();
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted;
END;
$$;

-- ── 5. Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.search_ncert_hybrid  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_chunk     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rag_cache        TO service_role;
GRANT EXECUTE ON FUNCTION public.set_rag_cache        TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_rag_cache      TO service_role;
