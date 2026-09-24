-- novo-push-daily is a distinct job from novo-push-dispatch (the 4-hourly
-- job in 20260616000000_activate_cron_schedules.sql) -- this daily 6am
-- job's own original cron.schedule() call is missing from migration
-- history entirely (another instance of the drift already tracked in
-- RISK-029/RISK-033, this time for a cron job registration rather than a
-- table or function). cron.unschedule() throws a hard error if the named
-- job doesn't exist yet (unlike most DDL, which has an IF EXISTS form) --
-- found via the real supabase db push/execute_sql error against staging,
-- which never had this job registered. Guarded with the same WHERE EXISTS
-- pattern activate_cron_schedules.sql already uses successfully.
SELECT cron.unschedule('novo-push-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'novo-push-daily');

SELECT cron.schedule(
  'novo-push-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);
