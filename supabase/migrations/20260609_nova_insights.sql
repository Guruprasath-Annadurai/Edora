-- ═══════════════════════════════════════════════════════════════
-- Edora — Novo Insights
-- Weekly AI-generated personalized performance report.
-- Edge function: novo-insights  (Deno, runs every Sunday 08:00 UTC)
-- Transport: pg_cron → pg_net → edge function → Gemini + FCM
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions (idempotent) ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_net";     -- outbound HTTP from pg_cron jobs
CREATE EXTENSION IF NOT EXISTS "pg_cron";    -- already enabled; idempotent

-- ── 1. novo_insights ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.novo_insights (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start          DATE        NOT NULL,  -- ISO Monday of the reported week
  headline            TEXT        NOT NULL DEFAULT '',
  weakest_subjects    JSONB       NOT NULL DEFAULT '[]',  -- [{subject,score_pct,reason,study_tip}]
  strongest_subjects  JSONB       NOT NULL DEFAULT '[]',  -- [{subject,score_pct,reason}]
  streak_insight      TEXT        NOT NULL DEFAULT '',
  recovery_plan       JSONB       NOT NULL DEFAULT '[]',  -- [{day,focus,tasks:[string]}]
  motivation          TEXT        NOT NULL DEFAULT '',
  xp_this_week        INTEGER     NOT NULL DEFAULT 0,
  quizzes_taken       INTEGER     NOT NULL DEFAULT 0,
  sprints_completed   INTEGER     NOT NULL DEFAULT 0,
  mistakes_logged     INTEGER     NOT NULL DEFAULT 0,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS novo_insights_user_week_idx
  ON public.novo_insights(user_id, week_start DESC);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.novo_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Users can read only their own insights
  IF NOT EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='novo_insights'
      AND policyname='Users read own insights') THEN
    CREATE POLICY "Users read own insights"
      ON public.novo_insights FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  -- Service-role key (used inside edge function) can write freely
  -- (service role bypasses RLS by default — policy below is documentation only)
END $$;

-- ── 3. pg_cron — every Sunday 08:00 UTC ──────────────────────────────────────
-- The anon key below is intentionally public (it lives in the JS bundle too).
-- The edge function uses SUPABASE_SERVICE_ROLE_KEY (auto-injected env var)
-- to access all users' data with service-role privileges.
--
-- Required Supabase Secrets (supabase secrets set KEY=value):
--   GEMINI_API_KEY       — already set
--   FIREBASE_SERVER_KEY  — Firebase Console → Project Settings → Cloud Messaging → Server key
--                          (if not set, push notifications are silently skipped)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'novo-insights-weekly') THEN
    PERFORM cron.schedule(
      'novo-insights-weekly',
      '0 8 * * 0',
      $job$
      SELECT net.http_post(
        url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-insights',
        headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sa3phYnNwY3dmb2NrYm1rbXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODUwMzYsImV4cCI6MjA5NjA2MTAzNn0.qvnAGZFn5ivjEHH9dbLK5dX7EsaHK6Zj8hU14pE8hJo' ||
                    '"}')::jsonb,
        body    := '{"trigger":"cron"}'::jsonb
      );
      $job$
    );
  END IF;
END
$$;
