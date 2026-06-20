-- ═══════════════════════════════════════════════════════════════════════════
-- NCERT Deep Coverage · PYQ Bank · Mock Full Tests · Concept Videos
-- AI Question Bank · Multilingual support tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. NCERT Chapter–Concept–Question mapping ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ncert_chapters (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_num     SMALLINT    NOT NULL CHECK (class_num BETWEEN 6 AND 12),
  subject       TEXT        NOT NULL,   -- 'Maths' | 'Science' | 'Physics' | 'Chemistry' | 'Biology' | 'History' | 'Geography' | 'Civics' | 'Economics'
  chapter_num   SMALLINT    NOT NULL,
  chapter_title TEXT        NOT NULL,
  description   TEXT,
  concepts      TEXT[]      NOT NULL DEFAULT '{}',  -- key concept names
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_num, subject, chapter_num)
);

CREATE INDEX IF NOT EXISTS ncert_chapters_class_subject_idx
  ON public.ncert_chapters (class_num, subject);

ALTER TABLE public.ncert_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ncert_chapters_public_read" ON public.ncert_chapters;
CREATE POLICY "ncert_chapters_public_read" ON public.ncert_chapters
  FOR SELECT USING (true);

-- Maps chapters to generated MCQs (20 per chapter target)
CREATE TABLE IF NOT EXISTS public.ncert_chapter_questions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id      UUID        NOT NULL REFERENCES public.ncert_chapters(id) ON DELETE CASCADE,
  concept         TEXT        NOT NULL,
  question        TEXT        NOT NULL,
  options         TEXT[]      NOT NULL CHECK (cardinality(options) = 4),
  correct_idx     SMALLINT    NOT NULL CHECK (correct_idx BETWEEN 0 AND 3),
  explanation     TEXT        NOT NULL,
  difficulty      TEXT        NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  is_exemplar     BOOLEAN     NOT NULL DEFAULT false,
  question_type   TEXT        NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','assertion_reason','case_study')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ncert_chq_chapter_idx ON public.ncert_chapter_questions (chapter_id, difficulty);
CREATE INDEX IF NOT EXISTS ncert_chq_concept_idx ON public.ncert_chapter_questions (concept);

ALTER TABLE public.ncert_chapter_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ncert_chq_public_read" ON public.ncert_chapter_questions;
CREATE POLICY "ncert_chq_public_read" ON public.ncert_chapter_questions
  FOR SELECT USING (true);

-- Per-user chapter flashcard completion tracking
CREATE TABLE IF NOT EXISTS public.ncert_chapter_progress (
  user_id       UUID      NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_id    UUID      NOT NULL REFERENCES public.ncert_chapters(id) ON DELETE CASCADE,
  questions_attempted  INTEGER NOT NULL DEFAULT 0,
  questions_correct    INTEGER NOT NULL DEFAULT 0,
  flashcards_reviewed  INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);

ALTER TABLE public.ncert_chapter_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ncert_progress_own" ON public.ncert_chapter_progress;
CREATE POLICY "ncert_progress_own" ON public.ncert_chapter_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. PYQ (Previous Year Questions) Bank ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pyq_questions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type       TEXT        NOT NULL CHECK (exam_type IN ('JEE_Main','JEE_Advanced','NEET','CBSE_10','CBSE_12')),
  year            SMALLINT    NOT NULL CHECK (year BETWEEN 2014 AND 2026),
  paper           TEXT,                  -- 'Paper 1' | 'Paper 2' | 'Set A' etc.
  subject         TEXT        NOT NULL,
  chapter         TEXT        NOT NULL,
  concept         TEXT        NOT NULL,
  question        TEXT        NOT NULL,
  options         TEXT[]      NOT NULL CHECK (cardinality(options) = 4),
  correct_idx     SMALLINT    NOT NULL CHECK (correct_idx BETWEEN 0 AND 3),
  explanation     TEXT        NOT NULL,
  difficulty      TEXT        NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  marks_positive  SMALLINT    NOT NULL DEFAULT 4,
  marks_negative  NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  question_type   TEXT        NOT NULL DEFAULT 'mcq',
  source_ref      TEXT,                  -- original question paper reference
  frequency_count INTEGER     NOT NULL DEFAULT 1,  -- times this concept appeared across years
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_exam_year_idx     ON public.pyq_questions (exam_type, year, subject);
CREATE INDEX IF NOT EXISTS pyq_chapter_idx       ON public.pyq_questions (chapter, subject);
CREATE INDEX IF NOT EXISTS pyq_concept_freq_idx  ON public.pyq_questions (concept, frequency_count DESC);

