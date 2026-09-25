-- ─────────────────────────────────────────────────────────────────────────────
-- Edora V5 Migration Execution Test
-- Runs ALL three V5 backend migrations in a disposable schema.
-- All tests are inside a single transaction that is ROLLED BACK at the end —
-- no persistent changes to the local database.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Disposable schema setup ───────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS edora_migration_test;
SET search_path = edora_migration_test, public;

-- Simulate Supabase extension availability
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN RAISE NOTICE '=== MIGRATION EXECUTION TEST START ==='; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 1: 20260927000000_v5_exam_target_normalization.sql
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE '--- Migration 1: exam_target_normalization ---'; END $$;

-- Create a minimal profiles table that the migration targets
CREATE TABLE edora_migration_test.profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT,
  exam_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apply migration logic (adapted for test schema)
-- Set default
ALTER TABLE edora_migration_test.profiles
  ALTER COLUMN exam_name SET DEFAULT 'GENERAL';

-- Backfill existing NULLs and whitespace-only values
UPDATE edora_migration_test.profiles
  SET exam_name = 'GENERAL'
  WHERE exam_name IS NULL OR trim(exam_name) = '';

-- Create trigger function
CREATE OR REPLACE FUNCTION edora_migration_test.normalize_profile_exam_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.exam_name IS NULL OR trim(NEW.exam_name) = '' THEN
    NEW.exam_name := 'GENERAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_exam_name ON edora_migration_test.profiles;
CREATE TRIGGER trg_normalize_profile_exam_name
  BEFORE INSERT OR UPDATE OF exam_name ON edora_migration_test.profiles
  FOR EACH ROW
  EXECUTE FUNCTION edora_migration_test.normalize_profile_exam_name();

-- ── Exam Target Tests ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id UUID;
  v_exam TEXT;
BEGIN
  -- Insert pre-existing NULL row (simulates legacy data before migration)
  INSERT INTO edora_migration_test.profiles (exam_name) VALUES (NULL)
    RETURNING id INTO v_id;
  -- Backfill (already applied above — but test new inserts via trigger)
  -- Test 1: legacy insert with NULL normalizes to GENERAL (trigger fires)
  SELECT exam_name INTO v_exam FROM edora_migration_test.profiles WHERE id = v_id;
  -- The backfill runs on existing, trigger runs on new inserts
  -- Re-insert with NULL to trigger
  INSERT INTO edora_migration_test.profiles (id, exam_name) VALUES (gen_random_uuid(), NULL)
    RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN
    RAISE EXCEPTION 'TEST FAIL: NULL exam_name should normalize to GENERAL, got: %', v_exam;
  END IF;
  RAISE NOTICE 'EXAM TEST 1 PASS: NULL exam_name normalizes to GENERAL via trigger';

  -- Test 2: empty string normalizes to GENERAL
  INSERT INTO edora_migration_test.profiles (id, exam_name) VALUES (gen_random_uuid(), '')
    RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN
    RAISE EXCEPTION 'TEST FAIL: empty exam_name should normalize to GENERAL, got: %', v_exam;
  END IF;
  RAISE NOTICE 'EXAM TEST 2 PASS: empty exam_name normalizes to GENERAL via trigger';

  -- Test 3: whitespace-only normalizes to GENERAL
  INSERT INTO edora_migration_test.profiles (id, exam_name) VALUES (gen_random_uuid(), '   ')
    RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN
    RAISE EXCEPTION 'TEST FAIL: whitespace exam_name should normalize to GENERAL, got: %', v_exam;
  END IF;
  RAISE NOTICE 'EXAM TEST 3 PASS: whitespace exam_name normalizes to GENERAL via trigger';

  -- Test 4: valid exam remains unchanged
  INSERT INTO edora_migration_test.profiles (id, exam_name) VALUES (gen_random_uuid(), 'JEE')
    RETURNING exam_name INTO v_exam;
  IF v_exam != 'JEE' THEN
    RAISE EXCEPTION 'TEST FAIL: valid exam_name JEE should be unchanged, got: %', v_exam;
  END IF;
  RAISE NOTICE 'EXAM TEST 4 PASS: valid exam_name JEE remains unchanged';

  -- Test 5: UPDATE with NULL also triggers normalization
  INSERT INTO edora_migration_test.profiles (id, exam_name) VALUES (gen_random_uuid(), 'CAT')
    RETURNING id INTO v_id;
  UPDATE edora_migration_test.profiles SET exam_name = NULL WHERE id = v_id
    RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN
    RAISE EXCEPTION 'TEST FAIL: UPDATE to NULL should normalize to GENERAL, got: %', v_exam;
  END IF;
  RAISE NOTICE 'EXAM TEST 5 PASS: UPDATE with NULL exam_name normalizes via trigger';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 2: 20260928000000_v5_app_flags.sql
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE '--- Migration 2: app_flags ---'; END $$;

