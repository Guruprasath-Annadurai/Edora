-- Prelims: reuses the existing MCQ pipeline (pyq_content).
alter table public.pyq_content drop constraint pyq_content_exam_check;
alter table public.pyq_content add constraint pyq_content_exam_check
  check (exam = any (array['JEE_MAIN','JEE_ADV','NEET','BITSAT','BOARDS','CAT','UPSC']));

-- Mains: fundamentally different — subjective/essay, no MCQ scoring reuses at
-- all. Question bank with model answers + key points for AI-evaluated
-- practice (band-based feedback, never a fake-precise numeric score — UPSC
-- Mains grading is holistic and we have no official calibration data).
create table if not exists public.mains_questions (
  id uuid primary key default gen_random_uuid(),
  paper text not null check (paper = any (array['Essay','GS1','GS2','GS3','GS4'])),
  topic text not null,
  question_text text not null,
  word_limit integer not null default 250,
  marks integer not null default 15,
  model_answer text not null,
  key_points jsonb not null default '[]'::jsonb,
  difficulty text not null default 'medium' check (difficulty = any (array['easy','medium','hard'])),
  created_at timestamptz not null default now()
);

alter table public.mains_questions enable row level security;
create policy mains_questions_read_all on public.mains_questions
  for select using (true);

create table if not exists public.mains_answer_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.mains_questions(id) on delete cascade,
  answer_text text not null,
  word_count integer not null default 0,
  score_band text check (score_band = any (array['needs_work','developing','good','excellent'])),
  covered_points jsonb not null default '[]'::jsonb,
  missed_points jsonb not null default '[]'::jsonb,
  structure_feedback text,
  suggestions jsonb not null default '[]'::jsonb,
  model_used text,
  created_at timestamptz not null default now()
);

create index if not exists mains_answer_submissions_user_idx on public.mains_answer_submissions(user_id, created_at desc);

alter table public.mains_answer_submissions enable row level security;
create policy mains_submissions_own_read on public.mains_answer_submissions
  for select using (auth.uid() = user_id);
create policy mains_submissions_own_write on public.mains_answer_submissions
  for insert with check (auth.uid() = user_id);
