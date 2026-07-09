// ─────────────────────────────────────────────────────────────────────────────
// novo-certifications — Mastery-verified in-app certificates
// Actions:
//   start_assessment  — generate a 10-question adaptive assessment
//   get_assessment    — fetch an in-progress assessment (resume support)
//   submit_answer     — submit one answer, get feedback + advance
//   get_certificates  — list all earned certificates for a user
//   get_certificate   — fetch one certificate by id or share_code
// Enterprise: rate limiting, Gemini retry, share-code collision retry,
//             per-question structural validation
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
const PASS_THRESHOLD   = 80;  // percent
const TOTAL_QUESTIONS  = 10;

// ── Gemini with retry ─────────────────────────────────────────────────────────
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
      }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]) as T;
}

// Retry up to maxRetries times with exponential backoff before throwing.
async function geminiJSONWithRetry<T>(prompt: string, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await geminiJSON<T>(prompt);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= maxRequests) {
    return { allowed: false, retryAfterSecs: windowMinutes * 60 };
  }
  supabase.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

interface AssessmentQuestion {
  q: string;
  options: [string, string, string, string];
  correct_idx: number;
  explanation: string;
}

// ── Per-question structural validator ─────────────────────────────────────────
function validateQuestions(questions: unknown[]): string | null {
  if (!Array.isArray(questions) || questions.length !== TOTAL_QUESTIONS) {
    return `Expected ${TOTAL_QUESTIONS} questions, got ${Array.isArray(questions) ? questions.length : 'non-array'}`;
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<AssessmentQuestion>;
    if (!q.q || typeof q.q !== 'string' || q.q.trim().length < 10) {
      return `Question ${i + 1}: missing or too-short "q" field`;
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return `Question ${i + 1}: "options" must be an array of exactly 4 strings`;
    }
    if (q.options.some(o => typeof o !== 'string' || o.trim().length === 0)) {
      return `Question ${i + 1}: all options must be non-empty strings`;
    }
    if (typeof q.correct_idx !== 'number' || q.correct_idx < 0 || q.correct_idx > 3) {
      return `Question ${i + 1}: "correct_idx" must be 0, 1, 2, or 3`;
    }
    if (!q.explanation || typeof q.explanation !== 'string') {
      return `Question ${i + 1}: "explanation" is required`;
    }
  }
  return null; // valid
}

