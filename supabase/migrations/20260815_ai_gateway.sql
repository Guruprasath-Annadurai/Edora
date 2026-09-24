-- ═══════════════════════════════════════════════════════════════════════════
-- Central AI gateway — Phase 7 of the enterprise remediation mandate
-- (RISK-006, High). ~39 edge functions call Gemini/Groq/NVIDIA directly with
-- no cost ceiling, no kill switch, no request logging. This migration adds
-- the two tables the gateway (supabase/functions/_shared/aiGateway.ts) reads
-- and writes; the gateway itself is the enforcement point, not this schema.
--
-- ai_gateway_config: a singleton row (enforced by the boolean PK trick — id
-- can only ever be TRUE, so there can only ever be one row) holding the kill
-- switch and the daily cost ceiling. Read by the gateway on every AI call
-- before it reaches a provider.
--
-- ai_gateway_requests: an append-only log of every call the gateway
-- mediates — provider, model, estimated cost, and whether it was blocked
-- (and why). This is what "gateway request logs" in the mandate's
-- verification method actually refers to.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- Same pattern as admin_action_audit: service_role only (the gateway and
-- admin-console edge functions both authenticate to Postgres as
-- service_role). No policy grants anon/authenticated direct access —
-- admin-console's get_ai_gateway_status/set_ai_gateway_kill_switch actions
-- are the only intended read/write path from the client, both gated
-- server-side by has_role(uid,'admin').
CREATE POLICY ai_gateway_config_service_all ON public.ai_gateway_config
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY ai_gateway_requests_service_all ON public.ai_gateway_requests
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.ai_gateway_config IS
  'Singleton (id is always TRUE) kill switch + daily cost ceiling for the central AI gateway. Read by supabase/functions/_shared/aiGateway.ts before every provider call.';

COMMENT ON TABLE public.ai_gateway_requests IS
  'Append-only log of every AI provider call mediated by the central gateway, including blocked ones — this is the "gateway request log" evidence for Phase 7 of the enterprise remediation mandate.';
