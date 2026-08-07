-- Backfill: public.classrooms and public.classroom_members
--
-- Both tables exist on production with real data but were never captured
-- in any migration file in this repo -- they predate this migration
-- history and were apparently created directly (dashboard SQL editor or
-- similar), not through a saved migration. Discovered while bootstrapping
-- a fresh staging database from local files (Gate 2, 4.1.0): the local
-- migration set is not actually self-consistent from scratch --
-- 20260616000001_network_effects.sql's circle_messages table has a
-- foreign key to study_circles, which has a foreign key to classrooms,
-- and classrooms.teacher_id / classroom_members both reference tables
-- that no local file ever creates. This is a stronger, more concrete
-- instance of the drift already flagged in RISK-029 ("local migration
-- filenames don't reliably match Supabase's applied-migration ledger") --
-- not just a filename mismatch, but a genuinely missing table definition.
--
-- Definitions below were extracted directly from production (project
-- mlkzabspcwfockbmkmzl) via information_schema / pg_constraint / pg_policies,
-- not guessed. Dated to sort before 20260616000000, the first file that
-- (transitively, via study_circles) needs classrooms to already exist.

CREATE TABLE IF NOT EXISTS public.classrooms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     TEXT,
  invite_code TEXT        NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id ON public.classrooms(teacher_id);

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.classroom_members (
  classroom_id UUID        NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (classroom_id, user_id)
);

ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classroom_members_read" ON public.classrooms;
CREATE POLICY "classroom_members_read" ON public.classrooms
  FOR SELECT USING (
    (SELECT auth.uid()) = teacher_id
    OR EXISTS (
      SELECT 1 FROM public.classroom_members
      WHERE classroom_members.classroom_id = classrooms.id
        AND classroom_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "classroom_teacher_insert" ON public.classrooms;
CREATE POLICY "classroom_teacher_insert" ON public.classrooms
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = teacher_id);

DROP POLICY IF EXISTS "classroom_teacher_update" ON public.classrooms;
CREATE POLICY "classroom_teacher_update" ON public.classrooms
  FOR UPDATE USING ((SELECT auth.uid()) = teacher_id)
  WITH CHECK ((SELECT auth.uid()) = teacher_id);

DROP POLICY IF EXISTS "classroom_teacher_delete" ON public.classrooms;
CREATE POLICY "classroom_teacher_delete" ON public.classrooms
  FOR DELETE USING ((SELECT auth.uid()) = teacher_id);

-- public.study_circles, moved earlier from 20260617000005_realtime_features.sql
-- (definition preserved verbatim there too; CREATE TABLE IF NOT EXISTS
-- makes that file's copy a harmless no-op once this has run first).
CREATE TABLE IF NOT EXISTS public.study_circles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  created_by   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id UUID        REFERENCES public.classrooms(id) ON DELETE SET NULL,
  invite_code  TEXT        UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  max_members  INTEGER     NOT NULL DEFAULT 8,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.study_circle_members, moved earlier for the same reason as
-- study_circles above: 20260616000001_network_effects.sql's circle_messages
-- table needs a RLS policy referencing this table before
-- 20260617000005_realtime_features.sql (its original creation point) runs.
-- Found via `supabase db diff` replaying every local migration into a real
-- Docker shadow database, not guessed.
CREATE TABLE IF NOT EXISTS public.study_circle_members (
  circle_id   UUID NOT NULL REFERENCES public.study_circles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

-- public.achievement_feed, base table moved earlier from
-- 20260703_social_competitive.sql (its original, much later creation
-- point). 20260616000001_network_effects.sql does
-- `ALTER TABLE public.achievement_feed ADD COLUMN ...` (adding a
-- "card_generated" flag) 17 days before the table it's altering is
-- otherwise ever created -- also found via the real `supabase db diff`
-- Docker shadow-database replay, not guessed. Only the base table is
-- recreated here (indexes/RLS/publication left to the original file,
-- which still runs normally afterward since the table already exists).
CREATE TABLE IF NOT EXISTS public.achievement_feed (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL CHECK (event_type IN (
    'chapter_completed','quiz_aced','streak_milestone','level_up',
    'battle_won','circle_joined','mock_test','pyq_session','achievement_unlocked'
  )),
  title          TEXT        NOT NULL,
  subtitle       TEXT,
  emoji          TEXT        NOT NULL DEFAULT '🎉',
  metadata       JSONB,
  is_public      BOOLEAN     NOT NULL DEFAULT true,
  reaction_count INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.profiles.school_name/school_id (+ state_name/city_name, added in
-- the same original ALTER TABLE batch) moved earlier from
-- 20260703_social_competitive.sql. Unlike the plpgsql function bodies
-- elsewhere in this migration set (whose column/table references aren't
-- checked until first invocation), 20260616000001_network_effects.sql's
-- get_school_leaderboard() is LANGUAGE sql, which Postgres validates
-- eagerly at CREATE FUNCTION time -- so this forward-reference fails
-- immediately, unlike the plpgsql cases already fixed above. Found via
-- the same supabase db diff Docker replay.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS state_name  TEXT,
  ADD COLUMN IF NOT EXISTS city_name   TEXT,
  ADD COLUMN IF NOT EXISTS school_name TEXT,
  ADD COLUMN IF NOT EXISTS school_id   UUID;

-- public.novo_memories, base table moved earlier from
-- 20260619_tier6_independent_tutor.sql (its original creation point).
-- 20260617000000_novo_brain_v3.sql does an unconditional
-- `ALTER TABLE public.novo_memories ADD COLUMN last_used_at ...` 2 days
-- before this table otherwise exists. Only the base table is recreated
-- here; indexes, RLS, and policies are left to the original file, which
-- still runs normally once the table already exists. Found via the same
-- supabase db diff Docker replay.
CREATE TABLE IF NOT EXISTS public.novo_memories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory_type  TEXT        NOT NULL
    CHECK (memory_type IN ('struggle','strength','preference','milestone','pattern','exam_context')),
  content      TEXT        NOT NULL,
  subject      TEXT,
  topic        TEXT,
  importance   INTEGER     NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  source       TEXT        CHECK (source IN ('chat','sprint','quiz','tutoring','debate','system')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ           -- NULL = never expires
);

-- public.novo_proactive_messages, base table moved earlier from
-- 20260619_tier6_independent_tutor.sql (its original creation point, same
-- file as novo_memories above). 20260617000001_phase1_emotional_checkin.sql
-- creates an index on it 2 days early. Checked the file's other 4 tables
-- (lesson_plans, lesson_plan_tasks, novo_certifications,
-- certification_assessments) -- none are referenced anywhere before this
-- same file, so only this one needed moving. Found via the same
-- supabase db diff Docker replay.
CREATE TABLE IF NOT EXISTS public.novo_proactive_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message       TEXT        NOT NULL,
  message_type  TEXT        NOT NULL
    CHECK (message_type IN (
      'diagnostic','exam_reminder','streak_check','milestone',
      'lesson_nudge','memory_callback','welcome_back','goal_check'
    )),
  cta_label     TEXT,
  cta_route     TEXT,
  context_data  JSONB,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.profiles.novo_personality, moved earlier from
-- 20260619_tier6_independent_tutor.sql (its original creation point, same
-- file as novo_memories/novo_proactive_messages above).
-- 20260617000001_phase1_emotional_checkin.sql creates an index on this
-- column 2 days early. Found via the same supabase db diff Docker replay.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS novo_personality TEXT NOT NULL DEFAULT 'teacher'
    CHECK (novo_personality IN ('teacher','friend','coach','examiner','mentor'));

-- public.pyq_content, base table moved earlier from
-- 20260804_corpus_layer6.sql (its original creation point, over a month
-- after it's first needed). 20260628000001_pyq_extended_seed_part1.sql
-- (and 3 sibling seed files) INSERT into it starting here; at least 19
-- files between this point and its real creation reference it. pgvector
-- (needed for the embedding column) is already enabled by
-- 20250615_content_moat.sql, well before this point, so no further
-- dependency. Only the base table + indexes are recreated; later files'
-- own incremental ALTERs (adding CAT/UPSC to the exam CHECK, class_level,
-- is_reviewed, etc.) are left in place and still run normally. Found via
-- the db-push-driven replay against the staging project (Gate 2/4.1.0,
-- resumed here without Docker after supabase db diff's shadow-database
-- replay became unusable due to local disk exhaustion).
CREATE TABLE IF NOT EXISTS public.pyq_content (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam             TEXT        NOT NULL CHECK (exam IN ('JEE_MAIN','JEE_ADV','NEET','BITSAT','BOARDS')),
  year             SMALLINT    NOT NULL,
  subject          TEXT        NOT NULL,
  chapter          TEXT        NOT NULL,
  question_text    TEXT        NOT NULL,
  solution_text    TEXT,
  options          JSONB       NOT NULL DEFAULT '[]',
  correct_option   TEXT,
  question_type    TEXT        NOT NULL DEFAULT 'mcq'
                   CHECK (question_type IN ('mcq','integer','subjective')),
  difficulty       TEXT        NOT NULL DEFAULT 'medium'
                   CHECK (difficulty IN ('easy','medium','hard')),
  marks            SMALLINT    NOT NULL DEFAULT 4,
  content_hash     TEXT,
  content_tsv      tsvector    GENERATED ALWAYS AS (
    to_tsvector('english',
      question_text || ' ' || chapter || ' ' || subject ||
      ' ' || COALESCE(solution_text, ''))
  ) STORED,
  embedding        vector(768),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_exam_year_idx      ON public.pyq_content (exam, year);
CREATE INDEX IF NOT EXISTS pyq_subject_idx         ON public.pyq_content (subject);
CREATE INDEX IF NOT EXISTS pyq_chapter_idx         ON public.pyq_content (chapter);
CREATE INDEX IF NOT EXISTS pyq_tsv_idx             ON public.pyq_content USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS pyq_content_hash_idx    ON public.pyq_content (content_hash) WHERE content_hash IS NOT NULL;
