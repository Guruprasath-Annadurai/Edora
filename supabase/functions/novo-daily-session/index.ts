// ─────────────────────────────────────────────────────────────────────────────
// novo-daily-session — Curated 10-minute daily power session content generator
//
// Actions:
//   get_content   — returns { flashcards[3], pyq[2], concept_bite }
//                   Generates concept_of_day if not yet created today.
//   mark_done     — updates daily_power_sessions progress for the user
//   get_progress  — returns { progress(0-6), completed, xp_awarded }
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
async function geminiJSONOnce<T>(prompt: string): Promise<T> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: prompt + '\n\nReturn ONLY valid JSON. No markdown fences.' }] }] }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = raw.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(match?.[0] ?? '{}') as T;
}

// Zero retry meant a single bad response silently killed today's concept
// card (get_content already catches the failure and returns null, but that
// meant students frequently just never got one).
async function geminiJSON<T>(prompt: string, validateFn?: (v: T) => boolean, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await geminiJSONOnce<T>(prompt);
      if (validateFn && !validateFn(result)) throw new Error('Gemini response failed validation');
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to get valid JSON from Gemini');
}

// ── Generate today's concept card ─────────────────────────────────────────────
async function generateConceptOfDay(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, subject: string | null, weakTopic: string | null,
) {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already generated today
  const { data: existing } = await supabase
    .from('concept_of_day')
    .select('*')
    .eq('user_id', userId)
    .eq('concept_date', today)
    .single();
  if (existing) return existing;

  const topicHint = weakTopic
    ? `The student is currently weak at: ${weakTopic}. Pick a concept from that area.`
    : `Pick any important concept from ${subject ?? 'General Science'}.`;

  type ConceptCard = {
    concept: string; description: string; example: string;
    question: string; answer: string;
  };

  const card = await geminiJSON<ConceptCard>(`
Generate a daily concept card for an Indian student (JEE/NEET/Board level).
${topicHint}

Return JSON:
{
  "concept": "Name of the concept (≤5 words)",
  "description": "Clear 2-sentence explanation a student can absorb in 30 seconds",
  "example": "One vivid real-world example or worked micro-problem",
  "question": "One quick application question to test understanding",
  "answer": "The correct answer with brief reasoning (≤2 sentences)"
}
`, v => !!v?.concept && !!v?.description);

  const { data } = await supabase.from('concept_of_day').insert({
    user_id:     userId,
    concept_date: today,
    concept:     card.concept     ?? 'Today\'s Concept',
    subject:     subject,
    description: card.description ?? '',
    example:     card.example     ?? '',
    question:    card.question    ?? '',
    answer:      card.answer      ?? '',
  }).select().single();

  return data;
}

serve(withSentry('novo-daily-session', async (req) => {
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
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body   = await req.json().catch(() => ({}));
  const action = body.action ?? 'get_content';

  const rl = await checkRateLimit(supabase, user.id, `novo_daily_session_${action}`, 40, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
  const today  = new Date().toISOString().slice(0, 10);

  // ── get_progress ────────────────────────────────────────────────────────────
  if (action === 'get_progress') {
    const { data } = await supabase
      .from('daily_power_sessions')
      .select('flashcards_done, pyq_done, concept_done, xp_awarded, completed_at, busy_mode')
      .eq('user_id', user.id)
      .eq('session_date', today)
      .single();

    const progress = data
      ? (data.flashcards_done + data.pyq_done + (data.concept_done ? 1 : 0))
      : 0;
    return json({
      progress,
      max: 6,
      completed: !!data?.completed_at,
      xp_awarded: data?.xp_awarded ?? 0,
      busy_mode:  data?.busy_mode ?? false,
      details: data ?? null,
    });
  }

  // ── mark_done ───────────────────────────────────────────────────────────────
  if (action === 'mark_done') {
    const { item_type, value, busy_mode } = body;
    // item_type: 'flashcard' | 'pyq' | 'concept'
    const patch: Record<string, unknown> = { busy_mode: !!busy_mode };
    if (item_type === 'flashcard') patch.flashcards_done = Math.min(3, (body.current_fc ?? 0) + 1);
    if (item_type === 'pyq')       patch.pyq_done        = Math.min(2, (body.current_pyq ?? 0) + 1);
    if (item_type === 'concept')   patch.concept_done    = true;

    const { data: result } = await supabase.rpc('update_daily_session', {
      p_user_id:    user.id,
      p_flashcards: patch.flashcards_done ?? null,
      p_pyq:        patch.pyq_done        ?? null,
      p_concept:    patch.concept_done    ?? null,
      p_busy_mode:  !!busy_mode,
    });

    return json(result?.[0] ?? { progress: 0, completed: false, xp_earned: 0 });
  }

  // ── get_content ─────────────────────────────────────────────────────────────
  // 1. Profile (to know subject/exam context)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, stream, exam_name, explanation_style')
    .eq('id', user.id)
    .single();

  const subject = profile?.stream ?? null;

  // 2. Weakest topic (for concept card + PYQ targeting)
  const { data: topicStats } = await supabase
    .from('topic_stats')
    .select('topic, subject, struggle_count')
    .eq('user_id', user.id)
    .order('struggle_count', { ascending: false })
    .limit(3);
  const weakTopics = topicStats?.map((t: { topic: string }) => t.topic) ?? [];
  const primaryWeak = weakTopics[0] ?? null;

  // 3. Flashcards due for spaced-repetition review (up to 3)
  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('id, front, back, subject, topic')
    .eq('user_id', user.id)
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at', { ascending: true })
    .limit(3);

  // 4. PYQ questions targeting weak topics (up to 2)
  // deno-lint-ignore no-explicit-any
  let pyqQuery: any = supabase
    .from('questions')
    .select('id, question_text, options, correct_option, explanation, subject, topic, year, source')
    .eq('source', 'pyq')
    .limit(2);

  if (weakTopics.length > 0) {
    pyqQuery = pyqQuery.in('topic', weakTopics);
  } else if (subject) {
    pyqQuery = pyqQuery.ilike('subject', `%${subject}%`);
  }
  pyqQuery = pyqQuery.order('created_at', { ascending: false });
  const { data: pyqQuestions } = await pyqQuery;

  // 5. Concept of Day (generate if needed)
  const conceptCard = await generateConceptOfDay(supabase, user.id, subject, primaryWeak).catch(() => null);

  // 6. Today's progress
  const { data: sessionData } = await supabase
    .from('daily_power_sessions')
    .select('flashcards_done, pyq_done, concept_done, xp_awarded, completed_at, busy_mode')
    .eq('user_id', user.id)
    .eq('session_date', today)
    .single();

  const progress = sessionData
    ? (sessionData.flashcards_done + sessionData.pyq_done + (sessionData.concept_done ? 1 : 0))
    : 0;

  return json({
    flashcards:   flashcards ?? [],
    pyq:          pyqQuestions ?? [],
    concept_bite: conceptCard,
    progress,
    max: 6,
    completed: !!sessionData?.completed_at,
    xp_awarded: sessionData?.xp_awarded ?? 0,
    session: sessionData ?? null,
  });
}));
