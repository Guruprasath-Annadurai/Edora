// ─────────────────────────────────────────────────────────────────────────────
// novo-push — FCM v1 push notification dispatcher
//
// Call modes:
//   A. Scheduled cron  — POST with CRON_SECRET header (no user JWT needed).
//      Processes ALL users in the cooldown window.
//
//   B. Authenticated user  — POST with user JWT (Authorization: Bearer ...).
//      { action: 'send_now' } → sends pending notification for THIS user only.
//      Cannot target other users without admin role.
//
//   C. Admin manual trigger — POST with user JWT + admin role.
//      { action: 'send_now', user_id: '<uuid>' } → targets a specific user.
//
// Sends push for (checked in priority order, first match wins):
//   1. Unread proactive messages (push_sent_at IS NULL)
//   2. Exam countdown: 7, 3, 1 days before exam
//   3. Streak at-risk: streak > 0, no activity today, after 6 PM IST
//   4. Weak-topic evening nudge: personalized from topic_stats
//      (struggle_count - win_count), fires ~7:30 PM IST onward —
//      "5 min before bed on <weak topic>?" instead of a generic blast
//
// Rate-limit: at most 1 push per user per 4 hours (profiles.last_push_at).
//
// Requires Supabase secrets:
//   FIREBASE_SERVICE_ACCOUNT_JSON  — full service account JSON from Firebase console
//   FIREBASE_PROJECT_ID            — your Firebase project ID
//   CRON_SECRET                    — shared secret header value for cron invocations
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
const PUSH_COOLDOWN_HOURS = 4;

// ── FCM helpers ───────────────────────────────────────────────────────────────

