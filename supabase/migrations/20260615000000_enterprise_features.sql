-- ═══════════════════════════════════════════════════════════════════════════
-- Enterprise Feature Pack — Weakness Radar · Snapshots · IRT Confidence
-- Run: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. topic_performance ──────────────────────────────────────────────────────
-- Aggregated per-chapter accuracy for the Weakness Radar spider chart.
-- Updated by quiz_sessions trigger + direct upserts from QuizPage.
CREATE TABLE IF NOT EXISTS public.topic_performance (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject       TEXT        NOT NULL,
  topic         TEXT        NOT NULL,
  total_q       INTEGER     NOT NULL DEFAULT 0,
  correct_q     INTEGER     NOT NULL DEFAULT 0,
  accuracy_pct  NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_q = 0 THEN 0
         ELSE ROUND((correct_q::NUMERIC / total_q) * 100, 2)
    END
  ) STORED,
  last_attempted_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject, topic)
);

CREATE INDEX IF NOT EXISTS tp_user_subject_idx
  ON public.topic_performance (user_id, subject, accuracy_pct);

ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_topic_performance" ON public.topic_performance;
CREATE POLICY "users_own_topic_performance" ON public.topic_performance
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. user_snapshots ────────────────────────────────────────────────────────
-- Photo Solver scans stored for later review.
-- image_url points to Supabase Storage object.
CREATE TABLE IF NOT EXISTS public.user_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url       TEXT,
  ocr_text        TEXT,
  subject         TEXT,
  topic           TEXT,
  solve_result    JSONB,      -- full SolveResult JSON
  sr_card_id      UUID,       -- set when "Add to Flashcard" used
  source          TEXT        NOT NULL DEFAULT 'photo_solver'
                              CHECK (source IN ('photo_solver', 'textbook_scan')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS us_user_created_idx
  ON public.user_snapshots (user_id, created_at DESC);

ALTER TABLE public.user_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_snapshots" ON public.user_snapshots;
CREATE POLICY "users_own_snapshots" ON public.user_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. quiz_confidence ────────────────────────────────────────────────────────
-- Per-answer confidence rating (sure / guessing) for IRT calibration.
CREATE TABLE IF NOT EXISTS public.quiz_confidence (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id  UUID,       -- references quiz_sessions.id if available
  topic       TEXT        NOT NULL,
  question    TEXT        NOT NULL,
  confidence  TEXT        NOT NULL CHECK (confidence IN ('sure', 'guessing')),
  correct     BOOLEAN     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qc_user_topic_idx
  ON public.quiz_confidence (user_id, topic, created_at DESC);

ALTER TABLE public.quiz_confidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_confidence" ON public.quiz_confidence;
CREATE POLICY "users_own_confidence" ON public.quiz_confidence
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 4. Helper function: upsert topic performance ─────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_topic_performance(
  p_user_id UUID,
  p_subject  TEXT,
  p_topic    TEXT,
  p_correct  INTEGER,
  p_total    INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.topic_performance (user_id, subject, topic, correct_q, total_q, last_attempted_at, updated_at)
  VALUES (p_user_id, p_subject, p_topic, p_correct, p_total, now(), now())
  ON CONFLICT (user_id, subject, topic)
  DO UPDATE SET
    correct_q         = topic_performance.correct_q + EXCLUDED.correct_q,
    total_q           = topic_performance.total_q   + EXCLUDED.total_q,
    last_attempted_at = now(),
    updated_at        = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_topic_performance TO authenticated;

-- ── 5. JEE topic weights (read-only reference table) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.jee_topic_weights (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT  NOT NULL,
  topic       TEXT  NOT NULL,
  weight_pct  NUMERIC(5,2) NOT NULL,  -- avg % of marks in past 5 JEE papers
  UNIQUE(subject, topic)
);

ALTER TABLE public.jee_topic_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jee_weights_public_read" ON public.jee_topic_weights;
CREATE POLICY "jee_weights_public_read" ON public.jee_topic_weights
  FOR SELECT USING (true);

-- Seed JEE topic weights (Physics, Chemistry, Maths — top 5 chapters each)
INSERT INTO public.jee_topic_weights (subject, topic, weight_pct) VALUES
  ('Physics',    'Mechanics',                      20.0),
  ('Physics',    'Electrostatics & Magnetism',     18.0),
  ('Physics',    'Modern Physics',                 12.0),
  ('Physics',    'Optics',                         10.0),
  ('Physics',    'Thermodynamics',                  9.0),
  ('Physics',    'Waves & SHM',                     8.0),
  ('Chemistry',  'Organic Chemistry',              28.0),
  ('Chemistry',  'Physical Chemistry',             26.0),
  ('Chemistry',  'Inorganic Chemistry',            16.0),
  ('Chemistry',  'Coordination Compounds',          7.0),
  ('Chemistry',  'Chemical Bonding',                6.0),
  ('Maths',      'Calculus',                        25.0),
  ('Maths',      'Algebra',                         22.0),
  ('Maths',      'Coordinate Geometry',             18.0),
  ('Maths',      'Probability & Statistics',        10.0),
  ('Maths',      'Trigonometry',                     9.0),
  ('Maths',      'Vectors & 3D Geometry',            8.0)
ON CONFLICT (subject, topic) DO NOTHING;
