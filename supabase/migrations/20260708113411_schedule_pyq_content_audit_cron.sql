select
  cron.schedule(
    'pyq-content-audit-nightly',
    '45 3 * * *',
    $$
    select net.http_post(
      url := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/pyq-content-audit',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'run_audit')
    );
    $$
  )
where not exists (select 1 from cron.job where jobname = 'pyq-content-audit-nightly');
