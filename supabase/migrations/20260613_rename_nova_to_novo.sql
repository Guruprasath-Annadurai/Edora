-- ═══════════════════════════════════════════════════════════════
-- Edora — Rename nova_insights → novo_insights
-- Brand rename: Nova AI tutor becomes Novo.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Rename the table ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.nova_insights
  RENAME TO novo_insights;

-- ── 2. Rename indexes ────────────────────────────────────────────────────────
ALTER INDEX IF EXISTS nova_insights_user_week_idx
  RENAME TO novo_insights_user_week_idx;

-- ── 3. Rename RLS policies (DROP + recreate with new name) ────────────────────
DO $$ BEGIN
  -- Read policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'novo_insights'
      AND policyname = 'Users read own insights'
  ) THEN
    -- Policy names can't be renamed; drop and recreate is the Postgres way
    DROP POLICY IF EXISTS "Users read own insights" ON public.novo_insights;
    CREATE POLICY "Users read own insights"
      ON public.novo_insights FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 4. Update the weekly cron job to call the renamed edge function ────────────
-- Remove old job
DO $$
BEGIN
  PERFORM cron.unschedule('novo-insights-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('nova-insights-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Re-create pointing at the novo-insights function
SELECT cron.schedule(
  'novo-insights-weekly',
  '0 8 * * 0',   -- every Sunday at 08:00 UTC
  format(
    $cron$
      SELECT net.http_post(
        url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-insights',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
      );
    $cron$,
    current_setting('app.settings.service_role_key', true)
  )
);
