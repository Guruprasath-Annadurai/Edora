// ─────────────────────────────────────────────────────────────────────────────
// useTeacher — hook for Google Classroom connection + assignment management
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/lib/supabase';

// ── Redirect URI — custom scheme for native, web URL for browser ──────────────
const CLASSROOM_REDIRECT_URI = Capacitor.isNativePlatform()
  ? 'com.edora.app://auth/classroom/callback'
  : `${window.location.origin}/auth/classroom/callback`;

export interface ClassroomCourse {
  id:              string;
  name:            string;
  section?:        string;
  alternateLink?:  string;
  enrollmentCode?: string;
}

export interface ClassroomAssignment {
  id:               string;
  course_name:      string;
  title:            string;
  subject:          string;
  class_num:        number;
  edora_type:       string;
  max_points:       number;
  due_date:         string | null;
  state:            string;
  coursework_id:    string | null;
  created_at:       string;
  submission_count: number;
  avg_score:        number | null;
  synced_count:     number;
  activity_url:     string;
  classroom_synced: boolean;
}

export interface CreateAssignmentInput {
  course_id:   string;
  course_name: string;
  title:       string;
  description?: string;
  subject:     string;
  class_num:   number;
  edora_type:  'quiz' | 'sprint' | 'flashcard' | 'exam';
  max_points?: number;
  due_date?:   string;
}

// ── Supabase call helpers ──────────────────────────────────────────────────────

async function callAuth(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('classroom-auth', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  return res;
}

async function callSync(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('classroom-sync', {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  return res;
}

export function useTeacher() {
  const [connected, setConnected]         = useState<boolean | null>(null); // null = loading
  const [googleEmail, setGoogleEmail]     = useState<string | null>(null);
  const [courses, setCourses]             = useState<ClassroomCourse[]>([]);
  const [assignments, setAssignments]     = useState<ClassroomAssignment[]>([]);
  const [loadingCourses, setLoadingCourses]       = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [creating, setCreating]           = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // ── Check connection status ────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    const { data, error: err } = await callAuth({ action: 'status' });
    if (err) { setConnected(false); return; }
    setConnected(data?.connected ?? false);
    setGoogleEmail(data?.google_email ?? null);
  }, []);

  // ── Initiate Google OAuth flow ─────────────────────────────────────────────
  const connectClassroom = useCallback(async () => {
    setError(null);
    const { data, error: err } = await callAuth({
      action:       'init_oauth',
      redirect_uri: CLASSROOM_REDIRECT_URI,
    });
    if (err || !data?.url) {
      setError(err?.message ?? 'Failed to get OAuth URL');
      return;
    }
    if (Capacitor.isNativePlatform()) {
      // Open in Chrome Custom Tab — Android catches the deep-link redirect
      await Browser.open({ url: data.url as string, presentationStyle: 'popover' });
    } else {
      window.location.href = data.url as string;
    }
  }, []);

  // ── Complete OAuth after callback ──────────────────────────────────────────
  const completeOAuth = useCallback(async (code: string, state: string) => {
    const { data, error: err } = await callAuth({
      action:       'callback',
      code,
      state,
      redirect_uri: CLASSROOM_REDIRECT_URI,
    });
    if (err || !data?.ok) throw new Error(err?.message ?? 'OAuth callback failed');
    setConnected(true);
    setGoogleEmail(data.google_email as string);
    return data.google_email as string;
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    await callAuth({ action: 'disconnect' });
    setConnected(false);
    setGoogleEmail(null);
    setCourses([]);
    setAssignments([]);
  }, []);

  // ── List courses ───────────────────────────────────────────────────────────
  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    setError(null);
    const { data, error: err } = await callAuth({ action: 'courses' });
    if (err || data?.error) {
      setError(data?.error ?? err?.message ?? 'Failed to load courses');
    } else {
      setCourses((data?.courses ?? []) as ClassroomCourse[]);
    }
    setLoadingCourses(false);
  }, []);

  // ── List assignments ───────────────────────────────────────────────────────
  const loadAssignments = useCallback(async () => {
    setLoadingAssignments(true);
    const { data } = await callSync({ action: 'list_assignments' });
    setAssignments((data?.assignments ?? []) as ClassroomAssignment[]);
    setLoadingAssignments(false);
  }, []);

  // ── Create assignment ──────────────────────────────────────────────────────
  const createAssignment = useCallback(async (input: CreateAssignmentInput) => {
    setCreating(true);
    setError(null);
    const { data, error: err } = await callSync({ action: 'create_assignment', ...input });
    setCreating(false);
    if (err || data?.error) {
      setError(data?.error ?? err?.message ?? 'Failed to create assignment');
      return null;
    }
    await loadAssignments();
    return data as { assignment_id: string; activity_url: string; classroom_synced: boolean };
  }, [loadAssignments]);

  // ── Sync grades ────────────────────────────────────────────────────────────
  const syncGrades = useCallback(async () => {
    const { data } = await callSync({ action: 'sync_grades' });
    return data as { synced: number; failed: number };
  }, []);

  // ── Archive assignment ─────────────────────────────────────────────────────
  const archiveAssignment = useCallback(async (assignmentId: string) => {
    await callSync({ action: 'delete_assignment', assignment_id: assignmentId });
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
  }, []);

  return {
    // State
    connected, googleEmail,
    courses, assignments,
    loadingCourses, loadingAssignments, creating, error,
    // Actions
    checkStatus, connectClassroom, completeOAuth, disconnect,
    loadCourses, loadAssignments, createAssignment, syncGrades, archiveAssignment,
  };
}
