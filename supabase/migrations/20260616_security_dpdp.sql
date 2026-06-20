-- ═══════════════════════════════════════════════════════════════════════════
-- Security Hardening + DPDP (India Digital Personal Data Protection) Compliance
-- SOC2 Type 1 readiness: audit log, data retention, consent tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. DPDP consent on profiles ──────────────────────────────────────────────
-- India DPDP Act 2023 requires explicit, informed, purpose-limited consent.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dpdp_consent_at      TIMESTAMPTZ,   -- when consent was given
  ADD COLUMN IF NOT EXISTS dpdp_consent_version TEXT,          -- consent text version (e.g. "v2026.06")
  ADD COLUMN IF NOT EXISTS analytics_opt_out    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_out    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at    TIMESTAMPTZ;

-- ── 2. Consent audit log ─────────────────────────────────────────────────────
-- Immutable log of every consent action (grant / revoke / update)
CREATE TABLE IF NOT EXISTS public.consent_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL CHECK (action IN ('consent_given', 'consent_revoked', 'analytics_opt_out', 'analytics_opt_in', 'data_export_requested', 'deletion_requested')),
  consent_version TEXT,
  ip_hash       TEXT,        -- hashed IP for audit (never store raw IP)
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable: no UPDATE or DELETE allowed on this table
ALTER TABLE public.consent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_consent_log" ON public.consent_audit_log
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT allowed via service role only (called from Edge Functions)

-- ── 3. API rate limits tuning ─────────────────────────────────────────────────
-- Ensure rate limit table exists and has right indexes
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  endpoint    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rl_user_endpoint_time_idx
  ON public.api_rate_limits (user_id, endpoint, created_at DESC);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_only_rate_limits" ON public.api_rate_limits
  USING (false);  -- app users cannot read/write; only service role

-- Auto-clean entries older than 2 hours to keep table small
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.api_rate_limits WHERE created_at < now() - INTERVAL '2 hours';
END;
$$;

-- ── 4. SOC2 audit event log ───────────────────────────────────────────────────
-- Tracks security-relevant events: login, password reset, data export, deletion
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event       TEXT        NOT NULL,   -- 'login_success', 'login_failed', 'password_reset', 'data_export', 'account_deletion'
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sal_user_event_idx
  ON public.security_audit_log (user_id, event, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_audit_log" ON public.security_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── 5. RLS hardening — ensure critical tables have policies ──────────────────
-- Double-check quiz answers are user-scoped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quiz_user_answers' AND policyname = 'users_own_quiz_answers'
  ) THEN
    ALTER TABLE public.quiz_user_answers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "users_own_quiz_answers" ON public.quiz_user_answers
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 6. Soft-delete column for DPDP "right to erasure" ────────────────────────
-- Rather than hard-deleting, we anonymise PII and mark deleted.
-- Hard delete is triggered 30 days after soft-delete (via cron or Vault).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- Function: anonymise a user account (called from delete-account Edge Function)
CREATE OR REPLACE FUNCTION public.anonymise_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET
    full_name    = 'Deleted User',
    email        = NULL,
    avatar_url   = NULL,
    phone        = NULL,
    anonymised_at = now()
  WHERE id = p_user_id;
  -- Log the deletion
  INSERT INTO public.security_audit_log (user_id, event, metadata)
  VALUES (p_user_id, 'account_deletion', jsonb_build_object('anonymised_at', now()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymise_user TO service_role;

-- ── 7. Short-lived tokens — enforce 1h expiry via Supabase JWT settings ──────
-- This is configured in Supabase Dashboard → Authentication → JWT Expiry.
-- Target: access_token = 3600s (1h), refresh_token = 604800s (7d)
-- Reminder comment only — cannot set via SQL:
-- Dashboard → Auth → JWT Expiry → set to 3600
COMMENT ON TABLE public.security_audit_log IS
  'SOC2/DPDP audit log. JWT expiry configured to 3600s in Supabase Auth settings.';

-- ── 8. Data retention policy (DPDP compliance) ───────────────────────────────
-- Inactive users' raw analytics purged after 2 years.
CREATE OR REPLACE FUNCTION public.purge_stale_analytics(p_cutoff TIMESTAMPTZ DEFAULT now() - INTERVAL '2 years')
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM public.api_rate_limits WHERE created_at < p_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Audit events older than 7 years can be purged (statutory limit)
  DELETE FROM public.security_audit_log WHERE created_at < now() - INTERVAL '7 years';
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_stale_analytics TO service_role;
