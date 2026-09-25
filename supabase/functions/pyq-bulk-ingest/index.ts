// pyq-bulk-ingest — scalable bulk content ingestion for pyq_content, so
// future CAT/UPSC/CBSE/JEE/NEET content additions don't require hand-written
// SQL migrations like this session's starter seeding did. Mirrors
// ncert-ingest's auth pattern (INGEST_API_KEY bearer token, falls back to
// service key). Every ingested row lands with is_reviewed=false — it enters
// the same pyq-content-audit review pipeline as everything else before it's
// trusted.
// NOTE: named pyq-bulk-ingest, NOT pyq-ingest — that slug already belonged to
// a pre-existing production function (unrelated, sibling to
// teacher-content-ingest/user-content-index) that was accidentally
// overwritten earlier this session. Do not redeploy anything under
// 'pyq-ingest' without first recovering/confirming what that original
// function did.
// Actions: status | bulk_seed
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

const VALID_EXAMS = ['JEE_MAIN', 'JEE_ADV', 'NEET', 'BITSAT', 'BOARDS', 'CAT', 'UPSC'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_QUESTION_TYPES = ['mcq', 'integer', 'subjective'];
const MAX_BATCH = 200;

interface IngestQuestion {
  exam: string;
  year: number;
  subject: string;
  chapter: string;
  question_text: string;
  solution_text?: string | null;
  options?: Array<{ label: string; text: string; correct: boolean }>;
  correct_option?: string | null;
  question_type?: string;
  difficulty?: string;
  marks?: number;
  class_level?: string | null;
}

function validateQuestion(q: unknown, idx: number): { valid: IngestQuestion | null; error: string | null } {
  const c = q as Partial<IngestQuestion>;
  if (!c || typeof c !== 'object') return { valid: null, error: `[${idx}] not an object` };
  if (!c.exam || !VALID_EXAMS.includes(c.exam)) return { valid: null, error: `[${idx}] invalid exam: ${c.exam}` };
  if (typeof c.year !== 'number') return { valid: null, error: `[${idx}] year required` };
  if (!c.subject || typeof c.subject !== 'string') return { valid: null, error: `[${idx}] subject required` };
  if (!c.chapter || typeof c.chapter !== 'string') return { valid: null, error: `[${idx}] chapter required` };
  if (!c.question_text || typeof c.question_text !== 'string') return { valid: null, error: `[${idx}] question_text required` };
  const questionType = c.question_type ?? 'mcq';
  if (!VALID_QUESTION_TYPES.includes(questionType)) return { valid: null, error: `[${idx}] invalid question_type: ${questionType}` };
  if (questionType === 'mcq') {
    if (!Array.isArray(c.options) || c.options.length < 2) return { valid: null, error: `[${idx}] mcq needs >=2 options` };
    if (!c.options.some(o => o.correct)) return { valid: null, error: `[${idx}] mcq needs exactly one correct option` };
  }
  const difficulty = c.difficulty ?? 'medium';
  if (!VALID_DIFFICULTIES.includes(difficulty)) return { valid: null, error: `[${idx}] invalid difficulty: ${difficulty}` };

  return {
    valid: {
      exam: c.exam, year: c.year, subject: c.subject, chapter: c.chapter,
      question_text: c.question_text, solution_text: c.solution_text,
      options: c.options ?? [], correct_option: c.correct_option ?? null,
      question_type: questionType, difficulty, marks: c.marks ?? 1,
      class_level: c.class_level ?? null,
    },
    error: null,
  };
}

serve(withSentry('pyq-bulk-ingest', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? serviceKey;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!callerToken || callerToken !== ingestKey) {
    return json({ error: 'Unauthorized — valid ingest key required' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'status') {
    const { count: total } = await supabase.from('pyq_content').select('id', { count: 'exact', head: true });
    const { count: unreviewed } = await supabase.from('pyq_content').select('id', { count: 'exact', head: true }).eq('is_reviewed', false);
    const { count: flagged } = await supabase.from('pyq_content').select('id', { count: 'exact', head: true }).eq('flagged_for_review', true);
    return json({ total_questions: total ?? 0, pending_review: unreviewed ?? 0, flagged_for_review: flagged ?? 0 });
  }

  if (action === 'bulk_seed') {
    const { questions } = body as { questions?: unknown[] };
    if (!Array.isArray(questions) || questions.length === 0) {
      return json({ error: 'questions array is required' }, 400);
    }
    if (questions.length > MAX_BATCH) {
      return json({ error: `Batch too large — max ${MAX_BATCH} per call` }, 400);
    }

    const validated: IngestQuestion[] = [];
    const errors: string[] = [];
    questions.forEach((q, idx) => {
      const { valid, error } = validateQuestion(q, idx);
      if (valid) validated.push(valid);
      if (error) errors.push(error);
    });

    if (errors.length > 0) {
      return json({ error: 'Validation failed — no rows inserted', validation_errors: errors }, 400);
    }

    const rows = validated.map(q => ({ ...q, is_reviewed: false, is_active: true }));
    const { data, error: insertErr } = await supabase.from('pyq_content').insert(rows).select('id');
    if (insertErr) return json({ error: insertErr.message }, 400);

    return json({ inserted: data?.length ?? 0, note: 'All rows queued for pyq-content-audit review before being trusted.' });
  }

  return json({ error: 'Unknown action. Use: status | bulk_seed' }, 400);
}));
