-- The db-backup-export cron job scheduled in 20260804120000_db_backup_export.sql
-- used current_setting('app.supabase_url') / current_setting('app.service_role_key'),
-- copying the pattern from older migration files in this repo (e.g.
-- 20260702105415_schedule_monitoring_check_cron.sql). That pattern does not
-- work in this project — those GUCs are not set at the database level,
-- confirmed by querying pg_db_role_setting (only app.settings.jwt_exp is
-- set). Live-tested and confirmed failing with "unrecognized configuration
-- parameter" on every cron tick on 2026-08-04.
--
-- monitoring-check-hourly's migration file uses the same broken pattern, but
-- its LIVE cron.job.command was independently patched at some point to a
-- hardcoded-URL + vault.decrypted_secrets lookup — the migration files and
-- the live database had already drifted apart for that job before this one
-- was ever written. Replacing with that proven-working pattern here.
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
    body    := '{}'::jsonb
  );
  $$
);
