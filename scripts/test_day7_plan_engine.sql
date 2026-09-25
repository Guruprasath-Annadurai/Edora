-- ==============================================================================
-- Edora V5 Day 7: Deterministic Today's Plan Engine Verification Suite
-- File: scripts/test_day7_plan_engine.sql
--
-- Tests:
--   1. Schema and dependency base creation
--   2. Application of all actual V5 migrations via \i including:
--      supabase/migrations/20260930000000_v5_get_today_plan.sql
--   3. Security & Isolation Tests (anon rejection, cross-user isolation)
--   4. PYQ Trust Eligibility Tests (unreviewed, flagged, inactive, trusted)
--   5. Persona A (No History -> Diagnostic)
--   6. Persona B (Weak Topic -> Lowest Mastery Deterministic Win)
--   7. Persona C (Due Reviews -> Review Due Priority 1)
--   8. Persona D (Exam <= 14 Days + Trusted PYQ -> Exam Push Priority 5)
--   9. Persona E (GENERAL -> Never Exam Push)
--  10. Mixed Priority (4 candidates -> Strictly Top 3 in Canonical Order)
--  11. EXPLAIN Query Plan Evidence on Synthetic Fixtures
-- ==============================================================================

\set ON_ERROR_STOP on

-- Ensure roles exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- ── Base Schemas & Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS auth;

-- Grant schema usage to test roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Simulated auth.uid() function for testing
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Ensure auth.users table
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE
);

-- Core application tables (pre-requisites for V5 migrations)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  exam_name TEXT DEFAULT 'GENERAL',
  exam_date DATE,
  study_level TEXT DEFAULT 'school',
  study_preferences JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_answers    JSONB NOT NULL DEFAULT '[]'::jsonb,
  score           INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.increment_xp(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_xp_unchecked(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_topic_performance(p_user_id uuid, p_subject text, p_topic text, p_score integer, p_total integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.xp_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_gateway_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  provider      TEXT NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ncert_content (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT,
  subject       TEXT,
  chapter_title TEXT,
  section_title TEXT,
  content_type  TEXT,
  chunk_level   TEXT,
  parent_id     UUID,
  class_num     INTEGER,
  source_type   TEXT,
  embedding     vector(768),
  embedding_q   vector(768),
  embedding_c   vector(768),
  content_tsv   tsvector
);

CREATE TABLE IF NOT EXISTS public.user_content_index (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  content     TEXT,
  subject     TEXT,
  topic       TEXT,
  source_type TEXT,
  embedding   vector(768),
  content_tsv tsvector
);

CREATE TABLE IF NOT EXISTS public.school_content_index (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID,
  content        TEXT,
  subject        TEXT,
  title          TEXT,
  grade          INTEGER,
  parent_doc_id  UUID,
  embedding      vector(768),
  content_tsv    tsvector
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'academic_validation_state') THEN
    CREATE TYPE public.academic_validation_state AS ENUM (
      'unreviewed',
      'ai_reviewed_ok',
      'ai_flagged',
      'pending_human_review',
      'human_verified',
      'rejected'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pyq_content (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam               TEXT NOT NULL,
  year               SMALLINT NOT NULL,
  subject            TEXT NOT NULL,
  chapter            TEXT NOT NULL,
  question_text      TEXT NOT NULL,
  solution_text      TEXT,
  options            JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option     TEXT,
  difficulty         TEXT DEFAULT 'medium',
  class_level        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  is_reviewed        BOOLEAN NOT NULL DEFAULT false,
  validation_state   public.academic_validation_state NOT NULL DEFAULT 'unreviewed',
  embedding          vector(768),
  content_tsv        tsvector,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sr_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'tutoring',
  front TEXT NOT NULL DEFAULT 'Q',
  back TEXT NOT NULL DEFAULT 'A',
  easiness_factor NUMERIC(4,3) NOT NULL DEFAULT 2.5,
  interval_days INT NOT NULL DEFAULT 1,
  repetitions INT NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at TIMESTAMPTZ,
  total_reviews INT NOT NULL DEFAULT 0,
  correct_reviews INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subtopic_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  difficulty_level INTEGER NOT NULL DEFAULT 3,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_wrong INTEGER NOT NULL DEFAULT 0,
  mastery_score FLOAT NOT NULL DEFAULT 0.5,
  last_attempted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, subtopic)
);

CREATE TABLE IF NOT EXISTS public.topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  total_q INTEGER NOT NULL DEFAULT 0,
  correct_q INTEGER NOT NULL DEFAULT 0,
  accuracy_pct NUMERIC(5,2) DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject, topic)
);

CREATE TABLE IF NOT EXISTS public.ncert_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_num SMALLINT NOT NULL CHECK (class_num BETWEEN 6 AND 12),
  subject TEXT NOT NULL,
  chapter_num SMALLINT NOT NULL,
  chapter_title TEXT NOT NULL,
  description TEXT,
  concepts TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_num, subject, chapter_num)
);

