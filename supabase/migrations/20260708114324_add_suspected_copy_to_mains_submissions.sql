alter table public.mains_answer_submissions add column if not exists suspected_copy boolean not null default false;
alter table public.mains_answer_submissions add column if not exists copy_overlap_ratio numeric;
