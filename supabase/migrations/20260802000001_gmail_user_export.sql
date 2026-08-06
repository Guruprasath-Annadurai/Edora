-- ═══════════════════════════════════════════════════════════════════════════
-- Generalizes the existing Gmail integration (previously teacher-only:
-- assignment notifications, due-date reminders, grade-posted, parent
-- reports) to also support any authenticated user emailing themselves an
-- exported note or progress report — same OAuth connection
-- (classroom_connections, already grants gmail.send), same gmail_sends
-- audit table, just a new send_type value.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.gmail_sends DROP CONSTRAINT IF EXISTS gmail_sends_send_type_check;
ALTER TABLE public.gmail_sends ADD CONSTRAINT gmail_sends_send_type_check
  CHECK (send_type IN (
    'assignment_notification', 'parent_report',
    'due_date_reminder', 'grade_posted', 'user_export'
  ));
