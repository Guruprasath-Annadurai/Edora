-- =============================================================================
-- Tier 3 — Voice & Multimodal
-- Tables: voice_tutor_sessions, reading_sessions, video_sessions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =============================================================================
-- 1. VOICE TUTOR SESSIONS (Feature 11: Novo Live Tutoring)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.voice_tutor_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  study_level     TEXT NOT NULL DEFAULT 'school'
                  CHECK (study_level IN ('school','college','competitive','professional')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','complete','abandoned')),
  -- Lesson structure
  current_phase   TEXT NOT NULL DEFAULT 'intro'
                  CHECK (current_phase IN ('intro','teaching','qa','assessment','complete')),
  turns_count     INT  NOT NULL DEFAULT 0,
  -- Performance
  questions_asked INT  NOT NULL DEFAULT 0,
  correct_answers INT  NOT NULL DEFAULT 0,
  -- Session data
  transcript      JSONB NOT NULL DEFAULT '[]',   -- [{role, content, ts}]
  key_points      JSONB NOT NULL DEFAULT '[]',   -- extracted after session
  sr_cards_added  INT  NOT NULL DEFAULT 0,
  -- Meta
  duration_seconds INT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER voice_tutor_sessions_updated_at
  BEFORE UPDATE ON public.voice_tutor_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS voice_tutor_sessions_user_idx
  ON public.voice_tutor_sessions (user_id, created_at DESC);

ALTER TABLE public.voice_tutor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_voice_sessions" ON public.voice_tutor_sessions
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 2. READING SESSIONS (Feature 14: Novo Reads With You)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Untitled Reading',
  source_text      TEXT NOT NULL,                  -- full pasted content
  word_count       INT  NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','complete','abandoned')),
  -- Progress
  current_paragraph  INT  NOT NULL DEFAULT 0,
  total_paragraphs   INT  NOT NULL DEFAULT 0,
  paragraphs_read    INT  NOT NULL DEFAULT 0,
  comprehension_score NUMERIC(4,3),               -- 0-1 average across check questions
  -- Generated content (cached)
  paragraphs_data  JSONB NOT NULL DEFAULT '[]',   -- [{text, annotation, question?, answer?}]
  key_concepts     JSONB NOT NULL DEFAULT '[]',   -- [{term, definition}]
  session_summary  TEXT,
  -- Meta
  subject          TEXT,
  duration_seconds INT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER reading_sessions_updated_at
  BEFORE UPDATE ON public.reading_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS reading_sessions_user_idx
  ON public.reading_sessions (user_id, created_at DESC);

ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_reading_sessions" ON public.reading_sessions
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 3. VIDEO SESSIONS (Feature 15: Video Lecture Companion)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.video_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url     TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  title           TEXT,
  channel         TEXT,
  duration_text   TEXT,
  thumbnail_url   TEXT,
  -- Analysis output (cached per video_id — shared across users who watch same video)
  transcript_text TEXT,                            -- raw transcript
  summary         TEXT,
  key_concepts    JSONB NOT NULL DEFAULT '[]',     -- [{concept, explanation}]
  flashcards      JSONB NOT NULL DEFAULT '[]',     -- [{front, back}]
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','complete','failed','no_captions')),
  -- Q&A chat history for this session
  chat_history    JSONB NOT NULL DEFAULT '[]',     -- [{role, content}]
  sr_cards_added  INT  NOT NULL DEFAULT 0,
  -- Meta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER video_sessions_updated_at
  BEFORE UPDATE ON public.video_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS video_sessions_user_idx
  ON public.video_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_sessions_video_id_idx
  ON public.video_sessions (video_id);

ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_video_sessions" ON public.video_sessions
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 4. WHITEBOARD ANALYSES (Feature 12: Whiteboard Mode)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.whiteboard_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT,
  prompt          TEXT,                            -- user's question about the drawing
  analysis        TEXT NOT NULL,                  -- Novo's response
  error_found     BOOLEAN NOT NULL DEFAULT false,
  error_summary   TEXT,
  -- Follow-up Q&A
  follow_ups      JSONB NOT NULL DEFAULT '[]',    -- [{question, answer}]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whiteboard_analyses_user_idx
  ON public.whiteboard_analyses (user_id, created_at DESC);

ALTER TABLE public.whiteboard_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_whiteboard" ON public.whiteboard_analyses
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- 5. PHOTO SOLVES (Feature 13: Photo Problem Solver)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.photo_solves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT,
  ocr_text        TEXT,                            -- extracted text from image
  solution        TEXT NOT NULL,                   -- step-by-step solution
  concept_summary TEXT,                            -- underlying concept explanation
  steps           JSONB NOT NULL DEFAULT '[]',     -- [{step_num, text, explanation}]
  sr_card_added   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_solves_user_idx
  ON public.photo_solves (user_id, created_at DESC);

ALTER TABLE public.photo_solves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_photo_solves" ON public.photo_solves
  FOR ALL USING (auth.uid() = user_id);
