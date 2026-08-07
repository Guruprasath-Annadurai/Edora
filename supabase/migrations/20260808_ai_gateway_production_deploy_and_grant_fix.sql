-- RISK-006 follow-up: the original AI gateway migration
-- (20260815_ai_gateway.sql) was, it turns out, only ever applied to
-- edora-staging — a direct query against production confirmed
-- ai_gateway_config/ai_gateway_requests do not exist there at all, and
-- production's ai-question-gen (version 16, last updated well before Phase
-- 7) is still the pre-gateway version. The tracker's "1 of 39 functions
-- migrated" claim was true of staging only; production's real coverage was
-- zero. This migration is the actual production deploy, applied here for
-- the first time.
--
-- It also fixes a second, separate bug found live while verifying this:
-- the original migration created RLS policies scoped to service_role but
-- never issued an explicit GRANT to service_role on either table (unlike
-- admin_action_audit, which does have explicit service_role grants — the
-- same class of gap as the Phase 10 subscriptions_own finding, where an RLS
-- policy alone is meaningless without the underlying table-level GRANT).
-- Confirmed live: calling gemini-vision against edora-staging (which DID
-- have the tables, just not the grants) failed with "AI gateway
-- configuration unavailable" — callAI()'s fail-closed path correctly
-- treated the permission-denied read as a block, but the gateway's own
-- kill-switch/cost-ceiling logic was never actually reachable on staging
-- either, meaning it had ALSO never been live-verified end-to-end despite
-- the migration tracker's "applied to edora-staging and verified" claim
-- (that verification checked the config row exists via direct SQL as
-- postgres, which bypasses grants entirely — not via the service-role path
-- the edge functions actually use).

CREATE TABLE IF NOT EXISTS public.ai_gateway_config (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  ai_enabled              boolean NOT NULL DEFAULT true,
  daily_cost_ceiling_usd  numeric NOT NULL DEFAULT 50.00,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id)
);

INSERT INTO public.ai_gateway_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_gateway_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  function_name       text NOT NULL,
  provider            text NOT NULL,
  model               text NOT NULL,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt_tokens       integer,
  completion_tokens   integer,
  estimated_cost_usd  numeric,
  status              text NOT NULL CHECK (status IN ('success', 'error', 'blocked_kill_switch', 'blocked_cost_ceiling')),
  latency_ms          integer,
  error_message       text
);

CREATE INDEX IF NOT EXISTS ai_gateway_requests_created_at_idx ON public.ai_gateway_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_gateway_requests_function_name_idx ON public.ai_gateway_requests (function_name);

ALTER TABLE public.ai_gateway_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_gateway_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_gateway_config_service_all ON public.ai_gateway_config;
CREATE POLICY ai_gateway_config_service_all ON public.ai_gateway_config
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS ai_gateway_requests_service_all ON public.ai_gateway_requests;
CREATE POLICY ai_gateway_requests_service_all ON public.ai_gateway_requests
  FOR ALL USING (auth.role() = 'service_role');

-- The actual fix: RLS policies are a secondary filter that only matters if
-- the connecting role already has the base table-level GRANT. Without this,
-- service_role's own edge-function client gets a bare permission-denied
-- before RLS is ever evaluated.
GRANT ALL ON public.ai_gateway_config   TO service_role;
GRANT ALL ON public.ai_gateway_requests TO service_role;

COMMENT ON TABLE public.ai_gateway_config IS
  'Singleton (id is always TRUE) kill switch + daily cost ceiling for the central AI gateway. Read by supabase/functions/_shared/aiGateway.ts before every provider call.';

COMMENT ON TABLE public.ai_gateway_requests IS
  'Append-only log of every AI provider call mediated by the central gateway, including blocked ones — this is the "gateway request log" evidence for Phase 7 of the enterprise remediation mandate.';
