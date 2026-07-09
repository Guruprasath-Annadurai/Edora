// ═══════════════════════════════════════════════════════════════════════════
// google-calendar — Manage Google Calendar events for teachers
//
// Actions:
//   create_event      → create a calendar event (assignment due, class session)
//   create_meet       → create a Google Meet session event
//   list_events       → list teacher's upcoming calendar events (next 30 days)
//   delete_event      → remove a calendar event
//   add_assignment_due → create a "due date" reminder event for an assignment
//
// Reuses the OAuth tokens stored in classroom_connections by classroom-auth.
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { getValidAccessToken } from '../_shared/classroom-tokens.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

serve(withSentry('google-calendar', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body   = await req.json().catch(() => ({}));
  const action = body.action as string;

  const rl = await checkRateLimit(serviceDb, user.id, `google_calendar_${action}`, 30, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── create_event ─────────────────────────────────────────────────────────
  if (action === 'create_event') {
    const {
      title, description,
      start_datetime, end_datetime,
      assignment_id, event_type = 'class_session',
      attendee_emails = [],
      timezone = 'Asia/Kolkata',
    } = body as {
      title: string; description?: string;
      start_datetime: string; end_datetime: string;
      assignment_id?: string; event_type?: string;
      attendee_emails?: string[]; timezone?: string;
    };

    if (!title || !start_datetime || !end_datetime) {
      return json({ error: 'title, start_datetime, end_datetime required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    const token = auth?.token;
    if (!token) return json({ error: 'Not connected to Google. Please reconnect via Teacher Dashboard.' }, 400);

    const eventBody: Record<string, unknown> = {
      summary:     title,
      description: description ?? '',
      start:       { dateTime: start_datetime, timeZone: timezone },
      end:         { dateTime: end_datetime,   timeZone: timezone },
    };

    if (attendee_emails.length > 0) {
      eventBody.attendees = attendee_emails.map((email: string) => ({ email }));
    }

    const res = await fetch(
      `${CALENDAR_API}/calendars/primary/events?sendUpdates=all`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventBody),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return json({ error: err?.error?.message ?? 'Calendar API error' }, res.status);
    }

    const event = await res.json() as { id: string; htmlLink: string; summary: string };

    // Store in DB
    await serviceDb.from('google_calendar_events').insert({
      teacher_id:        user.id,
      assignment_id:     assignment_id ?? null,
      calendar_event_id: event.id,
      event_title:       event.summary,
      event_start:       start_datetime,
      event_end:         end_datetime,
      event_type,
    });

    return json({ ok: true, event_id: event.id, html_link: event.htmlLink });
  }

  // ── create_meet ───────────────────────────────────────────────────────────
  if (action === 'create_meet') {
    const {
      title, description,
      start_datetime, end_datetime,
      attendee_emails = [],
      timezone = 'Asia/Kolkata',
    } = body as {
      title: string; description?: string;
      start_datetime: string; end_datetime: string;
      attendee_emails?: string[]; timezone?: string;
    };

    if (!title || !start_datetime || !end_datetime) {
      return json({ error: 'title, start_datetime, end_datetime required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    const token = auth?.token;
    if (!token) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    // requestId must be unique per request to generate a new Meet link
    const requestId = crypto.randomUUID();

    const eventBody: Record<string, unknown> = {
      summary:     title,
      description: description ?? 'Edora live class session',
      start:       { dateTime: start_datetime, timeZone: timezone },
      end:         { dateTime: end_datetime,   timeZone: timezone },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    if (attendee_emails.length > 0) {
      eventBody.attendees = attendee_emails.map((email: string) => ({ email }));
    }

    const res = await fetch(
      `${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(eventBody),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return json({ error: err?.error?.message ?? 'Calendar API error' }, res.status);
    }

    const event = await res.json() as {
      id: string; htmlLink: string; summary: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
    };

    const meetLink = event.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video',
    )?.uri ?? null;

    // Store in DB
    await serviceDb.from('google_calendar_events').insert({
      teacher_id:        user.id,
      calendar_event_id: event.id,
      meet_link:         meetLink,
      event_title:       event.summary,
      event_start:       start_datetime,
      event_end:         end_datetime,
      event_type:        'meet_session',
    });

    return json({ ok: true, event_id: event.id, html_link: event.htmlLink, meet_link: meetLink });
  }

  // ── add_assignment_due — create a "due date" event for an assignment ──────
  if (action === 'add_assignment_due') {
    const { assignment_id, timezone = 'Asia/Kolkata' } = body as {
      assignment_id: string; timezone?: string;
    };
    if (!assignment_id) return json({ error: 'assignment_id required' }, 400);

    const { data: assignment } = await serviceDb
      .from('classroom_assignments')
      .select('title, subject, class_num, due_date, course_name')
      .eq('id', assignment_id)
      .eq('teacher_id', user.id)
      .single();

    if (!assignment) return json({ error: 'Assignment not found' }, 404);
    if (!assignment.due_date) return json({ error: 'Assignment has no due date' }, 400);

    const auth = await getValidAccessToken(user.id, serviceDb);
    const token = auth?.token;
    if (!token) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    // All-day event on the due date
    const res = await fetch(
      `${CALENDAR_API}/calendars/primary/events`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          summary:     `[Edora Due] ${assignment.title}`,
          description: `${assignment.subject} · Class ${assignment.class_num} · ${assignment.course_name}\n\nAssignment due on Edora.`,
          start:       { date: assignment.due_date, timeZone: timezone },
          end:         { date: assignment.due_date, timeZone: timezone },
          reminders:   { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
          colorId:     '9', // blueberry — distinct from regular events
        }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return json({ error: err?.error?.message ?? 'Calendar API error' }, res.status);
    }

    const event = await res.json() as { id: string; htmlLink: string };

    await serviceDb.from('google_calendar_events').insert({
      teacher_id:        user.id,
      assignment_id,
      calendar_event_id: event.id,
      event_title:       `[Edora Due] ${assignment.title}`,
      event_start:       assignment.due_date + 'T00:00:00Z',
      event_end:         assignment.due_date + 'T23:59:59Z',
      event_type:        'assignment_due',
    });

    return json({ ok: true, event_id: event.id, html_link: event.htmlLink });
  }

  // ── list_events — upcoming events for this teacher ────────────────────────
  if (action === 'list_events') {
    const { data: events } = await serviceDb
      .from('google_calendar_events')
      .select('*')
      .eq('teacher_id', user.id)
      .gte('event_start', new Date().toISOString())
      .order('event_start', { ascending: true })
      .limit(50);

    return json({ events: events ?? [] });
  }

  // ── delete_event ──────────────────────────────────────────────────────────
  if (action === 'delete_event') {
    const { event_id } = body as { event_id: string };
    if (!event_id) return json({ error: 'event_id required' }, 400);

    // Fetch from DB first to get the Google calendar_event_id
    const { data: ev } = await serviceDb
      .from('google_calendar_events')
      .select('calendar_event_id')
      .eq('id', event_id)
      .eq('teacher_id', user.id)
      .single();

    if (!ev) return json({ error: 'Event not found' }, 404);

    const auth = await getValidAccessToken(user.id, serviceDb);
    if (auth?.token) {
      await fetch(
        `${CALENDAR_API}/calendars/primary/events/${ev.calendar_event_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } },
      );
    }

    await serviceDb.from('google_calendar_events').delete().eq('id', event_id);
    return json({ ok: true });
  }

  return json({
    error: 'Unknown action. Use: create_event | create_meet | add_assignment_due | list_events | delete_event',
  }, 400);
}));
