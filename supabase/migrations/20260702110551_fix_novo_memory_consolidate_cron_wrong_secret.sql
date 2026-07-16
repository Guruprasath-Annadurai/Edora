SELECT cron.unschedule('novo-memory-consolidate');

SELECT cron.schedule(
  'novo-memory-consolidate',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-memory-consolidate',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-internal-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);
