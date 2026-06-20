-- ─────────────────────────────────────────────────────────────────────────────
-- Enterprise fixes: API rate limiting + stronger share codes
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Rate limiting table ───────────────────────────────────────────────────────
-- One row per API call. Service-role edge functions write here; old rows
-- are pruned by cleanup_rate_limits() or a nightly cron.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,           -- e.g. 'start_assessment', 'generate_checkin_force'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_rate_limits_lookup_idx
  ON public.api_rate_limits (user_id, endpoint, created_at DESC);

-- Keep the table lean: delete rows older than 24 h
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
  RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.api_rate_limits
  WHERE created_at < now() - INTERVAL '24 hours';
$$;

-- RLS: users can see their own rows; only service role writes
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own rate limits" ON public.api_rate_limits;
CREATE POLICY "Users read own rate limits"
  ON public.api_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- ── Stronger share codes ──────────────────────────────────────────────────────
-- Extend NEW certificate share codes from 12 → 16 chars.
-- Existing 12-char codes remain valid; column has no length constraint.
-- Extend share codes on NEW certifications from 12 → 16 chars.
-- Uses gen_random_uuid() (PostgreSQL 13+ built-in, no extension needed).
ALTER TABLE public.novo_certifications
  ALTER COLUMN share_code SET DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 16);
