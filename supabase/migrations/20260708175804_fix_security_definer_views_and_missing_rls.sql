-- 1. Fix 3 views built this session that were SECURITY DEFINER (bypassing
--    RLS of underlying tables for the querying user) — force invoker rights.
alter view new_vertical_interest set (security_invoker = true);
alter view mains_band_stats set (security_invoker = true);
alter view pyq_topic_frequency set (security_invoker = true);

-- 2. Pre-existing tables with RLS fully disabled.
-- referral_rewards: static reward-tier config (3 rows: status/xp/streak-freeze
-- per tier), no user_id column — safe to expose read-only to any authenticated
-- user, no client writes (admin/service-role only).
alter table referral_rewards enable row level security;
create policy "authenticated_read_referral_rewards" on referral_rewards
  for select to authenticated using (true);

-- push_log: per-user push notification history (payload jsonb) — own-row
-- read only, no client writes (edge functions write via service role).
alter table push_log enable row level security;
create policy "own_read_push_log" on push_log
  for select using (auth.uid() = user_id);

-- rank_snapshots: leaderboard rank/xp snapshots — inherently comparative
-- (leaderboard needs to show other users' ranks), so readable by any
-- authenticated user; no client writes (service-role/cron only).
alter table rank_snapshots enable row level security;
create policy "authenticated_read_rank_snapshots" on rank_snapshots
  for select to authenticated using (true);

-- 3. Duplicate indexes (identical, pure waste) — safe drop, keep one of each.
drop index if exists api_rate_limits_lookup_idx;
drop index if exists idx_rate_limits_active;
drop index if exists rl_user_endpoint_time_idx;
-- kept: api_rate_limits_user_endpoint_idx

drop index if exists idx_daily_sessions_user;
-- kept: idx_daily_power_sessions_user
