// question-gen-eval-run — Evaluation harness for ai-question-gen
// (mirrors novo-eval-run, which only ever exercised gemini-chat).
//
// For each active question_gen_eval_case, calls the live ai-question-gen
// function (via its eval-mode bypass — see ai-question-gen/index.ts), then
// has an LLM judge each returned question for factual correctness and
// difficulty match — not just structural validity, which ai-question-gen
// already checks itself before returning anything.
//
// POST body: { run_id?: string, case_ids?: string[], subject?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_API_KEY      = Deno.env.get('GROQ_API_KEY')!;
const GROQ_BASE_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const JUDGE_MODEL       = 'llama-3.3-70b-versatile';
const QUESTION_GEN_URL  = `${SUPABASE_URL}/functions/v1/ai-question-gen`;
const EVAL_SECRET       = Deno.env.get('EVAL_SECRET');
const GEN_TIMEOUT_MS    = 45_000;
const MAX_CONCURRENCY   = 1; // Groq free-tier TPM budget, same reasoning as novo-eval-run

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface EvalCase {
  id: string;
  name: string;
  subject: string;
  chapter: string | null;
  class_num: number | null;
  ability_score: number;
  count: number;
}

interface GeneratedQuestion {
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  chapter?: string;
  confidence?: number;
}

interface QuestionRunResult {
  eval_case_id:     string;
  question_index:   number;
  question_text:    string | null;
  options:          string[] | null;
  correct_idx:      number | null;
  explanation:      string | null;
  model_confidence: number | null;
  judge_verdict:    'correct' | 'incorrect' | 'ambiguous' | null;
  judge_reasoning:  string | null;
  pass:             boolean;
  score:            number;
  latency_ms:       number;
  error:            string | null;
}

async function callQuestionGen(c: EvalCase): Promise<{ questions: GeneratedQuestion[]; latency: number; error: string | null }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    const res = await fetch(QUESTION_GEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'x-eval-mode':   'true',
        'x-eval-secret': EVAL_SECRET ?? '',
      },
      body: JSON.stringify({
        subject:       c.subject,
        chapter:       c.chapter ?? undefined,
        count:         c.count,
        ability_score: c.ability_score,
        class_num:     c.class_num ?? undefined,
      }),
      signal: controller.signal,
    });
    const latency = Date.now() - t0;
    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`[question-gen-eval] HTTP ${res.status} case="${c.name}" err=${err.slice(0, 200)}`);
      return { questions: [], latency, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { questions?: GeneratedQuestion[] };
    return { questions: data.questions ?? [], latency, error: null };
  } catch (err) {
    return { questions: [], latency: Date.now() - t0, error: (err as Error)?.message ?? 'fetch failed' };
  } finally {
    clearTimeout(tid);
  }
}

async function judgeQuestion(c: EvalCase, q: GeneratedQuestion): Promise<{
  verdict: 'correct' | 'incorrect' | 'ambiguous'; score: number; reasoning: string;
}> {
  const prompt = `You are a subject-matter expert verifying an AI-generated exam question for an Indian student app (${c.subject}, ${c.chapter ?? 'general syllabus'}).

Question: "${q.question}"
Options: ${JSON.stringify(q.options)}
Marked correct option (0-indexed): ${q.correct_idx} → "${q.options?.[q.correct_idx]}"
Explanation given: "${q.explanation}"

Verify: is the marked option actually correct, is exactly one option correct (not zero, not multiple), and is the question unambiguous and factually sound?

Return ONLY valid JSON, no markdown fences:
{"verdict":"correct"|"incorrect"|"ambiguous", "reasoning":"one sentence"}`;

  try {
    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: JUDGE_MODEL, temperature: 0.1, max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return { verdict: 'ambiguous', score: 0.5, reasoning: 'Judge unavailable' };
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
    const verdict: 'correct' | 'incorrect' | 'ambiguous' =
      parsed.verdict === 'correct' || parsed.verdict === 'incorrect' ? parsed.verdict : 'ambiguous';
    return {
      verdict,
      score: verdict === 'correct' ? 1 : verdict === 'ambiguous' ? 0.5 : 0,
      reasoning: parsed.reasoning ?? 'No reasoning returned.',
    };
  } catch {
    return { verdict: 'ambiguous', score: 0.5, reasoning: 'Judge parse error' };
  }
}

