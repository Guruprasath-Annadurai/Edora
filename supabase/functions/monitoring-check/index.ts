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
//   5. Backup job health (Phase 2.2) — missing, stale (>30h old), or
//      unexpectedly small (<10KB, real backups run ~400KB) db-backup-export
//      output in the db-backups storage bucket
//   6. Cron job health (RISK-032 follow-up) — any row in cron_health with
//      last_status = 'error' or 'inconclusive'. cron_health only stores each
//      job's single latest run (no history), so a transient one-off provider
//      blip and a job that's been broken for weeks look identical from this
//      table alone — alerting on every non-success run is the honest choice
//      given that limitation, not a refinement to "only alert after N
//      failures" that the data can't actually support yet. This is exactly
//      the gap that let pyq-content-audit-nightly fail silently every night
//      for an unknown period — it reports to cron_health, but nothing ever
//      read that table.
//   7. Stuck mock exam attempts (RISK-030) — mock_test_attempt_starts rows
//      older than 6h (matching mockExamRecovery.ts's resume TTL) with no
//      matching completed attempt_key in mock_test_attempts. Previously
//      this failure mode left zero trace anywhere; this is the first signal
//      of how often it actually happens, not just that it might.
//   8. AI model availability — direct result of a real incident (2026-08-16):
//      3 separate Groq/Gemini model IDs had been silently decommissioned by
//      their providers (deepseek-r1-distill-llama-70b, gemini-1.5-flash,
//      gemini-2.0-flash) and were hard-failing on every call across ~30
//      functions, for an unknown period, with nothing catching it — found by
//      accident while debugging an unrelated eval tool, not by any alert.
//      Makes one minimal (1-token) real completion call per model this app
//      depends on and alerts if a provider reports it gone, so the next
//      occurrence of this exact failure mode is caught by monitoring instead
//      of by chance.
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

  // ── 5. Backup job health (Phase 2.2) ───────────────────────────────────────
  // db-backup-export runs daily at 03:00 UTC. This has no alerting of its own
  // — a failed or silently-empty run previously had no way to surface short of
  // someone manually checking cron.job_run_details or the db-backups bucket
  // (see docs/backup-recovery.md's "What's still missing", now partially
  // closed by this check).
  const { data: backupObjects } = await db.storage.from('db-backups').list('', {
    limit: 5,
    sortBy: { column: 'updated_at', order: 'desc' },
  });
  const latestBackup = backupObjects?.[0];
  if (!latestBackup) {
    alerts.push({ severity: 'critical', text: '*No database backup found at all* in the `db-backups` bucket — the daily export cron may never have run successfully.' });
  } else {
    const updatedAt = latestBackup.updated_at ? new Date(latestBackup.updated_at).getTime() : 0;
    const ageHours = (Date.now() - updatedAt) / (1000 * 60 * 60);
    const sizeBytes = (latestBackup.metadata as { size?: number } | null)?.size ?? 0;
    if (ageHours > 30) {
      // 24h cadence + 6h grace before treating a missed run as an incident,
      // not a false alarm on ordinary cron-scheduling jitter.
      alerts.push({ severity: 'critical', text: `*Backup is stale:* newest file \`${latestBackup.name}\` is ${Math.round(ageHours)}h old (expected a new one every 24h)` });
    }
    if (sizeBytes > 0 && sizeBytes < 10_000) {
      // Real backups run ~400KB (174 tables, ~3500 rows as of Phase 2). A
      // near-empty file the right filename but wrong size is a silent-failure
      // pattern npm/cron jobs are notorious for — worth flagging even though
      // the HTTP call itself returned 200.
      alerts.push({ severity: 'critical', text: `*Backup unexpectedly small:* \`${latestBackup.name}\` is only ${sizeBytes} bytes (recent backups run ~400KB) — likely a partial or failed export that still reported success` });
    }
  }

  // ── 6. Cron job health (RISK-032 follow-up) ────────────────────────────────
  const { data: cronRows } = await db
    .from('cron_health')
    .select('jobname, last_run_at, last_status, last_summary');

  for (const row of (cronRows ?? []) as { jobname: string; last_run_at: string | null; last_status: string | null; last_summary: Record<string, unknown> | null }[]) {
    if (row.last_status === 'error') {
      alerts.push({ severity: 'critical', text: `*Cron job failing:* \`${row.jobname}\` last run reported status \`error\`${row.last_summary ? ` — ${JSON.stringify(row.last_summary)}` : ''}` });
    } else if (row.last_status === 'inconclusive') {
      alerts.push({ severity: 'warning', text: `*Cron job reported inconclusive:* \`${row.jobname}\` (last run: ${row.last_run_at ?? 'unknown'})${row.last_summary ? ` — ${JSON.stringify(row.last_summary)}` : ''} — check whether this is a one-off provider blip or a structural issue (e.g. a missing API key)` });
    }
  }

  // ── 7. Stuck mock exam attempts (RISK-030) ─────────────────────────────────
  // No FK/join exposed between these two tables via PostgREST, so diff the
  // attempt_key sets in-process. Bounded to a 30-day lookback so this never
  // grows unbounded — attempts older than that are just historical noise for
  // this specific alert, not a new finding worth re-surfacing forever.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: starts } = await db
    .from('mock_test_attempt_starts')
    .select('attempt_key, exam_type, started_at')
    .lt('started_at', sixHoursAgo)
    .gte('started_at', thirtyDaysAgo);

  if (starts && starts.length > 0) {
    const { data: completed } = await db
      .from('mock_test_attempts')
      .select('attempt_key')
      .not('attempt_key', 'is', null)
      .gte('created_at', thirtyDaysAgo);
    const completedKeys = new Set((completed ?? []).map((r: { attempt_key: string }) => r.attempt_key));
    const stuck = starts.filter((s: { attempt_key: string }) => !completedKeys.has(s.attempt_key));
    if (stuck.length > 0) {
      alerts.push({
        severity: 'warning',
        text: `*Stuck mock exam attempts:* ${stuck.length} started >6h ago with no matching completed attempt in the last 30 days (e.g. \`${stuck[0].exam_type}\` started ${stuck[0].started_at}) — likely crashes/abandonment, first time this has been visible`,
      });
    }
  }

  // ── 8. AI model availability watchdog ────────────────────────────────────
  // Keep these model IDs in sync with the real ones in gemini-chat/index.ts
  // and pyq-content-audit/index.ts — this check can't import them across a
  // separate function deployment, so drift here is a real risk to watch for.
  const groqKey = Deno.env.get('GROQ_API_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');

  async function deadModelReason(provider: 'groq' | 'gemini', model: string): Promise<string | null> {
    try {
      if (provider === 'groq') {
        if (!groqKey) return null; // missing-secret is a different concern, not this check's job
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        });
        if (res.status === 400 || res.status === 404) {
          const body = await res.text().catch(() => '');
          if (/decommission|not.?found|does not exist|invalid model/i.test(body)) return body.slice(0, 200);
        }
        return null;
      } else {
        if (!geminiKey) return null;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
          },
        );
        if (res.status === 404) return (await res.text().catch(() => '')).slice(0, 200);
        return null;
      }
    } catch {
      return null; // network/timeout errors aren't this check's concern — only "model is gone" is
    }
  }

  const modelsToWatch: Array<{ provider: 'groq' | 'gemini'; model: string; usedBy: string }> = [
    { provider: 'groq', model: 'openai/gpt-oss-120b', usedBy: 'gemini-chat + 8 other functions (primary/judge/quality models)' },
    { provider: 'groq', model: 'openai/gpt-oss-20b', usedBy: 'gemini-chat + tutoring-engine + novo-memory-consolidate (fast-path fallback)' },
    { provider: 'gemini', model: 'gemini-flash-latest', usedBy: 'gemini-chat + pyq-content-audit + 28 other functions (Gemini fallback)' },
  ];

  for (const m of modelsToWatch) {
    const reason = await deadModelReason(m.provider, m.model);
    if (reason) {
      alerts.push({
        severity: 'critical',
        text: `*AI model unavailable:* ${m.provider} model \`${m.model}\` (used by ${m.usedBy}) appears decommissioned/not-found: ${reason}`,
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
    alerts: alerts.map(a => ({ severity: a.severity, text: a.text })),
  });
}));
