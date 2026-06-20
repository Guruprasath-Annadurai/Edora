-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: achievements table + exam countdown fields on profiles
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Achievements table
create table if not exists public.achievements (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  achievement_id text        not null,
  unlocked_at    timestamptz not null default now(),
  unique(user_id, achievement_id)
);

alter table public.achievements enable row level security;

create policy "Users can view own achievements"
  on public.achievements for select
  using (auth.uid() = user_id);

create policy "Users can insert own achievements"
  on public.achievements for insert
  with check (auth.uid() = user_id);

create index if not exists achievements_user_id_idx
  on public.achievements(user_id);

-- 2. Exam countdown fields
alter table public.profiles
  add column if not exists exam_name text,
  add column if not exists exam_date date;