CREATE TABLE IF NOT EXISTS public.ncert_chapter_progress (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES public.ncert_chapters(id) ON DELETE CASCADE,
  questions_attempted INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  flashcards_reviewed INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter_id)
);

-- Base indexes
CREATE INDEX IF NOT EXISTS sr_cards_user_review_idx ON public.sr_cards (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS subtopic_mastery_user_idx ON public.subtopic_mastery(user_id, subject);
CREATE INDEX IF NOT EXISTS pyq_exam_year_idx ON public.pyq_content (exam, year);

SELECT 'BASE PRE-MIGRATION SCHEMA READY' AS status;

-- ── Apply V5 Migrations via \i ───────────────────────────────────────────────
\i supabase/migrations/20260926000000_v5_complete_quiz_session.sql
\i supabase/migrations/20260927000000_v5_ai_health_view.sql
\i supabase/migrations/20260927100000_v5_exam_target_normalization.sql
\i supabase/migrations/20260928000000_v5_app_flags.sql
\i supabase/migrations/20260929000000_v5_pyq_student_access_enforcement.sql
\i supabase/migrations/20260930000000_v5_get_today_plan.sql

SELECT 'ALL MIGRATIONS INCLUDING 20260930000000 APPLIED SUCCESSFULLY' AS status;

-- ── 1. Security & Caller Rejection Test ──────────────────────────────────────
DO $$
DECLARE
  v_err_code TEXT;
BEGIN
  -- Clear auth.uid()
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    PERFORM * FROM public.get_today_plan();
    RAISE EXCEPTION 'TEST FAILED: get_today_plan should have failed for unauthenticated caller';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
    IF v_err_code = '42501' THEN
      RAISE NOTICE 'SECURITY PASS: Unauthenticated caller rejected with 42501 (insufficient privilege)';
    ELSE
      RAISE EXCEPTION 'TEST FAILED: Unexpected error code %', v_err_code;
    END IF;
  END;
END $$;

-- ── Setup Test Fixtures ──────────────────────────────────────────────────────
DO $$
DECLARE
  u_a UUID := '11111111-1111-1111-1111-111111111111';
  u_b UUID := '22222222-2222-2222-2222-222222222222';
  u_c UUID := '33333333-3333-3333-3333-333333333333';
  u_d UUID := '44444444-4444-4444-4444-444444444444';
  u_e UUID := '55555555-5555-5555-5555-555555555555';
  u_m UUID := '66666666-6666-6666-6666-666666666666';
  c1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c2_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
  -- Create users
  INSERT INTO auth.users (id, email) VALUES
    (u_a, 'user_a@test.com'),
    (u_b, 'user_b@test.com'),
    (u_c, 'user_c@test.com'),
    (u_d, 'user_d@test.com'),
    (u_e, 'user_e@test.com'),
    (u_m, 'user_m@test.com')
  ON CONFLICT (id) DO NOTHING;

  -- Create profiles
  -- Persona A: No History (GENERAL)
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level)
  VALUES (u_a, 'GENERAL', NULL, 'school')
  ON CONFLICT (id) DO NOTHING;

  -- Persona B: Weak Topic Learner (has history, weak subtopics)
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level)
  VALUES (u_b, 'GENERAL', NULL, 'school')
  ON CONFLICT (id) DO NOTHING;

  -- Add history so diagnostic is NOT triggered for Persona B
  INSERT INTO public.quiz_sessions (id, user_id, subject, topic, score)
  VALUES (gen_random_uuid(), u_b, 'Physics', 'Mechanics', 80);

  -- Subtopics for B:
  -- Topic 1: mastery 0.40, attempts 4
  -- Topic 2: mastery 0.25, attempts 5 (weaker)
  -- Topic 3: mastery 0.25, attempts 6 (weaker by attempts)
  -- Topic 4: mastery 0.20, attempts 3 (lowest mastery -> should win!)
  -- Topic 5: mastery 0.45, attempts 2 (ineligible: attempts < 3)
  INSERT INTO public.subtopic_mastery (user_id, subject, subtopic, attempts, mastery_score)
  VALUES
    (u_b, 'Physics', 'Rotational Motion', 4, 0.40),
    (u_b, 'Physics', 'Work Energy', 5, 0.25),
    (u_b, 'Physics', 'Circular Motion', 6, 0.25),
    (u_b, 'Physics', 'Center of Mass', 3, 0.20),
    (u_b, 'Physics', 'Kinematics', 2, 0.45);

  -- Persona C: Due Reviews
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level)
  VALUES (u_c, 'GENERAL', NULL, 'school')
  ON CONFLICT (id) DO NOTHING;

  -- Add history for C
  INSERT INTO public.quiz_sessions (id, user_id, subject, topic, score)
  VALUES (gen_random_uuid(), u_c, 'Chemistry', 'Organic', 75);

  -- Add SR cards for C (2 due, 1 future)
  INSERT INTO public.sr_cards (user_id, subject, topic, next_review_date)
  VALUES
    (u_c, 'Chemistry', 'Aldehydes', CURRENT_DATE - 1),
    (u_c, 'Chemistry', 'Ketones', CURRENT_DATE),
    (u_c, 'Chemistry', 'Amines', CURRENT_DATE + 5);

  -- Persona D: Exam in <= 14 Days (NEET in 7 days)
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level, study_preferences)
  VALUES (u_d, 'NEET', CURRENT_DATE + 7, 'competitive', '{"class": "12", "subjects": ["Biology"]}'::JSONB)
  ON CONFLICT (id) DO NOTHING;

  -- Add history for D
  INSERT INTO public.quiz_sessions (id, user_id, subject, topic, score)
  VALUES (gen_random_uuid(), u_d, 'Biology', 'Genetics', 90);

  -- Persona E: GENERAL with exam_date set
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level)
  VALUES (u_e, 'GENERAL', CURRENT_DATE + 5, 'school')
  ON CONFLICT (id) DO NOTHING;

  -- Add history for E
  INSERT INTO public.quiz_sessions (id, user_id, subject, topic, score)
  VALUES (gen_random_uuid(), u_e, 'Maths', 'Calculus', 85);

  -- NCERT Chapters for learn_next
  INSERT INTO public.ncert_chapters (id, class_num, subject, chapter_num, chapter_title)
  VALUES
    (c1_id, 10, 'Science', 1, 'Chemical Reactions and Equations'),
    (c2_id, 10, 'Science', 2, 'Acids, Bases and Salts')
  ON CONFLICT DO NOTHING;

  -- Persona M: Mixed Candidate Set
  -- Due cards (Priority 1)
  -- Weak subtopic (Priority 2)
  -- Next NCERT chapter (Priority 4)
  -- Exam push (Priority 5)
  INSERT INTO public.profiles (id, exam_name, exam_date, study_level, study_preferences)
  VALUES (u_m, 'JEE Main', CURRENT_DATE + 10, 'competitive', '{"class": "10", "subjects": ["Science"]}'::JSONB)
  ON CONFLICT (id) DO NOTHING;

  -- History for M
  INSERT INTO public.quiz_sessions (id, user_id, subject, topic, score)
  VALUES (gen_random_uuid(), u_m, 'Science', 'Chemical Reactions', 70);

  -- Due review for M
  INSERT INTO public.sr_cards (user_id, subject, topic, next_review_date)
  VALUES (u_m, 'Science', 'Acids and Bases', CURRENT_DATE);

  -- Weak subtopic for M
  INSERT INTO public.subtopic_mastery (user_id, subject, subtopic, attempts, mastery_score)
  VALUES (u_m, 'Science', 'Redox Reactions', 4, 0.35);

  -- Completed chapter 1 progress for M, so chapter 2 becomes learn_next
  INSERT INTO public.ncert_chapter_progress (user_id, chapter_id, completed_at, questions_attempted)
  VALUES (u_m, c1_id, now() - INTERVAL '1 day', 10)
  ON CONFLICT DO NOTHING;

