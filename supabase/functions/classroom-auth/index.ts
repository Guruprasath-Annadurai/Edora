// ═══════════════════════════════════════════════════════════════════════════
// classroom-auth — Google Classroom OAuth2 flow
//
// Actions:
//   init_oauth  → returns the Google OAuth URL for teacher to redirect to
//   callback    → exchanges auth code for tokens, stores in DB
//   status      → returns connection status + google_email
//   courses     → lists teacher's Google Classroom courses
//   students    → lists students in a course
//   disconnect  → removes the OAuth connection
//
// Secrets (set in Supabase Dashboard):
//   GOOGLE_OAUTH_CLIENT_ID      — from GCP Console → APIs → OAuth2 Credentials
//   GOOGLE_OAUTH_CLIENT_SECRET  — same credential (GOCSPX-...)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { encryptToken } from '../_shared/token-crypto.ts';
import { getValidAccessToken } from '../_shared/classroom-tokens.ts';


import { withSentry } from '../_shared/sentry.ts';
// Google OAuth scopes — Classroom + Calendar + Gmail (send) + Drive (app files only)
const CLASSROOM_SCOPES = [
  // Classroom
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.teachers',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  // Calendar (create/update/delete events, including Meet links)
  'https://www.googleapis.com/auth/calendar',
  // Gmail — send-only; minimal blast radius if token is compromised
  'https://www.googleapis.com/auth/gmail.send',
  // Drive — only files this app creates (drive.file is least-privileged Drive scope)
  'https://www.googleapis.com/auth/drive.file',
  // Identity
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const CLASSROOM_API = 'https://classroom.googleapis.com/v1';

serve(withSentry('classroom-auth', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });


  // ── Authenticate caller ──────────────────────────────────────────────────
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clientId     = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

  if (!clientId || !clientSecret) {
    return json({ error: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set' }, 500);
  }

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── init_oauth — build Google OAuth URL ─────────────────────────────────
  if (action === 'init_oauth') {
    const redirectUri = body.redirect_uri as string;
    if (!redirectUri) return json({ error: 'redirect_uri required' }, 400);

    // Whitelist check — prevents open-redirect / OAuth token hijacking
    const ALLOWED_REDIRECT_URIS = [
      'com.edora.app://auth/classroom/callback',                  // Android / iOS deep link
      'https://edora-bb02e.web.app/auth/classroom/callback',      // Firebase Hosting
      'https://app.edora.in/auth/classroom/callback',             // Custom domain
      'http://localhost:5173/auth/classroom/callback',            // Local dev only
    ];
    if (!ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
      return json({ error: 'Invalid redirect_uri. Use the official Edora app to connect.' }, 400);
    }

    // State encodes teacher's user ID + timestamp for CSRF + replay protection
    const state = btoa(JSON.stringify({ userId: user.id, ts: Date.now() }));

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         CLASSROOM_SCOPES,
      access_type:   'offline',
      prompt:        'consent',  // always show consent → always get refresh_token
      state,
    });

    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }

  // ── callback — exchange auth code for tokens ─────────────────────────────
  if (action === 'callback') {
    const { code, redirect_uri, state } = body as {
      code: string; redirect_uri: string; state: string;
    };

    if (!code || !redirect_uri) return json({ error: 'code and redirect_uri required' }, 400);

    // Decode state — verify teacher identity and reject replayed/expired states
    let stateData: { userId: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return json({ error: 'Invalid state parameter' }, 400);
    }
    if (stateData.userId !== user.id) return json({ error: 'State mismatch — possible CSRF attempt' }, 403);
    // Reject states older than 10 minutes to prevent replay attacks
    if (!stateData.ts || Date.now() - stateData.ts > 600_000) {
      return json({ error: 'OAuth state expired. Please start the connection flow again.' }, 400);
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({})) as { error_description?: string };
      return json({ error: err.error_description ?? 'Token exchange failed' }, 400);
    }

    const tokens = await tokenRes.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
      token_type:    string;
    };

    // Fetch teacher's Google email
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as { email: string };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Encrypt OAuth tokens before storing — AES-256-GCM via OAUTH_TOKEN_ENCRYPTION_KEY
    const [encAccess, encRefresh] = await Promise.all([
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
    ]);

    // Upsert connection (service role — bypasses RLS to write tokens)
    const { error: upsertErr } = await serviceDb.from('classroom_connections').upsert({
      teacher_id:    user.id,
      google_email:  profile.email,
      access_token:  encAccess,
      refresh_token: encRefresh,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'teacher_id' });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // Ensure teacher_profile exists
    await serviceDb.from('teacher_profiles').upsert({
      id:           user.id,
      google_email: profile.email,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'id' });

    // Mark is_teacher on profile
    await serviceDb.from('profiles').update({ is_teacher: true }).eq('id', user.id);

    return json({ ok: true, google_email: profile.email });
  }

  // ── status — check if teacher is connected ───────────────────────────────
  if (action === 'status') {
    const { data: conn } = await userDb
      .from('classroom_connections')
      .select('google_email, expires_at, updated_at')
      .eq('teacher_id', user.id)
      .maybeSingle();

    return json({
      connected:    !!conn,
      google_email: conn?.google_email ?? null,
      updated_at:   conn?.updated_at ?? null,
    });
  }

  // ── courses — list teacher's Classroom courses ───────────────────────────
  if (action === 'courses') {
    const auth = await getValidAccessToken(user.id, serviceDb);
    const token = auth?.token;
    if (!token) return json({ error: 'Not connected to Google Classroom' }, 400);

    const res = await fetch(
      `${CLASSROOM_API}/courses?teacherId=me&courseStates=ACTIVE&pageSize=30`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return json({ error: err?.error?.message ?? 'Classroom API error' }, res.status);
    }

    const data = await res.json() as {
      courses?: Array<{ id: string; name: string; section?: string; enrollmentCode?: string; alternateLink?: string }>;
    };

    return json({ courses: data.courses ?? [] });
  }

  // ── students — list students in a course ────────────────────────────────
  if (action === 'students') {
    const { course_id } = body as { course_id: string };
    if (!course_id) return json({ error: 'course_id required' }, 400);

    const auth = await getValidAccessToken(user.id, serviceDb);
    const token = auth?.token;
    if (!token) return json({ error: 'Not connected to Google Classroom' }, 400);

    const res = await fetch(
      `${CLASSROOM_API}/courses/${course_id}/students?pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) return json({ error: 'Failed to list students' }, res.status);
    const data = await res.json() as {
      students?: Array<{ userId: string; profile: { name: { fullName: string }; emailAddress: string } }>;
    };

    return json({
      students: (data.students ?? []).map(s => ({
        id:    s.userId,
        name:  s.profile.name.fullName,
        email: s.profile.emailAddress,
      })),
    });
  }

  // ── disconnect — remove OAuth tokens ────────────────────────────────────
  if (action === 'disconnect') {
    await serviceDb.from('classroom_connections').delete().eq('teacher_id', user.id);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: init_oauth | callback | status | courses | students | disconnect' }, 400);
}));
