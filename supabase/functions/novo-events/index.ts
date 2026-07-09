// ─────────────────────────────────────────────────────────────────────────────
// novo-events — Learning analytics event pipeline
//
// Actions:
//   track    — store event in Postgres; async stream to BigQuery
//   sync     — flush unsynced Postgres events → BigQuery (cron-safe)
//   setup_bq — one-time: create BigQuery dataset + table
//   query    — run a named insight query and return results
//
// Architecture:
//   Client → track → Postgres (always reliable)
//                  → BigQuery (async, fire-and-forget)
//   Cron   → sync  → picks up any failed BigQuery rows and retries
//
// Requires secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GCP_SERVICE_ACCOUNT_JSON  (needs BigQuery Data Editor + Job User roles)
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGCPToken }  from '../_shared/gcp-auth.ts';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
const BQ_DATASET  = 'edora_analytics';
const BQ_TABLE    = 'events';
const BQ_SCOPES   = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/bigquery.insertdata',
];

interface EventRow {
  id:          string;
  event_name:  string;
  user_id:     string | null;
  session_id:  string | null;
  platform:    string;
  app_version: string | null;
  properties:  Record<string, unknown>;
  created_at:  string;
}

async function streamToBigQuery(
  rows: EventRow[],
  projectId: string,
  token: string,
): Promise<{ success: number; failed: number }> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${BQ_DATASET}/tables/${BQ_TABLE}/insertAll`;

  const bqRows = rows.map(r => ({
    insertId: r.id,
    json: {
      event_id:    r.id,
      event_name:  r.event_name,
      user_id:     r.user_id ?? null,
      session_id:  r.session_id ?? null,
      platform:    r.platform,
      app_version: r.app_version ?? null,
      properties:  JSON.stringify(r.properties),
      created_at:  r.created_at.replace(' ', 'T'),
    },
  }));

  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rows: bqRows, skipInvalidRows: true, ignoreUnknownValues: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BQ insertAll failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const failed = (data.insertErrors ?? []).length;
  return { success: rows.length - failed, failed };
}

serve(withSentry('novo-events', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const gcpSaJson   = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // Admin/cron-only actions — expose BigQuery admin ops and raw analytics
  // aggregates, so these must never be reachable without the shared secret.
  if (action === 'setup_bq' || action === 'sync' || action === 'query') {
    const secret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  // ── setup_bq — one-time dataset + table creation ─────────────────────────
  if (action === 'setup_bq') {
    if (!gcpSaJson) return json({ error: 'GCP_SERVICE_ACCOUNT_JSON required' }, 500);
    const sa        = JSON.parse(gcpSaJson);
    const projectId = sa.project_id;
    const token     = await getGCPToken(sa, BQ_SCOPES);

    // Create dataset
    const dsRes = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          datasetReference: { projectId, datasetId: BQ_DATASET },
          location:         'US',
          description:      'Edora learning analytics events',
        }),
      },
    );
    const dsData = await dsRes.json();
    const datasetCreated = dsRes.ok || dsData?.error?.code === 409; // 409 = already exists

    // Create table
    const tblRes = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${BQ_DATASET}/tables`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tableReference: { projectId, datasetId: BQ_DATASET, tableId: BQ_TABLE },
          schema: {
            fields: [
              { name: 'event_id',    type: 'STRING',    mode: 'REQUIRED' },
              { name: 'event_name',  type: 'STRING',    mode: 'REQUIRED' },
              { name: 'user_id',     type: 'STRING',    mode: 'NULLABLE' },
              { name: 'session_id',  type: 'STRING',    mode: 'NULLABLE' },
              { name: 'platform',    type: 'STRING',    mode: 'NULLABLE' },
              { name: 'app_version', type: 'STRING',    mode: 'NULLABLE' },
              { name: 'properties',  type: 'JSON',      mode: 'NULLABLE' },
              { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
            ],
          },
          timePartitioning: { type: 'DAY', field: 'created_at' },
          requirePartitionFilter: false,
        }),
      },
    );
    const tblData = await tblRes.json();
    const tableCreated = tblRes.ok || tblData?.error?.code === 409;

    return json({
      dataset_created: datasetCreated,
      table_created:   tableCreated,
      project_id:      projectId,
      full_table_id:   `${projectId}.${BQ_DATASET}.${BQ_TABLE}`,
    });
  }

  // ── track — ingest a single event ────────────────────────────────────────
  if (action === 'track') {
    const { event_name, user_id, session_id, platform = 'web', app_version, properties = {} } = body;
    if (!event_name) return json({ error: 'event_name required' }, 400);

    // Write to Postgres (reliable buffer)
    const { data: row, error } = await db.from('analytics_events').insert({
      event_name,
      user_id:     user_id ?? null,
      session_id:  session_id ?? null,
      platform,
      app_version: app_version ?? null,
      properties,
    }).select('id, event_name, user_id, session_id, platform, app_version, properties, created_at').single();

    if (error) return json({ error: error.message }, 500);

    // Async BigQuery stream — fire and forget (Postgres is the source of truth)
    if (gcpSaJson) {
      const sa = JSON.parse(gcpSaJson);
      getGCPToken(sa, BQ_SCOPES)
        .then(token => streamToBigQuery([row as EventRow], sa.project_id, token))
        .then(() => db.from('analytics_events').update({ bq_synced: true }).eq('id', row.id))
        .catch(() => { /* Postgres already has it — BQ sync happens via cron */ });
    }

    return json({ ok: true, id: row.id });
  }

  // ── sync — flush unsynced events to BigQuery (called by pg_cron) ─────────
  if (action === 'sync') {
    if (!gcpSaJson) return json({ error: 'GCP_SERVICE_ACCOUNT_JSON required' }, 500);

    const { data: unsyncedRows } = await db
      .from('analytics_events')
      .select('id, event_name, user_id, session_id, platform, app_version, properties, created_at')
      .eq('bq_synced', false)
      .order('created_at', { ascending: true })
      .limit(500);

    if (!unsyncedRows || unsyncedRows.length === 0) {
      return json({ synced: 0, message: 'Nothing to sync' });
    }

    const sa        = JSON.parse(gcpSaJson);
    const projectId = sa.project_id;
    const token     = await getGCPToken(sa, BQ_SCOPES);

    // Process in batches of 100 (BQ insertAll limit per request)
    let totalSynced = 0;
    for (let i = 0; i < unsyncedRows.length; i += 100) {
      const batch = unsyncedRows.slice(i, i + 100);
      try {
        const { success } = await streamToBigQuery(batch as EventRow[], projectId, token);
        if (success > 0) {
          const ids = batch.slice(0, success).map(r => r.id);
          await db.from('analytics_events').update({ bq_synced: true }).in('id', ids);
          totalSynced += success;
        }
      } catch {
        // Continue with next batch — failed rows remain unsynced for next run
      }
    }

    return json({ synced: totalSynced, total_pending: unsyncedRows.length });
  }

  // ── query — named insight queries ─────────────────────────────────────────
  if (action === 'query') {
    const { name } = body;

    const QUERIES: Record<string, string> = {
      // Which topics generate the most questions? (fix weak explanations)
      top_subjects: `
        SELECT properties->>'subject' AS subject, COUNT(*) AS count
        FROM analytics_events
        WHERE event_name = 'chat_message_sent' AND properties->>'subject' IS NOT NULL
        GROUP BY subject ORDER BY count DESC LIMIT 10
      `,
      // Which features are used most? (product insights)
      feature_usage: `
        SELECT event_name, COUNT(*) AS count, COUNT(DISTINCT user_id) AS unique_users
        FROM analytics_events
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY event_name ORDER BY count DESC LIMIT 20
      `,
      // Daily active users (DAU)
      dau: `
        SELECT DATE(created_at) AS date, COUNT(DISTINCT user_id) AS dau
        FROM analytics_events
        WHERE created_at > NOW() - INTERVAL '30 days' AND user_id IS NOT NULL
        GROUP BY date ORDER BY date DESC
      `,
      // Peak study hours (for push notification scheduling)
      study_hours: `
        SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS events
        FROM analytics_events
        WHERE event_name IN ('chat_message_sent', 'quiz_completed', 'flashcard_studied')
          AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY hour ORDER BY events DESC
      `,
      // Pro conversion funnel
      pro_funnel: `
        SELECT event_name, COUNT(DISTINCT user_id) AS users
        FROM analytics_events
        WHERE event_name IN ('pro_page_viewed', 'pro_checkout_started', 'pro_subscribed')
        GROUP BY event_name ORDER BY users DESC
      `,
      // Regional engagement (from platform/locale metadata)
      platform_split: `
        SELECT platform, COUNT(DISTINCT user_id) AS users, COUNT(*) AS events
        FROM analytics_events
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY platform ORDER BY users DESC
      `,
    };

    if (!name || !QUERIES[name]) {
      return json({ error: 'Unknown query name', available: Object.keys(QUERIES) }, 400);
    }

    const { data, error } = await db.rpc('exec_sql' as never, { query: QUERIES[name] }).catch(() => ({
      data: null,
      error: { message: 'Direct SQL not available — use BigQuery for analytics queries' },
    }));

    if (error) {
      // Return the SQL so user can run in BigQuery console
      return json({
        sql:         QUERIES[name].trim(),
        instruction: 'Run this SQL in BigQuery console: https://console.cloud.google.com/bigquery',
      });
    }

    return json({ results: data });
  }

  return json({ error: 'Unknown action. Use: track | sync | setup_bq | query' }, 400);
}));
