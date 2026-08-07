-- ═══════════════════════════════════════════════════════════════════════════
-- subscriptions RLS hardening — Phase 10 (payments/entitlement hardening,
-- RISK-012, High).
--
-- public.subscriptions had exactly one RLS policy, "sub_own":
--   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--
-- "FOR ALL" covers SELECT, INSERT, UPDATE, and DELETE. That means, on paper,
-- any authenticated user could INSERT a row for their own user_id with
-- status='active' and an expires_at far in the future — a direct
-- payment-bypass path, no Razorpay/RevenueCat verification required — and
-- get_status's self-healing logic (novo-subscription/index.ts) would then
-- read that row and flip profiles.is_pro to true on the student's own next
-- ordinary "check my subscription" call.
--
-- Verified this is NOT currently exploitable: `authenticated`/`anon` have no
-- table-level GRANT on subscriptions at all (only `postgres` does — see
-- information_schema.role_table_grants), so Postgres blocks the write before
-- RLS is even evaluated (confirmed live against edora-staging: an
-- authenticated INSERT attempt returned 42501 "permission denied for table
-- subscriptions", not an RLS rejection). All real writes happen through
-- novo-subscription's service-role client, which bypasses RLS.
--
-- Fixing anyway, as defense-in-depth rather than a live incident response:
-- relying on "the grants happen to also block it" as the ONLY thing standing
-- between a student and free Pro access is fragile — a future, unrelated
-- `GRANT INSERT/UPDATE ON subscriptions TO authenticated` (e.g. to let a
-- user edit some unrelated display field added to this table later) would
-- silently reactivate the bypass with no RLS-side warning. The policy should
-- independently express the real intent: users may read their own
-- subscription history; only the service role may write to it.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS sub_own ON public.subscriptions;

CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for anon/authenticated — intentional.
-- All subscription mutations happen exclusively through
-- supabase/functions/novo-subscription/index.ts's service-role client
-- (Razorpay checkout verify_payment, Razorpay/RevenueCat webhooks,
-- verify_revenuecat, restore_purchases, cancel).
