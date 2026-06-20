-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 1 — Language Support + NCERT Knowledge Base
-- Google Cloud Translation · TTS · STT · Document AI RAG
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add preferred_language to profiles (safe if already exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

-- ── NCERT content table for RAG ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ncert_content (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_num     SMALLINT    NOT NULL,
  subject       TEXT        NOT NULL,
  chapter_num   SMALLINT,
  chapter_title TEXT        NOT NULL,
  section_title TEXT,
  content       TEXT        NOT NULL,
  content_type  TEXT        NOT NULL DEFAULT 'paragraph'
    CHECK (content_type IN ('paragraph','definition','formula','example','exercise','law')),
  embedding     vector(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ncert_class_subject_idx
  ON public.ncert_content (class_num, subject);

-- HNSW index for fast approximate nearest-neighbour search
-- (works on empty table, no minimum rows required unlike ivfflat)
CREATE INDEX IF NOT EXISTS ncert_embedding_hnsw_idx
  ON public.ncert_content USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- NCERT is public domain — all authenticated users can read
ALTER TABLE public.ncert_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ncert_public_read" ON public.ncert_content;
CREATE POLICY "ncert_public_read" ON public.ncert_content
  FOR SELECT USING (true);

-- ── Semantic search function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_ncert(
  query_embedding vector(768),
  filter_class    INTEGER DEFAULT NULL,
  filter_subject  TEXT    DEFAULT NULL,
  result_count    INTEGER DEFAULT 5
)
RETURNS TABLE (
  id            UUID,
  class_num     SMALLINT,
  subject       TEXT,
  chapter_title TEXT,
  section_title TEXT,
  content       TEXT,
  content_type  TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    nc.id,
    nc.class_num,
    nc.subject,
    nc.chapter_title,
    nc.section_title,
    nc.content,
    nc.content_type,
    1 - (nc.embedding <=> query_embedding) AS similarity
  FROM public.ncert_content nc
  WHERE
    nc.embedding IS NOT NULL
    AND (filter_class  IS NULL OR nc.class_num = filter_class)
    AND (filter_subject IS NULL OR nc.subject ILIKE filter_subject)
  ORDER BY nc.embedding <=> query_embedding
  LIMIT result_count;
$$;
