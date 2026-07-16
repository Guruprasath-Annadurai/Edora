-- auth_rls_initplan fix: Postgres re-evaluates auth.uid() per row unless
-- wrapped in a scalar subselect (which the planner then caches once per
-- statement). Scoped to tables built/touched THIS session only — the
-- pre-existing ~150-table sprawl is real but too large to blind-rewrite
-- safely in one pass; this fixes what's known and verified.

drop policy "cron_health_admin_read" on cron_health;
create policy "cron_health_admin_read" on cron_health
  for select using (
    exists (select 1 from user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = any (array['admin','moderator']::app_role[]))
  );

drop policy "mains_submissions_own_read" on mains_answer_submissions;
create policy "mains_submissions_own_read" on mains_answer_submissions
  for select using ((select auth.uid()) = user_id);

drop policy "mains_submissions_own_write" on mains_answer_submissions;
create policy "mains_submissions_own_write" on mains_answer_submissions
  for insert with check ((select auth.uid()) = user_id);

drop policy "admin_read_band_overrides" on mains_band_overrides;
create policy "admin_read_band_overrides" on mains_band_overrides
  for select using (
    exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[]))
  );

drop policy "admin_update_band_overrides" on mains_band_overrides;
create policy "admin_update_band_overrides" on mains_band_overrides
  for update using (
    exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[]))
  );

drop policy "admin_write_band_overrides" on mains_band_overrides;
create policy "admin_write_band_overrides" on mains_band_overrides
  for insert with check (
    exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[]))
  );

drop policy "mock_test_attempts_own_read" on mock_test_attempts;
create policy "mock_test_attempts_own_read" on mock_test_attempts
  for select using ((select auth.uid()) = user_id);

drop policy "mock_test_attempts_own_write" on mock_test_attempts;
create policy "mock_test_attempts_own_write" on mock_test_attempts
  for insert with check ((select auth.uid()) = user_id);

drop policy "own_read_push_log" on push_log;
create policy "own_read_push_log" on push_log
  for select using ((select auth.uid()) = user_id);