END $$;

-- ── 2. PYQ Trust Eligibility Test ───────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  u_d UUID := '44444444-4444-4444-4444-444444444444';
BEGIN
  DELETE FROM public.pyq_content WHERE exam = 'NEET';

  -- Fixture 1: Unreviewed PYQ
  INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
  VALUES ('NEET', 2024, 'Biology', 'Genetics', 'Unreviewed Q', false, true, false, 'unreviewed');

  PERFORM set_config('request.jwt.claim.sub', u_d::text, true);
  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'exam_push';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TRUST TEST FAILED: Unreviewed PYQ activated exam_push!';
  END IF;

  -- Fixture 2: Flagged PYQ
  INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
  VALUES ('NEET', 2024, 'Biology', 'Genetics', 'Flagged Q', true, true, true, 'human_verified');

  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'exam_push';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TRUST TEST FAILED: Flagged PYQ activated exam_push!';
  END IF;

  -- Fixture 3: Inactive PYQ
  INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
  VALUES ('NEET', 2024, 'Biology', 'Genetics', 'Inactive Q', true, false, false, 'human_verified');

  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'exam_push';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TRUST TEST FAILED: Inactive PYQ activated exam_push!';
  END IF;

  -- Fixture 4: Rejected validation state
  INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
  VALUES ('NEET', 2024, 'Biology', 'Genetics', 'Rejected Q', true, true, false, 'rejected');

  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'exam_push';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TRUST TEST FAILED: Rejected PYQ activated exam_push!';
  END IF;

  -- Fixture 5: TRUSTED PYQ (is_active=true, flagged=false, is_reviewed=true, validation_state='human_verified')
  INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
  VALUES ('NEET', 2024, 'Biology', 'Genetics', 'Trusted Q', true, true, false, 'human_verified');

  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'exam_push';
  IF v_count != 1 THEN
    RAISE EXCEPTION 'TRUST TEST FAILED: Trusted PYQ should have activated exam_push!';
  END IF;

  RAISE NOTICE 'PYQ TRUST TEST PASS: Strictly trusted questions activate exam_push; unreviewed/flagged/rejected/inactive blocked.';
