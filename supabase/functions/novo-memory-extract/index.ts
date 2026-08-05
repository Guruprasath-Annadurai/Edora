import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const EXTRACT_PROMPT = `You are a memory extraction system. Given a conversation turn, extract 0-3 important facts about the student worth remembering for future personalization.

Extract memories that are:
- Learning patterns (how they study, what they struggle with)
- Academic facts (exam date, target college, weak subjects)
- Personal facts (name preferences, background)
- Emotional patterns (what frustrates them, what motivates them)
- Achievements (milestones, breakthroughs)

Output ONLY valid JSON array. No markdown, no explanation.

Format:
[
  {
    "memory_type": "learning_pattern" | "academic_goal" | "personal_fact" | "emotion" | "achievement" | "fact",
    "content": "concise fact about the student",
    "subject": "Physics" | "Chemistry" | "Mathematics" | "Biology" | null,
    "topic": "specific topic if relevant" | null,
    "importance": 1-10
  }
]

If nothing worth remembering, output: []

Student message: {USER_MSG}
Assistant response: {ASSISTANT_MSG}`;

interface ExtractRequest {
  userId: string;
  userMessage: string;
  assistantResponse: string;
  subject?: string;
}

interface ExtractedMemory {
  memory_type: string;
  content: string;
  subject?: string | null;
  topic?: string | null;
  importance: number;
}

const VALID_TYPES = new Set([
  'learning_pattern', 'academic_goal', 'personal_fact',
  'emotion', 'achievement', 'fact',
]);

// Single attempt: throws on network failure, non-2xx, or unparseable/non-array
// JSON. An empty array `[]` is a valid "nothing worth remembering" result and
// is NOT an error — only a genuinely broken response throws.
async function extractMemoriesOnce(apiKey: string, prompt: string): Promise<ExtractedMemory[]> {
  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });
  if (!geminiRes.ok) throw new Error(`Gemini ${geminiRes.status}`);

  const geminiData = await geminiRes.json();
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const memories = JSON.parse(cleaned);
  if (!Array.isArray(memories)) throw new Error('Gemini response was not a JSON array');
  return memories;
}

// Network-level retry with exponential backoff.
async function extractMemoriesWithRetry(apiKey: string, prompt: string, maxRetries = 2): Promise<ExtractedMemory[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await extractMemoriesOnce(apiKey, prompt);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Outer semantic layer: a non-empty array where every item fails the
// memory_type/content shape check almost always means a garbled response
// (not a genuine "nothing to remember", which the model returns as `[]`) —
// re-run the whole generate cycle rather than silently dropping it.
async function extractMemories(apiKey: string, prompt: string): Promise<ExtractedMemory[]> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const candidate = await extractMemoriesWithRetry(apiKey, prompt);
      const anyValid = candidate.length === 0 || candidate.some((m) => m.content && VALID_TYPES.has(m.memory_type));
      if (anyValid) return candidate;
      lastErr = new Error('All extracted items failed shape validation');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to extract memories after ${MAX_ATTEMPTS} attempts`);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: getCors(req) });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiKey      = Deno.env.get('GEMINI_API_KEY')!;

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response('Unauthorized', { status: 401, headers: getCors(req) });

    const rl = await checkRateLimit(userClient, user.id, 'novo-memory-extract', 25, 60);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }), {
        status: 429,
        headers: { ...getCors(req), 'Content-Type': 'application/json' },
      });
    }

    const body: ExtractRequest = await req.json();
    const { userId, userMessage, assistantResponse, subject } = body;

    if (userId !== user.id) return new Response('Forbidden', { status: 403, headers: getCors(req) });
    if (!userMessage || !assistantResponse) {
      return new Response(JSON.stringify({ extracted: 0 }), {
        status: 200,
        headers: { ...getCors(req), 'Content-Type': 'application/json' },
      });
    }

    const serviceDb = createClient(supabaseUrl, serviceKey);

    // §13 (docs/enterprise-remediation-tracker.md): honor the user's memory
    // opt-out before spending an LLM call — checked here, not just in the UI,
    // so disabling memory actually stops new memories from being written.
    const { data: profileRow } = await serviceDb
      .from('profiles')
      .select('memory_opt_out')
      .eq('id', userId)
      .maybeSingle();
    if (profileRow?.memory_opt_out) {
      return new Response(JSON.stringify({ extracted: 0, skipped: 'memory_opt_out' }), {
        status: 200,
        headers: { ...getCors(req), 'Content-Type': 'application/json' },
      });
    }

    const prompt = EXTRACT_PROMPT
      .replace('{USER_MSG}', userMessage.slice(0, 500))
      .replace('{ASSISTANT_MSG}', assistantResponse.slice(0, 800));

    let memories: ExtractedMemory[] = [];
    try {
      memories = await extractMemories(apiKey, prompt);
    } catch (e) {
      console.error('novo-memory-extract: extraction failed after retries:', e);
      return new Response(JSON.stringify({ extracted: 0, error: 'gemini_failed' }), {
        status: 200,
        headers: { ...getCors(req), 'Content-Type': 'application/json' },
      });
    }

    const toInsert = memories
      .filter((m) => m.content && VALID_TYPES.has(m.memory_type))
      .slice(0, 3)
      .map((m) => ({
        user_id:     userId,
        memory_type: m.memory_type,
        content:     String(m.content).slice(0, 500),
        subject:     subject ?? m.subject ?? null,
        topic:       m.topic ?? null,
        importance:  Math.min(10, Math.max(1, Number(m.importance) || 5)),
        source:      'chat',
      }));

    let extracted = 0;
    if (toInsert.length > 0) {
      const { error: insertError } = await serviceDb.from('novo_memories').insert(toInsert);
      if (!insertError) extracted = toInsert.length;
    }

    return new Response(JSON.stringify({ extracted }), {
      status: 200,
      headers: { ...getCors(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('novo-memory-extract error:', err);
    return new Response(JSON.stringify({ extracted: 0, error: String(err) }), {
      status: 200,
      headers: { ...getCors(req), 'Content-Type': 'application/json' },
    });
  }
});