ALTER TABLE public.pyq_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pyq_public_read" ON public.pyq_questions;
CREATE POLICY "pyq_public_read" ON public.pyq_questions
  FOR SELECT USING (true);

-- User PYQ practice sessions
CREATE TABLE IF NOT EXISTS public.pyq_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_type       TEXT        NOT NULL,
  question_ids    UUID[]      NOT NULL DEFAULT '{}',
  answers         JSONB       NOT NULL DEFAULT '{}',  -- {question_id: chosen_idx}
  score           INTEGER,
  max_score       INTEGER,
  time_taken_secs INTEGER,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_sessions_user_idx ON public.pyq_sessions (user_id, exam_type, created_at DESC);

ALTER TABLE public.pyq_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pyq_sessions_own" ON public.pyq_sessions;
CREATE POLICY "pyq_sessions_own" ON public.pyq_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Topic frequency view (heatmap data)
CREATE OR REPLACE VIEW public.pyq_topic_frequency AS
  SELECT
    exam_type,
    subject,
    chapter,
    concept,
    COUNT(*)                                    AS total_questions,
    COUNT(DISTINCT year)                        AS years_appeared,
    ROUND(AVG(CASE difficulty
      WHEN 'easy'   THEN 1
      WHEN 'medium' THEN 2
      WHEN 'hard'   THEN 3
    END), 2)                                    AS avg_difficulty,
    MAX(year)                                   AS last_year
  FROM public.pyq_questions
  GROUP BY exam_type, subject, chapter, concept;

GRANT SELECT ON public.pyq_topic_frequency TO authenticated;

-- ── 3. Mock Full Tests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mock_tests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  exam_type       TEXT        NOT NULL CHECK (exam_type IN ('JEE_Main','JEE_Advanced','NEET','CBSE_12')),
  duration_mins   INTEGER     NOT NULL,    -- 180 for JEE, 210 for NEET
  total_marks     INTEGER     NOT NULL,    -- 300 for JEE Main, 720 for NEET
  sections        JSONB       NOT NULL DEFAULT '[]',  -- [{subject, question_ids[], marks_per_q, negative}]
  is_official     BOOLEAN     NOT NULL DEFAULT false,  -- curated vs. AI-generated
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mock_tests_public_read" ON public.mock_tests;
CREATE POLICY "mock_tests_public_read" ON public.mock_tests
  FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.mock_test_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mock_test_id    UUID        REFERENCES public.mock_tests(id) ON DELETE SET NULL,
  exam_type       TEXT        NOT NULL,
  questions       JSONB       NOT NULL DEFAULT '[]',  -- full question objects snapshot
  answers         JSONB       NOT NULL DEFAULT '{}',  -- {q_id: chosen_idx}
  score           INTEGER,
  max_score       INTEGER,
  percentile      NUMERIC(5,2),
  subject_scores  JSONB,    -- {Physics: 80, Chemistry: 60, Maths: 100}
  time_taken_secs INTEGER,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  pdf_report_url  TEXT,
  parent_email_sent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS mta_user_exam_idx ON public.mock_test_attempts (user_id, exam_type, created_at DESC);

ALTER TABLE public.mock_test_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mta_own" ON public.mock_test_attempts;
CREATE POLICY "mta_own" ON public.mock_test_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Free mock usage tracking (2/month gate)
CREATE OR REPLACE FUNCTION public.get_mock_usage_this_month(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.mock_test_attempts
  WHERE user_id = p_user_id
    AND completed_at IS NOT NULL
    AND date_trunc('month', completed_at) = date_trunc('month', now());
$$;

GRANT EXECUTE ON FUNCTION public.get_mock_usage_this_month TO authenticated;

-- Percentile calculation across all completed mocks for same exam type
CREATE OR REPLACE FUNCTION public.calc_mock_percentile(
  p_score    INTEGER,
  p_exam_type TEXT
)
RETURNS NUMERIC(5,2) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE score < p_score)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
      2
    )
  FROM public.mock_test_attempts
  WHERE exam_type = p_exam_type AND completed_at IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.calc_mock_percentile TO authenticated;

-- ── 4. Concept Videos ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concept_videos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept         TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  class_num       SMALLINT,
  chapter         TEXT,
  title           TEXT        NOT NULL,
  youtube_id      TEXT,                   -- YouTube video ID (free tier)
  duration_secs   INTEGER,
  thumbnail_url   TEXT,
  description     TEXT,
  is_pro_content  BOOLEAN     NOT NULL DEFAULT false,
  view_count      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cv_concept_idx  ON public.concept_videos (concept, subject);
