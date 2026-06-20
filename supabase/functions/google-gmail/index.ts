// ═══════════════════════════════════════════════════════════════════════════
// google-gmail — Send teacher emails via Gmail API
//
// Actions:
//   send_assignment_notification → notify students about a new assignment
//   send_due_date_reminder       → remind students of an upcoming due date
//   send_parent_report           → email weekly HTML report to a parent
//   send_grade_posted            → notify student their grade has been posted
//   get_send_history             → list recent sends for an assignment
//
// Reuses OAuth tokens from classroom_connections (scope: gmail.send).
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { getValidAccessToken } from '../_shared/classroom-tokens.ts';

import { withSentry } from '../_shared/sentry.ts';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

// ── XSS guard — escape all DB-sourced strings before HTML interpolation ────────
function h(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Build RFC 2822 email → base64url string (required by Gmail API) ───────────
function buildRawEmail(opts: {
  from:    string;
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}): string {
  const boundary = `----=_EdoraMail_${Date.now()}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
    '',
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    opts.html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const raw = `${headers}\r\n${textPart}\r\n${htmlPart}`;
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Reusable email template wrapper ──────────────────────────────────────────
function wrapInTemplate(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #f0f4ff; color: #1f2937; }
  .wrap { max-width: 580px; margin: 0 auto; padding: 24px 16px; }
  .logo { background: linear-gradient(135deg, #5B6AF5 0%, #8B5CF6 100%); border-radius: 16px; padding: 20px 24px; margin-bottom: 20px; color: white; }
  .logo-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .logo-tag  { font-size: 12px; opacity: 0.7; margin-top: 2px; }
  .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; padding: 12px 0 4px; }
  .btn { display: inline-block; background: linear-gradient(135deg, #5B6AF5, #8B5CF6); color: white; text-decoration: none; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; margin-top: 16px; }
  .badge { display: inline-block; background: #eff6ff; color: #3b82f6; border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
  p { line-height: 1.7; color: #374151; margin-bottom: 12px; }
  h2 { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 12px; }
  .divider { border: none; border-top: 1px solid #f3f4f6; margin: 16px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-name">Edora</div>
    <div class="logo-tag">AI-Powered Learning Platform</div>
  </div>
  ${bodyHtml}
  <div class="footer">
    You received this because your teacher uses Edora for Google Classroom integration.<br>
    &copy; ${new Date().getFullYear()} Edora Education Pvt. Ltd.
  </div>
</div>
</body>
</html>`;
}

// ── Send a single email via Gmail API ────────────────────────────────────────
async function sendEmail(
  token: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string | null; ok: boolean }> {
  const raw = buildRawEmail({ from: `Edora Teacher <${from}>`, to, subject, html });

  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw }),
  });

  if (!res.ok) return { messageId: null, ok: false };
  const data = await res.json() as { id: string };
  return { messageId: data.id, ok: true };
}

