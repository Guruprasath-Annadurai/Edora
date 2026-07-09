-- Schedule nightly Novo memory consolidation at 02:30 UTC
-- Calls the novo-memory-consolidate edge function via net.http_post (pg_net extension).

-- Unschedule existing job if any (idempotent)
SELECT cron.unschedule('novo-memory-consolidate')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'novo-memory-consolidate'
);

-- Schedule: 02:30 UTC every night
SELECT cron.schedule(
  'novo-memory-consolidate',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/novo-memory-consolidate',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'Authorization',      'Bearer ' || current_setting('app.service_role_key'),
      'x-internal-secret',  current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
