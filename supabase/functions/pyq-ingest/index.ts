// ═══════════════════════════════════════════════════════════════════════════════
// pyq-ingest — JEE/NEET PYQ bulk ingest + embedding pipeline
//
// POST body:
//   { action: 'ingest', questions: PYQQuestion[], force?: boolean }
//   { action: 'status' }
//   { action: 'search', query: string, exam?: string, subject?: string, year_from?: number }
//
// Auth: service_role key required (admin operation).
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

interface PYQQuestion {
  exam:           string;           // 'JEE_MAIN' | 'JEE_ADV' | 'NEET' | 'BITSAT' | 'BOARDS'
  year:           number;
  subject:        string;
  chapter:        string;
  question_text:  string;
  solution_text?: string;
  options?:       Array<{ label: string; text: string; correct?: boolean }>;
  correct_option?: string;
  question_type?: string;
  difficulty?:    string;
  marks?:         number;
}

// FNV-1a 32-bit hash for dedup
function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + s.length.toString(16).padStart(8, '0');
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
          content: { parts: [{ text: text.slice(0, 3000) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      },
    );
    const d = await res.json() as { embedding?: { values?: number[] } };
    return d.embedding?.values ?? null;
  } catch { return null; }
}

// Build the text to embed for a PYQ: question + chapter + solution snippet
function buildEmbedText(q: PYQQuestion): string {
  const parts = [
    `${q.exam} ${q.year} ${q.subject} — ${q.chapter}`,
    q.question_text,
  ];
  if (q.solution_text) parts.push(`Solution: ${q.solution_text.slice(0, 500)}`);
  return parts.join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey    = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('VITE_GEMINI_API_KEY') ?? '';
  const serviceDb    = createClient(supabaseUrl, serviceKey);

  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCors(req), 'Content-Type': 'application/json' } });

  // Auth guard — requires service-role key or dedicated INGEST_API_KEY
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? serviceKey;
  const authHeader  = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!callerToken || callerToken !== ingestKey) {
    return jsonRes({ error: 'Unauthorized' }, 401);
  }

  // No per-user rate limit — internal/cron-triggered only

  try {
    const body = await req.json() as {
      action: string;
      questions?: PYQQuestion[];
      force?: boolean;
      query?: string;
      exam?: string;
      subject?: string;
      year_from?: number;
    };

    // ── Status check ──────────────────────────────────────────────────────────
    if (body.action === 'status') {
      const { data } = await serviceDb
        .from('pyq_content')
        .select('exam, year', { count: 'exact' });
      const examCounts: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ exam: string }>) {
        examCounts[r.exam] = (examCounts[r.exam] ?? 0) + 1;
      }
      return jsonRes({ total: data?.length ?? 0, by_exam: examCounts });
    }

    // ── Ingest ────────────────────────────────────────────────────────────────
    if (body.action === 'ingest') {
      const questions = body.questions ?? [];
      if (questions.length === 0) return jsonRes({ error: 'No questions provided' }, 400);

      let inserted = 0, skipped = 0, embedded = 0;
      const BATCH = 10;

      for (let i = 0; i < questions.length; i += BATCH) {
        const batch = questions.slice(i, i + BATCH);

        // Embed in parallel within batch
        const embeddings = await Promise.all(
          batch.map(q => embedText(buildEmbedText(q), geminiKey)),
        );

        for (let j = 0; j < batch.length; j++) {
          const q = batch[j];
          const hash = fnvHash(q.question_text.toLowerCase().replace(/\s+/g, ' ').trim());

          // Dedup check
          if (!body.force) {
            const { data: existing } = await serviceDb
              .from('pyq_content')
              .select('id')
              .eq('content_hash', hash)
              .maybeSingle();
            if (existing) { skipped++; continue; }
          }

          const embedding = embeddings[j];
          const row = {
            exam:           q.exam,
            year:           q.year,
            subject:        q.subject,
            chapter:        q.chapter,
            question_text:  q.question_text,
            solution_text:  q.solution_text ?? null,
            options:        q.options ?? [],
            correct_option: q.correct_option ?? null,
            question_type:  q.question_type ?? 'mcq',
            difficulty:     q.difficulty ?? 'medium',
            marks:          q.marks ?? 4,
            content_hash:   hash,
            embedding:      embedding ? `[${embedding.join(',')}]` : null,
          };

          const { error } = await serviceDb.from('pyq_content').upsert(row, { onConflict: 'content_hash' });
          if (!error) {
            inserted++;
            if (embedding) embedded++;
          }
        }
      }

      return jsonRes({ inserted, skipped, embedded, total_input: questions.length });
    }

    return jsonRes({ error: `Unknown action: ${body.action}` }, 400);

  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
