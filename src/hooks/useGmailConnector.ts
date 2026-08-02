// ─────────────────────────────────────────────────────────────────────────────
// useGmailConnector — lets ANY user (not just teachers) connect Gmail and
// email themselves an exported note or progress report.
//
// Reuses the exact same OAuth connection as the teacher Classroom features
// (classroom_connections table, already grants gmail.send) via useTeacher's
// connect/disconnect/status logic — there's no separate Gmail-only OAuth
// app or table. A student who connects here and a teacher who connects via
// the Teacher Dashboard are doing the identical OAuth flow; only which
// screen initiated it differs.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { useTeacher } from '@/hooks/useTeacher';
import { supabase } from '@/lib/supabase';

export function useGmailConnector() {
  const { connected, googleEmail, checkStatus, connectClassroom, disconnect } = useTeacher();
  const [sending, setSending] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkStatus().finally(() => setChecked(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((returnPath: string) => connectClassroom(returnPath), [connectClassroom]);

  const sendExport = useCallback(async (subject: string, html: string, toEmail?: string): Promise<{ ok: boolean; error?: string }> => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('google-gmail', {
        body: { action: 'send_export', subject, html, to_email: toEmail },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || data?.error) return { ok: false, error: data?.error ?? error?.message ?? 'Send failed' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? 'Send failed' };
    } finally {
      setSending(false);
    }
  }, []);

  return {
    connected: checked ? connected : null, // null = still checking
    googleEmail,
    connect,
    disconnect,
    sendExport,
    sending,
  };
}
