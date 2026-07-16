create table if not exists public.mock_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_type text not null,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score numeric not null,
  max_score numeric not null,
  percentile numeric,
  subject_scores jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mock_test_attempts_user_idx on public.mock_test_attempts(user_id, completed_at desc);
create index if not exists mock_test_attempts_exam_score_idx on public.mock_test_attempts(exam_type, score);

alter table public.mock_test_attempts enable row level security;

create policy mock_test_attempts_own_read on public.mock_test_attempts
  for select using (auth.uid() = user_id);

create policy mock_test_attempts_own_write on public.mock_test_attempts
  for insert with check (auth.uid() = user_id);

-- Percentile against Edora's own attempt population for that exam type (NOT an
-- official all-India percentile — we don't have official candidate population
-- data). Returns a neutral 50 when the sample is too small (<5 attempts) to
-- make any percentile claim meaningful, rather than a falsely precise number.
create or replace function public.calc_mock_percentile(p_score numeric, p_exam_type text)
returns numeric
language plpgsql
stable
as $$
declare
  v_total integer;
  v_below integer;
begin
  select count(*) into v_total from public.mock_test_attempts where exam_type = p_exam_type;
  if v_total < 5 then
    return 50;
  end if;

  select count(*) into v_below from public.mock_test_attempts
    where exam_type = p_exam_type and score < p_score;

  return round((v_below::numeric / v_total::numeric) * 100, 1);
end;
$$;
