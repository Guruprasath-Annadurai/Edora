// ═══════════════════════════════════════════════════════════════════════════
// backfill-corpus-embeddings — one-off/internal admin utility.
//
// ncert_content and pyq_content rows can exist with content_tsv populated but
// embedding still NULL (e.g. bulk-imported before the embedding step existed,
// or a prior partial run). Without an embedding, a row is invisible to vector
// search inside search_corpus_unified and can only surface via full-text
// match — meaning Novo's RAG grounding silently degrades to keyword search
// only for those rows. This function finds embedding IS NULL rows in both
// tables and backfills them using the same Gemini gemini-embedding-001 model
// (768-dim, RETRIEVAL_DOCUMENT task type) already used at ingest time.
//
// Auth: requires the same CRON_SECRET used by other internal-only functions
// (see novo-cron-proactive). Not reachable by regular app users.
//
// Call repeatedly (it processes up to `limit` rows per call, default 80,
// safely inside the edge function timeout) until { remaining: 0 } is returned.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inlined rather than importing ../_shared/cors.ts: this function is a
// one-off internal admin utility, deployed standalone, and the bundler
// couldn't resolve the shared relative import outside the normal functions
// tree layout. Keep in sync with _shared/cors.ts if the allowlist changes.
const ALLOWED_ORIGINS = new Set([
  'https://edora-bb02e.web.app',
  'https://app.edora.in',
  'http://localhost:5173',
  'http://localhost:8100',
  'capacitor://localhost',
  'https://app.edora',
  'https://localhost',
]);

function getCors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.edora.in',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

let lastEmbedError: string | null = null;

async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:              'models/gemini-embedding-001',
          content:            { parts: [{ text: text.slice(0, 2000) }] },
          taskType:           'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        }),
      },
    );
    if (!res.ok) {
      lastEmbedError = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
      return null;
    }
    const d = await res.json() as { embedding?: { values?: number[] } };
    if (!d.embedding?.values) { lastEmbedError = `no embedding in response: ${JSON.stringify(d).slice(0, 300)}`; }
    return d.embedding?.values ?? null;
  } catch (e) {
    lastEmbedError = `exception: ${String(e)}`;
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const CORS = getCors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? serviceKey.slice(0, 20);
  const authHeader  = req.headers.get('Authorization') ?? '';
  const cronHeader  = req.headers.get('x-cron-secret') ?? '';
  const isServiceKey = authHeader === `Bearer ${serviceKey}`;
  const isCron       = !!cronHeader && cronHeader === cronSecret;
  if (!isServiceKey && !isCron) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), { status: 500, headers: CORS });
  }

  const url = new URL(req.url);
  if (url.searchParams.get('debug') === 'list_models') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    const d = await res.json();
    const embedModels = (d.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('embedContent'))
      .map((m: { name: string }) => m.name);
    return new Response(JSON.stringify({ embedModels }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const db = createClient(supabaseUrl, serviceKey);

  let limit = 80;
  try {
    const body = await req.json();
    if (typeof body?.limit === 'number' && body.limit > 0 && body.limit <= 200) limit = body.limit;
  } catch { /* no body / not JSON — use default */ }

  const perTable = Math.max(1, Math.floor(limit / 2));

  const { data: ncertRows, error: ncertErr } = await db
    .from('ncert_content')
    .select('id, content')
    .is('embedding', null)
    .limit(perTable);
  if (ncertErr) {
    return new Response(JSON.stringify({ error: 'ncert_content query failed', detail: ncertErr.message }), { status: 500, headers: CORS });
  }

  const { data: pyqRows, error: pyqErr } = await db
    .from('pyq_content')
    .select('id, question_text, solution_text')
    .is('embedding', null)
    .limit(perTable);
  if (pyqErr) {
    return new Response(JSON.stringify({ error: 'pyq_content query failed', detail: pyqErr.message }), { status: 500, headers: CORS });
  }

  let ncertDone = 0, ncertFailed = 0;
  for (const row of ncertRows ?? []) {
    const text = (row.content as string ?? '').trim();
    if (!text) { ncertFailed++; continue; }
    const emb = await embedText(text, geminiKey);
    if (!emb) { ncertFailed++; continue; }
    const { error } = await db
      .from('ncert_content')
      .update({ embedding: `[${emb.join(',')}]` })
      .eq('id', row.id);
    if (error) ncertFailed++; else ncertDone++;
  }

  let pyqDone = 0, pyqFailed = 0;
  for (const row of pyqRows ?? []) {
    const text = [row.question_text, row.solution_text].filter(Boolean).join(' ').trim();
    if (!text) { pyqFailed++; continue; }
    const emb = await embedText(text, geminiKey);
    if (!emb) { pyqFailed++; continue; }
    const { error } = await db
      .from('pyq_content')
      .update({ embedding: `[${emb.join(',')}]` })
      .eq('id', row.id);
    if (error) pyqFailed++; else pyqDone++;
  }

  const { count: ncertRemaining } = await db
    .from('ncert_content').select('id', { count: 'exact', head: true }).is('embedding', null);
  const { count: pyqRemaining } = await db
    .from('pyq_content').select('id', { count: 'exact', head: true }).is('embedding', null);

  return new Response(JSON.stringify({
    ncert: { processed: ncertDone, failed: ncertFailed },
    pyq:   { processed: pyqDone, failed: pyqFailed },
    remaining: (ncertRemaining ?? 0) + (pyqRemaining ?? 0),
    last_embed_error: lastEmbedError,
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
