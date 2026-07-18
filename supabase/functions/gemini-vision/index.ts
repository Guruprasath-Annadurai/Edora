// ═══════════════════════════════════════════════════════════════
// Edora — Gemini Vision Edge Function
// Multimodal: text + image → Gemini 1.5 Flash
//
// Actions:
//   analyze_image   — analyse an image with an optional prompt
//   solve_problem   — solve a handwritten/typed problem step-by-step
//   analyze_drawing — inspect a whiteboard/canvas for errors
//   read_text       — extract + interpret text from image
//   ocr_flashcard   — OCR a textbook page → structured flashcard JSON
//
// Security: API key server-side only, JWT auth required
// Rate limit: 20 vision calls / hour per user
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const VISION_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`;

// Gemini's free tier returns 429 under burst load well before any per-user
// limit here is hit. Retrying with backoff smooths over those transient
// rate-limit windows without touching the model or prompts — same answers,
// just resilient to momentary contention at higher concurrent user counts.
async function fetchGeminiWithRetry(body: unknown, maxRetries = 2): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok || (res.status !== 429 && res.status !== 503)) return res;
    lastRes = res;
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 400 * Math.pow(3, attempt)));
    }
  }
  return lastRes!;
}

// ── Per-user rate limit: 20 vision calls / hour ───────────────────────────────
async function checkRateLimit(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await serviceDb
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', 'gemini:vision')
    .gte('created_at', windowStart);

  if ((count ?? 0) >= 20) return { allowed: false };
  serviceDb.from('api_rate_limits')
    .insert({ user_id: userId, endpoint: 'gemini:vision' })
    .then(() => {}).catch(() => {});
  return { allowed: true };
}

// ── Call Gemini with image + optional text ────────────────────────────────────
async function callGeminiVision(
  imageBase64:  string,
  mimeType:     string,
  textPrompt:   string,
  systemPrompt: string,
): Promise<string> {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: textPrompt },
      ],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };

  const res = await fetchGeminiWithRetry(body);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Vision error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── JSON variant ──────────────────────────────────────────────────────────────
async function callGeminiVisionJSONOnce<T>(
  imageBase64:  string,
  mimeType:     string,
  textPrompt:   string,
  systemPrompt: string,
): Promise<T> {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: textPrompt },
      ],
    }],
    generationConfig: {
      temperature:      0.2,
      maxOutputTokens:  2048,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetchGeminiWithRetry(body);

  if (!res.ok) throw new Error(`Gemini Vision JSON error ${res.status}`);
  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(raw) as T;
}

// fetchGeminiWithRetry only retries HTTP-level 429/503 — a 200 response with
// malformed/truncated JSON threw straight out of JSON.parse with nothing
// catching it, surfacing as an uncaught 500 for every scan/OCR action below.
// Retry the whole generate+parse cycle, same pattern as src/lib/gemini.ts.
async function callGeminiVisionJSON<T>(
  imageBase64:  string,
  mimeType:     string,
  textPrompt:   string,
  systemPrompt: string,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callGeminiVisionJSONOnce<T>(imageBase64, mimeType, textPrompt, systemPrompt);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to get valid JSON from Gemini Vision');
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
Deno.serve(withSentry('gemini-vision', async (req) => {
  const CORS = getCors(req);
  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth ─────────────────────────────────────────────────────────────────
  const auth = req.headers.get('Authorization');
  if (!auth) return jsonRes({ error: 'Missing authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const serviceDb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonRes({ error: 'Unauthorized' }, 401);

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rl = await checkRateLimit(serviceDb, user.id);
  if (!rl.allowed) {
    return jsonRes({
      error: 'rate_limit',
      message: 'You have reached the hourly image analysis limit (20 requests). Please wait and try again.',
      retry_after_secs: 3600,
    }, 429);
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) {}

  const {
    action    = 'analyze_image',
    image_base64,
    mime_type = 'image/jpeg',
    prompt    = '',
    subject   = '',
  } = body as Record<string, string>;

  if (!image_base64) return jsonRes({ error: 'image_base64 is required' }, 400);

  // ── analyze_image (generic) ───────────────────────────────────────────────
  if (action === 'analyze_image') {
    const system = `You are Novo, an expert AI tutor. The student has shared an image.
