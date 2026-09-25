-- V5 Day 2 — AI health evidence. ADDITIVE ONLY: one read-only view over ai_gateway_requests.
-- Rollback: drop view if exists public.ai_success_rate_by_function_provider;
--
-- Per function x provider success over 24 h and 7 d, plus "permanent 4xx" counts so a dead key/model
-- (e.g. the Gemini 429->403 failure or novo-morning-brief's 403) is visible at a glance.
-- Helper calls logged by observedFetch appear as function_name 'gemini-chat:embedding' / ':helper' / ':memory'.

create or replace view public.ai_success_rate_by_function_provider
with (security_invoker = true) as
select
  function_name,
  provider,
  count(*) filter (where created_at > now() - interval '24 hours')                                          as attempts_24h,
  count(*) filter (where created_at > now() - interval '24 hours' and status = 'success')                   as successes_24h,
  round(100.0 * count(*) filter (where created_at > now() - interval '24 hours' and status = 'success')
        / nullif(count(*) filter (where created_at > now() - interval '24 hours'), 0), 2)                   as success_pct_24h,
  count(*) filter (where created_at > now() - interval '24 hours'
                   and status = 'error' and error_message ~ '^HTTP (400|401|403|404)$')                      as permanent_4xx_24h,
  count(*)                                                                                                    as attempts_7d,
  count(*) filter (where status = 'success')                                                                 as successes_7d,
  round(100.0 * count(*) filter (where status = 'success') / nullif(count(*), 0), 2)                        as success_pct_7d,
  count(*) filter (where status = 'error' and error_message ~ '^HTTP (400|401|403|404)$')                    as permanent_4xx_7d,
  max(created_at) filter (where status = 'success')                                                          as last_success_at,
  max(created_at)                                                                                             as last_attempt_at
from public.ai_gateway_requests
where created_at > now() - interval '7 days'
group by function_name, provider;

-- Operational data: service role only (monitoring-check). Never exposed to app users.
revoke all on public.ai_success_rate_by_function_provider from public, anon, authenticated;
grant select on public.ai_success_rate_by_function_provider to service_role;
