-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 3 — B2B & Trust: Google Classroom + School Dashboards
-- ═══════════════════════════════════════════════════════════════════════════

-- ── School profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  board       TEXT        NOT NULL DEFAULT 'CBSE'
                          CHECK (board IN ('CBSE','ICSE','State','IB','IGCSE','Other')),
  district    TEXT,
  state       TEXT        NOT NULL DEFAULT 'Tamil Nadu',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_read_all"    ON public.school_profiles FOR SELECT USING (true);
CREATE POLICY "school_insert_auth" ON public.school_profiles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
GRANT SELECT, INSERT ON public.school_profiles TO authenticated;

-- ── Teacher profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id    UUID        REFERENCES public.school_profiles(id) ON DELETE SET NULL,
  subjects     TEXT[]      NOT NULL DEFAULT '{}',
  class_nums   INTEGER[]   NOT NULL DEFAULT '{}',
  google_email TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_own"        ON public.teacher_profiles USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "teacher_read_all"   ON public.teacher_profiles FOR SELECT USING (true);
GRANT SELECT, INSERT, UPDATE ON public.teacher_profiles TO authenticated;

-- ── is_teacher flag on profiles (fast check without join) ────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_teacher   BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS school_id    UUID     REFERENCES public.school_profiles(id) ON DELETE SET NULL;

-- ── Google Classroom OAuth tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_connections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email  TEXT        NOT NULL,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id)
);
ALTER TABLE public.classroom_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connection_own" ON public.classroom_connections
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_connections TO authenticated;

-- ── Classroom assignments ─────────────────────────────────────────────────────
-- Each record: teacher assigned an Edora activity as Google Classroom coursework
CREATE TABLE IF NOT EXISTS public.classroom_assignments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id        TEXT        NOT NULL,
  course_name      TEXT        NOT NULL,
  coursework_id    TEXT,                   -- set after Classroom API creates the coursework
  title            TEXT        NOT NULL,
  description      TEXT,
  subject          TEXT        NOT NULL,
  class_num        SMALLINT    NOT NULL,
  edora_type       TEXT        NOT NULL DEFAULT 'quiz'
                               CHECK (edora_type IN ('quiz','sprint','flashcard','exam')),
  max_points       INTEGER     NOT NULL DEFAULT 100,
  due_date         DATE,
  state            TEXT        NOT NULL DEFAULT 'active'
                               CHECK (state IN ('active','archived')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classroom_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_teacher_write" ON public.classroom_assignments
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "assignment_read_all" ON public.classroom_assignments
  FOR SELECT USING (true);
GRANT SELECT, INSERT, UPDATE ON public.classroom_assignments TO authenticated;

-- ── Per-student completion tracking ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_submissions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id        UUID        NOT NULL REFERENCES public.classroom_assignments(id) ON DELETE CASCADE,
  student_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_email        TEXT,
  score                INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  edora_session_id     TEXT,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_to_classroom  BOOLEAN     NOT NULL DEFAULT FALSE,
  classroom_sub_id     TEXT,
  UNIQUE (assignment_id, student_id)
);
ALTER TABLE public.classroom_submissions ENABLE ROW LEVEL SECURITY;
-- Students submit their own grades
CREATE POLICY "submission_student_insert" ON public.classroom_submissions
  FOR INSERT WITH CHECK (student_id = auth.uid());
-- Teachers see all submissions for their assignments
CREATE POLICY "submission_teacher_read" ON public.classroom_submissions
  FOR SELECT USING (
    assignment_id IN (
      SELECT id FROM public.classroom_assignments WHERE teacher_id = auth.uid()
    )
    OR student_id = auth.uid()
  );
-- Service role can update sync status
GRANT SELECT, INSERT, UPDATE ON public.classroom_submissions TO authenticated;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_classroom_assignments_teacher ON public.classroom_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_submissions_assignment ON public.classroom_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_classroom_submissions_student ON public.classroom_submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_classroom_submissions_unsynced ON public.classroom_submissions (synced_to_classroom, submitted_at)
  WHERE synced_to_classroom = FALSE;

-- ── School analytics views (used by Looker Studio via BigQuery) ───────────────
-- Both analytics_events.user_id and profiles.id are UUID — no cast needed
CREATE OR REPLACE VIEW public.v_school_daily_activity AS
SELECT
  p.school_id,
  sp.name                                   AS school_name,
  DATE(ae.created_at)                       AS activity_date,
  ae.platform,
  COUNT(DISTINCT ae.user_id)                AS active_students,
  COUNT(*) FILTER (WHERE ae.event_name = 'quiz_completed')    AS quizzes_completed,
  COUNT(*) FILTER (WHERE ae.event_name = 'chat_message_sent') AS chat_messages,
  COUNT(*) FILTER (WHERE ae.event_name = 'flashcard_studied') AS flashcard_sessions,
  ROUND(
    AVG(CASE WHEN ae.event_name = 'quiz_completed' THEN (ae.properties->>'score')::NUMERIC END),
    2
  )                                         AS avg_quiz_score
FROM public.analytics_events ae
JOIN public.profiles p ON p.id = ae.user_id
LEFT JOIN public.school_profiles sp ON sp.id = p.school_id
WHERE p.school_id IS NOT NULL
GROUP BY p.school_id, sp.name, DATE(ae.created_at), ae.platform;
GRANT SELECT ON public.v_school_daily_activity TO authenticated;

CREATE OR REPLACE VIEW public.v_student_weekly_summary AS
SELECT
  ae.user_id,
  p.full_name                               AS student_name,
  p.email                                   AS student_email,
  p.school_id,
  DATE_TRUNC('week', ae.created_at)::DATE   AS week_start,
  COUNT(DISTINCT DATE(ae.created_at))       AS active_days,
  COUNT(*) FILTER (WHERE ae.event_name = 'quiz_completed')    AS quizzes,
  COUNT(*) FILTER (WHERE ae.event_name = 'flashcard_studied') AS flashcard_sessions,
  COUNT(*) FILTER (WHERE ae.event_name = 'chat_message_sent') AS chat_messages,
  ROUND(
    AVG(CASE WHEN ae.event_name = 'quiz_completed' THEN (ae.properties->>'score')::NUMERIC END),
    1
  )                                         AS avg_quiz_score,
  ROUND(
    SUM(CASE WHEN ae.event_name = 'quiz_completed' THEN (ae.properties->>'time_secs')::NUMERIC ELSE 0 END) / 3600.0,
    2
  )                                         AS study_hours
FROM public.analytics_events ae
JOIN public.profiles p ON p.id = ae.user_id
GROUP BY ae.user_id, p.full_name, p.email, p.school_id, DATE_TRUNC('week', ae.created_at)::DATE;
GRANT SELECT ON public.v_student_weekly_summary TO authenticated;
