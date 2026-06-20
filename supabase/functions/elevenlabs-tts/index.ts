// ═══════════════════════════════════════════════════════════════
// Edora — ElevenLabs TTS Edge Function
// Secure proxy: ELEVENLABS_API_KEY stays server-side, never in JS bundle
// Deploy: supabase functions deploy elevenlabs-tts
// Secrets: supabase secrets set ELEVENLABS_API_KEY=<your-key>
// ═══════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — clear, friendly female
const MODEL_ID = 'eleven_flash_v2_5';
const MAX_CHARS = 2400;

// ── Per-user rate limit: 30 TTS calls / hour ─────────────────────────────────
async function checkRateLimit(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await serviceDb
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', 'elevenlabs:tts')
    .gte('created_at', windowStart);

  if ((count ?? 0) >= 30) return { allowed: false };
  serviceDb.from('api_rate_limits')
    .insert({ user_id: userId, endpoint: 'elevenlabs:tts' })
    .then(() => {}).catch(() => {});
  return { allowed: true };
}

serve(withSentry('elevenlabs-tts', async (req) => {
  const CORS = getCors(req);
  const jsonResp = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Authenticate user ─────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const serviceDb = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResp({ error: 'Unauthorized' }, 401);

    // ── 2. Rate limit ────────────────────────────────────────────
    const rl = await checkRateLimit(serviceDb, user.id);
    if (!rl.allowed) {
      return jsonResp({
        error: 'rate_limit',
        message: 'You have reached the hourly voice limit (30 requests). Please wait and try again.',
        retry_after_secs: 3600,
      }, 429);
    }

    // ── 3. Parse + validate request ──────────────────────────────
    const body = await req.json();
    const { text, speed = 'normal' } = body;
    if (!text || typeof text !== 'string') return jsonResp({ error: 'text is required' }, 400);

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) return jsonResp({ error: 'ElevenLabs API key not configured' }, 500);

    // Speed maps to ElevenLabs voice settings:
    // slow  → higher stability (0.75) + lower style (0.05) = deliberate, measured pace
    // normal → default (0.50 / 0.20)
    // fast  → lower stability (0.30) + higher style (0.35) = energetic, faster cadence
    const speedSettings: Record<string, { stability: number; style: number }> = {
      slow:   { stability: 0.75, style: 0.05 },
      normal: { stability: 0.50, style: 0.20 },
      fast:   { stability: 0.30, style: 0.35 },
    };
    const vs = speedSettings[speed as string] ?? speedSettings.normal;

    // ── 4. Call ElevenLabs API ───────────────────────────────────
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method:  'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:     text.slice(0, MAX_CHARS),
          model_id: MODEL_ID,
          voice_settings: {
            stability:         vs.stability,
            similarity_boost:  0.80,
            style:             vs.style,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (ttsRes.status === 401) {
      return jsonResp({ error: 'invalid_key', message: 'Audio unavailable: API key invalid' }, 401);
    }
    if (ttsRes.status === 429) {
      return jsonResp({ error: 'rate_limit', message: 'Audio limit reached. Try again later.' }, 429);
    }
    if (!ttsRes.ok) {
      return jsonResp({ error: `ElevenLabs HTTP ${ttsRes.status}` }, ttsRes.status);
    }

    // ── 5. Stream audio back ─────────────────────────────────────
    const audioBuffer = await ttsRes.arrayBuffer();
    return new Response(audioBuffer, {
      headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCors(req), 'Content-Type': 'application/json' } },
    );
  }
}));
