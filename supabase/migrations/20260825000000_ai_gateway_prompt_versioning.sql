-- ═══════════════════════════════════════════════════════════════════════════
-- AI gateway: prompt versioning (RISK-006 follow-up, gap #2 from
-- docs/enterprise/AI_GATEWAY_MIGRATION.md's "what's not built yet" list --
-- "no prompt versioning, no golden evaluation sets").
--
-- ai_prompt_versions: a real, diffable, rollback-able prompt store. Each
-- prompt lives under a stable `prompt_key` (e.g. 'novo-morning-brief.brief')
-- with numbered versions; exactly one version per key is `is_active` at a
-- time (enforced by the partial unique index below), which is the version
-- callers actually get back from getActivePrompt(). This is intentionally
-- NOT a requirement for every call site to migrate onto immediately --
-- functions keep their own inline prompt as a fallback if a key was never
-- registered, so this ships without a flag day. It exists so that (a) a
-- prompt change is a reviewable, revertible row instead of a silent edit
-- buried in a function deploy, and (b) ai_gateway_requests can now record
-- which exact prompt version produced a given AI call, which is what makes
-- an eval regression traceable to a specific prompt edit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key  text NOT NULL,
  version     integer NOT NULL,
  template    text NOT NULL,
  notes       text,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  UNIQUE (prompt_key, version)
);

-- Exactly one active version per prompt_key.
CREATE UNIQUE INDEX IF NOT EXISTS ai_prompt_versions_one_active_idx
  ON public.ai_prompt_versions (prompt_key) WHERE is_active;

CREATE INDEX IF NOT EXISTS ai_prompt_versions_key_idx ON public.ai_prompt_versions (prompt_key);

ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Same pattern as ai_gateway_config/ai_gateway_requests: service_role only,
-- read/written by the gateway and by admin-console (gated server-side by
-- has_role(uid,'admin')), never directly by a client.
CREATE POLICY ai_prompt_versions_service_all ON public.ai_prompt_versions
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.ai_prompt_versions TO service_role;

COMMENT ON TABLE public.ai_prompt_versions IS
  'Versioned prompt registry for the central AI gateway. One row per (prompt_key, version); exactly one version per key has is_active=true. Read by _shared/aiGateway.ts getActivePrompt(), written by admin-console.';

-- Traceability: which registered prompt (if any) produced a given gateway
-- call. Nullable -- most call sites won't be migrated onto the registry on
-- day one, and that's fine; the columns just stay null for those rows.
ALTER TABLE public.ai_gateway_requests
  ADD COLUMN IF NOT EXISTS prompt_key     text,
  ADD COLUMN IF NOT EXISTS prompt_version integer;

CREATE INDEX IF NOT EXISTS ai_gateway_requests_prompt_key_idx ON public.ai_gateway_requests (prompt_key);