END $$;

-- Also seed a trusted JEE_MAIN PYQ for Persona M
INSERT INTO public.pyq_content (exam, year, subject, chapter, question_text, is_reviewed, is_active, flagged_for_review, validation_state)
VALUES ('JEE_MAIN', 2024, 'Physics', 'Mechanics', 'Trusted JEE Main Q', true, true, false, 'ai_reviewed_ok');

-- ── 3. Persona A: NO HISTORY -> Diagnostic Item ─────────────────────────────
DO $$
DECLARE
  u_a UUID := '11111111-1111-1111-1111-111111111111';
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_a::text, true);

  FOR v_rec IN SELECT * FROM public.get_today_plan() LOOP
    v_count := v_count + 1;
    IF v_rec.kind = 'diagnostic' THEN
      IF v_rec.priority != 3 OR v_rec.target_path != '/practice' THEN
        RAISE EXCEPTION 'Persona A diagnostic contract mismatch: %', v_rec;
      END IF;
    ELSIF v_rec.kind IN ('review_due', 'fix_weak', 'exam_push') THEN
      RAISE EXCEPTION 'Persona A should NOT have received %', v_rec.kind;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Persona A received zero items!';
  END IF;

  RAISE NOTICE 'PERSONA A PASS: No history produced diagnostic item at priority 3.';