Analyse it clearly and helpfully. If it contains academic content, explain it.
Be concise (max 6 sentences), use plain language, no markdown headers.`;

    const text     = prompt || 'What do you see in this image? Explain it in educational terms.';
    const response = await callGeminiVision(image_base64, mime_type, text, system);
    return jsonRes({ response, action });
  }

  // ── solve_problem ─────────────────────────────────────────────────────────
  if (action === 'solve_problem') {
    interface SolveResult {
      problem_statement: string;
      subject_detected:  string;
      steps: Array<{ step_num: number; text: string; explanation: string }>;
      final_answer:    string;
      concept_summary: string;
      common_mistakes: string[];
    }

    const system = `You are Novo, an expert tutor specialising in academic problem solving.
The student has photographed a problem they need help with.
Extract the problem from the image and solve it step-by-step with clear explanations.`;

    const text = `${subject ? `Subject context: ${subject}. ` : ''}
Solve the problem shown in this image. Return ONLY valid JSON:
{
  "problem_statement": "What the problem asks",
  "subject_detected": "Mathematics / Physics / Chemistry / etc",
  "steps": [
    {"step_num": 1, "text": "First, ...", "explanation": "Because..."},
    {"step_num": 2, "text": "Then, ...", "explanation": "This works because..."}
  ],
  "final_answer": "The answer is ...",
  "concept_summary": "This problem tests your understanding of ...",
  "common_mistakes": ["Mistake students commonly make 1", "Mistake 2"]
}`;

    const result = await callGeminiVisionJSON<SolveResult>(image_base64, mime_type, text, system);
    return jsonRes({ result, action });
  }

  // ── analyze_drawing (Whiteboard) ──────────────────────────────────────────
  if (action === 'analyze_drawing') {
    interface DrawingAnalysis {
      content_type:  string;
      description:   string;
      errors_found:  boolean;
      errors: Array<{ location: string; error: string; correction: string }>;
      correct_parts: string;
      explanation:   string;
      next_steps:    string;
    }

    const system = `You are Novo, an expert AI tutor reviewing a student's whiteboard/handwritten work.
Be encouraging but precise. If you spot errors, explain them clearly with the correct approach.
If the work is correct, affirm it and suggest what to tackle next.`;

    const text = `${prompt ? `Student's question: "${prompt}". ` : ''}
Analyse this whiteboard drawing or working. Return ONLY valid JSON:
{
  "content_type": "equation|diagram|graph|working|mixed",
  "description": "What the student has drawn/written",
  "errors_found": true,
  "errors": [
    {"location": "Line 2 / second term", "error": "What is wrong", "correction": "The correct way"}
  ],
  "correct_parts": "What the student got right",
  "explanation": "Clear explanation of the key concept being practised",
  "next_steps": "What the student should do next"
}`;

    const result = await callGeminiVisionJSON<DrawingAnalysis>(image_base64, mime_type, text, system);
    return jsonRes({ result, action });
  }

  // ── read_text (extract + annotate text from image) ────────────────────────
  if (action === 'read_text') {
    const system = `You are Novo, an expert AI tutor. Extract any text visible in this image and help the student understand it.`;

    const text = `Extract all text from this image and then:
1. Identify key terms or difficult concepts
2. Provide a brief explanation of what this content is about
Return as plain text (not JSON), in this format:
EXTRACTED TEXT:
[the text]

EXPLANATION:
[your explanation]`;

    const response = await callGeminiVision(image_base64, mime_type, text, system);
    return jsonRes({ response, action });
  }

  // ── ocr_flashcard (Scan to Flashcard mode) ────────────────────────────────
  if (action === 'ocr_flashcard') {
    interface FlashcardResult {
      front:   string;
      back:    string;
      subject: string;
      topic:   string;
      tags:    string[];
    }

    const system = `You are Novo, an expert AI tutor. The student has photographed a page from their textbook or notes.
Extract the key concept and produce a high-quality flashcard. Be concise and clear.
Front = the question/term. Back = the answer/definition/explanation.`;

    const text = `${subject ? `Subject context: ${subject}. ` : ''}