async function runCase(c: EvalCase): Promise<QuestionRunResult[]> {
  const { questions, latency, error } = await callQuestionGen(c);
  if (error || questions.length === 0) {
    return [{
      eval_case_id: c.id, question_index: 0, question_text: null, options: null, correct_idx: null,
      explanation: null, model_confidence: null, judge_verdict: null, judge_reasoning: null,
      pass: false, score: 0, latency_ms: latency, error: error ?? 'No questions returned',
    }];
  }

  const results: QuestionRunResult[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      const { verdict, score, reasoning } = await judgeQuestion(c, q);
      results.push({
        eval_case_id: c.id, question_index: i, question_text: q.question,
        options: q.options, correct_idx: q.correct_idx, explanation: q.explanation,
        model_confidence: q.confidence ?? null, judge_verdict: verdict, judge_reasoning: reasoning,
        pass: verdict === 'correct', score, latency_ms: latency, error: null,
      });
    } catch (err) {
      results.push({
        eval_case_id: c.id, question_index: i, question_text: q.question, options: q.options,
        correct_idx: q.correct_idx, explanation: q.explanation, model_confidence: q.confidence ?? null,
        judge_verdict: null, judge_reasoning: null, pass: false, score: 0,
        latency_ms: latency, error: (err as Error)?.message ?? 'judge exception',
      });
    }
  }
  return results;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
}

function jwtRole(authHeader: string | null): string | null {
  try {
    const token = authHeader?.replace('Bearer ', '') ?? '';
    return JSON.parse(atob(token.split('.')[1]))?.role ?? null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  const evalSecretHeader = req.headers.get('x-eval-secret');
  const authorized = (expectedSecret && secret === expectedSecret)
    || jwtRole(authHeader) === 'service_role'
    || (!!EVAL_SECRET && evalSecretHeader === EVAL_SECRET);
  if (!authorized) return new Response('Unauthorized', { status: 401 });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) as {
    run_id?: string; case_ids?: string[]; subject?: string;
  } : {};

  const runId = body.run_id ?? crypto.randomUUID();
  const t0 = Date.now();

  let q = db.from('question_gen_eval_cases').select('*').eq('active', true);
  if (body.case_ids?.length) q = q.in('id', body.case_ids);
  if (body.subject) q = q.eq('subject', body.subject);
  const { data: cases, error: caseErr } = await q;
  if (caseErr || !cases) {
    return new Response(JSON.stringify({ error: 'Failed to load eval cases', detail: caseErr }), {
      status: 500, headers: { ...getCors(req), 'Content-Type': 'application/json' },
    });
  }

  console.log(`[question-gen-eval] run_id=${runId} cases=${cases.length}`);

  const tasks = (cases as EvalCase[]).map(c => () => runCase(c));
  const perCaseResults = await runWithConcurrency(tasks, MAX_CONCURRENCY);
  const results = perCaseResults.flat();

  const rows = results.map(r => ({ ...r, run_id: runId }));
  const { error: insertErr } = await db.from('question_gen_eval_runs').insert(rows);
  if (insertErr) console.error('[question-gen-eval] insert error', insertErr);

  const judged  = results.filter(r => r.judge_verdict !== null);
  const passed  = judged.filter(r => r.pass).length;
  const incorrect = judged.filter(r => r.judge_verdict === 'incorrect');
  const ambiguous  = judged.filter(r => r.judge_verdict === 'ambiguous');
  const genFailed  = results.filter(r => r.error !== null);
  const avgScore   = judged.reduce((a, r) => a + r.score, 0) / (judged.length || 1);

  const summary = {
    run_id: runId,
    cases_run: cases.length,
    questions_generated: results.length,
    questions_judged: judged.length,
    passed,
    incorrect: incorrect.length,
    ambiguous: ambiguous.length,
    generation_failures: genFailed.length,
    pass_rate: Math.round((passed / (judged.length || 1)) * 100),
    avg_score: Math.round(avgScore * 100) / 100,
    elapsed_ms: Date.now() - t0,
    incorrect_examples: incorrect.slice(0, 10).map(r => ({
      question: r.question_text, reasoning: r.judge_reasoning,
    })),
  };

  console.log(`[question-gen-eval] done run_id=${runId} pass=${passed}/${judged.length}`);

  return new Response(JSON.stringify(summary), {
    headers: { ...getCors(req), 'Content-Type': 'application/json' },
  });
});
