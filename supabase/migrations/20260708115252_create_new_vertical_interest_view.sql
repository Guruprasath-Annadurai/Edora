-- Real demand-signal query for the CAT/UPSC/CBSE-advanced beta features —
-- aggregates the track() events already firing from PYQBankPage's Advanced
-- Mix, UPSCMainsPage, and MockTestPage's CAT/UPSC config. Zero new
-- instrumentation needed; this just makes the existing signal queryable.
create or replace view public.new_vertical_interest as
select
  event_name,
  properties->>'exam_type' as exam_type,
  count(*) as event_count,
  count(distinct user_id) as unique_users,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.analytics_events
where event_name in (
  'pyq_advanced_mix_started', 'upsc_mains_question_opened', 'upsc_mains_answer_evaluated',
  'mock_test_started', 'pyq_practice_started'
)
group by event_name, properties->>'exam_type'
order by event_count desc;
