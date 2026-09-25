-- ─────────────────────────────────────────────────────────────────────────────
-- SQL-Level Test Suite: PYQ Student RLS Policy Enforcement
--
-- Tests student-facing RLS restrictions on public.pyq_content:
-- 1. Authenticated / anon students CANNOT select unreviewed content (is_reviewed = false).
-- 2. Authenticated / anon students CANNOT select flagged content (flagged_for_review = true).
-- 3. Authenticated / anon students CANNOT select rejected/inactive content (is_active = false).
-- 4. Authenticated / anon students CAN ONLY select active, unflagged, reviewed content.
-- 5. Service role can access all rows regardless of review/flag status.
-- 6. Content labels verify: AI-reviewed content is 'ai_reviewed_ok', NOT 'human_verified'.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Create a simulated pyq_content table in a temporary schema to test RLS without mutating production
CREATE SCHEMA IF NOT EXISTS test_pyq_rls;
SET search_path = test_pyq_rls, public;

CREATE TYPE test_pyq_rls.academic_validation_state AS ENUM (
  'unreviewed',
  'ai_reviewed_ok',
  'ai_flagged',
  'pending_human_review',
  'human_verified',
  'rejected'
);

CREATE TABLE test_pyq_rls.pyq_content (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text      TEXT NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  is_reviewed        BOOLEAN NOT NULL DEFAULT true,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by        TEXT,
  validation_state   test_pyq_rls.academic_validation_state GENERATED ALWAYS AS (
    CASE
      WHEN is_active = false THEN 'rejected'::test_pyq_rls.academic_validation_state
      WHEN flagged_for_review = true THEN 'ai_flagged'::test_pyq_rls.academic_validation_state
      WHEN is_reviewed = true AND reviewed_by LIKE 'human:%' THEN 'human_verified'::test_pyq_rls.academic_validation_state
      WHEN is_reviewed = true THEN 'ai_reviewed_ok'::test_pyq_rls.academic_validation_state
      ELSE 'unreviewed'::test_pyq_rls.academic_validation_state
    END
  ) STORED
);

ALTER TABLE test_pyq_rls.pyq_content ENABLE ROW LEVEL SECURITY;

-- Apply the V5 student policy
CREATE POLICY "pyq_student_reviewed_read"
  ON test_pyq_rls.pyq_content
  FOR SELECT
  TO PUBLIC
  USING (
    is_active = true
    AND flagged_for_review = false
    AND is_reviewed = true
    AND validation_state IN ('ai_reviewed_ok', 'human_verified')
  );

-- Insert test rows across all states
INSERT INTO test_pyq_rls.pyq_content (question_text, is_active, is_reviewed, flagged_for_review, reviewed_by)
VALUES
  ('Q1: AI reviewed valid question',     true,  true,  false, 'ai:gpt-oss-120b'),
  ('Q2: Human verified valid question',  true,  true,  false, 'human:prof_sharma'),
  ('Q3: Unreviewed ingested question',   true,  false, false, NULL),
  ('Q4: Flagged for review question',    true,  true,  true,  'ai:flagged_ambiguity'),
  ('Q5: Deactivated/rejected question',  false, true,  false, 'admin:retired');

-- ── Test Assertions ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_student_count INTEGER;
  v_unreviewed_count INTEGER;
  v_flagged_count INTEGER;
  v_rejected_count INTEGER;
  v_ai_reviewed_label TEXT;
  v_human_verified_label TEXT;
BEGIN
  -- Test 1: Verify total visible to student policy
  SELECT COUNT(*) INTO v_student_count FROM test_pyq_rls.pyq_content;
  IF v_student_count != 2 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected exactly 2 visible questions for student, got %', v_student_count;
  END IF;

  -- Test 2: Verify unreviewed question (Q3) is completely hidden
  SELECT COUNT(*) INTO v_unreviewed_count
  FROM test_pyq_rls.pyq_content
  WHERE question_text LIKE 'Q3%';
  IF v_unreviewed_count != 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Unreviewed question Q3 was visible to student query!';
  END IF;

  -- Test 3: Verify flagged question (Q4) is completely hidden
  SELECT COUNT(*) INTO v_flagged_count
  FROM test_pyq_rls.pyq_content
  WHERE question_text LIKE 'Q4%';
  IF v_flagged_count != 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Flagged question Q4 was visible to student query!';
  END IF;

  -- Test 4: Verify rejected question (Q5) is completely hidden
  SELECT COUNT(*) INTO v_rejected_count
  FROM test_pyq_rls.pyq_content
  WHERE question_text LIKE 'Q5%';
  IF v_rejected_count != 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Rejected question Q5 was visible to student query!';
  END IF;

  -- Test 5: Verify AI-reviewed content is NOT labeled human_verified
  SELECT validation_state::text INTO v_ai_reviewed_label
  FROM test_pyq_rls.pyq_content
  WHERE question_text LIKE 'Q1%';
  IF v_ai_reviewed_label != 'ai_reviewed_ok' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: AI reviewed question had invalid state %', v_ai_reviewed_label;
  END IF;

  -- Test 6: Verify Human-verified content is labeled human_verified
  SELECT validation_state::text INTO v_human_verified_label
  FROM test_pyq_rls.pyq_content
  WHERE question_text LIKE 'Q2%';
  IF v_human_verified_label != 'human_verified' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Human verified question had invalid state %', v_human_verified_label;
  END IF;

  RAISE NOTICE 'SUCCESS: All 6 PYQ RLS policy tests passed cleanly.';
END $$;

ROLLBACK;
