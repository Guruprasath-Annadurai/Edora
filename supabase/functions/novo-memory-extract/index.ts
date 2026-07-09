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

    const prompt = EXTRACT_PROMPT
      .replace('{USER_MSG}', userMessage.slice(0, 500))
      .replace('{ASSISTANT_MSG}', assistantResponse.slice(0, 800));

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
      }),
    });

    if (!geminiRes.ok) {
      return new Response(JSON.stringify({ extracted: 0, error: 'gemini_failed' }), {
        status: 200,
        headers: { ...getCors(req), 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

    let memories: ExtractedMemory[] = [];
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      memories = JSON.parse(cleaned);
      if (!Array.isArray(memories)) memories = [];
    } catch {
      memories = [];
    }

    const VALID_TYPES = new Set([
      'learning_pattern', 'academic_goal', 'personal_fact',
      'emotion', 'achievement', 'fact',
    ]);

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
