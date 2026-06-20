-- ─────────────────────────────────────────────────────────────────────────────
-- Content Moat Migration
-- 1. ncert_paragraphs     — paragraph-level NCERT coverage (concept/question/misconception/example)
-- 2. formulas             — exam-ready formula library
-- 3. revision_plans       — AI-generated week-by-week revision schedules
-- 4. concept_reels        — 60-second concept cards (TikTok-style)
-- 5. solved_examples      — 10,000 worked solutions bank
-- 6. question_translations — regional language translations (extends existing)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Utility: enable pgvector if not already ───────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. NCERT Paragraphs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ncert_paragraphs (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject             TEXT NOT NULL,
  class_num           SMALLINT NOT NULL CHECK (class_num BETWEEN 6 AND 12),
  chapter_title       TEXT NOT NULL,
  para_order          INTEGER NOT NULL DEFAULT 0,
  paragraph_text      TEXT NOT NULL,
  concept             TEXT NOT NULL,                -- what this paragraph teaches
  exam_question       TEXT NOT NULL,                -- likely MCQ from this para
  misconception       TEXT NOT NULL,                -- common student mistake
  real_world_example  TEXT NOT NULL,                -- relatable real-world hook
  generated_by        TEXT DEFAULT 'ai',            -- 'ai' | 'human' | 'ncert-ingest'
  embedding           vector(768),                   -- Gemini text-embedding-004
  bookmarked_count    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ncert_paragraphs_subject_chapter_idx
  ON ncert_paragraphs(subject, chapter_title);

CREATE INDEX IF NOT EXISTS ncert_paragraphs_embedding_idx
  ON ncert_paragraphs USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search
CREATE INDEX IF NOT EXISTS ncert_paragraphs_fts_idx
  ON ncert_paragraphs USING gin(
    to_tsvector('english', coalesce(paragraph_text,'') || ' ' || coalesce(concept,'') || ' ' || coalesce(exam_question,''))
  );

ALTER TABLE ncert_paragraphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ncert_paragraphs_read_all" ON ncert_paragraphs FOR SELECT USING (true);
CREATE POLICY "ncert_paragraphs_service_write" ON ncert_paragraphs FOR ALL USING (auth.role() = 'service_role');

-- ── 2. Formulas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS formulas (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  class_level     TEXT,                               -- '11' | '12' | 'JEE' | 'NEET'
  name            TEXT NOT NULL,
  formula_text    TEXT NOT NULL,                      -- ASCII/Unicode representation
  formula_latex   TEXT,                               -- LaTeX string
  derivation      TEXT NOT NULL,
  usage_context   TEXT NOT NULL,
  common_mistakes TEXT[] NOT NULL DEFAULT '{}',
  related_ids     TEXT[] NOT NULL DEFAULT '{}',
  mnemonic        TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  likes           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS formulas_subject_idx ON formulas(subject);
CREATE INDEX IF NOT EXISTS formulas_tags_idx ON formulas USING gin(tags);

ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formulas_read_all" ON formulas FOR SELECT USING (true);
CREATE POLICY "formulas_service_write" ON formulas FOR ALL USING (auth.role() = 'service_role');

-- Per-user pinned formulas
CREATE TABLE IF NOT EXISTS pinned_formulas (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  formula_id TEXT NOT NULL,
  pinned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, formula_id)
);

ALTER TABLE pinned_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pinned_formulas_own" ON pinned_formulas USING (auth.uid() = user_id);

-- ── 3. Revision Plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revision_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_name       TEXT NOT NULL,
  exam_date       DATE NOT NULL,
  chapters_count  INTEGER NOT NULL DEFAULT 0,
  daily_hours     SMALLINT NOT NULL DEFAULT 4,
  weeks           JSONB NOT NULL DEFAULT '[]',        -- array of PlanWeek objects
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revision_plans_user_idx ON revision_plans(user_id, created_at DESC);

ALTER TABLE revision_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revision_plans_own" ON revision_plans USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_revision_plan_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS revision_plans_updated_at ON revision_plans;
CREATE TRIGGER revision_plans_updated_at
  BEFORE UPDATE ON revision_plans
  FOR EACH ROW EXECUTE FUNCTION update_revision_plan_timestamp();

-- ── 4. Concept Reels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concept_reels (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject         TEXT NOT NULL,
  class_num       SMALLINT,
  chapter_title   TEXT NOT NULL,
  concept         TEXT NOT NULL,
  summary         TEXT NOT NULL,                      -- 1-line hook
  explanation     TEXT NOT NULL,                      -- 3-4 sentence explanation
  key_points      TEXT[] NOT NULL DEFAULT '{}',
  animation_type  TEXT NOT NULL DEFAULT 'gradient',   -- wave|orbit|gradient|circuit|dna|pendulum
  emoji           TEXT NOT NULL DEFAULT '📚',
  color1          TEXT NOT NULL DEFAULT '#5B6AF5',
  color2          TEXT NOT NULL DEFAULT '#8B5CF6',
  view_count      INTEGER NOT NULL DEFAULT 0,
  like_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concept_reels_subject_idx ON concept_reels(subject, chapter_title);

ALTER TABLE concept_reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_reels_read_all" ON concept_reels FOR SELECT USING (true);
CREATE POLICY "concept_reels_service_write" ON concept_reels FOR ALL USING (auth.role() = 'service_role');

-- Per-user interactions
CREATE TABLE IF NOT EXISTS reel_interactions (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reel_id    TEXT NOT NULL,
  liked      BOOLEAN NOT NULL DEFAULT false,
  saved      BOOLEAN NOT NULL DEFAULT false,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reel_id)
);

ALTER TABLE reel_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reel_interactions_own" ON reel_interactions USING (auth.uid() = user_id);

-- ── 5. Solved Examples ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solved_examples (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject      TEXT NOT NULL,
  class_num    SMALLINT,
  chapter      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'NCERT',         -- NCERT|JEE|NEET|AI
  difficulty   TEXT NOT NULL DEFAULT 'medium',         -- easy|medium|hard
  marks        SMALLINT NOT NULL DEFAULT 2,
  question     TEXT NOT NULL,
  key_concept  TEXT NOT NULL,
  steps        JSONB NOT NULL DEFAULT '[]',            -- array of SolutionStep
  answer       TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  view_count   INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solved_examples_subject_idx ON solved_examples(subject, chapter);
CREATE INDEX IF NOT EXISTS solved_examples_source_idx  ON solved_examples(source);
CREATE INDEX IF NOT EXISTS solved_examples_diff_idx    ON solved_examples(difficulty);
CREATE INDEX IF NOT EXISTS solved_examples_fts_idx
  ON solved_examples USING gin(to_tsvector('english', question || ' ' || chapter || ' ' || coalesce(key_concept,'')));

ALTER TABLE solved_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solved_examples_read_all" ON solved_examples FOR SELECT USING (true);
CREATE POLICY "solved_examples_service_write" ON solved_examples FOR ALL USING (auth.role() = 'service_role');

-- Saved examples per user
CREATE TABLE IF NOT EXISTS saved_examples (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  example_id TEXT NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, example_id)
);

ALTER TABLE saved_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_examples_own" ON saved_examples USING (auth.uid() = user_id);

-- ── 6. Question Translations (extend existing or create) ─────────────────────
CREATE TABLE IF NOT EXISTS question_translations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id          TEXT NOT NULL,
  source_table         TEXT NOT NULL DEFAULT 'pyq_questions',  -- which table question comes from
  lang_code            TEXT NOT NULL,                           -- hi|ta|te|kn|mr|bn|gu
  translated_question  TEXT NOT NULL,
  translated_options   TEXT[] NOT NULL DEFAULT '{}',
  translated_explanation TEXT,
  translated_by        TEXT NOT NULL DEFAULT 'gemini',          -- 'gemini' | 'human'
  quality_score        SMALLINT,                                -- 1-5 human rating
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, source_table, lang_code)
);

