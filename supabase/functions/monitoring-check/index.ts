// ─────────────────────────────────────────────────────────────────────────────
// monitoring-check — cron-triggered health check, posts alerts to Slack
//
// Checks:
//   1. Rate-limit hammering — any single user hitting one endpoint 50+ times/hr
//      (signals a broken client loop, or someone probing the rate limiter)
//   2. Admin action audit silence — no admin_action_audit rows in 48h (once the
//      table has ever had activity; skipped on a genuinely brand-new table)
//
// Requires secrets:
//   CRON_SECRET               — shared secret for the x-internal-secret header
//   MONITORING_SLACK_WEBHOOK  — Slack incoming webhook URL
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[monitoring-check] Slack post failed:', (err as Error)?.message);
  }
}

serve(withSentry('monitoring-check', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret || secret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const webhookUrl = Deno.env.get('MONITORING_SLACK_WEBHOOK');
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const alerts: string[] = [];

  // ── 1. Rate-limit hammering ────────────────────────────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentCalls } = await db
    .from('api_rate_limits')
    .select('user_id, endpoint')
    .gte('created_at', oneHourAgo);

  const counts = new Map<string, number>();
  for (const row of recentCalls ?? []) {
    const key = `${row.user_id}::${row.endpoint}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const hammering = Array.from(counts.entries()).filter(([, n]) => n >= 50);
  if (hammering.length > 0) {
    const lines = hammering.slice(0, 10).map(([key, n]) => {
      const [userId, endpoint] = key.split('::');
      return `• user ${userId.slice(0, 8)}… hit \`${endpoint}\` ${n}x in the last hour`;
    });
    alerts.push(`*Rate-limit hammering detected:*\n${lines.join('\n')}`);
  }

  // ── 2. Admin audit silence (only meaningful once the table has ever had data) ─
  const { data: lastAudit } = await db
    .from('admin_action_audit')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAudit) {
    const ageHours = (Date.now() - new Date(lastAudit.created_at).getTime()) / (1000 * 60 * 60);
    if (ageHours > 48) {
      alerts.push(`*Admin audit log quiet:* no entries in ${Math.round(ageHours)}h (last: ${lastAudit.created_at})`);
    }
  }

  if (alerts.length > 0 && webhookUrl) {
    await postToSlack(webhookUrl, `🚨 *Edora monitoring alert*\n\n${alerts.join('\n\n')}`);
  }

  return json({ ok: true, alerts_fired: alerts.length, checked_at: new Date().toISOString() });
}));
