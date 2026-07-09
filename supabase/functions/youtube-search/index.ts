// ─────────────────────────────────────────────────────────────────────────────
// youtube-search — server-side YouTube Data API v3 search
//
// Keeps YOUTUBE_API_KEY off the client entirely. No OAuth, no per-user login,
// no developer-mode allowlist cap — just a public search API with a generous
// free quota (10,000 units/day; each search costs 100 units = 100 searches/day
// per key, more than enough for a study-break feature).
//
// Requires secret: YOUTUBE_API_KEY (Google Cloud Console → enable
// "YouTube Data API v3" → create an API key, restrict it to that API).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

Deno.serve(withSentry('youtube-search', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Any authenticated user can search — no elevated scope needed.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceDb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const rl = await checkRateLimit(serviceDb, user.id, 'youtube_search', 60, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const query = String(body.query ?? '').trim().slice(0, 200);
  if (!query) return json({ error: 'query required' }, 400);

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return json({ error: 'YOUTUBE_API_KEY not configured' }, 500);

  const params = new URLSearchParams({
    key:        apiKey,
    q:          query,
    part:       'snippet',
    type:       'video',
    videoCategoryId: '10', // Music category
    maxResults: '15',
    safeSearch: 'strict', // students — keep results clean
  });

  const res = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) {
    const errText = await res.text();
    console.error('[youtube-search] YouTube API error:', errText);
    return json({ error: 'Search failed' }, 502);
  }

  const data = await res.json();
  interface YTItem {
    id: { videoId: string };
    snippet: { title: string; channelTitle: string; thumbnails?: { default?: { url: string } } };
  }
  const results = ((data.items ?? []) as YTItem[]).map(item => ({
    videoId:      item.id.videoId,
    title:        item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail:    item.snippet.thumbnails?.default?.url ?? null,
  }));

  return json({ results });
}));
