// ─────────────────────────────────────────────────────────────────────────────
// db-backup-export — cron-triggered logical backup, stopgap for a paid-tier
// managed backup product
//
// Why this exists: this project's Supabase organization is on the Free plan.
// Supabase does NOT run daily backups or offer PITR below the Pro plan — see
// docs/backup-recovery.md for the verified source. With real user accounts
// and no automated backup of any kind, a single bad migration, a fat-fingered
// DELETE, or an account-deletion bug could destroy user data with zero
// recovery path. This function is a bootstrap safety net: it is NOT a
// substitute for Supabase's physical/PITR backups (those cover WAL replay to
// a specific second; this covers "yesterday's snapshot of every row").
// Upgrading the org to Pro ($25/mo base) is the real fix and is a billing
// decision outside what this function can make.
//
// What it does: dumps every public-schema table to JSON, gzips the combined
// payload, and uploads it to the private `db-backups` storage bucket, then
// prunes backups older than 30 days from that bucket.
//
// This function intentionally does NOT import from ../_shared/* — the
// Supabase MCP deploy tool bundles each function in isolation and does not
// resolve relative imports that escape the function's own directory, so the
// two helpers it needs (CORS headers, minimal error logging) are inlined
// below rather than shared. supabase/functions/_shared/cors.ts and sentry.ts
// remain the canonical versions other functions import from the CLI.
//
// Requires secrets:
//   CRON_SECRET — shared secret for the x-internal-secret header (same
//                 pattern as monitoring-check; see 20260702105415_schedule_monitoring_check_cron.sql)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BACKUP_RETENTION_DAYS = 30;
const BUCKET = 'db-backups';

function getCors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const CORS = getCors();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret || secret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Discover tables dynamically rather than hardcoding a list — a hardcoded
    // list silently stops covering new tables the day someone adds one and
    // forgets to update this function.
    const { data: tableRows, error: tableErr } = await db.rpc('get_public_table_names');
    if (tableErr || !tableRows) {
      return json({ error: 'Failed to enumerate tables', detail: tableErr?.message }, 500);
    }

    const dump: Record<string, unknown[]> = {};
    let totalRows = 0;
    const failures: string[] = [];

    for (const { table_name } of tableRows as { table_name: string }[]) {
      const { data, error } = await db.from(table_name).select('*');
      if (error) {
        failures.push(`${table_name}: ${error.message}`);
        continue;
      }
      dump[table_name] = data ?? [];
      totalRows += data?.length ?? 0;
    }

    const payload = JSON.stringify({ exported_at: new Date().toISOString(), tables: dump });
    const compressed = await new Response(
      new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer();

    const filename = `backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(filename, compressed, { contentType: 'application/gzip', upsert: true });

    if (uploadError) {
      return json({ error: 'Upload failed', detail: uploadError.message, failures }, 500);
    }

    // Prune backups older than retention window.
    const { data: existing } = await db.storage.from(BUCKET).list();
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const stale = (existing ?? [])
      .filter(f => f.name.startsWith('backup-') && f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map(f => f.name);
    if (stale.length > 0) {
      await db.storage.from(BUCKET).remove(stale);
    }

    return json({
      ok: true,
      filename,
      tables_backed_up: Object.keys(dump).length,
      total_rows: totalRows,
      compressed_bytes: compressed.byteLength,
      failures,
      pruned: stale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: 'Internal server error', detail: message }, 500);
  }
});