Look at this textbook/notes image and create one high-quality flashcard from the most important concept visible.
Return ONLY valid JSON:
{
  "front": "Question or term for the front of the card",
  "back": "Answer, definition, or explanation for the back",
  "subject": "Physics|Chemistry|Maths|Biology|etc",
  "topic": "Specific topic name, e.g. Newton's Laws",
  "tags": ["tag1", "tag2"]
}`;

    const result = await callGeminiVisionJSON<FlashcardResult>(image_base64, mime_type, text, system);
    return jsonRes({ result, action });
  }

  // ── evaluate_handwriting — Voice-to-Answer + Handwriting OCR ─────────────
  // Step-by-step evaluation of a student's handwritten solution.
  // Returns: what they got right, where they went wrong, corrected working.
  if (action === 'evaluate_handwriting') {
    interface HandwritingEval {
      question_detected:  string;
      student_answer:     string;
      is_correct:         boolean;
      score:              number; // 0-100
      correct_steps:      string[];
      errors:             Array<{ step: string; mistake: string; correction: string }>;
      final_verdict:      string;
      full_solution:      string;
      encouragement:      string;
    }

    const system = `You are Novo, an expert JEE/NEET tutor evaluating a student's handwritten solution.
Be precise about errors. Give credit for correct steps even if final answer is wrong.
Always show the complete correct solution so the student can compare.`;

    const text = `${subject ? `Subject: ${subject}. ` : ''}${prompt ? `Context: ${prompt}. ` : ''}
Evaluate this handwritten solution image. Return ONLY valid JSON:
{
  "question_detected": "What question/problem the student attempted",
  "student_answer": "What answer the student wrote",
  "is_correct": true,
  "score": 85,
  "correct_steps": ["Step 1 the student did correctly", "Step 2..."],
  "errors": [
    {
      "step": "Which step had the error",
      "mistake": "What the student did wrong",
      "correction": "The correct approach"
    }
  ],
  "final_verdict": "1-2 sentence overall verdict",
  "full_solution": "Complete correct solution (step by step, concise)",
  "encouragement": "1 sentence personalised encouragement based on what they attempted"
}`;

    const result = await callGeminiVisionJSON<HandwritingEval>(image_base64, mime_type, text, system);
    return jsonRes({ result, action });
  }

  // ── formula_scan — AR Formula Overlay ────────────────────────────────────
  // Detects all formulas/equations in image, returns structured data for
  // the Formula AR Overlay feature (AR-style overlay cards).
  if (action === 'formula_scan') {
    interface FormulaEntry {
      formula:     string;
      name:        string;
      subject:     string;
      explanation: string;
      variables:   Array<{ symbol: string; meaning: string }>;
      application: string;
    }
    interface FormulaScanResult {
      formulas: FormulaEntry[];
      summary:  string;
      topic:    string;
    }

    const system = `You are Novo, an expert JEE/NEET tutor. The student has photographed their study material.
Identify every mathematical formula, scientific equation, and notation visible.
For each formula give a clear explanation suitable for a competitive exam student.`;

    const text = `Scan this image for ALL formulas, equations, and scientific notation.
Return ONLY valid JSON:
{
  "formulas": [
    {
      "formula": "F = ma",
      "name": "Newton's Second Law of Motion",
      "subject": "Physics",
      "explanation": "Force equals mass times acceleration. Describes how a net force changes the motion of an object.",
      "variables": [
        {"symbol": "F", "meaning": "Net force (Newtons, N)"},
        {"symbol": "m", "meaning": "Mass (kilograms, kg)"},
        {"symbol": "a", "meaning": "Acceleration (m/s²)"}
      ],
      "application": "Use when calculating force, mass, or acceleration in mechanics problems."
    }
  ],
  "summary": "Brief description of what subject/topic this image covers",
  "topic": "Specific topic or chapter name (e.g. Newton's Laws, Electrostatics)"
}
Rules:
- Include ALL visible formulas, even simple ones like v = u + at
- subject must be one of: Physics, Chemistry, Mathematics, Biology, General
- If no formulas detected, return formulas as empty array []
- Do NOT hallucinate formulas that aren't in the image`;

    const result = await callGeminiVisionJSON<FormulaScanResult>(image_base64, mime_type, text, system);
    return jsonRes({ result, action });
  }

  return jsonRes({ error: `Unknown action: ${action}` }, 400);
}));
