// ═══════════════════════════════════════════════════════════════
// Edora — AI Question Generator Edge Function
// Generates novel MCQs using Claude, calibrated to IRT ability score
// Deploy: supabase functions deploy ai-question-gen
// ═══════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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
- Only ONE option is clearly correct
- Explanation must be clear, educational, and help the student understand WHY the answer is correct
- Cover different sub-topics; avoid repetition

Return ONLY a valid JSON array with NO markdown or preamble:
[
  {
    "subject": "${subject}",
    "chapter": "specific chapter name",
    "concept": "specific concept being tested",
    "question": "complete question text",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correct_idx": 0,
    "explanation": "clear explanation of why this is correct and the concept behind it",
    "difficulty": "${difficulty}"
  }
]`;

    // ── Call Claude ────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return jsonResp({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    const claudeResp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error('[ai-question-gen] Claude error:', errText);
      return jsonResp({ error: 'AI generation failed' }, 502);
    }

    const claudeData = await claudeResp.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

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

    // Validate structure
    questions = questions.filter(q =>
      q.question && Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correct_idx === 'number' && q.explanation
    );

    // Persist to ai_questions table (best-effort)
    if (questions.length > 0) {
      serviceDb.from('ai_questions').insert(
        questions.map(q => ({
          subject: q.subject || subject,
          chapter: q.chapter || chapter || 'General',
          concept: q.concept || 'General',
          class_num: class_num ?? null,
          question: q.question,
          options: q.options,
          correct_idx: q.correct_idx,
          explanation: q.explanation,
          difficulty: q.difficulty || difficulty,
          ability_target: ability_score,
          language,
          generated_by: 'claude-sonnet-4-6',
        }))
      ).then(() => {}).catch(e => console.error('[ai-question-gen] persist error:', e));
    }

    return jsonResp({ questions, count: questions.length, difficulty, ability_score });

  } catch (err) {
    console.error('[ai-question-gen] unexpected error:', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
}));
