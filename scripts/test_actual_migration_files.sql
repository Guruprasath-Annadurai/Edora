-- ─────────────────────────────────────────────────────────────────────────────
-- Edora V5 Migration Execution Suite: ACTUAL REPOSITORY MIGRATION FILES
--
-- Executes the real repository migration files directly via \i:
-- 1. 20260926000000_v5_complete_quiz_session.sql
-- 2. 20260927000000_v5_ai_health_view.sql
-- 3. 20260927100000_v5_exam_target_normalization.sql
-- 4. 20260928000000_v5_app_flags.sql
-- 5. 20260929000000_v5_pyq_student_access_enforcement.sql
--
-- Includes:
-- - REAL-ROLE test with SET ROLE anon / authenticated / service_role
-- - GEMINI-CHAT RAG TRUST TEST: actual execution of search_corpus_unified under service_role
-- - PYQ topic frequency view verification
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

-- ── 1. Create Minimum Pre-Migration Base Structures ─────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '11111111-1111-1111-1111-111111111111'::uuid;
$$;

-- Grant schema usage to test roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Pre-migration: quiz_sessions, xp_history, increment_xp (for complete_quiz_session)
CREATE TABLE public.quiz_sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_answers    JSONB NOT NULL DEFAULT '[]'::jsonb,
  score           INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL,
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

CREATE TABLE public.xp_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-migration: ai_gateway_requests (for ai_health_view)
CREATE TABLE public.ai_gateway_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  provider      TEXT NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-migration: profiles (for exam_target_normalization)
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT,
  exam_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-migration: Corpus tables for search_corpus_unified
CREATE TABLE public.ncert_content (
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

CREATE TABLE public.user_content_index (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  content     TEXT,
  subject     TEXT,
  topic       TEXT,
  source_type TEXT,
  embedding   vector(768),
  content_tsv tsvector
);

CREATE TABLE public.school_content_index (
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

-- Pre-migration: pyq_content & academic_validation_state (for pyq enforcement)
CREATE TYPE public.academic_validation_state AS ENUM (
  'unreviewed',
  'ai_reviewed_ok',
  'ai_flagged',
  'pending_human_review',
  'human_verified',
  'rejected'
);

CREATE TABLE public.pyq_content (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam               TEXT NOT NULL DEFAULT 'JEE',
  year               INTEGER NOT NULL DEFAULT 2024,
  subject            TEXT NOT NULL DEFAULT 'Physics',
  chapter            TEXT NOT NULL DEFAULT 'Kinematics',
  question_text      TEXT NOT NULL,
  solution_text      TEXT DEFAULT 'Step by step solution',
  difficulty         TEXT DEFAULT 'medium',
  marks              INTEGER DEFAULT 4,
  options            JSONB DEFAULT '[]'::jsonb,
  class_level        INTEGER DEFAULT 11,
  embedding          vector(768),
  content_tsv        tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(question_text, '') || ' ' || coalesce(solution_text, ''))
  ) STORED,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  is_reviewed        BOOLEAN NOT NULL DEFAULT false,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by        TEXT,
  validation_state   public.academic_validation_state GENERATED ALWAYS AS (
    CASE
      WHEN is_active = false                                 THEN 'rejected'::public.academic_validation_state
      WHEN flagged_for_review = true                         THEN 'ai_flagged'::public.academic_validation_state
      WHEN is_reviewed = true AND reviewed_by LIKE 'human:%' THEN 'human_verified'::public.academic_validation_state
      WHEN is_reviewed = true                                THEN 'ai_reviewed_ok'::public.academic_validation_state
      ELSE                                                        'unreviewed'::public.academic_validation_state
    END
  ) STORED
);

-- Pre-migration permissive policy (which was the state prior to 20260929)
ALTER TABLE public.pyq_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY pyq_public_read ON public.pyq_content FOR SELECT TO anon, authenticated USING (is_active = true);
GRANT SELECT ON public.pyq_content TO anon, authenticated;
GRANT ALL ON public.pyq_content TO service_role;

-- Pre-migration pyq_topic_frequency view
CREATE OR REPLACE VIEW public.pyq_topic_frequency AS
SELECT
  exam AS exam_type, subject, chapter, chapter AS concept, class_level,
  count(*) AS total_questions, count(DISTINCT year) AS years_appeared,
  avg(2) AS avg_difficulty, max(year) AS last_year
FROM public.pyq_content
GROUP BY exam, subject, chapter, class_level;

