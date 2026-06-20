// ─────────────────────────────────────────────────────────────────────────────
// novo-language — Google Cloud Translation + Text-to-Speech proxy
//
// Actions:
//   translate  — text + source_lang + target_lang → translated text
//   tts        — text + language → base64 MP3 audio (WaveNet voices)
//   detect     — text → detected language code
//
// Security: requires authenticated Supabase user (JWT in Authorization header).
// Rate limits (per user, per hour):
//   translate → 30 calls/hr   (quota protection)
//   tts       → 20 calls/hr   (WaveNet is expensive)
//   detect    → 60 calls/hr
// Timeouts: all Google API calls abort after 15 seconds.
//
// Requires secrets: GOOGLE_CLOUD_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
//                   SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Rate limit constants ──────────────────────────────────────────────────────
const RATE_LIMITS: Record<string, { max: number; windowMins: number }> = {
  'language:translate': { max: 30, windowMins: 60 },
  'language:tts':       { max: 20, windowMins: 60 },
  'language:detect':    { max: 60, windowMins: 60 },
};

async function checkRateLimit(
  serviceDb: ReturnType<typeof createClient>,
  userId: string,
  endpoint: string,
): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  const cfg = RATE_LIMITS[endpoint];
  if (!cfg) return { allowed: true, retryAfterSecs: 0 };

  const windowStart = new Date(Date.now() - cfg.windowMins * 60_000).toISOString();
  const { count } = await serviceDb
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= cfg.max) {
    return { allowed: false, retryAfterSecs: cfg.windowMins * 60 };
  }

  // Record this call (non-blocking — best-effort)
  serviceDb.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {}).catch(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

// ── Fetch with timeout helper ─────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Input sanitizer — strips HTML, limits length ──────────────────────────────
function sanitizeText(text: unknown, maxLen: number): string {
  if (typeof text !== 'string') throw new Error('text must be a string');
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

// ── WaveNet voices for Indian languages ───────────────────────────────────────
const TTS_VOICES: Record<string, { languageCode: string; name: string }> = {
  hi:  { languageCode: 'hi-IN',  name: 'hi-IN-Wavenet-C'  },
  ta:  { languageCode: 'ta-IN',  name: 'ta-IN-Wavenet-C'  },
  te:  { languageCode: 'te-IN',  name: 'te-IN-Standard-B' },
  kn:  { languageCode: 'kn-IN',  name: 'kn-IN-Wavenet-A'  },
  bn:  { languageCode: 'bn-IN',  name: 'bn-IN-Wavenet-A'  },
  mr:  { languageCode: 'mr-IN',  name: 'mr-IN-Wavenet-A'  },
  gu:  { languageCode: 'gu-IN',  name: 'gu-IN-Wavenet-A'  },
  pa:  { languageCode: 'pa-IN',  name: 'pa-IN-Standard-A' },
  en:  { languageCode: 'en-IN',  name: 'en-IN-Wavenet-A'  },
};

function getVoice(lang: string) {
  return TTS_VOICES[lang] ?? TTS_VOICES['en'];
}

// ── Allowed target languages (whitelist to block prompt-injection via lang param) ──
const ALLOWED_LANGS = new Set(['en','hi','ta','te','kn','bn','mr','gu','pa','ml','or','ur','as','sd']);

serve(withSentry('novo-language', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── 1. Environment guards ──────────────────────────────────────────────────
  const apiKey     = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  // ── 3. Parse body ──────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  if (!action || typeof action !== 'string') {
    return json({ error: 'action required. Use: detect | translate | tts' }, 400);
  }

  // ── detect ────────────────────────────────────────────────────────────────
  if (action === 'detect') {
    const rl = await checkRateLimit(serviceDb, user.id, 'language:detect');
    if (!rl.allowed) {
      return json({ error: 'Rate limit exceeded. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
    }

    let text: string;
    try { text = sanitizeText(body.text, 500); } catch { return json({ error: 'text must be a non-empty string' }, 400); }
    if (!text) return json({ error: 'text required' }, 400);

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://translation.googleapis.com/language/translate/v2/detect?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text.slice(0, 200) }) },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Language detection timed out. Try again.' }, 504);
      return json({ error: 'Language detection failed' }, 502);
    }

    if (!res.ok) return json({ error: 'Detection failed', status: res.status }, 502);
    const data = await res.json();
    const detected = data.data?.detections?.[0]?.[0]?.language ?? 'en';
    return json({ language: detected });
  }

  // ── translate ─────────────────────────────────────────────────────────────
  if (action === 'translate') {
    const rl = await checkRateLimit(serviceDb, user.id, 'language:translate');
    if (!rl.allowed) {
      return json({ error: 'Rate limit exceeded. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
    }

    let text: string;
    try { text = sanitizeText(body.text, 5000); } catch { return json({ error: 'text must be a non-empty string' }, 400); }
    if (!text) return json({ error: 'text required' }, 400);

    const target = typeof body.target === 'string' ? body.target.slice(0, 10) : '';
    const source = typeof body.source === 'string' ? body.source.slice(0, 10) : undefined;

    if (!target) return json({ error: 'target language required' }, 400);
    if (!ALLOWED_LANGS.has(target.split('-')[0])) return json({ error: `Unsupported target language: ${target}` }, 400);
    if (source && source === target) return json({ translated: text, skipped: true });

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: text, target,
            ...(source ? { source } : {}),
            format: 'text',
          }),
        },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'Translation timed out. Try again.' }, 504);
      return json({ error: 'Translation failed' }, 502);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return json({ error: `Translation API error (${res.status})` }, 502);
    }
    const data = await res.json();
    const translated = data.data?.translations?.[0]?.translatedText ?? text;
    return json({
      translated,
      source: data.data?.translations?.[0]?.detectedSourceLanguage ?? source,
    });
  }

  // ── tts ───────────────────────────────────────────────────────────────────
  if (action === 'tts') {
    const rl = await checkRateLimit(serviceDb, user.id, 'language:tts');
    if (!rl.allowed) {
      return json({ error: 'Rate limit exceeded. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
    }

    let text: string;
    try { text = sanitizeText(body.text, 4800); } catch { return json({ error: 'text must be a non-empty string' }, 400); }
    if (!text) return json({ error: 'text required' }, 400);

    const rawLang = typeof body.language === 'string' ? body.language.slice(0, 10) : 'en';
    const language = ALLOWED_LANGS.has(rawLang.split('-')[0]) ? rawLang : 'en';
    const voice    = getVoice(language.split('-')[0]);

    const ttsPayload = (voiceName: string) => JSON.stringify({
      input: { text },
      voice: { languageCode: voice.languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
    });

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsPayload(voice.name) },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return json({ error: 'TTS timed out. Try again.' }, 504);
      return json({ error: 'TTS synthesis failed' }, 502);
    }

    // Fallback to Standard voice if WaveNet not available in this region
    if (!res.ok) {
      const fallbackName = `${voice.languageCode}-Standard-A`;
      try {
        res = await fetchWithTimeout(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ttsPayload(fallbackName) },
        );
      } catch (e) {
        if ((e as Error).name === 'AbortError') return json({ error: 'TTS timed out on fallback.' }, 504);
        return json({ error: 'TTS synthesis failed on fallback' }, 502);
      }
      if (!res.ok) return json({ error: 'TTS synthesis failed' }, 502);
      const data = await res.json();
      return json({ audio_base64: data.audioContent, language, fallback: true });
    }

    const data = await res.json();
    return json({ audio_base64: data.audioContent, language });
  }

  return json({ error: 'Unknown action. Use: detect | translate | tts' }, 400);
}));
