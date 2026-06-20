// ═══════════════════════════════════════════════════════════════
// Edora — Study Pack Generator Edge Function
// Secure proxy: GEMINI_API_KEY stays server-side.
// Takes extracted PDF text → returns structured study pack JSON.
//
// Deploy:  supabase functions deploy study-pack-generator
// Secrets: supabase secrets set GEMINI_API_KEY=<key>  (already set)
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// gemini-1.5-flash with JSON mode for guaranteed structured output
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Max chars we send to Gemini — keeps latency predictable
const MAX_TEXT_CHARS = 12_000;
const REQUEST_TIMEOUT_MS = 45_000;

// ── Response schema for Gemini JSON mode ─────────────────────────────────────
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    flashcards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING' },
          back:  { type: 'STRING' },
        },
        required: ['front', 'back'],
      },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question:       { type: 'STRING' },
          options:        { type: 'ARRAY', items: { type: 'STRING' } },
          correct_answer: { type: 'INTEGER' },
          explanation:    { type: 'STRING' },
        },
        required: ['question', 'options', 'correct_answer', 'explanation'],
      },
    },
    key_terms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          term:       { type: 'STRING' },
          definition: { type: 'STRING' },
        },
        required: ['term', 'definition'],
      },
    },
  },
  required: ['summary', 'flashcards', 'quiz', 'key_terms'],
};

// ── Build the study-pack generation prompt ────────────────────────────────────
function buildPrompt(text: string, fileName: string): string {
  return `You are an expert educational content creator. A student has uploaded a document called "${fileName}".

Analyze the text carefully and generate a complete study pack with:
1. A clear, comprehensive summary (3–4 paragraphs covering all major topics)
2. Exactly 10 flashcards (the most important concepts as question→answer pairs)
3. Exactly 5 multiple-choice quiz questions (4 options each, correct_answer is 0-indexed)
4. Exactly 10 key terms with precise, student-friendly definitions

Make everything directly based on the provided text. Be specific, not generic.

TEXT TO ANALYZE:
---
${text}
---`;
}

serve(withSentry('study-pack-generator', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── 1. Authenticate ──────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Parse request ─────────────────────────────────────────
    const { text, fileName } = await req.json() as { text: string; fileName: string };

    if (!text || typeof text !== 'string' || text.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'text must be at least 100 characters' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Truncate to keep Gemini fast and within limits
    const truncated = text.slice(0, MAX_TEXT_CHARS);

    // ── 3. Call Gemini with JSON mode + schema ────────────────────
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const geminiBody = {
      contents: [
        { role: 'user', parts: [{ text: buildPrompt(truncated, fileName ?? 'document') }] },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let geminiRes: Response;
    try {
      geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Rate limit
    if (geminiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: 'rate_limit', message: 'Too many requests. Please wait a moment.' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({})) as { error?: { message?: string } };
      return new Response(
        JSON.stringify({ error: errBody?.error?.message ?? `Gemini HTTP ${geminiRes.status}` }),
        { status: geminiRes.status, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const data = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // JSON mode should return clean JSON, but defensively strip fences
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const pack = JSON.parse(cleaned) as {
      summary: string;
      flashcards: Array<{ front: string; back: string }>;
      quiz: Array<{ question: string; options: string[]; correct_answer: number; explanation: string }>;
      key_terms: Array<{ term: string; definition: string }>;
    };

    // Validate required fields exist
    if (!pack.summary || !Array.isArray(pack.flashcards) || !Array.isArray(pack.quiz) || !Array.isArray(pack.key_terms)) {
      throw new Error('Invalid study pack structure from Gemini');
    }

    return new Response(
      JSON.stringify({ pack }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('AbortError') || message.includes('abort');
    console.error('[study-pack-generator] error:', message);
    return new Response(
      JSON.stringify({ error: isTimeout ? 'timeout' : message }),
      { status: isTimeout ? 504 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
}));
