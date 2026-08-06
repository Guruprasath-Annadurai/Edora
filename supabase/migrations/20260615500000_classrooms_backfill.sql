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
