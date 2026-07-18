// ─────────────────────────────────────────────────────────────────────────────
// debate-mode — Novo takes a position, student argues against it
// Actions: get_topics | create_session | send_message | end_debate | get_session
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSONOnce<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nReturn valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

// Single-attempt generation previously meant any parse hiccup or missing
// field crashed straight through end_debate/get_topics with no retry — most
// visible right when a student finishes a debate and expects their score.
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

// ── Curated debate topics per subject ────────────────────────────────────────
const TOPIC_BANK: Record<string, Array<{ topic: string; novo_position: string; user_position: string }>> = {
  Mathematics: [
    { topic: 'Is mathematics discovered or invented?', novo_position: 'Mathematics is invented by humans — it is a useful fiction we created to model reality.', user_position: 'Mathematics is discovered — mathematical truths exist independently of humans.' },
    { topic: 'Should calculators be allowed in all maths exams?', novo_position: 'Calculators should be banned from all maths exams to test genuine understanding.', user_position: 'Calculators should be freely allowed — real-world maths uses them.' },
    { topic: 'Is infinity a real concept or just a useful abstraction?', novo_position: 'Infinity is purely a useful abstraction — it does not correspond to anything real.', user_position: 'Infinity is a genuine mathematical reality, not just an abstraction.' },
  ],
  Physics: [
    { topic: 'Is string theory a genuine scientific theory?', novo_position: 'String theory is not science — it makes no testable predictions and is closer to philosophy.', user_position: 'String theory is legitimate science — untestability now does not mean it will remain so.' },
    { topic: 'Will we ever achieve faster-than-light travel?', novo_position: 'Faster-than-light travel is physically impossible and will never be achieved.', user_position: 'Faster-than-light travel may be theoretically achievable through exotic physics.' },
    { topic: 'Is quantum mechanics truly random or deterministic?', novo_position: 'Quantum mechanics is fundamentally deterministic — what looks random is just hidden variables.', user_position: 'Quantum mechanics proves fundamental randomness exists in nature.' },
  ],
  Chemistry: [
    { topic: 'Should all synthetic food additives be banned?', novo_position: 'All synthetic food additives should be banned as they are unnatural and potentially harmful.', user_position: 'Synthetic food additives are safe, well-regulated, and essential for food security.' },
    { topic: 'Are nuclear power plants safe enough for widespread use?', novo_position: 'Nuclear power plants are too dangerous and the risks outweigh the benefits.', user_position: 'Nuclear power is one of the safest and cleanest energy sources available.' },
  ],
  Biology: [
    { topic: 'Should human genetic engineering for disease prevention be allowed?', novo_position: 'Human genetic engineering should be strictly banned — the risks are too great.', user_position: 'Genetic engineering to prevent serious diseases is ethical and should be permitted.' },
    { topic: 'Is evolution "just a theory"?', novo_position: 'Evolution is just one scientific theory among others and should not be taught as certain fact.', user_position: 'Evolution is as well-established as any scientific fact and the "just a theory" objection is a misunderstanding.' },
    { topic: 'Should animal testing in medical research be abolished?', novo_position: 'Animal testing should be completely abolished — it is unethical and alternatives exist.', user_position: 'Animal testing remains a necessary part of safe medical research and saves human lives.' },
  ],
  History: [
    { topic: 'Did colonialism have any positive long-term effects?', novo_position: 'Colonialism had some positive long-term effects, including infrastructure and institutions.', user_position: 'Colonialism had no genuine positive effects — all supposed benefits came with devastating costs.' },
    { topic: 'Was the dropping of atomic bombs on Japan justified?', novo_position: 'The atomic bombings of Japan were morally justified as they ended the war and saved lives.', user_position: 'The atomic bombings were a war crime that cannot be morally justified.' },
    { topic: 'Should controversial historical statues be removed?', novo_position: 'Controversial statues glorifying oppressors should be removed from public spaces.', user_position: 'Historical statues should be kept with context — removing them erases history.' },
  ],
  English: [
    { topic: 'Does social media damage written language?', novo_position: 'Social media is permanently damaging written language by normalising poor grammar and spelling.', user_position: 'Social media is simply evolving language — it is not damage, it is change.' },
    { topic: 'Should Shakespeare still be mandatory in school?', novo_position: 'Shakespeare should no longer be mandatory — his work is outdated and inaccessible.', user_position: 'Shakespeare should remain mandatory — his themes are universal and his language enriching.' },
  ],
};