async function createJWT(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
  const pemContent = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const keyBytes = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const b64url = (s: string | ArrayBuffer) => {
    const str = typeof s === 'string'
      ? btoa(s)
      : btoa(String.fromCharCode(...new Uint8Array(s as ArrayBuffer)));
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(payload));
  const input  = `${header}.${body}`;
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(input));
  return `${input}.${b64url(sigBuf)}`;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa  = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const jwt = await createJWT(sa.private_key, {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error(`FCM auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sendFCM(
  deviceToken: string,
  title:       string,
  body:        string,
  data:        Record<string, string>,
  accessToken: string,
  projectId:   string,
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token:        deviceToken,
          notification: { title, body },
          data,
          android: { priority: 'high', notification: { sound: 'default', channel_id: 'novo_alerts' } },
          apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[FCM] send error:', JSON.stringify(err));
  }
  return res.ok;
}

// ── Dispatch logic (shared between cron and authenticated user) ───────────────
async function dispatchNotifications(
  serviceDb:   ReturnType<typeof createClient>,
  accessToken: string,
  projectId:   string,
  targetUserId?: string,
): Promise<{ sent: number; errors: number; total_checked: number }> {
  const now         = new Date();
  const cooloffISO  = new Date(now.getTime() - PUSH_COOLDOWN_HOURS * 3600_000).toISOString();
  const todayISO    = now.toISOString().slice(0, 10);

  let profileQuery = serviceDb
    .from('profiles')
    .select('id, full_name, push_token, exam_name, exam_date, streak_count, last_push_at, is_pro')
    .not('push_token', 'is', null)
    .or(`last_push_at.is.null,last_push_at.lt.${cooloffISO}`)
    .limit(500);

  if (targetUserId) profileQuery = profileQuery.eq('id', targetUserId);

  const { data: users, error: usersErr } = await profileQuery;
  if (usersErr || !users) {
    console.error('[novo-push] profile query error:', usersErr?.message);
    return { sent: 0, errors: 0, total_checked: 0 };
  }

  let sent   = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.push_token) continue;

    const notifications: { title: string; body: string; data: Record<string, string> }[] = [];

    // 1. Unread proactive messages ────────────────────────────────────────────
    const { data: pending } = await serviceDb
      .from('novo_proactive_messages')
      .select('id, message, cta_route')
      .eq('user_id', user.id)
      .is('read_at', null)
      .is('push_sent_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (pending && pending.length > 0) {
      const msg = pending[0] as { id: string; message: string; cta_route: string | null };
      notifications.push({
        title: 'Novo has a message for you',
        body:  msg.message.slice(0, 120) + (msg.message.length > 120 ? '…' : ''),
        data:  { route: msg.cta_route ?? '/novo-messages', message_id: msg.id },
      });

      // Mark push sent — log failure instead of silently swallowing it
      serviceDb
        .from('novo_proactive_messages')
        .update({ push_sent_at: now.toISOString() })
        .eq('id', msg.id)
        .then(() => {})
        .catch(err => console.error('[novo-push] mark push_sent_at failed:', err?.message));
    }

    // 2. Exam countdown ────────────────────────────────────────────────────────
    if (user.exam_date && !notifications.length) {
      const daysLeft = Math.max(0, Math.floor(
        (new Date(user.exam_date).getTime() - now.getTime()) / 86400000,
      ));
      if ([1, 3, 7].includes(daysLeft)) {
        const firstName = (user.full_name ?? 'there').split(' ')[0];
        notifications.push({
          title: `${user.exam_name ?? 'Your exam'} in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
          body:  `Hey ${firstName}, ${daysLeft === 1 ? "it's tomorrow" : `${daysLeft} days to go`}. Let's make today count!`,
          data:  { route: '/sprint' },
        });
      }
    }

    // 3. Streak at risk ────────────────────────────────────────────────────────
    if (!notifications.length && user.streak_count > 0) {
      const { count: todayCount } = await serviceDb
        .from('sprint_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('created_at', `${todayISO}T00:00:00.000Z`);

      // Only send after 6 PM UTC (midnight IST) to avoid early-morning spam
      if ((todayCount ?? 0) === 0 && now.getUTCHours() >= 10) {
        const firstName = (user.full_name ?? 'there').split(' ')[0];
        notifications.push({
          title: `${user.streak_count}-day streak at risk`,
          body:  `Hey ${firstName}, you haven't studied today. Keep your streak alive — a 10-min sprint is all it takes!`,
          data:  { route: '/sprint' },
        });
      }
    }

    // 4. Weak-topic evening nudge ──────────────────────────────────────────────
    // Personalized using topic_stats (struggle_count vs win_count) instead of a
    // generic blast. Fires in the evening (≥14:00 UTC ≈ 7:30 PM IST) — the "5
    // min before bed" framing — only when nothing more urgent already queued.
    if (!notifications.length && now.getUTCHours() >= 14) {
      const { data: weakTopics } = await serviceDb
        .from('topic_stats')
        .select('subject, topic, struggle_count, win_count')
        .eq('user_id', user.id)
        .gte('struggle_count', 2)
        .order('struggle_count', { ascending: false })
        .limit(5);

      const weakest = (weakTopics ?? [])
        .map(t => ({ ...t, weakness: t.struggle_count - t.win_count }))
        .sort((a, b) => b.weakness - a.weakness)[0];

      if (weakest && weakest.weakness > 0) {
        const firstName = (user.full_name ?? 'there').split(' ')[0];
        notifications.push({
          title: `${firstName}, your weak topic is ${weakest.topic}`,
          body:  `5 min before bed on ${weakest.topic} (${weakest.subject}) could change your score. Quick review?`,
          data:  { route: '/weakness-radar' },
        });
      }
    }

    if (notifications.length === 0) continue;

    const n  = notifications[0];
    const ok = await sendFCM(user.push_token, n.title, n.body, n.data, accessToken, projectId);

    if (ok) {
      sent++;
      serviceDb
        .from('profiles')
        .update({ last_push_at: now.toISOString() })
        .eq('id', user.id)
        .then(() => {})
        .catch(err => console.error('[novo-push] last_push_at update failed:', err?.message));
    } else {
      errors++;
    }
  }

  return { sent, errors, total_checked: users.length };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(withSentry('novo-push', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';

  const saJson    = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');

  if (!saJson || !projectId) {
    return json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID not configured' }, 500);
  }

  // ── Mode A: Cron call authenticated by shared secret header ─────────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const isCron = cronSecret && incomingCronSecret === cronSecret;

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (isCron) {
    // Cron processes ALL users — no per-user restriction
    let accessToken: string;
    try { accessToken = await getAccessToken(saJson); }
    catch (e) { return json({ error: `FCM auth failed: ${(e as Error).message}` }, 500); }

    const result = await dispatchNotifications(serviceDb, accessToken, projectId);
    return json(result);
  }

  // ── Mode B/C: Authenticated user trigger ────────────────────────────────────
  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized. Provide a valid Supabase JWT or the cron secret header.' }, 401);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined;

  // ── Authorization check: only admins can target other users ──────────────────
  if (requestedUserId && requestedUserId !== user.id) {
    // Verify caller has admin role
    const { data: roles } = await serviceDb
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roles) {
      return json({ error: 'Forbidden. You can only trigger notifications for your own account.' }, 403);
    }
  }

  // Scope to caller's own user_id unless admin specified a different user_id
  const targetUserId = requestedUserId ?? user.id;

  let accessToken: string;
  try { accessToken = await getAccessToken(saJson); }
  catch (e) { return json({ error: `FCM auth failed: ${(e as Error).message}` }, 500); }

  const result = await dispatchNotifications(serviceDb, accessToken, projectId, targetUserId);
  return json(result);
}));
