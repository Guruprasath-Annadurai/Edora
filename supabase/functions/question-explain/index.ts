// question-explain — pre-baked deep explanation cache.
// First time any question is seen, Nemotron writes a genuinely deep,
// multi-step explanation ONCE; every subsequent student gets the cached
// version instantly. Falls back to Gemini on any Nemotron failure so a miss
// never blocks the user. Action: get_or_generate (any authenticated user)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
  );
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
      temperature: 0.4,
      max_tokens: 900,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? '';
}

async function generateDeepExplanation(prompt: string): Promise<{ text: string; model: string }> {
  try {
    const text = await nemotron(prompt);
    if (text.trim()) return { text, model: 'nemotron-3-ultra-550b' };
    throw new Error('empty response');
  } catch (e) {
    console.error('Nemotron explanation failed, falling back to Gemini:', e);
    return { text: await gemini(prompt), model: 'gemini-flash-latest' };
  }
}

serve(withSentry('question-explain', async (req) => {
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

  const body = await req.json().catch(() => ({}));
  const { action, question_text, options, correct_answer, subject, topic } = body;

  if (action !== 'get_or_generate') return json({ error: 'Unknown action' }, 400);
  if (!question_text || typeof question_text !== 'string') return json({ error: 'question_text is required' }, 400);

  const rl = await checkRateLimit(supabase, user.id, 'question_explain', 60, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const hash = await sha256Hex(question_text.trim());

  const { data: cached } = await supabase
    .from('question_explanations')
    .select('*')
    .eq('question_hash', hash)
    .maybeSingle();

  if (cached) {
    supabase.from('question_explanations')
      .update({ hit_count: cached.hit_count + 1, last_served_at: new Date().toISOString() })
      .eq('id', cached.id)
      .then(() => {});
    return json({ explanation: cached.deep_explanation, model_used: cached.model_used, cached: true });
  }

  const prompt = `You are Novo, an expert tutor. Write a genuinely deep, step-by-step explanation for this question — the kind that builds real understanding, not just states the answer.

Question: ${question_text}
${options ? `Options: ${JSON.stringify(options)}` : ''}
${correct_answer ? `Correct answer: ${correct_answer}` : ''}
Subject: ${subject ?? 'unknown'} / Topic: ${topic ?? 'unknown'}

Structure:
1. What concept is actually being tested (1-2 sentences)
2. Step-by-step reasoning to the answer — show the work, don't skip steps
3. Why the other options are wrong (if multiple-choice) — common misconceptions each one represents
4. One sentence on how to recognize this pattern in future questions

Write in plain, encouraging language for a student. No markdown headers, just clear paragraphs.`;

  const { text, model } = await generateDeepExplanation(prompt);

  const { data: saved, error: insertErr } = await supabase
    .from('question_explanations')
    .upsert({
      question_hash: hash,
      subject: subject ?? null,
      topic: topic ?? null,
      question_text: question_text.trim(),
      deep_explanation: text,
      model_used: model,
    }, { onConflict: 'question_hash' })
    .select('*')
    .single();

  if (insertErr) {
    return json({ explanation: text, model_used: model, cached: false });
  }

  return json({ explanation: saved.deep_explanation, model_used: saved.model_used, cached: false });
}));
