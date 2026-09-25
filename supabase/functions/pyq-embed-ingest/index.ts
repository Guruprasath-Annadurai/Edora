// ═════════════════════════════════════════════════════════════════════════════
// pyq-embed-ingest — bulk PYQ content ingestion + embedding pipeline
//
// Built to close a real gap: pyq_content.content_hash and .embedding columns
// existed but were 100% unpopulated (0/402 rows) — no ingest path ever wrote
// to them. Deliberately deployed under a NEW slug, not the pre-existing
// `pyq-ingest` name — that slug was accidentally overwritten earlier this
// session (collided with an unrelated, unrecoverable original function with
// unknown external callers). Redeploying to that slug again on inference
// alone repeats the same mistake; this lives at its own name instead so
// `pyq-ingest` stays exactly as it was left, untouched by this fix.
//
// Pattern borrowed from sibling functions in the same original deploy batch
// (teacher-content-ingest, user-content-index): Gemini text-embedding-004,
// service-role writes gated by user JWT + role check.
//
// POST body:
//   { action: 'ingest', questions: PyqIngestRow[] }  — bulk insert + embed + dedup
//   { action: 'status' }                              — count embedded vs total
//
// Auth: admin/moderator only (pyq_content is curated exam content, not
// teacher/institution-scoped — no client should be able to seed the shared
// PYQ bank).
// ═════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

interface PyqIngestRow {
  exam: string;
  year: number;
  subject: string;
  chapter: string;
  question_text: string;
  solution_text?: string;
  options?: unknown[];
  correct_option?: string;
  question_type?: 'mcq' | 'integer' | 'subjective';
  difficulty?: 'easy' | 'medium' | 'hard';
  marks?: number;
  class_level?: string;
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

async function contentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  const { data: roles } = await serviceDb.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'moderator']);
  if (!roles?.length) return jsonRes({ error: 'Forbidden — admin only' }, 403);

  try {
    const body = await req.json() as { action: string; questions?: PyqIngestRow[] };

    if (body.action === 'status') {
      const [{ count: total }, { count: withEmbedding }, { count: withHash }] = await Promise.all([
        serviceDb.from('pyq_content').select('*', { count: 'exact', head: true }),
        serviceDb.from('pyq_content').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
        serviceDb.from('pyq_content').select('*', { count: 'exact', head: true }).not('content_hash', 'is', null),
      ]);
      return jsonRes({ total: total ?? 0, with_embedding: withEmbedding ?? 0, with_hash: withHash ?? 0 });
    }

    if (body.action === 'ingest' && body.questions?.length) {
      let inserted = 0, skippedDuplicate = 0, embedded = 0;

      for (const q of body.questions) {
        if (!q.exam || !q.subject || !q.chapter || !q.question_text) continue;

        const hash = await contentHash(`${q.exam}|${q.question_text}`);
        const { data: existing } = await serviceDb.from('pyq_content').select('id').eq('content_hash', hash).maybeSingle();
        if (existing) { skippedDuplicate++; continue; }

        const emb = await embedText(q.question_text, geminiKey);
        const { error } = await serviceDb.from('pyq_content').insert({
          exam: q.exam,
          year: q.year,
          subject: q.subject,
          chapter: q.chapter,
          question_text: q.question_text,
          solution_text: q.solution_text ?? null,
          options: q.options ?? [],
          correct_option: q.correct_option ?? null,
          question_type: q.question_type ?? 'mcq',
          difficulty: q.difficulty ?? 'medium',
          marks: q.marks ?? 4,
          class_level: q.class_level ?? null,
          content_hash: hash,
          embedding: emb ? `[${emb.join(',')}]` : null,
          is_reviewed: false, // new bulk-ingested content queues for pyq-content-audit, same as any other new row
        });
        if (!error) {
          inserted++;
          if (emb) embedded++;
        }
      }

      return jsonRes({ inserted, skipped_duplicate: skippedDuplicate, embedded, total_submitted: body.questions.length });
    }

    return jsonRes({ error: `Unknown action: ${body.action}` }, 400);
  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
