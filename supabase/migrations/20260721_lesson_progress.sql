-- ─────────────────────────────────────────────────────────────────────────────
-- Edora v3.5.0 — lesson_progress table
-- Tracks per-user lesson completion for the CoursePage
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lesson_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null,          -- matches Lesson.id in courseData.ts
  completed     boolean not null default false,
  xp_earned     integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique(user_id, lesson_id)
);

-- Index for fast per-user lookups
create index if not exists lesson_progress_user_idx on public.lesson_progress(user_id);

-- Row-level security
alter table public.lesson_progress enable row level security;

create policy "Users can read own lesson progress"
  on public.lesson_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert own lesson progress"
  on public.lesson_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own lesson progress"
  on public.lesson_progress for update
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lesson_progress_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();
