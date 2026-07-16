-- No nightly cron job (5 built this session) reports success/failure
-- anywhere — the 5s-timeout bug ran silently for hours before I caught it
-- manually. This closes that blind spot.
create table if not exists public.cron_health (
  jobname text primary key,
  last_run_at timestamptz not null default now(),
  last_status text not null check (last_status = any (array['success','error','inconclusive'])),
  last_summary jsonb not null default '{}'::jsonb
);

alter table public.cron_health enable row level security;
create policy cron_health_admin_read on public.cron_health
  for select using (exists (select 1 from user_roles where user_id = auth.uid() and role in ('admin','moderator')));
