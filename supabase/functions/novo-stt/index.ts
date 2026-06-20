// ─────────────────────────────────────────────────────────────────────────────
// novo-stt — Google Cloud Speech-to-Text proxy
//
// Actions:
//   transcribe — base64 audio + language → transcript text
//
// Security: requires authenticated Supabase user (JWT in Authorization header).
// Rate limits (per user, per hour):
//   stt:transcribe → 40 calls/hr  (voice study sessions are frequent)
// Input guards:
//   audio_base64 max 10 MB decoded (~13.3 MB base64)
//   encoding must be in ENCODING_MAP whitelist
// Timeouts: Google STT call aborts after 30 s (audio can be slow to upload).
//
// Requires secrets: GOOGLE_CLOUD_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//                   SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Rate limit config ─────────────────────────────────────────────────────────
const STT_ENDPOINT    = 'stt:transcribe';
const STT_MAX_PER_HR  = 40;

async function checkRateLimit(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await serviceDb
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', STT_ENDPOINT)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= STT_MAX_PER_HR) {
    return { allowed: false, retryAfterSecs: 3600 };
  }
  serviceDb.from('api_rate_limits').insert({ user_id: userId, endpoint: STT_ENDPOINT }).then(() => {}).catch(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Language code → BCP-47 locale ────────────────────────────────────────────
const STT_LOCALES: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
};

// ── Whitelisted audio encodings ───────────────────────────────────────────────
const ENCODING_MAP: Record<string, string> = {
  webm:   'WEBM_OPUS',
  opus:   'WEBM_OPUS',
  mp4:    'MP4',
  wav:    'LINEAR16',
  flac:   'FLAC',
  ogg:    'OGG_OPUS',
  linear: 'LINEAR16',
};

// 10 MB decoded audio limit → base64 is ~33% larger → 13.5 MB base64 cap
const MAX_AUDIO_BASE64_LEN = 13_500_000;

serve(withSentry('novo-stt', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── 1. Environment guards ──────────────────────────────────────────────────
  const apiKey      = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!apiKey) return json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, 500);

  // ── 2. Authentication — reject anonymous callers ───────────────────────────
  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized. A valid Supabase session is required.' }, 401);
  }

  // ── 3. Rate limiting ───────────────────────────────────────────────────────
  const rl = await checkRateLimit(serviceDb, user.id);
  if (!rl.allowed) {
    return json({
      error: 'STT rate limit exceeded (40 transcriptions/hour). Try again later.',
      retry_after_secs: rl.retryAfterSecs,
    }, 429);
  }

  // ── 4. Parse + validate body ───────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  if (action !== 'transcribe') {
    return json({ error: 'Unknown action. Use: transcribe' }, 400);
  }

  const {
    audio_base64,
    language    = 'en',
    encoding    = 'webm',
    sample_rate = 48000,
  } = body;

  if (typeof audio_base64 !== 'string' || !audio_base64) {
    return json({ error: 'audio_base64 (string) required' }, 400);
  }
  if (audio_base64.length > MAX_AUDIO_BASE64_LEN) {
    return json({ error: 'Audio too large. Maximum 10 MB per transcription.' }, 413);
  }

  const rawEncoding = typeof encoding === 'string' ? encoding.toLowerCase().slice(0, 20) : 'webm';
  const gcpEnc      = ENCODING_MAP[rawEncoding];
  if (!gcpEnc) {
    return json({ error: `Unsupported encoding "${rawEncoding}". Use: ${Object.keys(ENCODING_MAP).join(' | ')}` }, 400);
  }

  const rawLang = typeof language === 'string' ? language.slice(0, 10) : 'en';
  const locale  = STT_LOCALES[rawLang.split('-')[0]] ?? 'en-IN';

  const rawSampleRate = Number(sample_rate);
  if (!Number.isFinite(rawSampleRate) || rawSampleRate < 8000 || rawSampleRate > 48000) {
    return json({ error: 'sample_rate must be between 8000 and 48000' }, 400);
  }

  // ── 5. Build STT config ────────────────────────────────────────────────────
  const config: Record<string, unknown> = {
    encoding:                   gcpEnc,
    sampleRateHertz:            rawSampleRate,
    languageCode:               locale,
    alternativeLanguageCodes:   rawLang !== 'en' ? ['en-IN'] : [],
    enableAutomaticPunctuation: true,
    model:                      'latest_long',
    useEnhanced:                true,
  };

  const requestBody = { config, audio: { content: audio_base64 } };

  // ── 6. Call Google STT (with automatic enhanced → standard fallback) ────────
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) },
      30_000,
    );
  } catch (e) {
    if ((e as Error).name === 'AbortError') return json({ error: 'Transcription timed out. Try again.' }, 504);
    return json({ error: 'Speech API unreachable' }, 502);
  }

  // Retry without useEnhanced if the model isn't available for this locale
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: { code?: number } };
    if (errBody?.error?.code === 400) {
      config.useEnhanced = false;
      try {
        res = await fetchWithTimeout(
          `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ config, audio: { content: audio_base64 } }),
          },
          30_000,
        );
      } catch (e) {
        if ((e as Error).name === 'AbortError') return json({ error: 'Transcription timed out on fallback.' }, 504);
        return json({ error: 'Speech API unreachable on fallback' }, 502);
      }
    }
    if (!res.ok) return json({ error: 'Transcription failed', status: res.status }, 502);
  }

  // ── 7. Parse and return results ────────────────────────────────────────────
  const data = await res.json() as {
    results?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }>;
  };
  const results = data.results ?? [];

  if (results.length === 0) return json({ transcript: '', confidence: 0 });

  const transcript = results
    .map(r => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();

  const confidence = results[0]?.alternatives?.[0]?.confidence ?? 0;

  return json({ transcript, confidence, language: locale });
}));
