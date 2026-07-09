-- Doubt Room: stores student questions and Novo's AI answers
create table if not exists public.doubt_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  question    text not null,
  answer      text,
  subject     text,
  created_at  timestamptz not null default now()
);

-- Only the owner can see their own doubts
alter table public.doubt_threads enable row level security;

create policy "Users manage own doubts"
  on public.doubt_threads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fast lookup by user + recency
create index on public.doubt_threads (user_id, created_at desc);
