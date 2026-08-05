// ─────────────────────────────────────────────────────────────────────────────
// question-quality-audit — staff-only, gated by public.has_role(uid,'admin')
//
// Turns raw student reports (question_reports) into actioned quality flags.
// A question reported by multiple students is exactly the "cheapest, highest
// -leverage quality signal" pillar 1 asked for — this is what actually acts
// on it instead of letting reports sit unread.
//
// Actions:
//   run_audit          — group open reports by question_text (>= 2 reports),
//                        ask an LLM to verify + optionally propose a fix,
//                        write a question_flags row per group.
//   list_flags         — open flags for the admin UI.
//   resolve_flag        — mark actioned/dismissed.
//   approve_correction  — mark a proposed correction 'approved' in the bank.
//   reject_correction   — mark it 'rejected'.
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const MIN_REPORTS_TO_FLAG = 2;

interface VerifyResult {
  verdict: 'confirmed_bad' | 'genuinely_hard' | 'inconclusive';
  reasoning: string;
  corrected_question: { question_text: string; options: string[]; correct_index: number; explanation: string } | null;
}

const VALID_VERDICTS = new Set(['confirmed_bad', 'genuinely_hard', 'inconclusive']);

function validateCorrectedQuestion(cq: unknown): string | null {
  if (cq === null || cq === undefined) return null; // absent is valid
  const c = cq as Partial<NonNullable<VerifyResult['corrected_question']>>;
  if (typeof c.question_text !== 'string' || c.question_text.trim().length < 5) {
    return 'corrected_question.question_text missing or too short';
  }
  if (!Array.isArray(c.options) || c.options.length !== 4 || c.options.some(o => typeof o !== 'string' || o.trim().length === 0)) {
    return 'corrected_question.options must be exactly 4 non-empty strings';
  }
  if (typeof c.correct_index !== 'number' || !Number.isInteger(c.correct_index) || c.correct_index < 0 || c.correct_index > 3) {
    return 'corrected_question.correct_index must be an integer 0-3';
  }
  if (typeof c.explanation !== 'string' || c.explanation.trim().length === 0) {
    return 'corrected_question.explanation missing or empty';
  }
  return null;
}

// Single attempt: throws on network failure, non-2xx, unparseable JSON, an
// out-of-enum verdict, or a structurally invalid corrected_question — never
// silently defaults to "inconclusive" or writes a malformed correction.
async function verifyQuestionOnce(questionText: string, details: string[]): Promise<VerifyResult> {
  const prompt = `You are a subject-matter expert reviewing a flagged exam-prep question for an Indian student app (JEE/NEET/CBSE).

Question (as students saw it):
"""
${questionText}
"""

Student-reported issues (may be duplicates or noise):
${details.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Decide:
- "confirmed_bad": the question genuinely has a wrong answer key, ambiguous phrasing, or a factual error.
- "genuinely_hard": the question is correct but difficult — students are reporting it out of frustration, not because it's wrong.
- "inconclusive": you cannot determine correctness from the text alone (e.g. missing an image/diagram it depends on).

If confirmed_bad AND you can confidently produce a corrected version, include one. Otherwise corrected_question must be null.

Respond with ONLY valid JSON, no markdown fences:
{"verdict":"...", "reasoning":"one or two sentences", "corrected_question": {"question_text":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"..."} or null}`;

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

  if (!VALID_VERDICTS.has(parsed.verdict)) {
    throw new Error(`Invalid verdict in response: ${JSON.stringify(parsed.verdict)}`);
  }
  if (typeof parsed.reasoning !== 'string' || parsed.reasoning.trim().length === 0) {
    throw new Error('Missing or empty reasoning in response');
  }
  const correctionError = validateCorrectedQuestion(parsed.corrected_question);
  if (correctionError) throw new Error(correctionError);

  return {
    verdict: parsed.verdict,
    reasoning: parsed.reasoning,
    corrected_question: parsed.corrected_question ?? null,
  };
}

