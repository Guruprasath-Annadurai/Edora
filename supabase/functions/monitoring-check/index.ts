// ─────────────────────────────────────────────────────────────────────────────
// monitoring-check — cron-triggered health check, posts alerts to Slack
//
// Checks:
//   1. Rate-limit hammering — any single user hitting one endpoint 50+ times/hr
//      (signals a broken client loop, or someone probing the rate limiter)
//   2. Admin action audit silence — no admin_action_audit rows in 48h (once the
//      table has ever had activity; skipped on a genuinely brand-new table)
//   3. Edge function error rate — any function logging 10+ errors in the last
//      hour via edge_function_errors (populated by _shared/sentry.ts on every
//      captured exception, regardless of whether SENTRY_DSN is configured)
//   4. DB connection pressure — current_connections vs max_connections via
//      get_connection_stats(); alerts above 80% utilisation
//
// Severity: 🔴 CRITICAL alerts also prefix the Slack message with <!channel>.
// 🟡 WARNING alerts post normally. This is NOT a substitute for real on-call
// paging (PagerDuty/Opsgenie) — those need a separate account/service Claude
// cannot provision. This just makes the existing single Slack channel more
// actionable until real paging exists.
//
// Requires secrets:
//   CRON_SECRET               — shared secret for the x-internal-secret header
//   MONITORING_SLACK_WEBHOOK  — Slack incoming webhook URL
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

interface Alert {
  severity: 'critical' | 'warning';
  text: string;
}

async function postToSlack(webhookUrl: string, alerts: Alert[]): Promise<void> {
  const hasCritical = alerts.some(a => a.severity === 'critical');
  const lines = alerts.map(a => `${a.severity === 'critical' ? '🔴 *CRITICAL*' : '🟡 *WARNING*'} — ${a.text}`);
  const prefix = hasCritical ? '<!channel>\n' : '';
  const text = `${prefix}🚨 *Edora monitoring alert*\n\n${lines.join('\n\n')}`;

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

  const alerts: Alert[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // ── 1. Rate-limit hammering ────────────────────────────────────────────────
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
    alerts.push({ severity: 'warning', text: `*Rate-limit hammering detected:*\n${lines.join('\n')}` });
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
      alerts.push({ severity: 'warning', text: `*Admin audit log quiet:* no entries in ${Math.round(ageHours)}h (last: ${lastAudit.created_at})` });
    }
  }

  // ── 3. Edge function error rate ────────────────────────────────────────────
  const { data: recentErrors } = await db
    .from('edge_function_errors')
    .select('function_name')
    .gte('created_at', oneHourAgo);

  const errorCounts = new Map<string, number>();
  for (const row of recentErrors ?? []) {
    errorCounts.set(row.function_name, (errorCounts.get(row.function_name) ?? 0) + 1);
  }
  const spiking = Array.from(errorCounts.entries()).filter(([, n]) => n >= 10);
  if (spiking.length > 0) {
    const lines = spiking.map(([fn, n]) => `• \`${fn}\` logged ${n} errors in the last hour`);
    alerts.push({ severity: 'critical', text: `*Edge function error spike:*\n${lines.join('\n')}` });
  }

  // ── 4. DB connection pressure ──────────────────────────────────────────────
  const { data: connStats, error: connErr } = await db.rpc('get_connection_stats');
  if (!connErr && connStats) {
    const current = connStats.current_connections as number;
    const max = connStats.max_connections as number;
    const pct = max > 0 ? (current / max) * 100 : 0;
    if (pct >= 80) {
      alerts.push({
        severity: pct >= 95 ? 'critical' : 'warning',
        text: `*DB connection pressure:* ${current}/${max} connections used (${pct.toFixed(0)}%)`,
      });
    }
  }

  if (alerts.length > 0 && webhookUrl) {
    await postToSlack(webhookUrl, alerts);
  }

  return json({
    ok: true,
    alerts_fired: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    checked_at: new Date().toISOString(),
  });
}));
