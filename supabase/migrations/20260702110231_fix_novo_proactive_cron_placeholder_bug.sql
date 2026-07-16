SELECT cron.unschedule('novo-proactive-cron');

SELECT cron.schedule(
  'novo-proactive-cron',
  '0 6,14,22 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-cron-proactive',
    body    := '{"limit":5}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    )
  );
  $$
);
