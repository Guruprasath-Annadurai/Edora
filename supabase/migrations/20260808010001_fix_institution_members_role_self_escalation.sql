-- Real, directly-exploitable vulnerability found while writing RISK-005's
-- additional attack tests: the inst_mem_insert RLS policy's with_check was
-- (auth.uid() = user_id) OR is_institution_admin(...) — it let ANY
-- authenticated user insert an institution_members row for themselves with
-- ANY role value, including 'admin'. The app's own join_institution() RPC
-- (supabase/functions equivalent / SQL function) always hardcodes
-- role='student' for self-joins, so this was never reachable through the
-- normal UI — but the underlying table grant + RLS policy allowed any
-- authenticated client to bypass the app entirely and call
-- POST /rest/v1/institution_members directly with {"role":"admin"} to
-- instantly become an institution admin, gaining control over that
-- institution's membership (institution_members INSERT/UPDATE/DELETE all
-- gate on is_institution_admin()).
--
-- Verified live via a rolled-back transaction before applying: confirmed
-- the vulnerability first (self-insert with role='admin' was accepted),
-- then confirmed the fix blocks role='admin' while still allowing the
-- legitimate role='student' self-join path with no regression.
DROP POLICY IF EXISTS inst_mem_insert ON public.institution_members;
CREATE POLICY inst_mem_insert ON public.institution_members
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.uid()) = user_id AND role = 'student')
    OR is_institution_admin(institution_id, (SELECT auth.uid()))
  );
