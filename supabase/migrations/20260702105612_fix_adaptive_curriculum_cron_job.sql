SELECT cron.unschedule('adaptive-curriculum');

SELECT cron.schedule(
  'adaptive-curriculum',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/adaptive-curriculum',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);
