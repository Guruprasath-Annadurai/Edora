// pyq-content-audit — AI second-reviewer pass over pyq_content rows that
// haven't been human-reviewed. Fact-checks question/options/correct_option/
// solution for accuracy and well-formedness. Nemotron-primary/Gemini-fallback,
// same discipline as every other feature this session. Feeds the same
// approve/reject review queue an admin uses (Admin Console "Content QA" tab).
// A genuinely empty model response (both Nemotron and Gemini failed/rate-
// limited) is treated as INCONCLUSIVE, not a flag — the row is left pending
// for the next run rather than being falsely marked as a found problem.
// Every run_audit call reports to cron_health, whether triggered by cron or
// an admin — this closes the "silent failure" blind spot found this session
// (all 5 nightly crons were timing out for hours with nobody noticing).
// Actions: run_audit (admin/cron) | list_flagged (admin) | approve (admin) |
//          reject (admin, soft-delete via is_active=false)
//
// SYNCED FROM PRODUCTION 2026-08-08: this file had drifted out of the local
// repo entirely — the version previously committed here queried a different,
// never-deployed-to-production schema (a bare `reviewed` column +
// `pyq_content_flags` table from migration 20260801000000_admin_qa_pipelines.sql,
// which the local repo's migration history has but production never received
// for this table). Production's real, live function is this one: it operates
// directly on pyq_content's own is_reviewed/flagged_for_review/review_notes/
// reviewed_by columns, is NVIDIA Nemotron-primary with a Gemini fallback (not
// Groq), and is triggered both by an admin action and a nightly cron (see
// cron_health row 'pyq-content-audit-nightly'). Pulled back into git so the
// repo reflects what's actually running, not a stale draft.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { reportCronHealth } from '../_shared/cronHealth.ts';

const MAX_PER_RUN = 20;
const DELAY_BETWEEN_CALLS_MS = 400;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function nemotron(prompt: string): Promise<string> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) throw new Error('NVIDIA_API_KEY not configured');
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 400,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? '';
}

async function reasonAboutContent(prompt: string): Promise<{ text: string; model: string } | null> {
  try {
    const text = await nemotron(prompt);
    if (text.trim()) return { text, model: 'nemotron-3-ultra-550b' };
    throw new Error('empty response');
  } catch (e) {
    console.error('Nemotron content audit failed, falling back to Gemini:', e);
    try {
      const text = await gemini(prompt);
      if (text.trim()) return { text, model: 'gemini-1.5-flash' };
      return null;
    } catch (e2) {
      console.error('Gemini content audit also failed:', e2);
      return null;
    }
  }
}

function parseVerdict(raw: string): { ok: boolean; reasoning: string } | null {
  const match = raw.match(/VERDICT:\s*(ok|flag)/i);
  if (!match) return null;
  const ok = match[1].toLowerCase() === 'ok';
  const reasoning = raw.replace(/VERDICT:.*(\n|$)/i, '').trim() || raw.trim();
  return { ok, reasoning };
}

// deno-lint-ignore no-explicit-any
async function requireAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).in('role', ['admin', 'moderator']);
  return (data?.length ?? 0) > 0;
}

serve(withSentry('pyq-content-audit', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = action === 'run_audit' && cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

  let userId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    userId = user.id;
    if (!(await requireAdmin(supabase, userId))) return json({ error: 'Forbidden — admin only' }, 403);
    const rl = await checkRateLimit(supabase, userId, `pyq_content_audit_${action}`, 15, 60);
    if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
  }

  if (action === 'list_flagged') {
    const { data, count } = await supabase
      .from('pyq_content')
      .select('*', { count: 'exact' })
      .eq('flagged_for_review', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 30) - 1);
    return json({ flags: data ?? [], total: count ?? 0 });
  }

  if (action === 'approve') {
    const { id } = body;
    if (!id) return json({ error: 'id required' }, 400);
    const { data, error } = await supabase
      .from('pyq_content')
      .update({ is_reviewed: true, flagged_for_review: false, reviewed_by: `human:${userId}` })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 400);
    return json({ row: data });
  }

  if (action === 'reject') {
    const { id } = body;
    if (!id) return json({ error: 'id required' }, 400);
    const { data, error } = await supabase
      .from('pyq_content')
      .update({ is_active: false, flagged_for_review: false, reviewed_by: `human:${userId}` })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 400);
    return json({ row: data });
  }

  if (action === 'run_audit') {
    try {
      const { data: candidates } = await supabase
        .from('pyq_content')
        .select('id, exam, subject, chapter, question_text, options, correct_option, solution_text, question_type')
        .eq('is_reviewed', false)
        .eq('is_active', true)
        .limit(MAX_PER_RUN);

      const results = [];
      let inconclusive = 0;
      for (const c of candidates ?? []) {
        const prompt = `You are fact-checking a practice exam question before it goes live to students. Verify: (1) the marked correct answer is actually correct, (2) the question is well-formed and unambiguous, (3) the solution/explanation is accurate.

Exam: ${c.exam} / ${c.subject} / ${c.chapter}
Question: ${c.question_text}
${c.question_type === 'mcq' ? `Options: ${JSON.stringify(c.options)}` : `Expected answer: ${c.correct_option}`}
Marked correct: ${c.correct_option}
Solution given: ${c.solution_text ?? 'none'}

Respond in exactly this format:
VERDICT: <ok|flag>
Reasoning: <1-2 sentences — if flagging, say exactly what's wrong>`;

        const outcome = await reasonAboutContent(prompt);
        if (!outcome) {
          inconclusive++;
          await sleep(DELAY_BETWEEN_CALLS_MS);
          continue;
        }

        const parsed = parseVerdict(outcome.text);
        if (!parsed) {
          inconclusive++;
          await sleep(DELAY_BETWEEN_CALLS_MS);
          continue;
        }

        const { ok, reasoning } = parsed;
        const { data: updated } = await supabase
          .from('pyq_content')
          .update({
            is_reviewed: ok,
            flagged_for_review: !ok,
            review_notes: reasoning,
            reviewed_by: outcome.model,
          })
          .eq('id', c.id)
          .select('id, exam, subject, question_text, is_reviewed, flagged_for_review')
          .single();

        results.push(updated);
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }

      const flaggedCount = results.filter(r => r?.flagged_for_review).length;
      const status = results.length === 0 && inconclusive > 0 ? 'inconclusive' : 'success';
      await reportCronHealth(supabase, 'pyq-content-audit-nightly', status, {
        audited: results.length, flagged: flaggedCount, inconclusive, candidates_seen: candidates?.length ?? 0,
      });
      return json({ audited: results.length, flagged: flaggedCount, inconclusive, results });
    } catch (e) {
      await reportCronHealth(supabase, 'pyq-content-audit-nightly', 'error', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  return json({ error: 'Unknown action' }, 400);
}));