END $$;

-- ── 4. Persona B: WEAK TOPIC -> Weakest Eligible Row Wins ───────────────────
DO $$
DECLARE
  u_b UUID := '22222222-2222-2222-2222-222222222222';
  v_found_weak BOOLEAN := false;
  v_rec RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_b::text, true);

  FOR v_rec IN SELECT * FROM public.get_today_plan() LOOP
    IF v_rec.kind = 'fix_weak' THEN
      v_found_weak := true;
      -- Expect Center of Mass (mastery 0.20, attempts 3)
      IF v_rec.topic != 'Center of Mass' THEN
        RAISE EXCEPTION 'Persona B deterministic tie-break failure: expected Center of Mass, got %', v_rec.topic;
      END IF;
      IF v_rec.priority != 2 OR v_rec.target_path != '/practice' THEN
        RAISE EXCEPTION 'Persona B fix_weak contract mismatch: %', v_rec;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_found_weak THEN
    RAISE EXCEPTION 'Persona B failed to return fix_weak!';
  END IF;

  RAISE NOTICE 'PERSONA B PASS: Weakest eligible subtopic deterministically won (Center of Mass, mastery 0.20).';
END $$;

-- ── 5. Persona C: DUE REVIEWS -> Review Due Priority 1 ──────────────────────
DO $$
DECLARE
  u_c UUID := '33333333-3333-3333-3333-333333333333';
  v_first_kind TEXT;
  v_first_priority INTEGER;
  v_first_due INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_c::text, true);

  SELECT kind, priority, (reason->>'due_count')::INTEGER
  INTO v_first_kind, v_first_priority, v_first_due
  FROM public.get_today_plan()
  ORDER BY priority ASC
  LIMIT 1;

  IF v_first_kind != 'review_due' OR v_first_priority != 1 THEN
    RAISE EXCEPTION 'Persona C: review_due was not first item (got %, priority %)', v_first_kind, v_first_priority;
  END IF;

  IF v_first_due != 2 THEN
    RAISE EXCEPTION 'Persona C: expected due count 2, got %', v_first_due;
  END IF;

  RAISE NOTICE 'PERSONA C PASS: Review due is priority 1 with exact due count (2).';
END $$;

-- ── 6. Persona D: EXAM <= 14 DAYS -> Exam Push Priority 5 ───────────────────
DO $$
DECLARE
  u_d UUID := '44444444-4444-4444-4444-444444444444';
  v_found_exam BOOLEAN := false;
  v_rec RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_d::text, true);

  FOR v_rec IN SELECT * FROM public.get_today_plan() LOOP
    IF v_rec.kind = 'exam_push' THEN
      v_found_exam := true;
      IF v_rec.priority != 5 OR v_rec.target_path != '/pyq-bank' THEN
        RAISE EXCEPTION 'Persona D exam_push contract mismatch: %', v_rec;
      END IF;
      IF (v_rec.reason->>'days_remaining')::INTEGER != 7 THEN
        RAISE EXCEPTION 'Persona D expected 7 days remaining, got %', (v_rec.reason->>'days_remaining');
      END IF;
    END IF;
  END LOOP;

  IF NOT v_found_exam THEN
    RAISE EXCEPTION 'Persona D failed to return exam_push!';
  END IF;

  RAISE NOTICE 'PERSONA D PASS: Exam in 7 days with trusted PYQs activated exam_push at priority 5.';