SELECT 'PRE-MIGRATION BASE CREATED' AS status;

-- ── 2. Execute the ACTUAL Migration Files In Chronological Order ──────────────

SELECT 'APPLYING: 20260926000000_v5_complete_quiz_session.sql' AS step;
\i supabase/migrations/20260926000000_v5_complete_quiz_session.sql

SELECT 'APPLYING: 20260927000000_v5_ai_health_view.sql' AS step;
\i supabase/migrations/20260927000000_v5_ai_health_view.sql

SELECT 'APPLYING: 20260927100000_v5_exam_target_normalization.sql' AS step;
\i supabase/migrations/20260927100000_v5_exam_target_normalization.sql

SELECT 'APPLYING: 20260928000000_v5_app_flags.sql' AS step;
\i supabase/migrations/20260928000000_v5_app_flags.sql

SELECT 'APPLYING: 20260929000000_v5_pyq_student_access_enforcement.sql' AS step;
\i supabase/migrations/20260929000000_v5_pyq_student_access_enforcement.sql

SELECT 'ALL 5 ACTUAL MIGRATIONS APPLIED SUCCESSFULLY' AS status;

-- ── 3. Post-Migration Verification ──────────────────────────────────────────

-- Verification 1: complete_quiz_session RPC exists and executes
DO $$
DECLARE
  v_res JSONB;
  v_sid UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_quiz_session') THEN
    RAISE EXCEPTION 'complete_quiz_session RPC was not created';
  END IF;

  v_res := public.complete_quiz_session(
    v_sid, 'Physics', 'Optics', '[]'::jsonb, '[]'::jsonb, 5, 5, now()
  );

  IF (v_res->>'duplicate')::boolean != false OR (v_res->>'xp_awarded')::integer != 50 THEN
    RAISE EXCEPTION 'complete_quiz_session returned unexpected result: %', v_res;
  END IF;

  v_res := public.complete_quiz_session(
    v_sid, 'Physics', 'Optics', '[]'::jsonb, '[]'::jsonb, 5, 5, now()
  );
  IF (v_res->>'duplicate')::boolean != true OR (v_res->>'xp_awarded')::integer != 0 THEN
    RAISE EXCEPTION 'complete_quiz_session idempotency failed: %', v_res;
  END IF;

  RAISE NOTICE 'VERIFICATION 1 PASS: complete_quiz_session RPC created and verified idempotent';
END $$;

-- Verification 2: ai_health_view permissions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'ai_success_rate_by_function_provider') THEN
    RAISE EXCEPTION 'ai_success_rate_by_function_provider view was not created';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.ai_success_rate_by_function_provider', 'SELECT') THEN
    RAISE EXCEPTION 'service_role must have SELECT on ai_success_rate_by_function_provider';
  END IF;

  IF has_table_privilege('anon', 'public.ai_success_rate_by_function_provider', 'SELECT') THEN
    RAISE EXCEPTION 'anon must NOT have SELECT on ai_success_rate_by_function_provider';
  END IF;

  IF has_table_privilege('authenticated', 'public.ai_success_rate_by_function_provider', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must NOT have SELECT on ai_success_rate_by_function_provider';
  END IF;

  RAISE NOTICE 'VERIFICATION 2 PASS: ai_health_view permissions restricted to service_role';
END $$;

-- Verification 3: exam_target_normalization trigger and defaults
DO $$
DECLARE
  v_id UUID;
  v_exam TEXT;
BEGIN
  INSERT INTO public.profiles (exam_name) VALUES (NULL) RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN RAISE EXCEPTION 'NULL exam_name did not normalize: %', v_exam; END IF;

  INSERT INTO public.profiles (exam_name) VALUES ('') RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN RAISE EXCEPTION 'Empty exam_name did not normalize: %', v_exam; END IF;

  INSERT INTO public.profiles (exam_name) VALUES ('   ') RETURNING exam_name INTO v_exam;
  IF v_exam != 'GENERAL' THEN RAISE EXCEPTION 'Whitespace exam_name did not normalize: %', v_exam; END IF;

  INSERT INTO public.profiles (exam_name) VALUES ('JEE') RETURNING exam_name INTO v_exam;
  IF v_exam != 'JEE' THEN RAISE EXCEPTION 'Valid exam_name did not persist: %', v_exam; END IF;

  RAISE NOTICE 'VERIFICATION 3 PASS: exam_target_normalization trigger guarantees GENERAL fallback';
END $$;

-- Verification 4: app_flags table and fail-closed RPC
DO $$
DECLARE
  v_flags JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'app_flags' AND relrowsecurity = true) THEN
    RAISE EXCEPTION 'app_flags table does not exist or lacks RLS';
  END IF;

  v_flags := public.get_app_flags();
  IF (v_flags->>'battle_enabled')::boolean != false THEN
    RAISE EXCEPTION 'battle_enabled must be false, got: %', v_flags->>'battle_enabled';
  END IF;
  IF (v_flags->>'new_home_enabled')::boolean != false THEN
    RAISE EXCEPTION 'new_home_enabled must be false, got: %', v_flags->>'new_home_enabled';
  END IF;
  IF (v_flags->>'novo_enabled')::boolean != true THEN
    RAISE EXCEPTION 'novo_enabled must be true, got: %', v_flags->>'novo_enabled';
  END IF;

  IF NOT has_table_privilege('anon', 'public.app_flags', 'SELECT') THEN
    RAISE EXCEPTION 'anon must have SELECT on app_flags';
  END IF;
  IF has_table_privilege('anon', 'public.app_flags', 'INSERT') THEN
    RAISE EXCEPTION 'anon must NOT have INSERT on app_flags';
  END IF;
  IF has_table_privilege('authenticated', 'public.app_flags', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must NOT have INSERT on app_flags';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.app_flags', 'INSERT') THEN
    RAISE EXCEPTION 'service_role must have INSERT on app_flags';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.app_flags', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role must have UPDATE on app_flags';
  END IF;

  RAISE NOTICE 'VERIFICATION 4 PASS: app_flags created with fail-closed defaults and strict RLS/grants';
