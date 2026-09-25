-- V5 Backend: Remote Application Feature Flags Foundation
--
-- Generic, lightweight, cacheable remote configuration with safe defaults.
-- RLS: Read-only for authenticated and anon users. Writable only by service_role.

CREATE TABLE IF NOT EXISTS public.app_flags (
  flag_name   TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_flags_read_policy" ON public.app_flags;
CREATE POLICY "app_flags_read_policy"
  ON public.app_flags
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.app_flags FROM public, anon, authenticated;
GRANT SELECT ON public.app_flags TO anon, authenticated;
GRANT ALL ON public.app_flags TO service_role;

-- Seed canonical V5 feature flags (safe default = true)
INSERT INTO public.app_flags (flag_name, enabled, description)
VALUES
  ('novo_enabled', true, 'Master kill-switch for Novo AI tutor and proactive assistance'),
  ('ai_generation_enabled', true, 'Enables real-time LLM-driven generation (quizzes, explanations, roadmaps)'),
  ('pyq_enabled', true, 'Enables Previous Year Questions exploration and mock papers'),
  ('battle_enabled', true, 'Enables multiplayer 1v1 quiz battles'),
  ('new_home_enabled', true, 'Enables the V5 modular home dashboard experience'),
  ('pro_enabled', true, 'Enables Pro subscription tier features and checks')
ON CONFLICT (flag_name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at  = now();

-- Canonical read function: aggregates flags into a flat, ultra-small JSON object
CREATE OR REPLACE FUNCTION public.get_app_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_object_agg(flag_name, enabled),
    '{}'::jsonb
  )
  FROM public.app_flags;
$$;

REVOKE ALL ON FUNCTION public.get_app_flags() FROM public;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

COMMENT ON TABLE public.app_flags IS 'V5 Remote feature flags: server-authoritative kill-switches and rollouts.';
COMMENT ON FUNCTION public.get_app_flags() IS 'Returns a flat key-value JSON object of all active remote feature flags.';