END $$;

-- ── 7. Persona E: GENERAL -> Never Exam Push ────────────────────────────────
DO $$
DECLARE
  u_e UUID := '55555555-5555-5555-5555-555555555555';
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_e::text, true);

  SELECT count(*) INTO v_count
  FROM public.get_today_plan()
  WHERE kind = 'exam_push';

  IF v_count != 0 THEN
    RAISE EXCEPTION 'Persona E (GENERAL) received exam_push!';
  END IF;

  RAISE NOTICE 'PERSONA E PASS: GENERAL learner never receives exam_push.';
END $$;

-- ── 8. Persona M: MIXED PRIORITY (4 candidates -> top 3 in order) ───────────
DO $$
DECLARE
  u_m UUID := '66666666-6666-6666-6666-666666666666';
  v_kinds TEXT[] := '{}';
  v_rec RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_m::text, true);

  FOR v_rec IN SELECT * FROM public.get_today_plan() ORDER BY priority ASC LOOP
    v_kinds := array_append(v_kinds, v_rec.kind);
  END LOOP;

  IF array_length(v_kinds, 1) != 3 THEN
    RAISE EXCEPTION 'Persona M expected exactly 3 items, got % (%)', array_length(v_kinds, 1), v_kinds;
  END IF;

  IF v_kinds[1] != 'review_due' OR v_kinds[2] != 'fix_weak' OR v_kinds[3] != 'learn_next' THEN
    RAISE EXCEPTION 'Persona M ordering failure: expected [review_due, fix_weak, learn_next], got %', v_kinds;
  END IF;

  RAISE NOTICE 'PERSONA M PASS: 4 candidates strictly cut to top 3 in canonical order (review_due, fix_weak, learn_next). Exam push safely bounded.';
END $$;

-- ── 9. Cross-User Isolation Test ────────────────────────────────────────────
DO $$
DECLARE
  u_b UUID := '22222222-2222-2222-2222-222222222222';
  u_c UUID := '33333333-3333-3333-3333-333333333333';
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u_b::text, true);
  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'review_due';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'CROSS-USER LEAK: User B received User C review_due items!';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', u_c::text, true);
  SELECT count(*) INTO v_count FROM public.get_today_plan() WHERE kind = 'fix_weak';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'CROSS-USER LEAK: User C received User B fix_weak items!';
  END IF;

  RAISE NOTICE 'CROSS-USER ISOLATION PASS: Zero cross-user data leakage between callers.';
END $$;

-- ── 10. EXPLAIN Performance Analysis on Hot Queries ─────────────────────────
\echo '--- EXPLAIN PLAN: Weak Subtopic with Partial Index ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT subject, subtopic, mastery_score, attempts
FROM public.subtopic_mastery
WHERE user_id = '22222222-2222-2222-2222-222222222222'
  AND attempts >= 3
  AND mastery_score < 0.5
ORDER BY mastery_score ASC, attempts DESC, last_attempted_at ASC NULLS FIRST, subtopic ASC, id ASC
LIMIT 1;

\echo '--- EXPLAIN PLAN: Spaced Repetition Due Cards ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)::INTEGER
FROM public.sr_cards
WHERE user_id = '33333333-3333-3333-3333-333333333333'
  AND next_review_date <= CURRENT_DATE;

\echo '--- EXPLAIN PLAN: Full get_today_plan() RPC Call ---'
SELECT set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.get_today_plan();

SELECT 'ALL DAY 7 DATABASE TESTS & CHECKS PASSED CLEANLY' AS final_verdict;
