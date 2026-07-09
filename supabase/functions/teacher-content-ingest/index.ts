// ═══════════════════════════════════════════════════════════════════════════════
// teacher-content-ingest — B2B school-scoped content upload + embedding pipeline
//
// POST body (multipart or JSON):
//   { action: 'ingest_text', institution_id, title, content, subject?, grade? }
//   { action: 'ingest_chunks', institution_id, title, chunks: string[], subject?, grade?, file_url? }
//   { action: 'delete_doc', parent_doc_id }
//   { action: 'status', institution_id }
//
// Auth: user JWT required. Must be admin or teacher of the institution.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const CHUNK_CHARS   = 1200;
const OVERLAP_CHARS = 80;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const end   = Math.min(pos + CHUNK_CHARS, text.length);
    const chunk = text.slice(pos, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    pos = end - OVERLAP_CHARS;
    if (pos >= text.length - OVERLAP_CHARS) break;
  }
  if (pos < text.length) {
    const last = text.slice(pos).trim();
    if (last.length > 50) chunks.push(last);
  }
  return chunks;
}

async function embedText(text: string, geminiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: text.slice(0, 2000) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      },
    );
    const d = await res.json() as { embedding?: { values?: number[] } };
    return d.embedding?.values ?? null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? '';

  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCors(req), 'Content-Type': 'application/json' } });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonRes({ error: 'Not authenticated' }, 401);

  const userDb    = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const serviceDb = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return jsonRes({ error: 'Invalid token' }, 401);

  const rl = await checkRateLimit(serviceDb, user.id, 'teacher_content_ingest', 25, 60);
  if (!rl.allowed) return jsonRes({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  try {
    const body = await req.json() as {
      action:          string;
      institution_id?: string;
      title?:          string;
      content?:        string;
      chunks?:         string[];
      subject?:        string;
      grade?:          string;
      file_url?:       string;
      parent_doc_id?:  string;
    };

    // ── Status ─────────────────────────────────────────────────────────────────
    if (body.action === 'status' && body.institution_id) {
      const { count } = await serviceDb.from('school_content_index')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', body.institution_id);

      const { data: docs } = await serviceDb.from('school_content_index')
        .select('parent_doc_id, title')
        .eq('institution_id', body.institution_id)
        .eq('chunk_index', 0)
        .limit(50);

      return jsonRes({ total_chunks: count ?? 0, documents: docs ?? [] });
    }

    // ── Delete document ────────────────────────────────────────────────────────
    if (body.action === 'delete_doc' && body.parent_doc_id) {
      // Verify ownership
      const { data: doc } = await serviceDb.from('school_content_index')
        .select('institution_id, uploaded_by')
        .eq('parent_doc_id', body.parent_doc_id)
        .limit(1)
        .maybeSingle();
      if (!doc) return jsonRes({ error: 'Document not found' }, 404);
      if (doc.uploaded_by !== user.id) {
        // Allow institution admin to delete too
        const { data: inst } = await serviceDb.from('institutions')
          .select('admin_user_id').eq('id', doc.institution_id).maybeSingle();
        if (!inst || inst.admin_user_id !== user.id) return jsonRes({ error: 'Forbidden' }, 403);
      }
      await serviceDb.from('school_content_index').delete().eq('parent_doc_id', body.parent_doc_id);
      return jsonRes({ deleted: true });
    }

    // Require institution_id for ingest actions
    if (!body.institution_id) return jsonRes({ error: 'institution_id required' }, 400);

    // Verify user is admin or teacher member of this institution
    const { data: membership } = await serviceDb.from('institution_members')
      .select('role').eq('institution_id', body.institution_id).eq('user_id', user.id).maybeSingle();
    const { data: instAdmin } = await serviceDb.from('institutions')
      .select('admin_user_id').eq('id', body.institution_id).maybeSingle();
    const isAuthorized = membership?.role === 'teacher' || membership?.role === 'admin'
      || instAdmin?.admin_user_id === user.id;
    if (!isAuthorized) return jsonRes({ error: 'Only teachers/admins can upload content' }, 403);

    // ── Ingest text (auto-chunk) ───────────────────────────────────────────────
    if (body.action === 'ingest_text' && body.title && body.content) {
      const rawChunks = chunkText(body.content);
      return await ingestChunks(
        serviceDb, geminiKey, user.id,
        body.institution_id, body.title, rawChunks,
        body.subject, body.grade, body.file_url, jsonRes,
      );
    }

    // ── Ingest pre-chunked content ─────────────────────────────────────────────
    if (body.action === 'ingest_chunks' && body.title && body.chunks?.length) {
      return await ingestChunks(
        serviceDb, geminiKey, user.id,
        body.institution_id, body.title, body.chunks,
        body.subject, body.grade, body.file_url, jsonRes,
      );
    }

    return jsonRes({ error: `Unknown action: ${body.action}` }, 400);

  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});

async function ingestChunks(
  serviceDb:      ReturnType<typeof createClient>,
  geminiKey:      string,
  uploadedBy:     string,
  institutionId:  string,
  title:          string,
  chunks:         string[],
  subject?:       string,
  grade?:         string,
  fileUrl?:       string,
  jsonRes:        (data: unknown, status?: number) => Response,
): Promise<Response> {
  // Generate a parent_doc_id grouping all chunks from this upload
  const parentDocId = crypto.randomUUID();
  let inserted = 0, embedded = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk     = chunks[i];
    const emb       = await embedText(chunk, geminiKey);
    const { error } = await serviceDb.from('school_content_index').insert({
      institution_id: institutionId,
      uploaded_by:    uploadedBy,
      title,
      content:        chunk,
      subject:        subject ?? null,
      grade:          grade ?? null,
      file_url:       fileUrl ?? null,
      chunk_index:    i,
      parent_doc_id:  parentDocId,
      embedding:      emb ? `[${emb.join(',')}]` : null,
    });
    if (!error) {
      inserted++;
      if (emb) embedded++;
    }
  }

  return jsonRes({ parent_doc_id: parentDocId, inserted, embedded, total_chunks: chunks.length });
}