END $$;

-- ── 4. REAL-ROLE PYQ RLS TEST ───────────────────────────────────────────────

-- Insert test questions across all academic states with dummy embeddings
INSERT INTO public.pyq_content (
  question_text, solution_text, is_active, is_reviewed, flagged_for_review, reviewed_by, embedding
)
VALUES
  ('Q1: Valid AI reviewed question on kinematics motion', 'Detailed solution', true,  true,  false, 'ai:gpt-oss-120b', ('[' || array_to_string(array_fill(0.05, ARRAY[768]), ',') || ']')::vector),
  ('Q2: Valid Human verified question on kinematics motion', 'Detailed solution', true,  true,  false, 'human:prof_sharma', ('[' || array_to_string(array_fill(0.06, ARRAY[768]), ',') || ']')::vector),
  ('Q3: Unreviewed question on kinematics motion', 'Detailed solution', true,  false, false, NULL, ('[' || array_to_string(array_fill(0.07, ARRAY[768]), ',') || ']')::vector),
  ('Q4: Flagged for review question on kinematics motion', 'Detailed solution', true,  true,  true,  'ai:flagged_ambiguity', ('[' || array_to_string(array_fill(0.08, ARRAY[768]), ',') || ']')::vector),
  ('Q5: Deactivated rejected question on kinematics motion', 'Detailed solution', false, true,  false, 'admin:retired', ('[' || array_to_string(array_fill(0.09, ARRAY[768]), ',') || ']')::vector);

-- Test as role: anon
SET ROLE anon;
DO $$
DECLARE
  v_count INTEGER;
  v_unreviewed INTEGER;
  v_flagged INTEGER;
  v_rejected INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.pyq_content;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'REAL-ROLE anon: Expected exactly 2 visible questions, got %', v_count;
  END IF;

  SELECT count(*) INTO v_unreviewed FROM public.pyq_content WHERE question_text LIKE 'Q3%';
  IF v_unreviewed != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE anon: Unreviewed question was visible!';
  END IF;

  SELECT count(*) INTO v_flagged FROM public.pyq_content WHERE question_text LIKE 'Q4%';
  IF v_flagged != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE anon: Flagged question was visible!';
  END IF;

  SELECT count(*) INTO v_rejected FROM public.pyq_content WHERE question_text LIKE 'Q5%';
  IF v_rejected != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE anon: Rejected question was visible!';
  END IF;

  RAISE NOTICE 'REAL-ROLE anon PASS: Strictly restricted to active, reviewed questions (2/5)';
END $$;

