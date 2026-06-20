// ─────────────────────────────────────────────────────────────────────────────
// boss-fight — Generates 10 MCQ questions for a chapter boss fight
// Each question has: question, 4 options, correctIndex, explanation, taunt
// The boss's personality flavours the taunt text.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
      }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const raw   = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown, no code blocks.');
      const match = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON found');
      return JSON.parse(match[0]) as T;
    } catch (e) {
      lastErr = e;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastErr;
}

// Rate limit: 30 boss fights per hour
// deno-lint-ignore no-explicit-any
async function checkRateLimit(supabase: any, userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase.from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('endpoint', 'boss-fight')
    .gte('created_at', windowStart);
  if ((count ?? 0) >= 30) return false;
  supabase.from('api_rate_limits').insert({ user_id: userId, endpoint: 'boss-fight' }).then(() => {});
  return true;
}

const TAUNT_STYLE: Record<string, string> = {
  smug:    'condescending and mocking — "Pathetic.", "Is that all?", "I expected better."',
  cold:    'cold and clinical — "Incorrect.", "Insufficient.", "Suboptimal."',
  pompous: 'pompous and dramatic — "Outrageous!", "How dare you!", "Preposterous!"',
  eerie:   'unsettling and mysterious — "Curious...", "You cannot see what I see.", "The answer eludes you."',
};

serve(withSentry('boss-fight', async (req) => {
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

  const allowed = await checkRateLimit(supabase, user.id);
  if (!allowed) return json({ error: 'Rate limit exceeded — 30 boss fights per hour.' }, 429);

  const body = await req.json().catch(() => ({}));
  const { subject, chapter, bossName, bossPersonality = 'smug' } = body;

  if (!subject || !chapter) return json({ error: 'subject and chapter required' }, 400);

  const tauntStyle = TAUNT_STYLE[bossPersonality] ?? TAUNT_STYLE.smug;

  type Question = {
    question:     string;
    options:      string[];
    correctIndex: number;
    explanation:  string;
    taunt:        string;
  };

  let questions: Question[];
  try {
    questions = await geminiJSON<Question[]>(`
You are ${bossName}, a villainous AI boss in a study game. A student is battling you by answering questions on ${subject} — ${chapter}.

Generate EXACTLY 10 MCQ questions. Mix difficulty: 3 easy, 4 medium, 3 hard.
Each question should test a different concept within ${chapter}.

For each question, also write a short taunt the boss says when the student gets it WRONG.
Taunt style: ${tauntStyle}. Keep taunts under 12 words.

Return a JSON ARRAY (not object) of 10 questions:
[
  {
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correctIndex": 0,
    "explanation": "Brief explanation (1-2 sentences) of why the answer is correct. Include the key formula/concept.",
    "taunt": "Short boss taunt for wrong answer"
  }
]

Rules:
- Options must start with A. B. C. D. prefixes
- correctIndex is 0-3 (index of correct option in the array)
- Explanations must be factually accurate — this is for JEE/NEET students
- No repeated concepts across questions
`);
  } catch {
    return json({ error: 'Failed to generate questions. Please try again.' }, 500);
  }

  // Validate structure
  const valid = questions
    .filter(q =>
      typeof q.question === 'string' &&
      Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4 &&
      typeof q.explanation === 'string'
    )
    .slice(0, 10);

  if (valid.length < 5) return json({ error: 'Could not generate enough valid questions. Try a more specific chapter name.' }, 500);

  return json({ questions: valid, boss: { name: bossName, personality: bossPersonality } });
}));
