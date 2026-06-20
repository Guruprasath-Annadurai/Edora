-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 5 — Analytics & Reporting
-- Features: Parent Dashboard · Teacher Export · Predictive Exam Score
--           Attention Heatmap · Novo Confidence Score
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. TOPIC ATTENTION LOG ────────────────────────────────────────────────────
-- One row per (user × subject × topic) — always upserted, keeps the LATEST timestamp.
-- Populated by the analytics edge function; read to compute the heatmap.

CREATE TABLE IF NOT EXISTS public.topic_attention_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject     text        NOT NULL,
  topic       text        NOT NULL,
  source      text        NOT NULL DEFAULT 'unknown',
    -- sprint | sr_review | tutoring | quiz | challenge | curriculum | story | streak
  studied_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, topic)
);

ALTER TABLE public.topic_attention_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attention log"
  ON public.topic_attention_log FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tal_user_studied_idx
  ON public.topic_attention_log (user_id, studied_at DESC);
CREATE INDEX IF NOT EXISTS tal_user_subject_idx
  ON public.topic_attention_log (user_id, subject);

-- ── 2. CONFIDENCE EVENTS ──────────────────────────────────────────────────────
-- One row per answer event across any feature.
-- response_time_ms = how long the student took to answer.
-- confidence_score computed server-side (0-100).

CREATE TABLE IF NOT EXISTS public.confidence_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject          text        NOT NULL,
  topic            text        NOT NULL,
  source           text        NOT NULL DEFAULT 'unknown',
    -- quiz | sprint | sr_review | challenge | exam_sim | tutoring
  correct          boolean     NOT NULL,
  response_time_ms integer,
  confidence_score integer     NOT NULL, -- 0-100
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.confidence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own confidence events"
  ON public.confidence_events FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ce_user_subject_idx
  ON public.confidence_events (user_id, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS ce_user_topic_idx
  ON public.confidence_events (user_id, topic, created_at DESC);

-- ── 3. EXAM SCORE PREDICTIONS ────────────────────────────────────────────────
-- Cached per user — re-generated when stale (>24h) or when user requests refresh.

CREATE TABLE IF NOT EXISTS public.exam_predictions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exam_subject        text,
  exam_board          text,
  days_remaining      integer,
  predicted_score     integer,     -- 0-100 percentage
  predicted_grade     text,        -- A*, A, B, C, etc.
  target_score        integer,
  target_grade        text,
  daily_hours_needed  numeric(4,1),
  confidence_level    text         DEFAULT 'medium', -- high|medium|low
  weak_topics         jsonb        NOT NULL DEFAULT '[]',
  strong_topics       jsonb        NOT NULL DEFAULT '[]',
  study_plan          jsonb        NOT NULL DEFAULT '[]',
    -- [{week, focus, hours_per_day, topics:[]}]
  narrative           text,
  mastery_snapshot    jsonb        NOT NULL DEFAULT '{}',
  generated_at        timestamptz  DEFAULT now(),
  expires_at          timestamptz  DEFAULT now() + interval '24 hours',
  UNIQUE (user_id)  -- one active prediction per user, upsert to refresh
);

ALTER TABLE public.exam_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own predictions"
  ON public.exam_predictions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. PARENT REPORTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start    date        NOT NULL,
  report_html   text        NOT NULL,
  report_data   jsonb       NOT NULL DEFAULT '{}',
  generated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.parent_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own parent reports"
  ON public.parent_reports FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pr_user_week_idx
  ON public.parent_reports (user_id, week_start DESC);

-- ── 5. TEACHER EXPORTS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_exports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  export_html   text        NOT NULL,
  export_data   jsonb       NOT NULL DEFAULT '{}',
  generated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.teacher_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own teacher exports"
  ON public.teacher_exports FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS te_user_idx ON public.teacher_exports (user_id, generated_at DESC);

-- ── Helper: recompute topic_attention_log from existing sr_cards ──────────────
-- Backfills the heatmap from already-reviewed SR cards on first run.
-- Safe to call multiple times (upsert).
CREATE OR REPLACE FUNCTION public.backfill_topic_attention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.topic_attention_log (user_id, subject, topic, source, studied_at)
  SELECT
    user_id,
    subject,
    topic,
    'sr_review' AS source,
    COALESCE(last_reviewed_at, created_at) AS studied_at
  FROM public.sr_cards
  WHERE last_reviewed_at IS NOT NULL
  ON CONFLICT (user_id, subject, topic)
  DO UPDATE SET
    studied_at = EXCLUDED.studied_at,
    source     = EXCLUDED.source
  WHERE EXCLUDED.studied_at > topic_attention_log.studied_at;
END;
$$;

-- Run backfill once on migration
SELECT public.backfill_topic_attention();
