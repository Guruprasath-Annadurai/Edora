-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening pass, driven by a production-readiness audit:
--
-- get_daily_session_progress / update_daily_session / add_streak_freeze /
-- apply_streak_freeze_if_needed (20260706_habit_architecture.sql) are all
-- SECURITY DEFINER but never set search_path — the classic Postgres
-- privilege-escalation vector (an attacker-created object earlier in the
-- resolution path can hijack unqualified references inside the function
-- body) and exactly what Supabase's own security linter flags as
-- "Function Search Path Mutable." Pins search_path on all four without
-- touching their logic.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.get_daily_session_progress(UUID) SET search_path = public;
ALTER FUNCTION public.update_daily_session(UUID, INTEGER, INTEGER, BOOLEAN, BOOLEAN) SET search_path = public;
ALTER FUNCTION public.add_streak_freeze(UUID, INTEGER, TEXT, INTEGER) SET search_path = public;
ALTER FUNCTION public.apply_streak_freeze_if_needed(UUID) SET search_path = public;
