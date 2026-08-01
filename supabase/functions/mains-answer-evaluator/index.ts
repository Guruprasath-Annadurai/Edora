// ─────────────────────────────────────────────────────────────────────────────
// mains-answer-evaluator — UPSC Mains / CBSE Boards long-answer practice.
//
// Real content and a real submissions table have existed since
// 20260708054118_add_upsc_support.sql (mains_questions: 25 UPSC + CBSE
// questions with model answers + key points; mains_answer_submissions:
// student answers + band feedback) — this edge function itself was the
// only missing piece, which is why UPSCMainsPage.tsx 404'd.
//
// Student actions (any authenticated user): list_questions | evaluate
// Admin actions (has_role admin, see below): admin_list_recent | override_band
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

interface MainsQuestion {
  id: string;
  exam: 'UPSC' | 'CBSE';
  class_level: string | null;
  paper: string;
  topic: string;
  question_text: string;
  word_limit: number;
  marks: number;
  model_answer: string;
  key_points: string[];
  difficulty: string;
}

interface Evaluation {
  band: 'needs_work' | 'developing' | 'good' | 'excellent';
  covered_points: string[];
  missed_points: string[];
  structure_feedback: string;
  suggestions: string[];
}

async function gradeAnswer(q: MainsQuestion, answerText: string): Promise<Evaluation> {
  const prompt = `You are an experienced ${q.exam === 'UPSC' ? 'UPSC Mains' : `CBSE Class ${q.class_level} board`} examiner grading a student's written answer. Grading is holistic — give a coarse band, never a fake-precise numeric score.

Question (${q.marks} marks, ${q.word_limit}-word limit): "${q.question_text}"

Model answer key points:
${q.key_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Student's answer:
"""
${answerText}
"""

Evaluate holistically:
- band: "needs_work" (major gaps/incorrect), "developing" (partial, several gaps), "good" (covers most key points, decent structure), "excellent" (covers nearly all key points, well-structured, exam-ready)
- covered_points: which of the model answer's key points the student's answer actually addresses (paraphrase in student's own terms, don't just copy the key point verbatim unless it matches)
- missed_points: which key points are missing or weak
- structure_feedback: one or two sentences on organization/clarity/use of examples
- suggestions: 2-4 concrete, actionable suggestions to improve the answer

Respond with ONLY valid JSON, no markdown fences:
{"band":"...", "covered_points":["..."], "missed_points":["..."], "structure_feedback":"...", "suggestions":["...","..."]}`;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const band: Evaluation['band'] = ['needs_work', 'developing', 'good', 'excellent'].includes(parsed.band)
    ? parsed.band : 'developing';
  return {
    band,
    covered_points: Array.isArray(parsed.covered_points) ? parsed.covered_points : [],
    missed_points: Array.isArray(parsed.missed_points) ? parsed.missed_points : [],
    structure_feedback: parsed.structure_feedback ?? '',
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}

serve(withSentry('mains-answer-evaluator', async (req) => {
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

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── Student actions — any authenticated user ────────────────────────────
  if (action === 'list_questions') {
    const rl = await checkRateLimit(serviceDb, user.id, 'mains_list_questions', 60, 60);
    if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

    const { exam, class_level } = body as { exam?: 'UPSC' | 'CBSE'; class_level?: string };
    let q = serviceDb
      .from('mains_questions')
      .select('id, exam, class_level, paper, topic, question_text, word_limit, marks, difficulty')
      .order('created_at', { ascending: true });
    if (exam) q = q.eq('exam', exam);
    if (exam === 'CBSE' && class_level) q = q.eq('class_level', class_level);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ questions: data ?? [] });
  }

  if (action === 'evaluate') {
    const rl = await checkRateLimit(serviceDb, user.id, 'mains_evaluate', 15, 60);
    if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

    const { question_id, answer_text } = body as { question_id: string; answer_text: string };
    if (!question_id || !answer_text?.trim()) return json({ error: 'question_id and answer_text required' }, 400);

    const { data: question, error: qErr } = await serviceDb
      .from('mains_questions').select('*').eq('id', question_id).maybeSingle();
    if (qErr || !question) return json({ error: 'Question not found' }, 404);

    const wordCount = answer_text.trim().split(/\s+/).length;
    let evaluation: Evaluation;
    try {
      evaluation = await gradeAnswer(question as MainsQuestion, answer_text.trim());
    } catch (e) {
      console.error('[mains-answer-evaluator] grading failed:', e);
      return json({ error: 'Evaluation failed — please try again' }, 502);
    }

    const { error: insertErr } = await serviceDb.from('mains_answer_submissions').insert({
      user_id: user.id,
      question_id,
      answer_text: answer_text.trim(),
      word_count: wordCount,
      score_band: evaluation.band,
      covered_points: evaluation.covered_points,
      missed_points: evaluation.missed_points,
      structure_feedback: evaluation.structure_feedback,
      suggestions: evaluation.suggestions,
      model_used: GROQ_MODEL,
      exam: (question as MainsQuestion).exam,
    });
    if (insertErr) console.error('[mains-answer-evaluator] persist error:', insertErr);

    return json({ evaluation, model_answer: (question as MainsQuestion).model_answer });
  }

  // ── Admin actions — staff only ───────────────────────────────────────────
  const { data: isAdmin } = await serviceDb.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'Forbidden — admin role required' }, 403);

  const rl = await checkRateLimit(serviceDb, user.id, 'mains_answer_evaluator_admin', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  if (action === 'admin_list_recent') {
    const limit = Math.min(Number(body.limit) || 50, 200);
    const { data, error } = await serviceDb
      .from('mains_answer_submissions')
      .select('*, mains_questions(exam, paper, topic, question_text), mains_band_overrides(override_band, note, created_at)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    const { data: stats } = await serviceDb.from('mains_band_stats').select('*').maybeSingle();
    return json({ submissions: data ?? [], stats: stats ?? { total_overrides: 0, total_submissions: 0, override_rate_pct: null } });
  }

  if (action === 'override_band') {
    const { submission_id, override_band, note } = body as { submission_id: string; override_band: string; note?: string };
    if (!submission_id || !override_band) return json({ error: 'submission_id and override_band required' }, 400);

    const { data: submission } = await serviceDb.from('mains_answer_submissions').select('id').eq('id', submission_id).maybeSingle();
    if (!submission) return json({ error: 'Submission not found' }, 404);

    const { error: insertErr } = await serviceDb.from('mains_band_overrides').insert({
      submission_id, override_band, note: note ?? null,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    const { error: updateErr } = await serviceDb.from('mains_answer_submissions').update({ score_band: override_band }).eq('id', submission_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: list_questions | evaluate | admin_list_recent | override_band' }, 400);
}));