serve(withSentry('debate-mode', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const rl = await checkRateLimit(supabase, user.id, `debate_mode_${action}`, 25, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_topics ────────────────────────────────────────────────────────────
  if (action === 'get_topics') {
    const { subject } = body;
    const topics = TOPIC_BANK[subject] ?? TOPIC_BANK['History'];
    // Also generate 1 fresh topic via AI for variety
    interface FreshTopic { topic: string; novo_position: string; user_position: string; }
    const fresh = await geminiJSON<FreshTopic>(`
Generate ONE compelling debate topic for a student studying ${subject || 'any subject'}.
Novo will argue one position and the student must argue the opposite.

Return JSON:
{
  "topic": "The debate topic as a question or statement",
  "novo_position": "Novo's argument position (1-2 sentences)",
  "user_position": "The student's opposite position (1-2 sentences)"
}`).catch(() => null);

    const allTopics = fresh ? [...topics, { ...fresh, fresh: true }] : topics;
    return json({ topics: allTopics });
  }

  // ── create_session ────────────────────────────────────────────────────────
  if (action === 'create_session') {
    const { topic, subject, novo_position, user_position } = body;

    // Generate Novo's opening argument
    const opening = await gemini(`
You are Novo, an AI tutor engaging in an academic debate.

Your assigned position: "${novo_position}"
Topic: "${topic}"

Make your opening argument. Be intellectual, confident, and use specific evidence/examples.
Keep it to 3-4 paragraphs. End with a direct question or challenge to the student.
Do NOT be dismissive — you are a fair academic opponent.`);

    const messages = [
      { role: 'novo', content: opening, timestamp: new Date().toISOString() }
    ];

    const { data: session } = await supabase
      .from('debate_sessions')
      .insert({
        user_id: user.id,
        subject: subject || null,
        topic,
        novo_position,
        user_position,
        messages,
        turn_count: 1,
      })
      .select('*')
      .single();

    return json({ session });
  }

  // ── send_message ──────────────────────────────────────────────────────────
  if (action === 'send_message') {
    const { session_id, message } = body;

    const { data: session } = await supabase
      .from('debate_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    if (!session) return json({ error: 'Session not found' }, 404);
    if (session.status !== 'active') return json({ error: 'Debate already ended' }, 400);

    const messages = session.messages as Array<{ role: string; content: string }>;
    messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() } as any);

    // Build conversation history for context
    const historyText = messages.map(m =>
      `${m.role === 'novo' ? 'NOVO' : 'STUDENT'}: ${m.content}`
    ).join('\n\n---\n\n');

    // Novo's rebuttal
    const rebuttal = await gemini(`
You are Novo, an AI tutor in an academic debate.

Topic: "${session.topic}"
Your position: "${session.novo_position}"
Student's position: "${session.user_position}"

Debate history so far:
${historyText}

Now write your rebuttal to the student's latest argument.
Rules:
- Identify 1-2 specific logical gaps or weak points in their argument
- Counter with concrete evidence or reasoning
- Maintain intellectual respect — never mock, always engage seriously
- Push back hard on weak claims, acknowledge genuinely good points
- Ask a sharp follow-up question that forces them to defend their position
- 2-3 paragraphs maximum`);

    messages.push({ role: 'novo', content: rebuttal, timestamp: new Date().toISOString() } as any);
    const turn_count = session.turn_count + 2;

    await supabase
      .from('debate_sessions')
      .update({ messages, turn_count })
      .eq('id', session_id);

    return json({ reply: rebuttal, turn_count });
  }

  // ── end_debate ────────────────────────────────────────────────────────────
  if (action === 'end_debate') {
    const { session_id } = body;

    const { data: session } = await supabase
      .from('debate_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    if (!session) return json({ error: 'Session not found' }, 404);

    const messages = session.messages as Array<{ role: string; content: string }>;
    const studentArguments = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n\n');

    interface DebateScore {
      score: number;
      breakdown: { clarity: number; evidence: number; logic: number; rebuttal: number };
      feedback: string;
      best_argument: string;
      missed_points: string;
    }
    const evaluation = await geminiJSON<DebateScore>(`
Evaluate this student's debate performance.

Topic: "${session.topic}"
Student's position: "${session.user_position}"
Novo's position: "${session.novo_position}"

Student's arguments across all turns:
${studentArguments}

Return JSON:
{
  "score": <0-100 overall debate score>,
  "breakdown": {
    "clarity": <0-25, how clearly they expressed ideas>,
    "evidence": <0-25, quality of evidence/examples used>,
    "logic": <0-25, logical structure and reasoning>,
    "rebuttal": <0-25, how well they addressed counterarguments>
  },
  "feedback": "3-4 sentences of specific, constructive feedback on their overall performance",
  "best_argument": "Quote or paraphrase their single strongest argument",
  "missed_points": "1-2 key points or evidence they could have used but missed"
}`, v => typeof v?.score === 'number' && !!v?.breakdown && !!v?.feedback);

    // XP for completing a debate
    const xp = Math.round(evaluation.score * 0.5) + 25; // 25-75 XP
    await supabase.rpc('increment_xp', { user_id: user.id, amount: xp });

    await supabase
      .from('debate_sessions')
      .update({
        status: 'completed',
        score: evaluation.score,
        score_breakdown: evaluation.breakdown,
        feedback: evaluation.feedback,
        completed_at: new Date().toISOString(),
      })
      .eq('id', session_id);

    return json({ ...evaluation, xp_earned: xp });
  }

  // ── get_session ───────────────────────────────────────────────────────────
  if (action === 'get_session') {
    const { session_id } = body;
    const { data: session } = await supabase
      .from('debate_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    return json({ session });
  }

  // ── list_sessions ─────────────────────────────────────────────────────────
  if (action === 'list_sessions') {
    const { data: sessions } = await supabase
      .from('debate_sessions')
      .select('id,topic,subject,score,status,turn_count,created_at,completed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return json({ sessions: sessions ?? [] });
  }

  return json({ error: 'Unknown action' }, 400);
}));