serve(withSentry('novo-certifications', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── start_assessment ──────────────────────────────────────────────────────
  if (action === 'start_assessment') {
    const { subject, topic } = body;
    if (!subject || !topic) return json({ error: 'subject and topic required' }, 400);

    // Rate limit: 10 assessments per hour per user (prevents Gemini quota drain)
    const rl = await checkRateLimit(supabase, user.id, 'start_assessment', 10, 60);
    if (!rl.allowed) {
      return json({
        error: 'You\'ve started many assessments recently. Please wait before starting another.',
        retry_after_secs: rl.retryAfterSecs,
      }, 429);
    }

    // Resume if an in-progress assessment already exists for this topic
    const { data: inProgress } = await supabase
      .from('certification_assessments')
      .select('*')
      .eq('user_id', user.id)
      .eq('subject', subject)
      .eq('topic', topic)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1);

    if (inProgress && inProgress.length > 0) {
      // Return without correct_idx
      const safe = {
        ...inProgress[0],
        questions: inProgress[0].questions.map((q: AssessmentQuestion) => ({
          q: q.q,
          options: q.options,
        })),
      };
      return json({ assessment: safe, resumed: true });
    }

    // Fetch profile for adaptive difficulty
    const { data: profile } = await supabase
      .from('profiles').select('study_level,full_name').eq('id', user.id).single();

    // Generate 10 MCQ questions via Gemini with retry
    let questions: AssessmentQuestion[] = [];
    try {
      questions = await geminiJSONWithRetry<AssessmentQuestion[]>(`
You are Novo, an expert AI examiner. Generate exactly ${TOTAL_QUESTIONS} multiple-choice questions
to assess mastery of "${topic}" in ${subject}.

Student level: ${profile?.study_level ?? 'college'}

Requirements:
- Questions must rigorously test UNDERSTANDING, not just recall
- Mix difficulty: 3 easy, 4 medium, 3 hard
- Each question has exactly 4 options in the "options" array
- correct_idx is 0, 1, 2, or 3 (index into options array)
- explanation is a clear 1-2 sentence explanation of the correct answer
- No trick questions — test genuine knowledge
- Every field must be present and non-empty

Return a JSON array of exactly ${TOTAL_QUESTIONS} objects:
[
  {
    "q": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_idx": 0,
    "explanation": "Brief explanation of why this is correct."
  }
]
`);
    } catch (e) {
      return json({ error: `Failed to generate questions after retries: ${e}` }, 500);
    }

    // Strict per-question validation (catches every malformed field)
    const validationError = validateQuestions(questions);
    if (validationError) {
      return json({ error: `Question validation failed: ${validationError}` }, 500);
    }

    const { data: assessment, error: insertErr } = await supabase
      .from('certification_assessments')
      .insert({
        user_id:   user.id,
        subject,
        topic,
        questions,
        answers:   [],
        current_q: 0,
        status:    'in_progress',
      })
      .select('*')
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);

    // Strip correct_idx before sending to client
    const safeAssessment = {
      ...assessment,
      questions: assessment.questions.map((q: AssessmentQuestion) => ({
        q: q.q,
        options: q.options,
        // correct_idx intentionally omitted
      })),
    };

    return json({ assessment: safeAssessment, resumed: false });
  }

  // ── get_assessment ────────────────────────────────────────────────────────
  if (action === 'get_assessment') {
    const { assessment_id } = body;
    if (!assessment_id) return json({ error: 'assessment_id required' }, 400);

    const { data: assessment } = await supabase
      .from('certification_assessments')
      .select('*')
      .eq('id', assessment_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assessment) return json({ error: 'Assessment not found' }, 404);

    // Strip correct_idx for in-progress; full reveal after completion
    const safeQuestions = assessment.status === 'in_progress'
      ? assessment.questions.map((q: AssessmentQuestion) => ({ q: q.q, options: q.options }))
      : assessment.questions;

    return json({ assessment: { ...assessment, questions: safeQuestions } });
  }

  // ── submit_answer ─────────────────────────────────────────────────────────
  if (action === 'submit_answer') {
    const { assessment_id, answer_idx } = body;
    if (!assessment_id || answer_idx === undefined) {
      return json({ error: 'assessment_id and answer_idx required' }, 400);
    }
    if (typeof answer_idx !== 'number' || answer_idx < 0 || answer_idx > 3) {
      return json({ error: 'answer_idx must be 0–3' }, 400);
    }

    // Fetch full assessment server-side (with correct answers — never sent to client)
    const { data: assessment } = await supabase
      .from('certification_assessments')
      .select('*')
      .eq('id', assessment_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assessment) return json({ error: 'Assessment not found' }, 404);
    if (assessment.status !== 'in_progress') {
      return json({ error: 'Assessment already completed' }, 400);
    }

    const questions: AssessmentQuestion[] = assessment.questions;
    const currentQ = assessment.current_q;

    if (currentQ >= questions.length) {
      return json({ error: 'All questions already answered' }, 400);
    }

    const correctIdx: number = questions[currentQ].correct_idx;
    const isCorrect          = answer_idx === correctIdx;
    const explanation        = questions[currentQ].explanation;

    const newAnswers = [...(assessment.answers as number[]), answer_idx];
    const nextQ      = currentQ + 1;
    const isComplete = nextQ >= TOTAL_QUESTIONS;

    if (!isComplete) {
      await supabase.from('certification_assessments').update({
        answers:   newAnswers,
        current_q: nextQ,
      }).eq('id', assessment_id);

      return json({
        correct:     isCorrect,
        correct_idx: correctIdx,
        explanation,
        current_q:   nextQ,
        total:       TOTAL_QUESTIONS,
        complete:    false,
      });
    }

    // ── Assessment complete ───────────────────────────────────────────────
    const correctCount = newAnswers.filter(
      (a, i) => a === questions[i].correct_idx,
    ).length;
    const pctScore = Math.round((correctCount / TOTAL_QUESTIONS) * 100);
    const passed   = pctScore >= PASS_THRESHOLD;

    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single();
    const studentName = profile?.full_name ?? 'Student';

    let certId: string | null = null;
    let certificate            = null;

    if (passed) {
      // Issue certificate with share-code collision retry (up to 3 attempts)
      let attempts = 0;
      let certErr: { code?: string; message: string } | null = null;
      while (attempts < 3 && !certificate) {
        const { data: cert, error: err } = await supabase
          .from('novo_certifications')
          .insert({
            user_id:         user.id,
            subject:         assessment.subject,
            topic:           assessment.topic,
            student_name:    studentName,
            score:           correctCount,
            questions_total: TOTAL_QUESTIONS,
            pct_score:       pctScore,
            // share_code default (substring(replace(gen_random_uuid(),'−',''),1,16)) is set by DB
          })
          .select('*')
          .single();

        if (!err) {
          certificate = cert;
          certId      = cert.id;
        } else if (err.code === '23505') {
          // Unique violation on share_code — extremely rare; retry generates a new default
          attempts++;
          certErr = err;
        } else {
          // Unrelated error — stop retrying
          certErr = err;
          break;
        }
      }

      if (!certificate) {
        // Certificate insert failed after retries — log and continue gracefully
        console.error('Certificate insert failed:', certErr?.message);
      } else {
        // Save milestone memory
        await supabase.from('novo_memories').insert({
          user_id:     user.id,
          memory_type: 'milestone',
          content:     `Earned Novo Certification in "${assessment.topic}" (${assessment.subject}) with ${pctScore}% score`,
          subject:     assessment.subject,
          topic:       assessment.topic,
          importance:  9,
          source:      'system',
        }).catch(e => console.error('[novo-certifications] milestone memory insert failed:', e?.message));

        // Award XP (non-fatal)
        const xpGain = 100 + Math.round((pctScore - PASS_THRESHOLD) * 2);
        await supabase.rpc('increment_xp', { user_id: user.id, amount: xpGain }).catch(e =>
          console.error('[novo-certifications] increment_xp failed:', e?.message)
        );
      }
    } else {
      // Save struggle memory (non-fatal)
      await supabase.from('novo_memories').insert({
        user_id:     user.id,
        memory_type: 'struggle',
        content:     `Did not pass certification assessment for "${assessment.topic}" in ${assessment.subject} (scored ${pctScore}%)`,
        subject:     assessment.subject,
        topic:       assessment.topic,
        importance:  7,
        source:      'system',
      }).catch(e => console.error('[novo-certifications] struggle memory insert failed:', e?.message));
    }

    // Mark assessment as complete
    await supabase.from('certification_assessments').update({
      answers:      newAnswers,
      current_q:    TOTAL_QUESTIONS,
      status:       passed ? 'passed' : 'failed',
      score:        correctCount,
      pct_score:    pctScore,
      cert_id:      certId,
      completed_at: new Date().toISOString(),
    }).eq('id', assessment_id);

    // Full question reveal (including correct answers) only after assessment ends
    return json({
      correct:       isCorrect,
      correct_idx:   correctIdx,
      explanation,
      current_q:     TOTAL_QUESTIONS,
      total:         TOTAL_QUESTIONS,
      complete:      true,
      passed,
      score:         correctCount,
      pct_score:     pctScore,
      certificate,
      all_questions: questions,   // full reveal — safe because assessment is complete
      all_answers:   newAnswers,
    });
  }

  // ── get_certificates ──────────────────────────────────────────────────────
  if (action === 'get_certificates') {
    const { data: certs } = await supabase
      .from('novo_certifications')
      .select('*')
      .eq('user_id', user.id)
      .order('issued_at', { ascending: false });
    return json({ certificates: certs ?? [] });
  }

  // ── get_certificate ───────────────────────────────────────────────────────
  if (action === 'get_certificate') {
    const { cert_id, share_code } = body;
    if (!cert_id && !share_code) return json({ error: 'cert_id or share_code required' }, 400);

    // deno-lint-ignore no-explicit-any
    let query: any = supabase.from('novo_certifications').select('*');
    if (cert_id)   query = query.eq('id', cert_id);
    else           query = query.eq('share_code', share_code);

    const { data: cert } = await query.maybeSingle();
    if (!cert) return json({ error: 'Certificate not found' }, 404);
    return json({ certificate: cert });
  }

  return json({ error: 'Unknown action' }, 400);
}));
