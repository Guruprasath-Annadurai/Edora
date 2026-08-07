-- Backfill: public.pyq_content
--
-- A separate migration file, not folded into the earlier
-- 20260615500000_classrooms_backfill.sql: that file was already applied
-- to the staging project (Gate 2/4.1.0) by the time this gap was found,
-- and Supabase's migration tracking is by version number, not content --
-- editing an already-applied file's SQL has no effect on any environment
-- that already ran it. A genuinely new, not-yet-applied version is
-- required instead.
--
-- public.pyq_content is created in 20260804_corpus_layer6.sql, but
-- 20260628000001_pyq_extended_seed_part1.sql (and 3 sibling seed files)
-- already INSERT into it starting over a month earlier -- at least 19
-- files in between reference this table, consistent with it being a
-- central, heavily-used table (see RISK-032). pgvector (needed for the
-- embedding column) is already enabled by 20250615_content_moat.sql, well
-- before this point. Only the base table + indexes are recreated here
-- (minus the ivfflat embedding index, left to the original file since it
-- benefits from existing data); later files' own incremental ALTERs
-- (CAT/UPSC exam values, class_level, review-pipeline columns) are
-- untouched and still run normally once the table exists. Dated to sort
-- immediately before the seed files that need it.

CREATE TABLE IF NOT EXISTS public.pyq_content (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam             TEXT        NOT NULL CHECK (exam IN ('JEE_MAIN','JEE_ADV','NEET','BITSAT','BOARDS')),
  year             SMALLINT    NOT NULL,
  subject          TEXT        NOT NULL,
  chapter          TEXT        NOT NULL,
  question_text    TEXT        NOT NULL,
  solution_text    TEXT,
  options          JSONB       NOT NULL DEFAULT '[]',
  correct_option   TEXT,
  question_type    TEXT        NOT NULL DEFAULT 'mcq'
                   CHECK (question_type IN ('mcq','integer','subjective')),
  difficulty       TEXT        NOT NULL DEFAULT 'medium'
                   CHECK (difficulty IN ('easy','medium','hard')),
  marks            SMALLINT    NOT NULL DEFAULT 4,
  content_hash     TEXT,
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
