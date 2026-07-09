-- ═══════════════════════════════════════════════════════════════════════════════
-- Tier 3 Context Intelligence — upgrade 7
--
-- 1. Add embedding column to rag_query_cache (semantic dedup)
-- 2. get_top_ncert_similarity   — confidence gate: top-1 cosine sim for a query
-- 3. semantic_cache_lookup      — find semantically equivalent cached answers
-- 4. set_rag_cache (updated)    — accepts optional p_embedding
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add embedding to cache table ──────────────────────────────────────────
ALTER TABLE public.rag_query_cache
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS rag_cache_embedding_idx
  ON public.rag_query_cache USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

-- ── 2. Confidence gate — top-1 cosine similarity against NCERT corpus ────────
-- Returns 1 - cosine_distance (i.e. similarity in [0,1]) for the nearest chunk.
-- Called after query embedding is computed; if < 0.72 → skip RAG injection.
CREATE OR REPLACE FUNCTION public.get_top_ncert_similarity(
  p_embedding vector(768)
)
RETURNS FLOAT8
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1.0 - (embedding <=> p_embedding)
  FROM   ncert_content
  WHERE  embedding IS NOT NULL
  ORDER BY embedding <=> p_embedding
  LIMIT 1;
$$;

-- ── 3. Semantic cache lookup — find a similar query answered in the last 24h ─
-- Returns the cached response_text if a semantically equivalent query exists.
-- Threshold default 0.95 means near-identical intent (not just same topic).
CREATE OR REPLACE FUNCTION public.semantic_cache_lookup(
  p_embedding     vector(768),
  p_threshold     FLOAT8  DEFAULT 0.95,
  p_max_age_hours INTEGER DEFAULT 24
)
RETURNS TABLE (response_text TEXT, cache_key TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT response_text, cache_key
  FROM   rag_query_cache
  WHERE  embedding  IS NOT NULL
    AND  expires_at  > now()
    AND  created_at  > now() - (p_max_age_hours || ' hours')::INTERVAL
    AND  1.0 - (embedding <=> p_embedding) >= p_threshold
  ORDER BY embedding <=> p_embedding
  LIMIT  1;
$$;

-- ── 4. set_rag_cache — updated signature; adds p_embedding (DEFAULT NULL) ────
-- Existing callers with 7 positional args continue to work unchanged.
CREATE OR REPLACE FUNCTION public.set_rag_cache(
  p_key         TEXT,
  p_query       TEXT,
  p_response    TEXT,
  p_chunk_ids   UUID[]      DEFAULT '{}',
  p_subject     TEXT        DEFAULT '',
  p_study_level TEXT        DEFAULT '',
  p_ttl_hours   INTEGER     DEFAULT 24,
  p_embedding   vector(768) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO rag_query_cache (
    cache_key, query_text, response_text, chunk_ids,
    subject, study_level, expires_at, embedding
  )
  VALUES (
    p_key, p_query, p_response, p_chunk_ids,
    p_subject, p_study_level,
    now() + (p_ttl_hours || ' hours')::INTERVAL,
    p_embedding
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET response_text = EXCLUDED.response_text,
        chunk_ids     = EXCLUDED.chunk_ids,
        hit_count     = rag_query_cache.hit_count + 1,
        last_hit_at   = now(),
        expires_at    = EXCLUDED.expires_at,
        -- preserve existing embedding if new one is NULL (e.g. embedding failed)
        embedding     = COALESCE(EXCLUDED.embedding, rag_query_cache.embedding);
END;
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_top_ncert_similarity  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.semantic_cache_lookup     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_rag_cache             TO authenticated, service_role;
