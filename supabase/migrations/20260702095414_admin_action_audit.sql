CREATE TABLE IF NOT EXISTS public.admin_action_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  TEXT        NOT NULL DEFAULT 'user',
  action      TEXT        NOT NULL,
  source      TEXT        NOT NULL,
  target_id   TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_audit_actor_idx ON public.admin_action_audit (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_audit_action_idx ON public.admin_action_audit (action, created_at DESC);

ALTER TABLE public.admin_action_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_audit FROM authenticated, anon;
