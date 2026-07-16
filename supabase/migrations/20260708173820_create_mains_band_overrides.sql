create table mains_band_overrides (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references mains_answer_submissions(id) on delete cascade,
  original_band text not null,
  override_band text not null check (override_band in ('needs_work','developing','good','excellent')),
  admin_id uuid not null references auth.users(id),
  note text null,
  created_at timestamptz not null default now(),
  unique (submission_id)
);

alter table mains_band_overrides enable row level security;

create policy "admin_read_band_overrides" on mains_band_overrides
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','moderator'))
  );

create policy "admin_write_band_overrides" on mains_band_overrides
  for insert with check (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','moderator'))
  );

create policy "admin_update_band_overrides" on mains_band_overrides
  for update using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','moderator'))
  );
