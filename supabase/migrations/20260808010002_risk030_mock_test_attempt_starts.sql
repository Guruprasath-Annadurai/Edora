-- RISK-030: mock_test_attempts only ever receives a row on successful
-- completion (score/max_score/completed_at are all NOT NULL) -- a crash,
-- connectivity drop, or app kill mid-exam leaves zero trace anywhere: not a
-- failed row, no row at all. Phase 5 (mock exam integrity) closed the
-- client-side half of this (localStorage snapshot + resume prompt via
-- src/lib/mockExamRecovery.ts) but that's invisible server-side -- there was
-- still no way to answer "how often does this actually happen" or to alert
-- anyone when it does.
--
-- This is a separate, lightweight, insert-only table rather than adding
-- nullable columns to mock_test_attempts itself: every existing consumer of
-- that table (postmortem analysis, weak-topic pipeline, percentile calc,
-- analytics) already assumes every row is a completed attempt with a real
-- score. Keeping "started" as its own table means none of that code needs
-- to change or add null-checks it doesn't otherwise need.

CREATE TABLE IF NOT EXISTS public.mock_test_attempt_starts (
  attempt_key     UUID        PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type       TEXT        NOT NULL,
  config_version  TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_test_attempt_starts_started_at
  ON public.mock_test_attempt_starts (started_at);

ALTER TABLE public.mock_test_attempt_starts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mock_test_attempt_starts_own_insert" ON public.mock_test_attempt_starts;
CREATE POLICY "mock_test_attempt_starts_own_insert" ON public.mock_test_attempt_starts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_test_attempt_starts_own_select" ON public.mock_test_attempt_starts;
CREATE POLICY "mock_test_attempt_starts_own_select" ON public.mock_test_attempt_starts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_test_attempt_starts_service_all" ON public.mock_test_attempt_starts;
CREATE POLICY "mock_test_attempt_starts_service_all" ON public.mock_test_attempt_starts
  FOR ALL TO service_role USING (true);

-- RLS alone is not sufficient -- service_role (used by monitoring-check to
-- scan for stuck attempts) needs the base table grant too, the same
-- grant-vs-policy gap found repeatedly this session (RISK-006, RISK-032,
-- Phase 10's subscriptions finding).
GRANT SELECT, INSERT ON public.mock_test_attempt_starts TO authenticated;
GRANT ALL ON public.mock_test_attempt_starts TO service_role;

COMMENT ON TABLE public.mock_test_attempt_starts IS
  'RISK-030: insert-only trace of every mock exam attempt at the moment it starts (client mints attempt_key here, before any answers exist). A row here with no matching mock_test_attempts.attempt_key after a reasonable window (6h, matching mockExamRecovery.ts''s resume TTL) is an abandoned or crashed attempt -- previously invisible. Read by monitoring-check.';