-- Test as role: authenticated
SET ROLE authenticated;
DO $$
DECLARE
  v_count INTEGER;
  v_unreviewed INTEGER;
  v_flagged INTEGER;
  v_rejected INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.pyq_content;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'REAL-ROLE authenticated: Expected exactly 2 visible questions, got %', v_count;
  END IF;

  SELECT count(*) INTO v_unreviewed FROM public.pyq_content WHERE question_text LIKE 'Q3%';
  IF v_unreviewed != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE authenticated: Unreviewed question was visible!';
  END IF;

  SELECT count(*) INTO v_flagged FROM public.pyq_content WHERE question_text LIKE 'Q4%';
  IF v_flagged != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE authenticated: Flagged question was visible!';
  END IF;

  SELECT count(*) INTO v_rejected FROM public.pyq_content WHERE question_text LIKE 'Q5%';
  IF v_rejected != 0 THEN
    RAISE EXCEPTION 'REAL-ROLE authenticated: Rejected question was visible!';
  END IF;

  RAISE NOTICE 'REAL-ROLE authenticated PASS: Strictly restricted to active, reviewed questions (2/5)';
END $$;

-- Test as role: service_role (bypasses RLS via policy pyq_service_admin_all)
SET ROLE service_role;
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.pyq_content;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'REAL-ROLE service_role: Expected all 5 questions, got %', v_count;
  END IF;

  RAISE NOTICE 'REAL-ROLE service_role PASS: Full administrative visibility retained (5/5)';
END $$;

RESET ROLE;

-- ── 5. GEMINI-CHAT RAG TRUST TEST (search_corpus_unified) ───────────────────
-- Execute search_corpus_unified under service_role authority (as gemini-chat does).
-- Prove that ONLY trusted PYQs (Q1 and Q2) are ever returned as corpus_source='pyq',
-- and NEVER unreviewed (Q3), flagged (Q4), or rejected/inactive (Q5).

SET ROLE service_role;
DO $$
DECLARE
  v_dummy_emb vector(768) := ('[' || array_to_string(array_fill(0.05, ARRAY[768]), ',') || ']')::vector;
  v_uid UUID := gen_random_uuid();
  r RECORD;
  v_pyq_count INTEGER := 0;
  v_has_q1 BOOLEAN := false;
  v_has_q2 BOOLEAN := false;
  v_has_untrusted BOOLEAN := false;
BEGIN
  FOR r IN
    SELECT id, content, corpus_source
    FROM public.search_corpus_unified(
      p_embedding      := v_dummy_emb,
      p_query_text     := 'kinematics motion',
      p_user_id        := v_uid,
      p_include_pyq    := true,
      p_include_user   := false,
      p_include_school := false,
      p_top_k          := 20
    )
    WHERE corpus_source = 'pyq'
  LOOP
    v_pyq_count := v_pyq_count + 1;
    IF r.content LIKE 'Q1:%' THEN v_has_q1 := true; END IF;
    IF r.content LIKE 'Q2:%' THEN v_has_q2 := true; END IF;
    IF r.content LIKE 'Q3:%' OR r.content LIKE 'Q4:%' OR r.content LIKE 'Q5:%' THEN
      v_has_untrusted := true;
      RAISE EXCEPTION 'SECURITY DEFENDER BYPASS: Untrusted question returned in search_corpus_unified: %', r.content;
    END IF;
  END LOOP;

  IF v_has_untrusted THEN
    RAISE EXCEPTION 'search_corpus_unified returned untrusted PYQ content';
  END IF;

  IF NOT (v_has_q1 AND v_has_q2) THEN
    RAISE EXCEPTION 'search_corpus_unified did not return trusted questions Q1 and Q2 (count=%)', v_pyq_count;
  END IF;

  IF v_pyq_count != 2 THEN
    RAISE EXCEPTION 'search_corpus_unified expected exactly 2 PYQ hits, got: %', v_pyq_count;
  END IF;

  RAISE NOTICE 'GEMINI-CHAT RAG TRUST TEST PASS: search_corpus_unified returned exactly 2/2 trusted PYQs (0 untrusted)';
END $$;
RESET ROLE;

-- ── 6. pyq_topic_frequency view verification ─────────────────────────────────
DO $$
DECLARE
  v_freq_count INTEGER;
BEGIN
  SELECT total_questions INTO v_freq_count FROM public.pyq_topic_frequency WHERE subject = 'Physics';
  IF v_freq_count != 2 THEN
    RAISE EXCEPTION 'pyq_topic_frequency expected count 2 (only reviewed), got: %', v_freq_count;
  END IF;
  RAISE NOTICE 'VERIFICATION 6 PASS: pyq_topic_frequency view counts strictly reviewed questions (2)';
END $$;

SELECT 'ALL VERIFICATIONS PASSED CLEANLY' AS final_verdict;
