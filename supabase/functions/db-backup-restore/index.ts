// ─────────────────────────────────────────────────────────────────────────────
// db-backup-restore — companion to db-backup-export
//
// Restores rows from a gzipped JSON backup produced by db-backup-export back
// into the live database. MERGE semantics only: every write is an upsert on
// each table's primary key — this function never deletes or truncates
// anything. A full "wipe and restore exactly as the backup" mode does not
// exist here on purpose; that is a destructive, incident-specific decision
// that needs a human deciding it in the moment, not a default a script picks
// silently. If a real incident needs that, write and run that SQL by hand
// with the specific tables actually affected in front of you.
//
// FK ordering: tables are restored in multiple passes. A table that fails
// (most likely a foreign-key violation because a row it references hasn't
// been restored yet) is retried in the next pass, after other tables have
// had a chance to land their rows. This avoids needing to hand-maintain a
// dependency graph for ~180 tables — it costs a few extra passes instead.
//
// Call with { dry_run: true } (the default) first — it reports backup vs.
// live row counts per table with zero writes. Only pass { dry_run: false }
// once you've reviewed that output and are sure you want to write.
//
// Body: { filename?: string, dry_run?: boolean (default true), tables?: string[] }
//
// Requires secrets:
//   CRON_SECRET — same shared secret as db-backup-export's x-internal-secret
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'db-backups';
const MAX_PASSES = 5;
const UPSERT_CHUNK_SIZE = 500;

function getCors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface RestoreResult {
  table: string;
  backup_rows: number;
  live_rows_before: number | null;
  rows_upserted: number;
  status: 'dry_run' | 'restored' | 'partial' | 'failed' | 'skipped_no_pk' | 'skipped_empty';
  passes_needed: number;
  error?: string;
}

Deno.serve(async (req) => {
  const CORS = getCors();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret || secret !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { filename?: string; dry_run?: boolean; tables?: string[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const dryRun = body.dry_run !== false; // default true — restoring is opt-out-of-safety, not opt-in
  const tableFilter = body.tables && body.tables.length > 0 ? new Set(body.tables) : null;

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // ── Resolve which backup to restore from ──────────────────────────────
    let filename = body.filename;
    if (!filename) {
      const { data: files, error: listErr } = await db.storage.from(BUCKET).list();
      if (listErr) return json({ error: 'Failed to list backups', detail: listErr.message }, 500);
      const backups = (files ?? [])
        .filter(f => f.name.startsWith('backup-') && f.name.endsWith('.json.gz'))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      if (backups.length === 0) return json({ error: 'No backups found in db-backups bucket' }, 404);
      filename = backups[0].name;
    }

    const { data: fileBlob, error: downloadErr } = await db.storage.from(BUCKET).download(filename);
    if (downloadErr || !fileBlob) {
      return json({ error: 'Failed to download backup', detail: downloadErr?.message, filename }, 500);
    }

    const decompressed = await new Response(
      fileBlob.stream().pipeThrough(new DecompressionStream('gzip'))
    ).text();
    const parsed = JSON.parse(decompressed) as { exported_at: string; tables: Record<string, Record<string, unknown>[]> };

    // ── PK map for onConflict targets ──────────────────────────────────────
    const { data: pkRows, error: pkErr } = await db.rpc('get_table_primary_keys');
    if (pkErr || !pkRows) {
      return json({ error: 'Failed to fetch primary keys', detail: pkErr?.message }, 500);
    }
    const pkMap = new Map<string, string[]>();
    for (const row of pkRows as { table_name: string; pk_columns: string[] }[]) {
      pkMap.set(row.table_name, row.pk_columns ?? []);
    }

    const tableNames = Object.keys(parsed.tables).filter(t => !tableFilter || tableFilter.has(t));
    const results = new Map<string, RestoreResult>();
    let pending = tableNames.filter(t => (parsed.tables[t]?.length ?? 0) > 0);

    // Tables with zero rows in the backup, or no PK, are resolved immediately —
    // no point retrying those across passes.
    for (const t of tableNames) {
      const rows = parsed.tables[t] ?? [];
      if (rows.length === 0) {
        results.set(t, { table: t, backup_rows: 0, live_rows_before: null, rows_upserted: 0, status: 'skipped_empty', passes_needed: 0 });
        continue;
      }
      const pk = pkMap.get(t);
      if (!pk || pk.length === 0) {
        results.set(t, { table: t, backup_rows: rows.length, live_rows_before: null, rows_upserted: 0, status: 'skipped_no_pk', passes_needed: 0 });
        pending = pending.filter(x => x !== t);
      }
    }
    pending = pending.filter(t => !results.has(t));

    if (dryRun) {
      for (const t of pending) {
        const { count } = await db.from(t).select('*', { count: 'exact', head: true });
        results.set(t, {
          table: t,
          backup_rows: parsed.tables[t].length,
          live_rows_before: count ?? 0,
          rows_upserted: 0,
          status: 'dry_run',
          passes_needed: 0,
        });
      }
    } else {
      for (let pass = 1; pass <= MAX_PASSES && pending.length > 0; pass++) {
        const stillPending: string[] = [];
        for (const t of pending) {
          const rows = parsed.tables[t];
          const pk = pkMap.get(t)!;
          let upserted = 0;
          let lastError: string | undefined;
          for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
            const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
            const { error } = await db.from(t).upsert(chunk, { onConflict: pk.join(',') });
            if (error) {
              lastError = error.message;
              break; // stop this table's chunks for this pass; retry whole table next pass
            }
            upserted += chunk.length;
          }
          if (lastError) {
            stillPending.push(t);
            results.set(t, { table: t, backup_rows: rows.length, live_rows_before: null, rows_upserted: upserted, status: 'partial', passes_needed: pass, error: lastError });
          } else {
            results.set(t, { table: t, backup_rows: rows.length, live_rows_before: null, rows_upserted: upserted, status: 'restored', passes_needed: pass });
          }
        }
        pending = stillPending;
      }
      // Anything still pending after MAX_PASSES is a genuine failure, not FK ordering.
      for (const t of pending) {
        const r = results.get(t);
        if (r) r.status = 'failed';
      }
    }

    const summary = Array.from(results.values());
    return json({
      ok: true,
      dry_run: dryRun,
      filename,
      backup_exported_at: parsed.exported_at,
      tables: summary,
      totals: {
        restored: summary.filter(r => r.status === 'restored').length,
        failed: summary.filter(r => r.status === 'failed' || r.status === 'partial').length,
        skipped_no_pk: summary.filter(r => r.status === 'skipped_no_pk').length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: 'Internal server error', detail: message }, 500);
  }
});
