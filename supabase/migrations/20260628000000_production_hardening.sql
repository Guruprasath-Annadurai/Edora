-- ═══════════════════════════════════════════════════════════════════════════
-- v2.5.0 Production Hardening
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Unique constraint on razorpay_payment_id ───────────────────────────────
-- Enforces idempotency at the DB layer in addition to the code-level guard.
-- NULLs are not compared for uniqueness in PostgreSQL, so rows without a
-- payment_id (e.g. gifted/manual subscriptions) are not affected.
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_razorpay_payment_id_key
  UNIQUE (razorpay_payment_id);

-- ── 2. Partial index on classroom_connections for token refresh lookups ───────
-- Speeds up the per-teacher token read used on every Google API call.
CREATE INDEX IF NOT EXISTS idx_classroom_connections_teacher
  ON public.classroom_connections (teacher_id, expires_at);

-- ── 3. Compound index for api_rate_limits time-window queries ─────────────────
-- Covers (user_id, endpoint, created_at DESC) for the hourly window check.
-- A partial index with now() is not allowed (volatile function); a full index
-- on these three columns is sufficient — old rows are pruned by cleanup_rate_limits().
CREATE INDEX IF NOT EXISTS idx_rate_limits_active
  ON public.api_rate_limits (user_id, endpoint, created_at DESC);

-- ── 4. RLS policy: service role can insert rate limit rows ───────────────────
-- Edge functions use the service role key to write rate limit entries.
-- The existing SELECT policy for authenticated users is preserved.
DROP POLICY IF EXISTS "service_insert_rate_limits" ON public.api_rate_limits;
CREATE POLICY "service_insert_rate_limits"
  ON public.api_rate_limits
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── 5. Cleanup function schedule note ────────────────────────────────────────
-- Run cleanup_rate_limits() daily via Supabase Cron / pg_cron:
--   select cron.schedule('cleanup-rate-limits', '0 3 * * *', 'select public.cleanup_rate_limits()');
