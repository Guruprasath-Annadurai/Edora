-- ═══════════════════════════════════════════════════════════════════════════
-- v2.5.0 — Google Services: Calendar, Gmail, Drive tracking tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Google Calendar events created by teachers ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_calendar_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id    UUID        REFERENCES public.classroom_assignments(id) ON DELETE SET NULL,
  calendar_event_id TEXT       NOT NULL,
  meet_link        TEXT,
  event_title      TEXT        NOT NULL,
  event_start      TIMESTAMPTZ NOT NULL,
  event_end        TIMESTAMPTZ NOT NULL,
  event_type       TEXT        NOT NULL DEFAULT 'assignment_due'
                               CHECK (event_type IN ('assignment_due','class_session','study_block','meet_session')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_events_own" ON public.google_calendar_events
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_calendar_events TO authenticated;
CREATE INDEX IF NOT EXISTS idx_cal_events_teacher ON public.google_calendar_events (teacher_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_assignment ON public.google_calendar_events (assignment_id);

-- ── Gmail sends log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gmail_sends (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id    UUID        REFERENCES public.classroom_assignments(id) ON DELETE SET NULL,
  recipient_email  TEXT        NOT NULL,
  subject          TEXT        NOT NULL,
  send_type        TEXT        NOT NULL DEFAULT 'assignment_notification'
                               CHECK (send_type IN (
                                 'assignment_notification','parent_report',
                                 'due_date_reminder','grade_posted'
                               )),
  gmail_message_id TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_sends_own" ON public.gmail_sends
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT ON public.gmail_sends TO authenticated;
CREATE INDEX IF NOT EXISTS idx_gmail_sends_teacher     ON public.gmail_sends (teacher_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sends_assignment  ON public.gmail_sends (assignment_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sends_recipient   ON public.gmail_sends (recipient_email);

-- ── Google Drive files created by teachers ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_drive_files (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id    UUID        REFERENCES public.classroom_assignments(id) ON DELETE SET NULL,
  drive_file_id    TEXT        NOT NULL,
  drive_file_name  TEXT        NOT NULL,
  web_view_link    TEXT        NOT NULL,
  web_content_link TEXT,
  mime_type        TEXT        NOT NULL DEFAULT 'application/pdf',
  file_size_bytes  BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_drive_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drive_files_own" ON public.google_drive_files
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.google_drive_files TO authenticated;
CREATE INDEX IF NOT EXISTS idx_drive_files_teacher    ON public.google_drive_files (teacher_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_assignment ON public.google_drive_files (assignment_id);
