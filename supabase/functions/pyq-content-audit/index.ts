// ─────────────────────────────────────────────────────────────────────────────
// pyq-content-audit — staff-only, gated by public.has_role(uid,'admin')
//
// Second-review pass over pyq_content: an LLM checks each unreviewed row for
// a wrong answer key, an ambiguous question, or a solution that doesn't
// match the marked correct option, and flags anything suspect for a human.
// Rows that pass are marked reviewed so they're never re-audited.
//
// Actions: run_audit | list_flagged | approve | reject
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const BATCH_SIZE   = 15;

interface ReviewResult {
  verdict: 'approved' | 'flagged';
  review_notes: string;
}

type Row = {
  question_text: string; options: unknown; correct_option: string | null; solution_text: string | null;
};

// Single attempt: throws on network failure, non-2xx, unparseable JSON, or a
// missing/invalid verdict — never silently defaults to "approved".
async function reviewRowOnce(row: Row): Promise<ReviewResult> {
  const prompt = `You are a subject-matter expert doing second-review QA on a previous-year-question bank entry for an Indian exam-prep app.

Question:
"""
${row.question_text}
"""

Options: ${JSON.stringify(row.options)}
Marked correct option: ${row.correct_option ?? '(none recorded)'}
Solution/explanation on file: ${row.solution_text ?? '(none recorded)'}

Check for: a wrong answer key, an ambiguous or malformed question, or a solution that contradicts the marked correct option.

Respond with ONLY valid JSON, no markdown fences:
{"verdict":"approved"|"flagged", "review_notes":"one or two sentences explaining your verdict"}`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  if (parsed.verdict !== 'approved' && parsed.verdict !== 'flagged') {
    throw new Error(`Invalid verdict in response: ${JSON.stringify(parsed.verdict)}`);
  }
  if (typeof parsed.review_notes !== 'string' || parsed.review_notes.trim().length === 0) {
    throw new Error('Missing or empty review_notes in response');
  }
  return { verdict: parsed.verdict, review_notes: parsed.review_notes };
}

// Network-level retry with exponential backoff (fetch failure, non-2xx, bad JSON).
async function reviewRowWithRetry(row: Row, maxRetries = 2): Promise<ReviewResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await reviewRowOnce(row);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Outer semantic layer: re-runs the whole generate+validate cycle if the
// model returns a structurally invalid response, instead of ever guessing.
async function reviewRow(row: Row): Promise<ReviewResult> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await reviewRowWithRetry(row);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to review row after ${MAX_ATTEMPTS} attempts`);
}

serve(withSentry('pyq-content-audit', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: isAdmin } = await serviceDb.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'Forbidden — admin role required' }, 403);

  const rl = await checkRateLimit(serviceDb, user.id, 'pyq_content_audit', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'run_audit') {
    const { data: rows, error } = await serviceDb
      .from('pyq_content')
      .select('id, exam, subject, chapter, question_text, options, correct_option, solution_text')
      .eq('reviewed', false)
      .limit(BATCH_SIZE);
    if (error) return json({ error: error.message }, 500);

    let flagged = 0, approved = 0;
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      try {
        const result = await reviewRow(row as { question_text: string; options: unknown; correct_option: string | null; solution_text: string | null });
        if (result.verdict === 'flagged') {
          await serviceDb.from('pyq_content_flags').insert({
            pyq_content_id: row.id,
            exam: row.exam,
            subject: row.subject,
            chapter: row.chapter,
            question_text: row.question_text,
            options: row.options,
            correct_option: row.correct_option,
            solution_text: row.solution_text,
            review_notes: result.review_notes,
            status: 'flagged',
          });
          flagged += 1;
        } else {
          approved += 1;
        }
        await serviceDb.from('pyq_content').update({ reviewed: true }).eq('id', row.id as string);
      } catch (e) {
        console.error('[pyq-content-audit] review failed:', row.id, e);
      }
    }
    return json({ ok: true, rows_reviewed: (rows ?? []).length, flagged, approved });
  }

  if (action === 'list_flagged') {
    const status = (body.status as string | undefined) ?? 'flagged';
    const { data, error } = await serviceDb
      .from('pyq_content_flags').select('*').eq('status', status)
      .order('created_at', { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ flags: data ?? [] });
  }

  if (action === 'approve' || action === 'reject') {
    const { id } = body as { id: string };
    if (!id) return json({ error: 'id required' }, 400);
    const status = action === 'approve' ? 'approved' : 'retired';
    const { error } = await serviceDb.from('pyq_content_flags').update({ status }).eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: run_audit | list_flagged | approve | reject' }, 400);
}));
