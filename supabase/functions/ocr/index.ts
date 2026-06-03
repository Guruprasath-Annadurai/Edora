// ═══════════════════════════════════════════════════════════════
// Edora — Cloud Vision OCR Edge Function
// Secure proxy: authenticated users only, API key never leaves server
// Deploy: supabase functions deploy ocr
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
    const fullText = response?.fullTextAnnotation?.text ?? '';
    const pages    = response?.fullTextAnnotation?.pages ?? [];
    const blocks   = pages.flatMap((p: any) =>
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
        scan_id:   scan?.id,
        full_text: fullText,
        blocks,
        confidence: response?.fullTextAnnotation?.pages?.[0]?.confidence ?? null,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
