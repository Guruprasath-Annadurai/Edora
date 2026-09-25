-- ==============================================================================
-- Edora V5 Infrastructure: Zero-Cost Observability Views
-- SAFE, READ-ONLY, LOW-OVERHEAD VIEWS FOR SYSTEM HEALTH & QUOTA MONITORING
-- ==============================================================================

-- 1. AI Gateway Hourly Performance & Error Rates (Rolling 24h)
CREATE OR REPLACE VIEW public.v_ai_gateway_hourly_metrics AS
SELECT
  date_trunc('hour', created_at) AS time_bucket,
  provider,
  model,
  count(*) AS total_requests,
  count(*) FILTER (WHERE status = 'success') AS success_count,
  count(*) FILTER (WHERE status = 'error') AS error_count,
  count(*) FILTER (WHERE status LIKE 'blocked%') AS blocked_count,
  round((count(*) FILTER (WHERE status = 'error')::numeric / nullif(count(*), 0) * 100), 2) AS error_rate_pct,
  round(avg(latency_ms), 0) AS avg_latency_ms,
  max(latency_ms) AS max_latency_ms,
  sum(prompt_tokens) AS total_prompt_tokens,
  sum(completion_tokens) AS total_completion_tokens,
  round(sum(estimated_cost_usd), 4) AS total_cost_usd
FROM public.ai_gateway_requests
WHERE created_at >= (now() - interval '24 hours')
GROUP BY 1, 2, 3
ORDER BY 1 DESC, total_requests DESC;

-- 2. AI Provider Fallback & Error Pattern Summary
CREATE OR REPLACE VIEW public.v_ai_provider_fallback_summary AS
SELECT
  provider,
  model,
  status,
  substring(coalesce(error_message, 'None') from 1 for 100) AS error_prefix,
  count(*) AS occurrence_count,
  min(created_at) AS first_seen,
  max(created_at) AS last_seen
FROM public.ai_gateway_requests
WHERE created_at >= (now() - interval '7 days')
  AND status != 'success'
GROUP BY 1, 2, 3, 4
ORDER BY occurrence_count DESC;

-- 3. Quiz Session Answer Persistence Health (Detecting F17 / Missing Score Drops)
CREATE OR REPLACE VIEW public.v_quiz_session_health AS
SELECT
  date_trunc('hour', created_at) AS time_bucket,
  count(*) AS total_sessions_started,
  count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed_sessions,
  count(*) FILTER (WHERE score IS NULL AND completed_at IS NOT NULL) AS null_score_completed,
  round(avg(score) FILTER (WHERE completed_at IS NOT NULL), 1) AS avg_score,
  round((count(*) FILTER (WHERE completed_at IS NOT NULL)::numeric / nullif(count(*), 0) * 100), 1) AS completion_rate_pct
FROM public.quiz_sessions
WHERE created_at >= (now() - interval '48 hours')
GROUP BY 1
ORDER BY 1 DESC;

-- 4. Database Table Footprint (Monitoring 500 MB Free-Tier Ceiling)
CREATE OR REPLACE VIEW public.v_database_table_sizes AS
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
  n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- 5. Access Security & Hardening: Operator-Only Visibility
-- Operational views expose internal tokens, cost, database size, and error patterns.
-- They must NEVER be accessible to student or anonymous client roles via PostgREST.

REVOKE ALL ON public.v_ai_gateway_hourly_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_ai_provider_fallback_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_quiz_session_health FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_database_table_sizes FROM PUBLIC, anon, authenticated;

-- Strictly grant SELECT only to administrative backend roles
GRANT SELECT ON public.v_ai_gateway_hourly_metrics TO service_role, postgres;
GRANT SELECT ON public.v_ai_provider_fallback_summary TO service_role, postgres;
GRANT SELECT ON public.v_quiz_session_health TO service_role, postgres;
GRANT SELECT ON public.v_database_table_sizes TO service_role, postgres;

COMMENT ON VIEW public.v_ai_gateway_hourly_metrics IS 'Zero-cost operational view for AI Gateway requests (Rolling 24h - Operator only)';
COMMENT ON VIEW public.v_ai_provider_fallback_summary IS 'Zero-cost operational view for AI error patterns and provider fallbacks (Operator only)';
COMMENT ON VIEW public.v_quiz_session_health IS 'Zero-cost operational view for quiz session persistence health (Operator only)';
COMMENT ON VIEW public.v_database_table_sizes IS 'Storage footprint monitor against 500MB free-tier limits (Operator only)';
