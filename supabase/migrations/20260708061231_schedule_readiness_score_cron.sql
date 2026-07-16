select
  cron.schedule(
    'exam-readiness-weekly',
    '0 4 * * 1',
    $$
    select net.http_post(
      url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/exam-prediction',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'run_cron')
    );
    $$
  )
where not exists (select 1 from cron.job where jobname = 'exam-readiness-weekly');