CREATE INDEX IF NOT EXISTS cv_chapter_idx  ON public.concept_videos (chapter, class_num);

ALTER TABLE public.concept_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cv_public_read" ON public.concept_videos;
CREATE POLICY "cv_public_read" ON public.concept_videos
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "cv_pro_content" ON public.concept_videos;
CREATE POLICY "cv_pro_content" ON public.concept_videos
  FOR SELECT USING (
    NOT is_pro_content
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_pro = true
    )
  );

-- User video watch history
CREATE TABLE IF NOT EXISTS public.video_watches (
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id    UUID        NOT NULL REFERENCES public.concept_videos(id) ON DELETE CASCADE,
  watch_pct   SMALLINT    NOT NULL DEFAULT 0 CHECK (watch_pct BETWEEN 0 AND 100),
  watched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE public.video_watches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vw_own" ON public.video_watches;
CREATE POLICY "vw_own" ON public.video_watches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 5. AI-Generated Question Bank ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_questions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT        NOT NULL,
  chapter         TEXT        NOT NULL,
  concept         TEXT        NOT NULL,
  class_num       SMALLINT,
  question        TEXT        NOT NULL,
  options         TEXT[]      NOT NULL CHECK (cardinality(options) = 4),
  correct_idx     SMALLINT    NOT NULL CHECK (correct_idx BETWEEN 0 AND 3),
  explanation     TEXT        NOT NULL,
  difficulty      TEXT        NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  ability_target  NUMERIC(4,2),            -- IRT theta the question is calibrated for
  quality_score   NUMERIC(3,2) DEFAULT 1.0 CHECK (quality_score BETWEEN 0 AND 1),
  flag_count      INTEGER     NOT NULL DEFAULT 0,
  is_retired      BOOLEAN     NOT NULL DEFAULT false,
  language        TEXT        NOT NULL DEFAULT 'en',
  generated_by    TEXT        NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aiq_subject_chapter_idx  ON public.ai_questions (subject, chapter, class_num);
CREATE INDEX IF NOT EXISTS aiq_difficulty_idx       ON public.ai_questions (difficulty, ability_target);
CREATE INDEX IF NOT EXISTS aiq_quality_idx          ON public.ai_questions (quality_score DESC) WHERE NOT is_retired;

ALTER TABLE public.ai_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aiq_public_read" ON public.ai_questions;
CREATE POLICY "aiq_public_read" ON public.ai_questions
  FOR SELECT USING (NOT is_retired AND quality_score >= 0.5);

-- Question flags (bad question reports from users)
CREATE TABLE IF NOT EXISTS public.ai_question_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID        NOT NULL REFERENCES public.ai_questions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL CHECK (reason IN ('wrong_answer','unclear','too_easy','too_hard','duplicate','other')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

ALTER TABLE public.ai_question_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aiqf_own_insert" ON public.ai_question_flags;
CREATE POLICY "aiqf_own_insert" ON public.ai_question_flags
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "aiqf_own_read" ON public.ai_question_flags;
CREATE POLICY "aiqf_own_read" ON public.ai_question_flags
  FOR SELECT USING (auth.uid() = user_id);

-- Auto-retire questions with 5+ flags, reduce quality score on flag
CREATE OR REPLACE FUNCTION public.handle_question_flag()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ai_questions
  SET
    flag_count    = flag_count + 1,
    quality_score = GREATEST(0, quality_score - 0.1),
    is_retired    = (flag_count + 1 >= 5)
  WHERE id = NEW.question_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_question_flagged ON public.ai_question_flags;
CREATE TRIGGER on_question_flagged
  AFTER INSERT ON public.ai_question_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_question_flag();

-- ── 6. Multilingual question content ────────────────────────────────────────

-- Language override for AI-generated question content
CREATE TABLE IF NOT EXISTS public.question_translations (
  question_id   UUID    NOT NULL,  -- references ai_questions or ncert_chapter_questions
  source_table  TEXT    NOT NULL CHECK (source_table IN ('ai_questions','ncert_chapter_questions','pyq_questions')),
  language      TEXT    NOT NULL,  -- 'hi', 'ta', 'te', 'kn', 'mr', 'bn'
  question      TEXT    NOT NULL,
  options       TEXT[]  NOT NULL CHECK (cardinality(options) = 4),
  explanation   TEXT    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, source_table, language)
);

ALTER TABLE public.question_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qt_public_read" ON public.question_translations;
CREATE POLICY "qt_public_read" ON public.question_translations
  FOR SELECT USING (true);
