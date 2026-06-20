-- ══════════════════════════════════════════════════════════
-- NCERT Full-Text Search index
-- Adds tsvector column + GIN index for fast keyword search.
-- Falls back gracefully when pgvector embeddings are absent.
-- ══════════════════════════════════════════════════════════

-- tsvector column for fast full-text search
ALTER TABLE public.ncert_content
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(subject,       '') || ' ' ||
      coalesce(chapter_title, '') || ' ' ||
      coalesce(section_title, '') || ' ' ||
      coalesce(content,       '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS ncert_content_tsv_idx
  ON public.ncert_content USING gin(content_tsv);

-- Full-text search function (no embeddings required)
CREATE OR REPLACE FUNCTION public.search_ncert_fts(
  query_text      TEXT,
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
    ts_rank_cd(nc.content_tsv, websearch_to_tsquery('english', query_text))::FLOAT AS similarity
  FROM public.ncert_content nc
  WHERE
    nc.content_tsv @@ websearch_to_tsquery('english', query_text)
    AND (filter_class   IS NULL OR nc.class_num = filter_class)
    AND (filter_subject IS NULL OR nc.subject ILIKE filter_subject)
  ORDER BY similarity DESC
  LIMIT result_count;
$$;
