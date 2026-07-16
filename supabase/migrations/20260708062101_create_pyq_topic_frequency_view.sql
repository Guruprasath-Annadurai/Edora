-- pyq_topic_frequency never existed as a table — PYQBankPage's Heatmap has
-- been silently broken (empty result) for every exam, not just CBSE. Built
-- as a live view over pyq_content instead of a stale cron-refreshed table —
-- 402 rows total, cheap to compute on every request, always accurate.
create or replace view public.pyq_topic_frequency as
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
