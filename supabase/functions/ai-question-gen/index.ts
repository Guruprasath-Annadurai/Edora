// ═══════════════════════════════════════════════════════════════
// Edora — AI Question Generator Edge Function
// Generates novel MCQs using Claude, calibrated to IRT ability score
// Deploy: supabase functions deploy ai-question-gen
// ═══════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';

const LANG_INSTRUCTIONS: Record<string, string> = {
  hi: 'Respond with all explanations and conversational text in Hindi (हिन्दी). Keep technical terms, formulas, and subject names in English.',
  ta: 'Respond with all explanations in Tamil (தமிழ்). Keep technical terms in English.',
  te: 'Respond with all explanations in Telugu (తెలుగు). Keep technical terms in English.',
  kn: 'Respond with all explanations in Kannada (ಕನ್ನಡ). Keep technical terms in English.',
  mr: 'Respond with all explanations in Marathi (मराठी). Keep technical terms in English.',
  bn: 'Respond with all explanations in Bengali (বাংলা). Keep technical terms in English.',
};

interface RequestBody {
  subject: string;
  chapter?: string;
  count?: number;
  ability_score?: number;   // IRT theta: -2 to +2
  language?: string;
  class_num?: number;
}

interface GeneratedQuestion {
  subject: string;
  chapter: string;
  concept: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: string;
  // AI safety fields — added by verification pass
  confidence?: number;         // 0–1: how confident the model is in the answer
  verify_in_textbook?: boolean; // true → student should double-check against NCERT
  ncert_reference?: string;     // e.g. "Class 12 Physics, Chapter 3 — Current Electricity"
  flags?: string[];             // internal: 'ambiguous_options' | 'multiple_correct' | 'calculation_error_risk'
}

