-- net.http_post defaults to timeout_milliseconds=5000. Every nightly cron
-- built this session loops over many candidates doing sequential
-- Nemotron/Gemini calls — trivially exceeds 5s for any batch >2-3 rows.
-- Empirically confirmed: a manually-triggered pyq-content-audit run produced
-- zero writes after several minutes, consistent with the function being
-- killed when pg_net's client-side timeout closes the connection.
-- cron.schedule with an existing jobname REPLACES the job definition.

select cron.schedule(
  'question-quality-audit-nightly',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/question-quality-audit',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{"action":"run_audit"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'anomaly-detection-nightly',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/anomaly-detection',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{"action":"run_scan"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'mistake-clustering-nightly',
  '15 3 * * *',
  $$
  select net.http_post(
    url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/mistake-clustering',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('action', 'run_clustering'),
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'exam-readiness-weekly',
  '0 4 * * 1',
  $$
  select net.http_post(
    url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/exam-prediction',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('action', 'run_cron'),
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'pyq-content-audit-nightly',
  '45 3 * * *',
  $$
  select net.http_post(
    url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/pyq-content-audit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('action', 'run_audit'),
    timeout_milliseconds := 120000
  );
  $$
);
