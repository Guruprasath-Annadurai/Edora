-- db-backup-export dumps ~180 tables via sequential PostgREST round-trips,
-- gzips, and uploads to storage — this genuinely takes longer than pg_net's
-- default 5000ms http_post timeout. Live-tested on 2026-08-04: the backup
-- itself succeeded (file uploaded, verified via storage.objects) but the
-- cron caller logged "Timeout of 5000 ms reached" because the HTTP response
-- didn't come back in time. Bumping to 30s, which the same live test
-- confirmed is enough (function actually completes in ~7-8s for the current
-- ~3,500-row dataset; 30s gives headroom as data grows).
select cron.unschedule('db-backup-export-daily');

select cron.schedule(
  'db-backup-export-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/db-backup-export',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-internal-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