serve(withSentry('ai-question-gen', async (req) => {
  const CORS = getCors(req);
  const jsonResp = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth ─────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const serviceDb = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResp({ error: 'Unauthorized' }, 401);

    // ── Rate limit: 20 AI-gen calls/hour ─────────────────────────
    const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: rlCount } = await serviceDb
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('endpoint', 'ai-question-gen')
      .gte('created_at', windowStart);
    if ((rlCount ?? 0) >= 20) return jsonResp({ error: 'Rate limit exceeded. Try again in an hour.' }, 429);
    serviceDb.from('api_rate_limits')
      .insert({ user_id: user.id, endpoint: 'ai-question-gen' })
      .then(() => {}).catch(() => {});

    // ── Parse request ─────────────────────────────────────────────
    const body: RequestBody = await req.json();
    const {
      subject  = 'Physics',
      chapter  = '',
      count    = 10,
      ability_score = 0,
      language = 'en',
      class_num,
    } = body;

    const safeCount = Math.min(Math.max(1, count), 20);

    // Map ability score to difficulty
    const difficulty = ability_score > 0.5 ? 'hard' : ability_score < -0.5 ? 'easy' : 'medium';
    const diffDesc = {
      hard:   'challenging (JEE/NEET advanced level), requiring deep conceptual understanding and multi-step reasoning',
      medium: 'moderate (application-level), requiring understanding of principles not just memorization',
      easy:   'foundational (basic recall and simple application), suitable for concept building',
    }[difficulty];

    const langInstr = LANG_INSTRUCTIONS[language] ?? '';
    const classCtx = class_num ? `Class ${class_num} ` : '';
    const chapterCtx = chapter ? `on the topic "${chapter}"` : 'covering diverse topics across the full syllabus';

    const systemPrompt = `You are an expert Indian educational content creator specializing in ${classCtx}${subject} for competitive exams (JEE, NEET, CBSE).
Your task: generate ${safeCount} original, high-quality MCQ questions.
${langInstr}`;

    const userPrompt = `Generate ${safeCount} ${difficulty} ${subject} MCQ questions ${chapterCtx}.

Requirements:
- Questions must be ORIGINAL — not copied from any textbook or previous year paper
- Each question should test ${diffDesc}
- Every question must have exactly 4 options (A, B, C, D)
- Only ONE option is clearly correct and unambiguous
- Explanation must be clear, educational, and step-by-step where calculation is involved
- Cover different sub-topics; avoid repetition
- For each question, assess your own confidence in the correctness of the answer (0.0–1.0)
- Flag any question where a student should verify the answer against their NCERT textbook (e.g. exact values, formulas, exceptions)

Return ONLY a valid JSON array with NO markdown or preamble:
[
  {
    "subject": "${subject}",
    "chapter": "specific NCERT chapter name",
    "concept": "specific concept being tested",
    "question": "complete question text",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_idx": 0,
    "explanation": "clear step-by-step explanation of why this is correct",
    "difficulty": "${difficulty}",
    "confidence": 0.95,
    "verify_in_textbook": false,
    "ncert_reference": "${classCtx}${subject}, Chapter — <chapter name>",
    "flags": []
  }
]

Confidence guide: 1.0 = definitively correct from first principles; 0.8–0.99 = high confidence; 0.6–0.79 = moderate, student should verify; <0.6 = set verify_in_textbook=true.
Flags: use "ambiguous_options" if two options could both be argued correct, "calculation_error_risk" for numerical questions where a slip in calculation changes the answer, "ncert_exception" for edge cases not in standard NCERT.`;

    // ── Call Groq ─────────────────────────────────────────────────
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) return jsonResp({ error: 'GROQ_API_KEY not configured' }, 500);

    const groqResp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!groqResp.ok) {
      const errText = await groqResp.text();
      console.error('[ai-question-gen] Groq error:', errText);
      return jsonResp({ error: 'AI generation failed' }, 502);
    }

    const groqData = await groqResp.json();
    const rawText = groqData.choices?.[0]?.message?.content ?? '';

    // Parse JSON from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[ai-question-gen] No JSON array in Claude response');
      return jsonResp({ error: 'Failed to parse questions' }, 500);
    }

    let questions: GeneratedQuestion[];
    try {
      questions = JSON.parse(jsonMatch[0]);
    } catch {
      return jsonResp({ error: 'Invalid JSON from AI' }, 500);
    }

    // ── Safety validation ──────────────────────────────────────────
    questions = questions.filter(q =>
      q.question && Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correct_idx === 'number' && q.correct_idx >= 0 && q.correct_idx <= 3 &&
      q.explanation && q.options.every((o: string) => typeof o === 'string' && o.trim().length > 0)
    );

    // Normalise confidence and auto-flag low-confidence questions
    questions = questions.map(q => {
      const conf = typeof q.confidence === 'number' ? Math.min(1, Math.max(0, q.confidence)) : 0.85;
      const flags: string[] = Array.isArray(q.flags) ? q.flags : [];
      const verify = q.verify_in_textbook === true || conf < 0.7;
      // Auto-add flag for borderline confidence
      if (conf < 0.7 && !flags.includes('low_confidence')) flags.push('low_confidence');
      return { ...q, confidence: conf, verify_in_textbook: verify, flags };
    });

    // Drop questions the model itself rated below 0.5 confidence — too risky for students
    const safeQuestions = questions.filter(q => (q.confidence ?? 1) >= 0.5);
    const droppedCount  = questions.length - safeQuestions.length;
    if (droppedCount > 0) {
      console.warn(`[ai-question-gen] Dropped ${droppedCount} question(s) with confidence < 0.5`);
    }

    // Persist to ai_questions table (best-effort)
    if (safeQuestions.length > 0) {
      serviceDb.from('ai_questions').insert(
        safeQuestions.map(q => ({
          subject:           q.subject || subject,
          chapter:           q.chapter || chapter || 'General',
          concept:           q.concept || 'General',
          class_num:         class_num ?? null,
          question:          q.question,
          options:           q.options,
          correct_idx:       q.correct_idx,
          explanation:       q.explanation,
          difficulty:        q.difficulty || difficulty,
          ability_target:    ability_score,
          language,
          generated_by:      GROQ_MODEL,
          confidence:        q.confidence ?? 0.85,
          verify_in_textbook: q.verify_in_textbook ?? false,
          ncert_reference:   q.ncert_reference ?? null,
          flags:             q.flags ?? [],
        }))
      ).then(() => {}).catch(e => console.error('[ai-question-gen] persist error:', e));
    }

    return jsonResp({
      questions: safeQuestions,
      count: safeQuestions.length,
      difficulty,
      ability_score,
      safety_stats: {
        generated: questions.length + droppedCount,
        dropped_low_confidence: droppedCount,
        flagged_verify: safeQuestions.filter(q => q.verify_in_textbook).length,
      },
    });

  } catch (err) {
    console.error('[ai-question-gen] unexpected error:', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
}));
