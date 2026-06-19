// ─────────────────────────────────────────────────────────────────────────────
// useGoogleServices — hook for Google Calendar, Gmail, and Drive integration
// Reuses the teacher's OAuth tokens stored by useTeacher / classroom-auth.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ── Shared invoker ────────────────────────────────────────────────────────────
async function callFn(fnName: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  return supabase.functions.invoke(fnName, {
    body,
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id:               string;
  teacher_id:       string;
  assignment_id:    string | null;
  calendar_event_id: string;
  meet_link:        string | null;
  event_title:      string;
  event_start:      string;
  event_end:        string;
  event_type:       'assignment_due' | 'class_session' | 'study_block' | 'meet_session';
  created_at:       string;
}

export interface GmailSend {
  id:              string;
  assignment_id:   string | null;
  recipient_email: string;
  subject:         string;
  send_type:       string;
  sent_at:         string;
}

export interface DriveFile {
  id:               string;
  assignment_id:    string | null;
  drive_file_id:    string;
  drive_file_name:  string;
  web_view_link:    string;
  web_content_link: string | null;
  mime_type:        string;
  file_size_bytes:  number | null;
  created_at:       string;
}

export interface CreateEventInput {
  title:          string;
  description?:   string;
  start_datetime: string; // ISO 8601
  end_datetime:   string; // ISO 8601
  assignment_id?: string;
  event_type?:    'assignment_due' | 'class_session' | 'study_block' | 'meet_session';
  attendee_emails?: string[];
  timezone?:      string;
}

export interface SendEmailInput {
  assignment_id?:   string;
  recipient_emails: string[];
}

export function useGoogleServices() {
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingGmail,    setLoadingGmail]    = useState(false);
  const [loadingDrive,    setLoadingDrive]    = useState(false);
  const [calendarEvents,  setCalendarEvents]  = useState<CalendarEvent[]>([]);
  const [driveFiles,      setDriveFiles]      = useState<DriveFile[]>([]);
  const [error,           setError]           = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ── CALENDAR ───────────────────────────────────────────────────────────────

  const createEvent = useCallback(async (input: CreateEventInput) => {
    setLoadingCalendar(true);
    setError(null);
    const { data, error: err } = await callFn('google-calendar', { action: 'create_event', ...input });
    setLoadingCalendar(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Calendar error'); return null; }
    return data as { ok: boolean; event_id: string; html_link: string };
  }, []);

  const createMeet = useCallback(async (input: Omit<CreateEventInput, 'assignment_id' | 'event_type'>) => {
    setLoadingCalendar(true);
    setError(null);
    const { data, error: err } = await callFn('google-calendar', { action: 'create_meet', ...input });
    setLoadingCalendar(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Calendar error'); return null; }
    return data as { ok: boolean; event_id: string; html_link: string; meet_link: string | null };
  }, []);

  const addAssignmentDue = useCallback(async (assignmentId: string, timezone?: string) => {
    setLoadingCalendar(true);
    setError(null);
    const { data, error: err } = await callFn('google-calendar', {
      action: 'add_assignment_due',
      assignment_id: assignmentId,
      timezone: timezone ?? 'Asia/Kolkata',
    });
    setLoadingCalendar(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Calendar error'); return null; }
    return data as { ok: boolean; event_id: string; html_link: string };
  }, []);

  const loadCalendarEvents = useCallback(async () => {
    setLoadingCalendar(true);
    const { data } = await callFn('google-calendar', { action: 'list_events' });
    setCalendarEvents((data?.events ?? []) as CalendarEvent[]);
    setLoadingCalendar(false);
  }, []);

  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    setLoadingCalendar(true);
    const { data, error: err } = await callFn('google-calendar', { action: 'delete_event', event_id: eventId });
    setLoadingCalendar(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Delete failed'); return false; }
    setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
    return true;
  }, []);

  // ── GMAIL ──────────────────────────────────────────────────────────────────

  const sendAssignmentNotification = useCallback(async (
    assignmentId: string,
    recipientEmails: string[],
  ) => {
    setLoadingGmail(true);
    setError(null);
    const { data, error: err } = await callFn('google-gmail', {
      action:           'send_assignment_notification',
      assignment_id:    assignmentId,
      recipient_emails: recipientEmails,
    });
    setLoadingGmail(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Send failed'); return null; }
    return data as { ok: boolean; sent: number; total: number };
  }, []);

  const sendDueDateReminder = useCallback(async (
    assignmentId: string,
    recipientEmails: string[],
  ) => {
    setLoadingGmail(true);
    setError(null);
    const { data, error: err } = await callFn('google-gmail', {
      action:           'send_due_date_reminder',
      assignment_id:    assignmentId,
      recipient_emails: recipientEmails,
    });
    setLoadingGmail(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Send failed'); return null; }
    return data as { ok: boolean; sent: number; total: number };
  }, []);

  const sendParentReport = useCallback(async (opts: {
    parentEmail:  string;
    studentName:  string;
    reportHtml:   string;
  }) => {
    setLoadingGmail(true);
    setError(null);
    const { data, error: err } = await callFn('google-gmail', {
      action:       'send_parent_report',
      parent_email: opts.parentEmail,
      student_name: opts.studentName,
      report_html:  opts.reportHtml,
    });
    setLoadingGmail(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Send failed'); return null; }
    return data as { ok: boolean; message_id: string };
  }, []);

  const sendGradePosted = useCallback(async (opts: {
    assignmentId: string;
    studentEmail: string;
    score:        number;
  }) => {
    setLoadingGmail(true);
    setError(null);
    const { data, error: err } = await callFn('google-gmail', {
      action:         'send_grade_posted',
      assignment_id:  opts.assignmentId,
      student_email:  opts.studentEmail,
      score:          opts.score,
    });
    setLoadingGmail(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Send failed'); return null; }
    return data as { ok: boolean; message_id: string };
  }, []);

  // ── DRIVE ──────────────────────────────────────────────────────────────────

  const uploadReport = useCallback(async (opts: {
    fileName:     string;
    content:      string;
    assignmentId?: string;
    mimeType?:    string;
  }) => {
    setLoadingDrive(true);
    setError(null);
    const { data, error: err } = await callFn('google-drive', {
      action:        'upload_report',
      file_name:     opts.fileName,
      content:       opts.content,
      assignment_id: opts.assignmentId,
      mime_type:     opts.mimeType ?? 'text/html',
    });
    setLoadingDrive(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Upload failed'); return null; }
    return data as { ok: boolean; file_id: string; web_view_link: string; web_content_link?: string };
  }, []);

  const loadDriveFiles = useCallback(async (assignmentId?: string) => {
    setLoadingDrive(true);
    const { data } = await callFn('google-drive', {
      action: 'list_files',
      ...(assignmentId ? { assignment_id: assignmentId } : {}),
    });
    setDriveFiles((data?.files ?? []) as DriveFile[]);
    setLoadingDrive(false);
  }, []);

  const deleteDriveFile = useCallback(async (fileId: string) => {
    setLoadingDrive(true);
    const { data, error: err } = await callFn('google-drive', { action: 'delete_file', file_id: fileId });
    setLoadingDrive(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Delete failed'); return false; }
    setDriveFiles(prev => prev.filter(f => f.id !== fileId));
    return true;
  }, []);

  return {
    // State
    loadingCalendar, loadingGmail, loadingDrive,
    calendarEvents, driveFiles, error,
    clearError,
    // Calendar
    createEvent, createMeet, addAssignmentDue,
    loadCalendarEvents, deleteCalendarEvent,
    // Gmail
    sendAssignmentNotification, sendDueDateReminder,
    sendParentReport, sendGradePosted,
    // Drive
    uploadReport, loadDriveFiles, deleteDriveFile,
  };
}
