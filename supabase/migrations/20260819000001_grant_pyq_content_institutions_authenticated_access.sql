-- Same gap as 20260819000000, found immediately after fixing it: two more
-- tables exercised directly by the live_event_grading pgTAP suite --
-- pyq_content (the test's own fixture INSERT, which runs before the test
-- switches role) and institutions (read/written by the
-- sync_institution_student_count() trigger, which is a plain plpgsql
-- function -- SECURITY INVOKER by default -- so it runs with the calling
-- role's privileges, not the table owner's) -- were never given an
-- explicit table-level GRANT in any committed migration either. Production
-- has full authenticated access to both (confirmed live via
-- information_schema.role_table_grants); a fresh replay (CI, staging)
-- never gets it. Same undocumented-production-drift pattern as
-- institution_members (20260819000000) and RISK-029/033/034 before that.
--
-- Idempotent on production. Granting only `authenticated`, matching the
-- 20260819000000 scoping rationale -- these are the grants actually
-- exercised by real app code (client-side reads of pyq_content gated by
-- its own RLS policies; the institutions trigger only ever fires in an
-- authenticated request context).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pyq_content TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.institutions TO authenticated;
