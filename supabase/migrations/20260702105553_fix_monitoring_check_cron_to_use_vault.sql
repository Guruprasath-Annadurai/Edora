SELECT cron.unschedule('monitoring-check-hourly');

SELECT cron.schedule(
  'monitoring-check-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/monitoring-check',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);
