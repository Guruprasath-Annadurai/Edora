select
  cron.schedule(
    'mistake-clustering-nightly',
    '15 3 * * *',
    $$
    select net.http_post(
      url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/mistake-clustering',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'run_clustering')
    );
    $$
  )
where not exists (select 1 from cron.job where jobname = 'mistake-clustering-nightly');
