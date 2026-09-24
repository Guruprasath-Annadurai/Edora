-- pyq_topic_frequency already existed, but as a view over public.pyq_questions
-- (a legacy, abandoned table created in 20260702000002_ncert_pyq_mock_videos.sql
-- and never populated in practice, per the intent below) rather than the
-- actively-used public.pyq_content -- explaining why PYQBankPage's Heatmap
-- was silently broken (empty result) for every exam: the original comment
-- here believed this view "never existed" at all, when actually it existed
-- but pointed at the wrong (empty) table. Found via the real db-push/
-- execute_sql-driven replay against staging (Gate 2/4.1.0): CREATE OR
-- REPLACE VIEW cannot change an existing view's column set/order (Postgres
-- only allows appending trailing columns), so the original form here failed
-- with "cannot change name of view column" once replayed against a database
-- that actually has the old view. DROP + CREATE instead -- safe, this is
-- just a view, no data loss, and the old definition was already useless.
drop view if exists public.pyq_topic_frequency;
create view public.pyq_topic_frequency as
select
  exam as exam_type,
  subject,
  chapter,
  chapter as concept,
  class_level,
  count(*) as total_questions,
  count(distinct year) as years_appeared,
  avg(case difficulty when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 2 end) as avg_difficulty,
  max(year) as last_year
from public.pyq_content
group by exam, subject, chapter, class_level;