// Network-level retry with exponential backoff.
async function verifyQuestionWithRetry(questionText: string, details: string[], maxRetries = 2): Promise<VerifyResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await verifyQuestionOnce(questionText, details);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Outer semantic layer: re-runs the whole generate+validate cycle on a
// structurally invalid response instead of ever guessing or defaulting.
async function verifyQuestion(questionText: string, details: string[]): Promise<VerifyResult> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await verifyQuestionWithRetry(questionText, details);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to verify question after ${MAX_ATTEMPTS} attempts`);
}

serve(withSentry('question-quality-audit', async (req) => {
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

  const rl = await checkRateLimit(serviceDb, user.id, 'question_quality_audit', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'run_audit') {
    // Group pending reports by question_text, ignore ones with < MIN_REPORTS_TO_FLAG
    // and ones already turned into a flag.
    const { data: pending, error } = await serviceDb
      .from('question_reports')
      .select('id, question_text, details')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return json({ error: error.message }, 500);

    const { data: existingFlags } = await serviceDb.from('question_flags').select('question_text').eq('status', 'open');
    const alreadyFlagged = new Set((existingFlags ?? []).map((f: { question_text: string }) => f.question_text));

    const groups = new Map<string, { ids: string[]; details: string[] }>();
    for (const r of (pending ?? []) as { id: string; question_text: string; details: string | null }[]) {
      if (alreadyFlagged.has(r.question_text)) continue;
      const g = groups.get(r.question_text) ?? { ids: [], details: [] };
      g.ids.push(r.id);
      if (r.details) g.details.push(r.details);
      groups.set(r.question_text, g);
    }

    const toAudit = Array.from(groups.entries()).filter(([, g]) => g.ids.length >= MIN_REPORTS_TO_FLAG).slice(0, 15);
    let created = 0;
    for (const [questionText, g] of toAudit) {
      try {
        const verdict = await verifyQuestion(questionText, g.details);
        let correctionBankId: string | null = null;
        if (verdict.corrected_question) {
          const { data: bankRow } = await serviceDb.from('question_corrections').insert({
            question_text: verdict.corrected_question.question_text,
            options: verdict.corrected_question.options,
            correct_index: verdict.corrected_question.correct_index,
            explanation: verdict.corrected_question.explanation,
            status: 'pending',
          }).select('id').single();
          correctionBankId = bankRow?.id ?? null;
        }
        await serviceDb.from('question_flags').insert({
          question_text: questionText,
          report_count: g.ids.length,
          verdict: verdict.verdict,
          reasoning: verdict.reasoning,
          model_used: GROQ_MODEL,
          corrected_question: verdict.corrected_question,
          correction_bank_id: correctionBankId,
          source_report_ids: g.ids,
          status: 'open',
        });
        created += 1;
        // Mark the source reports as 'reviewed' so run_audit doesn't re-flag them.
        await serviceDb.from('question_reports').update({ status: 'reviewed' }).in('id', g.ids);
      } catch (e) {
        console.error('[question-quality-audit] verify failed:', questionText.slice(0, 60), e);
      }
    }
    return json({ ok: true, flags_created: created, groups_considered: toAudit.length });
  }

  if (action === 'list_flags') {
    const status = (body.status as string | undefined) ?? 'open';
    const { data, error } = await serviceDb
      .from('question_flags').select('*').eq('status', status)
      .order('created_at', { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ flags: data ?? [] });
  }

  if (action === 'resolve_flag') {
    const { flag_id, status } = body as { flag_id: string; status: 'actioned' | 'dismissed' };
    if (!flag_id || !status) return json({ error: 'flag_id and status required' }, 400);
    const { error } = await serviceDb.from('question_flags').update({ status }).eq('id', flag_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'approve_correction') {
    const { bank_id } = body as { bank_id: string };
    if (!bank_id) return json({ error: 'bank_id required' }, 400);
    const { error } = await serviceDb.from('question_corrections').update({ status: 'approved' }).eq('id', bank_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'reject_correction') {
    const { bank_id } = body as { bank_id: string };
    if (!bank_id) return json({ error: 'bank_id required' }, 400);
    const { error } = await serviceDb.from('question_corrections').update({ status: 'rejected' }).eq('id', bank_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: run_audit | list_flags | resolve_flag | approve_correction | reject_correction' }, 400);
}));
