-- ─────────────────────────────────────────────────────────────────────────────
-- General admin/mutation action audit log — previously the only audit trail
-- in the app was DPDP-consent-specific. This table gives a single place to
-- record who did what, from which edge function, to which record — the
-- baseline every enterprise security review asks for first.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_action_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  TEXT        NOT NULL DEFAULT 'user',   -- 'user' | 'teacher' | 'service'
  action      TEXT        NOT NULL,                  -- e.g. 'delete_account', 'grade_override', 'subscription_admin_grant'
  source      TEXT        NOT NULL,                  -- edge function or page that logged it
  target_id   TEXT,                                  -- affected row id (student_id, subscription_id, etc.)
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_audit_actor_idx ON public.admin_action_audit (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_audit_action_idx ON public.admin_action_audit (action, created_at DESC);

-- Keep 1 year of history — long enough for incident review, short enough to
-- stay lean without a dedicated retention job.
ALTER TABLE public.admin_action_audit ENABLE ROW LEVEL SECURITY;

-- Only service role writes (edge functions); no one reads via the client API
-- (audit logs are pulled by staff via the Supabase dashboard / SQL, not the app).
REVOKE ALL ON public.admin_action_audit FROM authenticated, anon;
