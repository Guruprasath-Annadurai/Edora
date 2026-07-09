-- Adaptive curriculum loop: nightly background agent that detects stagnation
-- (weak subtopic_mastery + struggling sr_cards) and proactively schedules
-- revision, bumping affected chapters in the student's revision plan.
-- Log table tracks every adjustment for transparency / debugging.

CREATE TABLE IF NOT EXISTS public.curriculum_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  reason          TEXT NOT NULL,              -- 'stagnant_mastery' | 'struggling_sr_card'
  mastery_score   NUMERIC(4,3),
  consecutive_wrong INT,
  action_taken    TEXT NOT NULL,              -- 'logged_weak' | 'scheduled_revision' | 'plan_reprioritized'
  revision_plan_id UUID REFERENCES public.revision_plans(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curriculum_adjustments_user_idx
  ON public.curriculum_adjustments(user_id, created_at DESC);

ALTER TABLE public.curriculum_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "curriculum_adjustments_own" ON public.curriculum_adjustments
  FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON public.curriculum_adjustments TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- CRON: nightly adaptive curriculum scan — 03:15 UTC (after memory consolidate)
-- ════════════════════════════════════════════════════════════════
SELECT cron.unschedule('adaptive-curriculum')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'adaptive-curriculum'
);

SELECT cron.schedule(
  'adaptive-curriculum',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/adaptive-curriculum',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'Authorization',      'Bearer ' || current_setting('app.service_role_key'),
      'x-internal-secret',  current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