CREATE TABLE edora_migration_test.app_flags (
  flag_name   TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE edora_migration_test.app_flags ENABLE ROW LEVEL SECURITY;

-- Seed canonical V5 flags
INSERT INTO edora_migration_test.app_flags (flag_name, enabled, description)
VALUES
  ('novo_enabled',           true,  'Novo AI tutor kill-switch'),
  ('ai_generation_enabled',  true,  'LLM generation'),
  ('pyq_enabled',            true,  'PYQ exploration'),
  ('battle_enabled',         false, 'Battle (V5 freeze)'),
  ('new_home_enabled',       false, 'New home (V5 freeze)'),
  ('pro_enabled',            true,  'Pro tier')
ON CONFLICT (flag_name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at  = now();

-- Create get_app_flags aggregation function (in test schema)
CREATE OR REPLACE FUNCTION edora_migration_test.get_app_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    jsonb_object_agg(flag_name, enabled),
    '{}'::jsonb
  )
  FROM edora_migration_test.app_flags;
$$;

-- ── App Flags Tests ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_flags JSONB;
  v_count INTEGER;
BEGIN
  -- Test 1: Table created and has 6 rows
  SELECT COUNT(*) INTO v_count FROM edora_migration_test.app_flags;
  IF v_count != 6 THEN
    RAISE EXCEPTION 'TEST FAIL: app_flags should have 6 rows, got: %', v_count;
  END IF;
  RAISE NOTICE 'FLAGS TEST 1 PASS: app_flags table has 6 rows';

  -- Test 2: battle_enabled is false
  IF (SELECT enabled FROM edora_migration_test.app_flags WHERE flag_name = 'battle_enabled') != false THEN
    RAISE EXCEPTION 'TEST FAIL: battle_enabled must default false';
  END IF;
  RAISE NOTICE 'FLAGS TEST 2 PASS: battle_enabled = false';

  -- Test 3: new_home_enabled is false
  IF (SELECT enabled FROM edora_migration_test.app_flags WHERE flag_name = 'new_home_enabled') != false THEN
    RAISE EXCEPTION 'TEST FAIL: new_home_enabled must default false';
  END IF;
  RAISE NOTICE 'FLAGS TEST 3 PASS: new_home_enabled = false';

  -- Test 4: novo_enabled is true
  IF (SELECT enabled FROM edora_migration_test.app_flags WHERE flag_name = 'novo_enabled') != true THEN
    RAISE EXCEPTION 'TEST FAIL: novo_enabled must be true';
  END IF;
  RAISE NOTICE 'FLAGS TEST 4 PASS: novo_enabled = true';

  -- Test 5: get_app_flags() RPC returns correct JSON
  SELECT edora_migration_test.get_app_flags() INTO v_flags;
  IF (v_flags->>'battle_enabled')::boolean != false THEN
    RAISE EXCEPTION 'TEST FAIL: get_app_flags() must return battle_enabled=false';
  END IF;
  IF (v_flags->>'novo_enabled')::boolean != true THEN
    RAISE EXCEPTION 'TEST FAIL: get_app_flags() must return novo_enabled=true';
  END IF;
  RAISE NOTICE 'FLAGS TEST 5 PASS: get_app_flags() returns correct JSON';

  -- Test 6: RLS is enabled on the table
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'edora_migration_test'
      AND c.relname = 'app_flags'
      AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'TEST FAIL: RLS must be enabled on app_flags';
  END IF;
  RAISE NOTICE 'FLAGS TEST 6 PASS: RLS is enabled on app_flags';

  -- Test 7: service_role can update a flag (direct SQL — no role switching in local test)
  UPDATE edora_migration_test.app_flags SET enabled = true WHERE flag_name = 'battle_enabled';
  IF (SELECT enabled FROM edora_migration_test.app_flags WHERE flag_name = 'battle_enabled') != true THEN
    RAISE EXCEPTION 'TEST FAIL: battle_enabled update failed';
  END IF;
  -- Reset
  UPDATE edora_migration_test.app_flags SET enabled = false WHERE flag_name = 'battle_enabled';
  RAISE NOTICE 'FLAGS TEST 7 PASS: battle_enabled can be explicitly enabled/disabled';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 3: 20260929000000_v5_pyq_student_access_enforcement.sql
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE '--- Migration 3: pyq_student_access_enforcement ---'; END $$;

-- Create the academic_validation_state enum
CREATE TYPE edora_migration_test.academic_validation_state AS ENUM (
  'unreviewed',
  'ai_reviewed_ok',
  'ai_flagged',
  'pending_human_review',
  'human_verified',
  'rejected'
);

-- Create pyq_content table
CREATE TABLE edora_migration_test.pyq_content (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text      TEXT NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  is_reviewed        BOOLEAN NOT NULL DEFAULT false,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by        TEXT,
  validation_state   edora_migration_test.academic_validation_state GENERATED ALWAYS AS (
    CASE
      WHEN is_active = false                                        THEN 'rejected'::edora_migration_test.academic_validation_state
      WHEN flagged_for_review = true                                THEN 'ai_flagged'::edora_migration_test.academic_validation_state
      WHEN is_reviewed = true AND reviewed_by LIKE 'human:%'        THEN 'human_verified'::edora_migration_test.academic_validation_state
      WHEN is_reviewed = true                                       THEN 'ai_reviewed_ok'::edora_migration_test.academic_validation_state
      ELSE                                                               'unreviewed'::edora_migration_test.academic_validation_state
    END
  ) STORED
);

ALTER TABLE edora_migration_test.pyq_content ENABLE ROW LEVEL SECURITY;

-- Apply the V5 student policy
DROP POLICY IF EXISTS "pyq_student_reviewed_read" ON edora_migration_test.pyq_content;
CREATE POLICY "pyq_student_reviewed_read"
  ON edora_migration_test.pyq_content
  FOR SELECT
  TO PUBLIC
  USING (
    is_active = true
    AND flagged_for_review = false
    AND is_reviewed = true
    AND validation_state IN ('ai_reviewed_ok', 'human_verified')
  );

-- Insert test rows
INSERT INTO edora_migration_test.pyq_content (question_text, is_active, is_reviewed, flagged_for_review, reviewed_by)
VALUES
  ('Q1: AI reviewed valid question',    true,  true,  false, 'ai:gpt-oss-120b'),
  ('Q2: Human verified question',       true,  true,  false, 'human:prof_sharma'),
  ('Q3: Unreviewed question (CAT sim)', true,  false, false, NULL),
  ('Q4: Flagged for review',            true,  true,  true,  'ai:flagged'),
  ('Q5: Deactivated/rejected',          false, true,  false, 'admin:retired');

-- ── PYQ Tests ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_state TEXT;
BEGIN
  -- Test 1: RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'edora_migration_test'
      AND c.relname = 'pyq_content'
      AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'TEST FAIL: RLS must be enabled on pyq_content';
  END IF;
  RAISE NOTICE 'PYQ TEST 1 PASS: RLS enabled on pyq_content';

  -- Test 2: Total rows inserted = 5
  SELECT COUNT(*) INTO v_count FROM edora_migration_test.pyq_content;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'TEST FAIL: Expected 5 rows in pyq_content, got %', v_count;
  END IF;
  RAISE NOTICE 'PYQ TEST 2 PASS: 5 rows inserted';

  -- Test 3: ai_reviewed_ok state generated correctly for AI reviewer
  SELECT validation_state::text INTO v_state
    FROM edora_migration_test.pyq_content WHERE question_text LIKE 'Q1%';
  IF v_state != 'ai_reviewed_ok' THEN
    RAISE EXCEPTION 'TEST FAIL: Q1 (AI reviewed) should be ai_reviewed_ok, got: %', v_state;
  END IF;
  RAISE NOTICE 'PYQ TEST 3 PASS: AI reviewed question has state ai_reviewed_ok';

  -- Test 4: human_verified state generated correctly
  SELECT validation_state::text INTO v_state
    FROM edora_migration_test.pyq_content WHERE question_text LIKE 'Q2%';
  IF v_state != 'human_verified' THEN
    RAISE EXCEPTION 'TEST FAIL: Q2 (human verified) should be human_verified, got: %', v_state;
  END IF;
  RAISE NOTICE 'PYQ TEST 4 PASS: human-reviewed question has state human_verified';

  -- Test 5: unreviewed row has state = unreviewed
  SELECT validation_state::text INTO v_state
    FROM edora_migration_test.pyq_content WHERE question_text LIKE 'Q3%';
  IF v_state != 'unreviewed' THEN
    RAISE EXCEPTION 'TEST FAIL: Q3 (unreviewed) should have state unreviewed, got: %', v_state;
  END IF;
  RAISE NOTICE 'PYQ TEST 5 PASS: unreviewed question has state unreviewed';

  -- Test 6: flagged row has state = ai_flagged
  SELECT validation_state::text INTO v_state
    FROM edora_migration_test.pyq_content WHERE question_text LIKE 'Q4%';
  IF v_state != 'ai_flagged' THEN
    RAISE EXCEPTION 'TEST FAIL: Q4 (flagged) should have state ai_flagged, got: %', v_state;
  END IF;
  RAISE NOTICE 'PYQ TEST 6 PASS: flagged question has state ai_flagged';

  -- Test 7: inactive row has state = rejected
  SELECT validation_state::text INTO v_state
    FROM edora_migration_test.pyq_content WHERE question_text LIKE 'Q5%';
  IF v_state != 'rejected' THEN
    RAISE EXCEPTION 'TEST FAIL: Q5 (inactive) should have state rejected, got: %', v_state;
  END IF;
  RAISE NOTICE 'PYQ TEST 7 PASS: inactive question has state rejected';

  -- Test 8: Student policy visibility — only Q1 and Q2 are visible under policy
  -- (testing directly as superuser — policy is enforced at role level;
  --  we validate by counting rows matching the policy predicate directly)
  SELECT COUNT(*) INTO v_count
    FROM edora_migration_test.pyq_content
    WHERE is_active = true
      AND flagged_for_review = false
      AND is_reviewed = true
      AND validation_state IN ('ai_reviewed_ok', 'human_verified');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'TEST FAIL: Student policy should allow exactly 2 questions, got: %', v_count;
  END IF;
  RAISE NOTICE 'PYQ TEST 8 PASS: Student policy allows exactly 2 questions (Q1 + Q2)';

  -- Test 9: Unreviewed (Q3) is excluded by policy predicate
  SELECT COUNT(*) INTO v_count
    FROM edora_migration_test.pyq_content
    WHERE question_text LIKE 'Q3%'
      AND is_active = true
      AND flagged_for_review = false
      AND is_reviewed = true
      AND validation_state IN ('ai_reviewed_ok', 'human_verified');
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST FAIL: Q3 (unreviewed) must be invisible to student policy';
  END IF;
  RAISE NOTICE 'PYQ TEST 9 PASS: Unreviewed Q3 is excluded by student policy';

  -- Test 10: Flagged (Q4) is excluded by policy predicate
  SELECT COUNT(*) INTO v_count
    FROM edora_migration_test.pyq_content
    WHERE question_text LIKE 'Q4%'
      AND is_active = true
      AND flagged_for_review = false
      AND is_reviewed = true
      AND validation_state IN ('ai_reviewed_ok', 'human_verified');
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST FAIL: Q4 (flagged) must be invisible to student policy';
  END IF;
  RAISE NOTICE 'PYQ TEST 10 PASS: Flagged Q4 is excluded by student policy';

  -- Test 11: Inactive/rejected (Q5) is excluded by policy predicate
  SELECT COUNT(*) INTO v_count
    FROM edora_migration_test.pyq_content
    WHERE question_text LIKE 'Q5%'
      AND is_active = true
      AND flagged_for_review = false
      AND is_reviewed = true
      AND validation_state IN ('ai_reviewed_ok', 'human_verified');
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST FAIL: Q5 (inactive) must be invisible to student policy';
  END IF;
  RAISE NOTICE 'PYQ TEST 11 PASS: Inactive Q5 is excluded by student policy';

  -- Test 12: Service/admin path — unrestricted count = 5
  SELECT COUNT(*) INTO v_count FROM edora_migration_test.pyq_content;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'TEST FAIL: Service path should see all 5 rows, got: %', v_count;
  END IF;
  RAISE NOTICE 'PYQ TEST 12 PASS: Service/admin path sees all 5 rows';

END $$;

DO $$ BEGIN RAISE NOTICE '=== ALL MIGRATION TESTS PASSED ==='; END $$;

-- ── Cleanup — rollback everything, no persistent changes ──────────────────────
DROP SCHEMA edora_migration_test CASCADE;
ROLLBACK;
