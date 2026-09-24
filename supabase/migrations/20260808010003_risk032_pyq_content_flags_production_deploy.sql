-- RISK-032 (content review workflow): supabase/migrations/20260801000000_admin_qa_pipelines.sql
-- was applied to edora-staging (via the full 178-migration replay) but never
-- to production -- confirmed via information_schema that pyq_content_flags
-- and pyq_content.reviewed did not exist there.
--
-- IMPORTANT, discovered AFTER this migration was applied (see
-- docs/enterprise/RISK032_CONTENT_REVIEW_WORKFLOW.md for the full story):
-- production's real, live pyq-content-audit edge function does NOT use
-- either of these -- it operates directly on pyq_content's original
-- is_reviewed/flagged_for_review/review_notes/reviewed_by columns, which
-- already existed. This migration's pyq_content_flags table and reviewed
-- column are therefore currently unused by any live code path. Left in
-- place rather than reverted in the same pass that discovered the mistake
-- (dropping schema deserves its own deliberate review) -- flagged as
-- cleanup debt for a future pass to either wire up or drop.

ALTER TABLE public.pyq_content
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pyq_content_unreviewed ON public.pyq_content (reviewed) WHERE NOT reviewed;

CREATE TABLE IF NOT EXISTS public.pyq_content_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pyq_content_id  UUID        NOT NULL REFERENCES public.pyq_content(id) ON DELETE CASCADE,
  exam            TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  chapter         TEXT        NOT NULL,
  question_text   TEXT        NOT NULL,
  options         JSONB,
  correct_option  TEXT,
  solution_text   TEXT,
  review_notes    TEXT        NOT NULL,
  reviewed_by     TEXT        NOT NULL DEFAULT 'ai-second-reviewer',
  status          TEXT        NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','approved','retired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pyq_content_flags_status ON public.pyq_content_flags (status, created_at DESC);

ALTER TABLE public.pyq_content_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pyq_content_flags_service_only" ON public.pyq_content_flags;
CREATE POLICY "pyq_content_flags_service_only" ON public.pyq_content_flags FOR ALL TO service_role USING (true);

-- Same grant-vs-RLS-policy gap found repeatedly this session (RISK-006,
-- Phase 10's subscriptions finding): an RLS policy alone does not grant
-- service_role the base table privilege it needs.
GRANT ALL ON public.pyq_content_flags TO service_role;
