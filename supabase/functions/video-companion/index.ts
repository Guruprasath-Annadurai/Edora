// ═══════════════════════════════════════════════════════════════
// Edora — Video Companion Edge Function (Feature 15)
//
// Actions:
//   analyze  — YouTube URL → fetch transcript → Gemini analysis
//              returns: summary, key_concepts[], flashcards[]
//   chat     — Q&A about a previously analysed video (session-based)
//
// Transcript strategy:
//   1. Parse video ID from URL
//   2. Fetch YouTube watch page → extract ytInitialPlayerResponse
//   3. Follow captionTrack baseUrl → XML/JSON captions
//   4. Fallback: use video title + description if no captions
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY  = Deno.env.get('GEMINI_API_KEY')!;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';


const db = createClient(SUPABASE_URL, SERVICE_KEY);

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Extract video ID from YouTube URL ────────────────────────────────────────
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ── Fetch YouTube transcript ──────────────────────────────────────────────────
interface VideoMeta {
  title:         string;
  channel:       string;
  description:   string;
  duration_text: string;
  thumbnail_url: string;
}

interface TranscriptResult {
  transcript: string;
  meta:       VideoMeta;
  has_captions: boolean;
}

async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptResult> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const pageRes = await fetch(watchUrl, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!pageRes.ok) throw new Error(`YouTube page fetch failed: ${pageRes.status}`);
  const html = await pageRes.text();

  // ── Extract ytInitialPlayerResponse ──────────────────────────────────────
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;(?:var|const|let|\s*<)/s);
  if (!playerMatch) throw new Error('Could not parse YouTube page');

  let playerData: any;
  try {
    playerData = JSON.parse(playerMatch[1]);
  } catch {
    throw new Error('Failed to parse ytInitialPlayerResponse');
  }

  // ── Extract video metadata ────────────────────────────────────────────────
  const videoDetails = playerData?.videoDetails ?? {};
  const meta: VideoMeta = {
    title:         videoDetails.title         ?? 'Unknown Title',
    channel:       videoDetails.author        ?? 'Unknown Channel',
    description:   (videoDetails.shortDescription ?? '').slice(0, 500),
    duration_text: formatDuration(parseInt(videoDetails.lengthSeconds ?? '0')),
    thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };

  // ── Try to get captions ───────────────────────────────────────────────────
  const captionTracks = playerData?.captions
    ?.playerCaptionsTracklistRenderer
    ?.captionTracks ?? [];

  if (!captionTracks.length) {
    // No captions — return description as fallback
    return {
      transcript:   meta.description || `[No transcript available for "${meta.title}"]`,
      meta,
      has_captions: false,
    };
  }

  // Prefer English (en), then en-US, then first available
  const track = captionTracks.find((t: any) => t.languageCode === 'en')
    ?? captionTracks.find((t: any) => t.languageCode?.startsWith('en'))
    ?? captionTracks[0];

  // ── Fetch caption JSON ────────────────────────────────────────────────────
  const captionUrl = `${track.baseUrl}&fmt=json3`;
  const captionRes = await fetch(captionUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!captionRes.ok) {
    return { transcript: meta.description, meta, has_captions: false };
  }

  const captionData = await captionRes.json();
  const events      = captionData.events ?? [];

  // Reconstruct readable transcript with rough timestamps
  const lines: string[] = [];
  for (const e of events) {
    if (!e.segs) continue;
    const text = e.segs.map((s: any) => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim();
    if (text) lines.push(text);
  }

  const fullTranscript = lines.join(' ').replace(/\s+/g, ' ').trim();

  return {
    transcript:   fullTranscript || meta.description,
    meta,
    has_captions: !!fullTranscript,
  };
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Gemini analysis ───────────────────────────────────────────────────────────
interface VideoAnalysis {
  summary:       string;
  key_concepts:  Array<{ concept: string; explanation: string }>;
  flashcards:    Array<{ front: string; back: string }>;
  topic_tags:    string[];
  difficulty:    'beginner' | 'intermediate' | 'advanced';
}

async function analyseWithGemini(
  transcript: string,
  meta:       VideoMeta,
  hasCaptions: boolean,
): Promise<VideoAnalysis> {
  const content = hasCaptions
    ? `Video: "${meta.title}" by ${meta.channel}\n\nTranscript (${transcript.length} chars):\n${transcript.slice(0, 12000)}`
    : `Video: "${meta.title}" by ${meta.channel}\nDuration: ${meta.duration_text}\nDescription: ${meta.description}\n\n[Note: This video has no available captions — analysis based on metadata]`;

  const prompt = `You are Novo, an expert educational AI. Analyse this educational video content and create comprehensive study materials.

${content}

Return ONLY valid JSON:
{
  "summary": "3-5 sentence clear summary of what this video covers and its main teaching points",
  "key_concepts": [
    {"concept": "Concept name", "explanation": "Clear 1-2 sentence explanation suitable for a student"}
  ],
  "flashcards": [
    {"front": "Question or prompt for the flashcard front", "back": "Answer on the card back (2-3 sentences)"}
  ],
  "topic_tags": ["tag1", "tag2", "tag3"],
  "difficulty": "beginner|intermediate|advanced"
}

Rules:
- summary: exactly 3-5 sentences, no bullet points
- key_concepts: 5-10 most important concepts from the video
- flashcards: 8-12 high-quality study cards testing key facts and concepts
- topic_tags: 3-5 relevant subject/topic tags`;

  const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) throw new Error(`Gemini analysis failed: ${res.status}`);
  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(raw) as VideoAnalysis;
}

