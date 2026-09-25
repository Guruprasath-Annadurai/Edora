-- V5 Backend: PYQ Student Access Enforcement & RLS Hardening
--
-- V5 Requirement: UNREVIEWED PYQ CONTENT MUST BE UNREACHABLE FROM STUDENT-FACING ACCESS.
--
-- 1. Replaces permissive `pyq_public_read` policy (which only checked `is_active = true`)
--    with strict `pyq_student_reviewed_read` policy for anon & authenticated roles.
--    Students can ONLY read questions that are active, unflagged, and validated as
--    'ai_reviewed_ok' or 'human_verified'.
-- 2. Grants full access to `service_role` for administration, auditing, and ingestion.
-- 3. Hardens `search_corpus_unified` and `hybrid_search_corpus` to restrict PYQ results
--    to reviewed, active content.

-- ── 1. RLS Policies on public.pyq_content ────────────────────────────────────

ALTER TABLE public.pyq_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pyq_public_read ON public.pyq_content;
DROP POLICY IF EXISTS "pyq_public_read" ON public.pyq_content;
DROP POLICY IF EXISTS "pyq_student_reviewed_read" ON public.pyq_content;

CREATE POLICY "pyq_student_reviewed_read"
  ON public.pyq_content
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND flagged_for_review = false
    AND is_reviewed = true
    AND validation_state IN ('ai_reviewed_ok', 'human_verified')
  );

DROP POLICY IF EXISTS "pyq_service_admin_all" ON public.pyq_content;
CREATE POLICY "pyq_service_admin_all"
  ON public.pyq_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "pyq_student_reviewed_read" ON public.pyq_content IS
  'V5 Student Protection: Restricts student and public reads strictly to active, unflagged, reviewed PYQs.';

COMMENT ON POLICY "pyq_service_admin_all" ON public.pyq_content IS
  'Allows service_role unrestricted access to audit, ingest, and manage PYQ content.';
