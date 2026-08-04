-- ─────────────────────────────────────────────────────────────────────────────
-- db-backup-export bootstrap: private storage bucket + helper RPC + daily cron
--
-- Context: this org is on Supabase's Free plan, which does not include daily
-- backups or PITR (Pro plan and above only — see docs/backup-recovery.md).
-- This is a stopgap logical backup, not a replacement for upgrading to Pro.
--
-- NOTE: the cron job scheduled here uses current_setting('app.supabase_url')
-- / current_setting('app.service_role_key'), copying the pattern from older
-- cron migrations in this repo. That pattern was later found (live-tested
-- 2026-08-04) to NOT work in this project — see
-- 20260804120100_fix_db_backup_export_cron_broken_current_setting.sql for
-- the correction and the evidence. Left as originally applied, matching
-- what actually ran against the live database, rather than rewritten after
-- the fact — see that follow-up migration for the real story.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('db-backups', 'db-backups', false)
on conflict (id) do nothing;

-- Only the service role (used exclusively by the db-backup-export edge
-- function) may read/write this bucket — no user-facing access whatsoever.
create policy "service role only - db-backups"
  on storage.objects for all
  using (bucket_id = 'db-backups' and auth.role() = 'service_role')
  with check (bucket_id = 'db-backups' and auth.role() = 'service_role');

-- Lists real tables in the public schema so db-backup-export doesn't need a
-- hardcoded, drift-prone table list. SECURITY DEFINER so the edge function's
-- service-role caller can enumerate tables without needing broader grants;
-- it only returns table names, nothing sensitive.
create or replace function get_public_table_names()
returns table (table_name text)
language sql
security definer
set search_path = public
as $$
  select tablename::text
  from pg_tables
  where schemaname = 'public'
  order by tablename;
$$;

revoke all on function get_public_table_names() from public, anon, authenticated;
grant execute on function get_public_table_names() to service_role;

select cron.schedule(
  'db-backup-export-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/db-backup-export',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'Authorization',      'Bearer ' || current_setting('app.service_role_key'),
      'x-internal-secret',  current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