CREATE INDEX IF NOT EXISTS question_translations_qid_lang_idx
  ON question_translations(question_id, lang_code);

ALTER TABLE question_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "question_translations_read_all" ON question_translations FOR SELECT USING (true);
CREATE POLICY "question_translations_service_write" ON question_translations FOR ALL USING (auth.role() = 'service_role');
-- Also allow authenticated users to insert translations (AI-generated from client)
CREATE POLICY "question_translations_auth_insert" ON question_translations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 7. Ncert Paragraph Bookmarks (per user) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ncert_paragraph_bookmarks (
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  paragraph_id TEXT NOT NULL,
  bookmarked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, paragraph_id)
);

ALTER TABLE ncert_paragraph_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ncert_para_bookmarks_own" ON ncert_paragraph_bookmarks USING (auth.uid() = user_id);

-- ── Grant execute permissions ─────────────────────────────────────────────────
GRANT SELECT ON ncert_paragraphs TO anon, authenticated;
GRANT SELECT ON formulas TO anon, authenticated;
GRANT SELECT ON concept_reels TO anon, authenticated;
GRANT SELECT ON solved_examples TO anon, authenticated;
GRANT SELECT ON question_translations TO anon, authenticated;
GRANT ALL ON revision_plans TO authenticated;
GRANT ALL ON pinned_formulas TO authenticated;
GRANT ALL ON reel_interactions TO authenticated;
GRANT ALL ON saved_examples TO authenticated;
GRANT ALL ON ncert_paragraph_bookmarks TO authenticated;
GRANT ALL ON question_translations TO authenticated;
