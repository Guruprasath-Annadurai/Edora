create view mains_band_stats as
select
  count(*) as total_overrides,
  (select count(*) from mains_answer_submissions) as total_submissions,
  round(
    100.0 * count(*) / nullif((select count(*) from mains_answer_submissions), 0), 1
  ) as override_rate_pct,
  original_band,
  override_band,
  count(*) as transition_count
from mains_band_overrides
group by original_band, override_band;