// ── Video Q&A chat ────────────────────────────────────────────────────────────
async function chatAboutVideo(
  question:    string,
  sessionData: any,
  history:     Array<{ role: string; content: string }>,
): Promise<string> {
  const context = `Video: "${sessionData.title}" by ${sessionData.channel}
Summary: ${sessionData.summary ?? 'See transcript below'}
${sessionData.transcript_text ? `\nTranscript excerpt:\n${sessionData.transcript_text.slice(0, 6000)}` : ''}`;

  const historyParts = history.slice(-8).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: `You are Novo, an expert AI tutor. You are helping a student study the following video content:\n\n${context}\n\nAnswer questions based on the video content. Be clear and educational. Max 4 sentences per answer.` }],
    },
    contents: [
      ...historyParts,
      { role: 'user', parts: [{ text: question }] },
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  };

  const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Chat failed');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "I'm not sure about that. Try rephrasing your question.";
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
Deno.serve(withSentry('video-companion', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization');
  if (!auth) return jsonRes({ error: 'Missing authorization' }, 401);

  // Auth via anon key (user token)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonRes({ error: 'Unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const { action } = body;

  // ── analyze ──────────────────────────────────────────────────────────────
  if (action === 'analyze') {
    const { youtube_url } = body;
    if (!youtube_url) return jsonRes({ error: 'youtube_url required' }, 400);

    const videoId = extractVideoId(youtube_url);
    if (!videoId) return jsonRes({ error: 'Could not extract video ID from URL. Please use a valid YouTube URL.' }, 400);

    // Check for cached analysis from any user
    const { data: cached } = await db
      .from('video_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('video_id', videoId)
      .eq('status', 'complete')
      .maybeSingle();

    if (cached) return jsonRes({ session: cached, cached: true });

    // Create session row
    const { data: session, error: insertErr } = await db
      .from('video_sessions')
      .insert({
        user_id:    user.id,
        youtube_url,
        video_id:   videoId,
        status:     'processing',
      })
      .select()
      .single();

    if (insertErr) return jsonRes({ error: insertErr.message }, 500);

    try {
      // Fetch transcript
      const { transcript, meta, has_captions } = await fetchYouTubeTranscript(videoId);

      // Analyse with Gemini
      const analysis = await analyseWithGemini(transcript, meta, has_captions);

      // Persist
      const { data: updated } = await db
        .from('video_sessions')
        .update({
          title:          meta.title,
          channel:        meta.channel,
          duration_text:  meta.duration_text,
          thumbnail_url:  meta.thumbnail_url,
          transcript_text: transcript.slice(0, 50000),
          summary:        analysis.summary,
          key_concepts:   analysis.key_concepts,
          flashcards:     analysis.flashcards,
          status:         has_captions ? 'complete' : 'no_captions',
        })
        .eq('id', session.id)
        .select()
        .single();

      return jsonRes({ session: updated, cached: false });

    } catch (e: any) {
      await db.from('video_sessions').update({ status: 'failed' }).eq('id', session.id);
      return jsonRes({ error: `Analysis failed: ${e.message}` }, 500);
    }
  }

  // ── chat ─────────────────────────────────────────────────────────────────
  if (action === 'chat') {
    const { session_id, question } = body;
    if (!session_id || !question) return jsonRes({ error: 'session_id and question required' }, 400);

    const { data: session } = await db
      .from('video_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (!session) return jsonRes({ error: 'Session not found' }, 404);

    const history = (session.chat_history ?? []) as Array<{ role: string; content: string }>;
    const answer  = await chatAboutVideo(question, session, history);

    // Append to chat history
    const newHistory = [
      ...history,
      { role: 'user',      content: question },
      { role: 'assistant', content: answer   },
    ].slice(-40); // keep last 40 turns

    await db.from('video_sessions')
      .update({ chat_history: newHistory })
      .eq('id', session_id);

    return jsonRes({ answer, session_id });
  }

  // ── get_session ──────────────────────────────────────────────────────────
  if (action === 'get_session') {
    const { session_id } = body;
    if (!session_id) return jsonRes({ error: 'session_id required' }, 400);
    const { data: session } = await db
      .from('video_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();
    return jsonRes({ session });
  }

  // ── list_sessions ─────────────────────────────────────────────────────────
  if (action === 'list_sessions') {
    const { data: sessions } = await db
      .from('video_sessions')
      .select('id, video_id, title, channel, thumbnail_url, status, created_at, sr_cards_added')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return jsonRes({ sessions: sessions ?? [] });
  }

  return jsonRes({ error: `Unknown action: ${action}` }, 400);
}));
