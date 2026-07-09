// ═══════════════════════════════════════════════════════════════
// Edora — Cloud Vision OCR Edge Function
// Secure proxy: authenticated users only, API key never leaves server
// Deploy: supabase functions deploy ocr
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
serve(withSentry('ocr', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── 1. Authenticate the user ─────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — valid session required' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const rl = await checkRateLimit(supabase, user.id, 'ocr', 25, 60);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Parse request body ────────────────────────────────────
    const { image_base64, detection_type = 'DOCUMENT_TEXT_DETECTION' } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: 'image_base64 is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // ── 3. Call Cloud Vision API (key stored securely in env) ────
    const VISION_API_KEY = Deno.env.get('CLOUD_VISION_API_KEY');

    const visionRequest = {
      requests: [{
        image: { content: image_base64 },
        features: [{ type: detection_type, maxResults: 1 }],
        imageContext: {
          languageHints: ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'bn', 'gu', 'mr', 'pa'],
        },
      }],
    };

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visionRequest),
      }
    );

    if (!visionRes.ok) {
      const err = await visionRes.text();
      throw new Error(`Cloud Vision error: ${err}`);
    }

    const visionData = await visionRes.json();
    const response = visionData.responses?.[0];

    // ── 4. Extract text ──────────────────────────────────────────
    let fullText = response?.fullTextAnnotation?.text ?? '';
    const pages  = response?.fullTextAnnotation?.pages ?? [];
    const blocks = pages.flatMap((p: any) =>
      p.blocks?.map((b: any) => ({
        text: b.paragraphs
          ?.flatMap((para: any) =>
            para.words?.map((w: any) =>
              w.symbols?.map((s: any) => s.text).join('') ?? ''
            ) ?? []
          )
          .join(' '),
        confidence: b.confidence ?? 0,
        boundingBox: b.boundingBox,
      })) ?? []
    );

    const gcvConfidence = response?.fullTextAnnotation?.pages?.[0]?.confidence ?? null;
    let   finalConfidence = gcvConfidence;
    let   ocrSource = 'cloud_vision';

    // ── 4.5. Gemini Vision fallback for low-confidence / Indian textbook photos ─
    // Triggers when: GCV confidence < 0.60 OR no text found at all.
    // Gemini 1.5 Flash handles printed serif fonts, handwritten Hindi, blurry images.
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    const needsFallback = GEMINI_KEY && (fullText.trim().length === 0 || (gcvConfidence !== null && gcvConfidence < 0.60));

    if (needsFallback) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inline_data: { mime_type: 'image/jpeg', data: image_base64 },
                  },
                  {
                    text: `Extract ALL text from this image exactly as written. This may be an Indian textbook page, handwritten notes, or printed study material in English or Indian languages (Hindi, Tamil, Telugu, Kannada, etc.).

Rules:
- Preserve all mathematical equations, chemical formulas, and numbered steps exactly
- Preserve all Hindi/regional language text in its original script (Devanagari, Tamil, etc.)
- Preserve diagram labels, table content, and footnotes
- Output ONLY the extracted text — no commentary, no markdown formatting
- If text is handwritten, transcribe as accurately as possible`,
                  },
                ],
              }],
              generationConfig: { temperature: 0, maxOutputTokens: 2048 },
            }),
          },
        );

        if (geminiRes.ok) {
          const gd  = await geminiRes.json();
          const txt = (gd.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
          if (txt.length > fullText.length) {
            fullText      = txt;
            finalConfidence = 0.82;   // Gemini Vision is reliable — report higher confidence
            ocrSource     = 'gemini_vision';
          }
        }
      } catch (_) { /* fall through with GCV result */ }
    }

    // ── 5. Save scan record to DB ────────────────────────────────
    const { data: scan } = await supabase
      .from('handwriting_scans')
      .insert({
        user_id: user.id,
        image_url: '',          // caller can update with storage URL after upload
        ocr_text: fullText,
      })
      .select('id')
      .single();

    return new Response(
      JSON.stringify({
        scan_id:    scan?.id,
        full_text:  fullText,
        blocks,
        confidence: finalConfidence,
        ocr_source: ocrSource,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
}));