serve(withSentry('google-gmail', async (req) => {
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

  // ── send_assignment_notification ──────────────────────────────────────────
  if (action === 'send_assignment_notification') {
    const { assignment_id, recipient_emails } = body as {
      assignment_id: string;
      recipient_emails: string[];
    };

    if (!assignment_id || !recipient_emails?.length) {
      return json({ error: 'assignment_id and recipient_emails required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    if (!auth) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const { data: assignment } = await serviceDb
      .from('classroom_assignments')
      .select('title, subject, class_num, due_date, course_name, edora_type, id')
      .eq('id', assignment_id)
      .eq('teacher_id', user.id)
      .single();

    if (!assignment) return json({ error: 'Assignment not found' }, 404);

    const activityUrl = `https://edora-bb02e.web.app/quiz?assignment_id=${assignment.id}&subject=${encodeURIComponent(assignment.subject)}&class=${assignment.class_num}`;
    const dueLine = assignment.due_date
      ? `<p><strong>Due:</strong> ${new Date(assignment.due_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`
      : '';

    const html = wrapInTemplate(`
      <div class="card">
        <h2>New Assignment Posted</h2>
        <p>Your teacher has posted a new <span class="badge">${h(assignment.edora_type)}</span> assignment on Edora.</p>
        <hr class="divider">
        <p><strong>Course:</strong> ${h(assignment.course_name)}</p>
        <p><strong>Title:</strong> ${h(assignment.title)}</p>
        <p><strong>Subject:</strong> ${h(assignment.subject)} · Class ${h(String(assignment.class_num))}</p>
        ${dueLine}
        <a class="btn" href="${activityUrl}">Open in Edora</a>
      </div>
    `);

    let sent = 0;
    const sends: unknown[] = [];

    for (const email of recipient_emails) {
      const result = await sendEmail(
        auth.token,
        auth.email,
        email,
        `New Assignment: ${assignment.title}`,
        html,
      );
      if (result.ok) {
        sent++;
        sends.push({
          teacher_id:      user.id,
          assignment_id,
          recipient_email: email,
          subject:         `New Assignment: ${assignment.title}`,
          send_type:       'assignment_notification',
          gmail_message_id: result.messageId,
        });
      }
    }

    if (sends.length > 0) {
      await serviceDb.from('gmail_sends').insert(sends);
    }

    return json({ ok: true, sent, total: recipient_emails.length });
  }

  // ── send_due_date_reminder ────────────────────────────────────────────────
  if (action === 'send_due_date_reminder') {
    const { assignment_id, recipient_emails } = body as {
      assignment_id: string;
      recipient_emails: string[];
    };

    if (!assignment_id || !recipient_emails?.length) {
      return json({ error: 'assignment_id and recipient_emails required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    if (!auth) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const { data: assignment } = await serviceDb
      .from('classroom_assignments')
      .select('title, subject, class_num, due_date, course_name, id, edora_type')
      .eq('id', assignment_id)
      .eq('teacher_id', user.id)
      .single();

    if (!assignment) return json({ error: 'Assignment not found' }, 404);
    if (!assignment.due_date) return json({ error: 'Assignment has no due date' }, 400);

    const daysLeft = Math.ceil(
      (new Date(assignment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const urgencyColor = daysLeft <= 1 ? '#ef4444' : daysLeft <= 3 ? '#f59e0b' : '#5B6AF5';
    const activityUrl = `https://edora-bb02e.web.app/quiz?assignment_id=${assignment.id}&subject=${encodeURIComponent(assignment.subject)}&class=${assignment.class_num}`;

    const html = wrapInTemplate(`
      <div class="card">
        <h2>Assignment Due Soon</h2>
        <p>You have an upcoming Edora assignment that is due in
          <strong style="color:${urgencyColor}">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
        </p>
        <hr class="divider">
        <p><strong>Course:</strong> ${h(assignment.course_name)}</p>
        <p><strong>Title:</strong> ${h(assignment.title)}</p>
        <p><strong>Subject:</strong> ${h(assignment.subject)} · Class ${h(String(assignment.class_num))}</p>
        <p><strong>Due:</strong> ${new Date(assignment.due_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <a class="btn" href="${activityUrl}">Complete Now</a>
      </div>
    `);

    let sent = 0;
    const sends: unknown[] = [];

    for (const email of recipient_emails) {
      const result = await sendEmail(
        auth.token,
        auth.email,
        email,
        `Reminder: "${assignment.title}" due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        html,
      );
      if (result.ok) {
        sent++;
        sends.push({
          teacher_id:      user.id,
          assignment_id,
          recipient_email: email,
          subject:         `Reminder: "${assignment.title}" due in ${daysLeft} days`,
          send_type:       'due_date_reminder',
          gmail_message_id: result.messageId,
        });
      }
    }

    if (sends.length > 0) await serviceDb.from('gmail_sends').insert(sends);
    return json({ ok: true, sent, total: recipient_emails.length });
  }

  // ── send_parent_report — email student's weekly HTML report ──────────────
  if (action === 'send_parent_report') {
    const { parent_email, student_name, report_html } = body as {
      parent_email: string;
      student_name: string;
      report_html:  string;
    };

    if (!parent_email || !student_name || !report_html) {
      return json({ error: 'parent_email, student_name, report_html required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    if (!auth) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const weekLabel = new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });
    const result = await sendEmail(
      auth.token,
      auth.email,
      parent_email,
      `Edora Weekly Report — ${student_name} — ${weekLabel}`,
      report_html, // caller passes the fully-formed HTML from weekly-report function
    );

    if (!result.ok) return json({ error: 'Failed to send email' }, 500);

    await serviceDb.from('gmail_sends').insert({
      teacher_id:      user.id,
      recipient_email: parent_email,
      subject:         `Edora Weekly Report — ${student_name} — ${weekLabel}`,
      send_type:       'parent_report',
      gmail_message_id: result.messageId,
    });

    return json({ ok: true, message_id: result.messageId });
  }

  // ── send_grade_posted ─────────────────────────────────────────────────────
  if (action === 'send_grade_posted') {
    const { assignment_id, student_email, score } = body as {
      assignment_id: string;
      student_email: string;
      score: number;
    };

    if (!assignment_id || !student_email || score === undefined) {
      return json({ error: 'assignment_id, student_email, score required' }, 400);
    }

    const auth = await getValidAccessToken(user.id, serviceDb);
    if (!auth) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const { data: assignment } = await serviceDb
      .from('classroom_assignments')
      .select('title, subject, class_num, course_name, max_points')
      .eq('id', assignment_id)
      .eq('teacher_id', user.id)
      .single();

    if (!assignment) return json({ error: 'Assignment not found' }, 404);

    const pct = Math.round((score / 100) * 100);
    const gradeColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
    const gradeLabel = pct >= 70 ? 'Great work!' : pct >= 40 ? 'Keep practising!' : 'Review and retry!';

    const html = wrapInTemplate(`
      <div class="card">
        <h2>Your Grade Has Been Posted</h2>
        <p>Your teacher has posted your grade for the following Edora assignment.</p>
        <hr class="divider">
        <p><strong>Course:</strong> ${h(assignment.course_name)}</p>
        <p><strong>Assignment:</strong> ${h(assignment.title)}</p>
        <p><strong>Subject:</strong> ${h(assignment.subject)} · Class ${h(String(assignment.class_num))}</p>
        <hr class="divider">
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:48px;font-weight:800;color:${gradeColor}">${pct}%</div>
          <div style="font-size:14px;color:#6b7280;margin-top:4px">out of ${Number(assignment.max_points)} pts · ${gradeLabel}</div>
        </div>
      </div>
    `);

    const result = await sendEmail(
      auth.token,
      auth.email,
      student_email,
      `Grade posted: ${assignment.title}`,
      html,
    );

    if (!result.ok) return json({ error: 'Failed to send email' }, 500);

    await serviceDb.from('gmail_sends').insert({
      teacher_id:      user.id,
      assignment_id,
      recipient_email: student_email,
      subject:         `Grade posted: ${assignment.title}`,
      send_type:       'grade_posted',
      gmail_message_id: result.messageId,
    });

    return json({ ok: true, message_id: result.messageId });
  }

  // ── get_send_history ──────────────────────────────────────────────────────
  if (action === 'get_send_history') {
    const { assignment_id, limit = 50 } = body as { assignment_id?: string; limit?: number };

    let query = serviceDb
      .from('gmail_sends')
      .select('*')
      .eq('teacher_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(Math.min(limit, 200));

    if (assignment_id) query = query.eq('assignment_id', assignment_id);

    const { data: sends } = await query;
    return json({ sends: sends ?? [] });
  }

  return json({
    error: 'Unknown action. Use: send_assignment_notification | send_due_date_reminder | send_parent_report | send_grade_posted | get_send_history',
  }, 400);
}));
