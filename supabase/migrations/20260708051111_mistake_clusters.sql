create table if not exists public.mistake_clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cluster_label text not null,
  root_cause text not null,
  subject text,
  topic text,
  question_hashes jsonb not null default '[]'::jsonb,
  miss_count integer not null default 0,
  model_used text,
  created_at timestamptz not null default now()
);

create index if not exists mistake_clusters_user_idx on public.mistake_clusters(user_id, miss_count desc);

alter table public.mistake_clusters enable row level security;

create policy mistake_clusters_own_read on public.mistake_clusters
  for select using (auth.uid() = user_id);

create policy mistake_clusters_service_write on public.mistake_clusters
  for insert with check (auth.role() = 'service_role');

create policy mistake_clusters_service_delete on public.mistake_clusters
  for delete using (auth.role() = 'service_role');
