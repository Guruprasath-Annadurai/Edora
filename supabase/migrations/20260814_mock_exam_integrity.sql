-- ═══════════════════════════════════════════════════════════════════════════
-- Mock exam integrity — Phase 5 of the enterprise remediation mandate
-- (RISK-008, Critical). mock_test_attempts had no idempotency protection
-- and no exam-config versioning:
--
-- 1. Idempotency: submitExam() (src/pages/MockTestPage.tsx) guarded against
--    double-submit with an in-memory React ref only — zero protection
--    against a retried network request, or a resumed-after-crash session
--    re-submitting the same attempt, creating a duplicate row and (via
--    calc_mock_percentile) skewing the percentile distribution for every
--    other student on that exam type.
-- 2. Config versioning: attempts stored their own questions/marking scheme
--    but nothing tying them to which exam-config revision was in effect —
--    if EXAM_CONFIG (src/pages/MockTestPage.tsx) changes between an
--    attempt's start and submission, there'd be no way to tell, after the
--    fact, which rules a given historical score was actually computed
--    under.
--
-- attempt_key is a client-generated UUID, minted once when the exam starts
-- (not at submit time) and persisted alongside the in-progress attempt
-- state (see src/lib/mockExamRecovery.ts) — the SAME key survives a
-- crash/reload and is reused on resume, so a resumed attempt's eventual
-- submit collides with itself on retry instead of creating a duplicate.
-- A partial unique index (not a NOT NULL constraint) so existing rows are
-- unaffected; every new attempt going forward always sets it.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.mock_test_attempts
  ADD COLUMN IF NOT EXISTS attempt_key    uuid,
  ADD COLUMN IF NOT EXISTS config_version text;

CREATE UNIQUE INDEX IF NOT EXISTS mock_test_attempts_attempt_key_key
  ON public.mock_test_attempts (attempt_key)
  WHERE attempt_key IS NOT NULL;

COMMENT ON COLUMN public.mock_test_attempts.attempt_key IS
  'Client-generated UUID minted when the exam starts (not at submission). Enforces idempotent submission: a retried or resumed-after-crash submit reuses the same key and is rejected by the unique index rather than creating a duplicate attempt.';

COMMENT ON COLUMN public.mock_test_attempts.config_version IS
  'EXAM_CONFIG_VERSION in effect when this attempt started (see src/pages/MockTestPage.tsx). Lets historical scores be traced to the exact section/marking rules used to compute them, even after EXAM_CONFIG later changes.';
