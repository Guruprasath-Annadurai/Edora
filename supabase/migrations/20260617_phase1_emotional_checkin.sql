-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1: Emotional Check-in Engine + Proactive Cron Intelligence
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. user_mood_checkins ─────────────────────────────────────────────────────
-- Stores one mood entry per user per day.

CREATE TABLE IF NOT EXISTS public.user_mood_checkins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  mood       TEXT        NOT NULL CHECK (mood IN ('focused', 'tired', 'stressed', 'motivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.user_mood_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_mood"
  ON public.user_mood_checkins
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mood_checkins_user_date
  ON public.user_mood_checkins (user_id, date DESC);

-- ── 2. mood_streaks view ──────────────────────────────────────────────────────
-- Handy view for Novo to reference: how many consecutive days has the user
-- been checking in, and what's their most common mood this week?

CREATE OR REPLACE VIEW public.user_mood_summary AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '7 days') AS checkins_last_7d,
  MODE() WITHIN GROUP (ORDER BY mood)
    FILTER (WHERE date >= CURRENT_DATE - INTERVAL '7 days')         AS dominant_mood_7d,
  MAX(date)                                                          AS last_checkin_date
FROM public.user_mood_checkins
GROUP BY user_id;

-- ── 3. novo_proactive_messages: ensure index for cron efficiency ──────────────

CREATE INDEX IF NOT EXISTS idx_proactive_messages_user_created
  ON public.novo_proactive_messages (user_id, created_at DESC);

-- ── 4. pg_cron schedule for novo-cron-proactive ───────────────────────────────
-- Runs every 8 hours: 06:00, 14:00, 22:00 UTC (11:30, 19:30, 03:30 IST)
-- Requires pg_cron extension. Enable in Supabase dashboard → Extensions.

-- Extension guard: only register if pg_cron is available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove old schedule if exists (idempotent)
    PERFORM cron.unschedule('novo-proactive-cron')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'novo-proactive-cron'
      );

    PERFORM cron.schedule(
      'novo-proactive-cron',
      '0 6,14,22 * * *',
      $$
        SELECT net.http_post(
          url    := current_setting('app.supabase_url') || '/functions/v1/novo-cron-proactive',
          body   := '{"limit":5}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
            'x-cron-secret', current_setting('app.cron_secret', true)
          )
        );
      $$
    );
  END IF;
END $$;

-- ── 5. Personality-aware welcome injection: add novo_personality index ─────────

CREATE INDEX IF NOT EXISTS idx_profiles_novo_personality
  ON public.profiles (novo_personality)
  WHERE novo_personality IS NOT NULL;

-- ── 6. Track mood in proactive context_data (no schema change needed) ────────
-- The novo-cron-proactive edge function already writes mood signals
-- into the context_data JSONB column of novo_proactive_messages.
-- Add a GIN index for fast querying by mood signal.

CREATE INDEX IF NOT EXISTS idx_proactive_context_data
  ON public.novo_proactive_messages USING GIN (context_data);

COMMENT ON TABLE public.user_mood_checkins IS
  'Daily emotional check-in: one mood per user per day. Used by Novo to adapt session tone and difficulty.';
