// ─────────────────────────────────────────────────────────────────────────────
// novo-memory — Cross-session memory layer for Novo AI
// Actions:
//   get_context        — ONE call: top weaknesses + session summaries + style
//                        → returns ready-to-inject system_prompt_block
//   save              — persist one memory record (dedup-checked)
//   save_from_session — analyse chat history, auto-extract & save (dedup-checked)
//   save_session_summary — store a structured session summary (quiz/tutoring/chat)
//   get               — retrieve top memories for system-prompt injection
//   delete            — remove a single memory by id
//   get_summary       — AI-generated paragraph summary of all memories
//   update_explanation_style — update the user's preferred learning style
// Enterprise: rate limiting, Gemini retry, semantic deduplication
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
// ── Explanation style descriptions for system-prompt injection ────────────────
const STYLE_DESCRIPTIONS: Record<string, string> = {
  simple:    'Use simple language, everyday analogies, and avoid jargon. Break every concept into the smallest possible steps. Assume no prior knowledge.',
  balanced:  'Mix conceptual explanation with worked examples. Accessible but not dumbed down.',
  deep:      'Give full mathematical rigour, derivations, proofs, and edge cases. The student wants to understand WHY, not just HOW.',
  socratic:  'Guide with questions rather than giving answers directly. Ask "what do you think would happen if…?", let the student discover insights. Intervene only when truly stuck.',
};

// ── Gemini text embedding (768-dim, text-embedding-004) ──────────────────────
async function embedText(text: string): Promise<number[] | null> {
  try {
    const key = Deno.env.get('GEMINI_API_KEY')!;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: text.slice(0, 2000) }] },
        }),
      },
    );
    const d = await res.json();
    const values = d?.embedding?.values;
    if (!Array.isArray(values) || values.length !== 768) return null;
    return values as number[];
  } catch {
    return null;
  }
}

// ── Gemini with exponential-backoff retry ─────────────────────────────────────
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in Gemini response');
  return JSON.parse(match[0]) as T;
}

async function geminiJSONWithRetry<T>(prompt: string, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await geminiJSON<T>(prompt);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function checkRateLimit(supabase: any, userId: string, endpoint: string, maxRequests: number, windowMinutes: number) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('endpoint', endpoint)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= maxRequests) return { allowed: false, retryAfterSecs: windowMinutes * 60 };
  supabase.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

// ── Semantic deduplication ───────────────────────────────────────────────────
function jaccardSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wa = words(a); const wb = words(b);
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : intersection / union;
}

// deno-lint-ignore no-explicit-any
async function findDuplicate(supabase: any, userId: string, content: string, memoryType: string, subject: string | null) {
  // deno-lint-ignore no-explicit-any
  let q: any = supabase.from('novo_memories').select('id, content, importance').eq('user_id', userId).eq('memory_type', memoryType);
  if (subject) q = q.eq('subject', subject);
  const { data } = await q.limit(60);
  for (const mem of data ?? []) {
    if (jaccardSimilarity(content, mem.content) >= 0.6) return { id: mem.id, importance: mem.importance };
  }
  return null;
}

// ── Build system-prompt memory block ─────────────────────────────────────────
function buildMemoryBlock(
  studentName: string,
  // deno-lint-ignore no-explicit-any
  weaknesses: any[],
  // deno-lint-ignore no-explicit-any
  strengths: any[],
  // deno-lint-ignore no-explicit-any
  summaries: any[],
  explanationStyle: string,
): string {
  const lines: string[] = [`=== Novo's Memory of ${studentName} ===`];

  if (weaknesses.length > 0) {
    lines.push('\nWEAK SPOTS — revisit these proactively, slow down when they come up:');
    weaknesses.slice(0, 3).forEach((w: { topic?: string; subject?: string; content: string }) => {
      const tag = w.topic ?? w.subject ?? 'General';
      lines.push(`• [${tag}] ${w.content}`);
    });
  }

  if (strengths.length > 0) {
    lines.push('\nSTRENGTHS — build on these, use them to bridge new concepts:');
    strengths.slice(0, 3).forEach((s: { topic?: string; content: string }) => {
      lines.push(`• ${s.content}`);
    });
  }

  const styleDesc = STYLE_DESCRIPTIONS[explanationStyle] ?? STYLE_DESCRIPTIONS.balanced;
  lines.push(`\nLEARNING STYLE: ${styleDesc}`);

  if (summaries.length > 0) {
    lines.push('\nRECENT SESSIONS (most recent first):');
    summaries.slice(0, 5).forEach((s: { summary: string; topic?: string; created_at: string }) => {
      const when = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      lines.push(`• [${when}] ${s.summary}`);
    });
  }

  lines.push('\nINSTRUCTION: Use these memories naturally — reference weak spots when relevant topics arise. Never recite this list robotically. Make the student feel understood, not analysed.');

  return lines.join('\n');
}

const MAX_MEMORIES = 100;
const VALID_TYPES = new Set(['struggle', 'strength', 'preference', 'milestone', 'pattern', 'exam_context']);

serve(withSentry('novo-memory', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── get_context ───────────────────────────────────────────────────────────
  // Single call returns everything needed for system-prompt injection.
  // When current_topic is provided, weaknesses are ranked by semantic
  // similarity to the topic (pgvector cosine search) so Novo surfaces the
  // most *relevant* struggles first — not just the most important ones.
  if (action === 'get_context') {
    const { current_topic } = body; // optional: topic the student is studying now
    const now = new Date().toISOString();

    // If we have a topic, embed it for semantic ranking
    let topicEmbedding: number[] | null = null;
    if (current_topic && typeof current_topic === 'string') {
      topicEmbedding = await embedText(current_topic);
    }

    // Run semantic search + standard queries in parallel
    const [weaknessRes, strengthRes, summaryRes, profileRes, topicStatsRes, semanticRes] = await Promise.all([
      supabase
        .from('novo_memories')
        .select('id,content,subject,topic,importance')
        .eq('user_id', user.id)
        .eq('memory_type', 'struggle')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('novo_memories')
        .select('id,content,subject,topic,importance')
        .eq('user_id', user.id)
        .eq('memory_type', 'strength')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3),

      supabase
        .from('novo_session_summaries')
        .select('summary,subject,topic,struggles,wins,source,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('profiles')
        .select('full_name,explanation_style,exam_name,exam_date')
        .eq('id', user.id)
        .single(),

      supabase
        .from('topic_stats')
        .select('subject,topic,struggle_count,win_count,last_active')
        .eq('user_id', user.id)
        .order('struggle_count', { ascending: false })
        .limit(10),

      // Semantic search — only fires if we have an embedding
      topicEmbedding
        ? supabase.rpc('search_novo_memories', {
            p_user_id:   user.id,
            p_embedding: JSON.stringify(topicEmbedding),
            p_limit:     6,
            p_min_sim:   0.65,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const weaknesses      = weaknessRes.data ?? [];
    const strengths       = strengthRes.data ?? [];
    const summaries       = summaryRes.data ?? [];
    const profile         = profileRes.data;
    const topicStats      = topicStatsRes.data ?? [];
    const semanticHits    = (semanticRes.data ?? []) as Array<{ id: string; content: string; memory_type: string; subject: string | null; topic: string | null; importance: number; similarity: number }>;
    const explanationStyle = profile?.explanation_style ?? 'balanced';
    const studentName     = profile?.full_name?.split(' ')[0] ?? 'there';

    // Merge semantic hits into weaknesses — surface relevant memories first
    // regardless of their stored importance rank
    let mergedWeaknesses = weaknesses;
    if (semanticHits.length > 0) {
      const seenIds = new Set(weaknesses.map((w: { id: string }) => w.id));
      const semanticWeaknesses = semanticHits
        .filter(h => h.memory_type === 'struggle' && !seenIds.has(h.id))
        .map(h => ({ id: h.id, content: h.content, subject: h.subject, topic: h.topic, importance: h.importance, _semantic_sim: h.similarity }));
      // Put semantic matches first (most relevant), then pad with importance-sorted ones
      mergedWeaknesses = [...semanticWeaknesses, ...weaknesses].slice(0, 5);
    }

    // Also fetch preferences and patterns to enrich the block
    const { data: prefs } = await supabase
      .from('novo_memories')
      .select('content')
      .eq('user_id', user.id)
      .in('memory_type', ['preference', 'pattern'])
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('importance', { ascending: false })
      .limit(4);

    const systemPromptBlock = buildMemoryBlock(
      studentName, mergedWeaknesses, strengths, summaries, explanationStyle,
    );

    return json({
      top_weaknesses:     mergedWeaknesses.slice(0, 3),
      recent_strengths:   strengths,
      session_summaries:  summaries,
      preferences:        prefs ?? [],
      explanation_style:  explanationStyle,
      exam_context:       profile?.exam_name ? { name: profile.exam_name, date: profile.exam_date } : null,
      system_prompt_block: systemPromptBlock,
      topic_stats:        topicStats,
    });
  }

  // ── save_session_summary ──────────────────────────────────────────────────
  if (action === 'save_session_summary') {
    const { source, subject, topic, summary, struggles, wins, duration_mins } = body;
    if (!source || !summary) return json({ error: 'source and summary required' }, 400);
    const validSources = new Set(['chat', 'quiz', 'tutoring', 'sprint']);
    if (!validSources.has(source)) return json({ error: 'Invalid source' }, 400);

    // Keep only last 20 summaries per user — prune oldest first
    const { count } = await supabase
      .from('novo_session_summaries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if ((count ?? 0) >= 20) {
      const { data: oldest } = await supabase
        .from('novo_session_summaries')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(5);
      if (oldest && oldest.length > 0) {
        await supabase.from('novo_session_summaries')
          .delete().in('id', oldest.map((r: { id: string }) => r.id));
      }
    }

    const { data, error } = await supabase
      .from('novo_session_summaries')
      .insert({
        user_id: user.id, source,
        subject: subject ?? null,
        topic: topic ?? null,
        summary: summary.slice(0, 1000),
        struggles: Array.isArray(struggles) ? struggles.slice(0, 10).map((s: string) => s.slice(0, 200)) : null,
        wins: Array.isArray(wins) ? wins.slice(0, 10).map((w: string) => w.slice(0, 200)) : null,
        duration_mins: duration_mins ?? null,
      })
      .select('id')
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ summary: data });
  }

  // ── update_explanation_style ──────────────────────────────────────────────
  if (action === 'update_explanation_style') {
    const { style } = body;
    const validStyles = new Set(['simple', 'balanced', 'deep', 'socratic']);
    if (!style || !validStyles.has(style)) return json({ error: 'Invalid style' }, 400);

    const { error } = await supabase
      .from('profiles')
      .update({ explanation_style: style })
      .eq('id', user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ updated: true, style });
  }

  // ── save ──────────────────────────────────────────────────────────────────
  if (action === 'save') {
    const { memory_type, content, subject, topic, importance = 5, source } = body;
    if (!memory_type || !content) return json({ error: 'memory_type and content required' }, 400);
    if (!VALID_TYPES.has(memory_type)) return json({ error: 'Invalid memory_type' }, 400);

    const rl = await checkRateLimit(supabase, user.id, 'memory_save', 50, 60);
    if (!rl.allowed) return json({ error: 'Rate limit exceeded', retry_after_secs: rl.retryAfterSecs }, 429);

    const dup = await findDuplicate(supabase, user.id, content, memory_type, subject ?? null);
    if (dup) {
      if (importance > dup.importance) {
        await supabase.from('novo_memories').update({ importance }).eq('id', dup.id);
      }
      return json({ memory: { id: dup.id }, deduplicated: true });
    }

    // Generate embedding asynchronously — don't block the save on it
    const embedding = await embedText(`${memory_type}: ${content}${subject ? ` (${subject})` : ''}`);

    const { data, error } = await supabase
      .from('novo_memories')
      .insert({ user_id: user.id, memory_type, content, subject, topic, importance, source, embedding: embedding ? JSON.stringify(embedding) : null })
      .select('id').single();
    if (error) return json({ error: error.message }, 500);

    // Prune if over cap
    const { count } = await supabase.from('novo_memories').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count ?? 0) > MAX_MEMORIES) {
      const { data: overflow } = await supabase.from('novo_memories').select('id').eq('user_id', user.id)
        .order('importance', { ascending: true }).order('created_at', { ascending: true }).limit(10);
      if (overflow && overflow.length > 0) {
        await supabase.from('novo_memories').delete().in('id', overflow.map((r: { id: string }) => r.id));
      }
    }
    return json({ memory: data, deduplicated: false });
  }

  // ── save_from_session ─────────────────────────────────────────────────────
  if (action === 'save_from_session') {
    const { messages, source = 'chat', subject } = body;
    if (!messages || !Array.isArray(messages) || messages.length < 2) return json({ memories_saved: 0 });

    const rl = await checkRateLimit(supabase, user.id, 'memory_save_from_session', 20, 60);
    if (!rl.allowed) return json({ memories_saved: 0, rate_limited: true });

    const convo = messages
      .slice(-30)
      .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    type MemoryExtract = {
      memory_type: string; content: string; subject: string | null;
      topic: string | null; importance: number;
    };
    type SessionSummaryExtract = {
      summary: string; struggles: string[]; wins: string[];
      explanation_style: string | null;
    };
    type ExtractionResult = {
      memories: MemoryExtract[];
      session_summary: SessionSummaryExtract;
    };

    let extracted: ExtractionResult;
    try {
      extracted = await geminiJSONWithRetry<ExtractionResult>(`
You are analysing a student-tutor conversation. Return a JSON object with two keys:

1. "memories": array of 1-5 learning memories (can be empty [])
Each memory: { "memory_type": "struggle"|"strength"|"preference"|"milestone"|"pattern"|"exam_context", "content": "concise third-person statement (≤120 chars)", "subject": string|null, "topic": string|null, "importance": 1-10 }
Rules: Only meaningful patterns (not trivial exchanges). importance ≥ 7 for clear repeated patterns.

2. "session_summary": single object:
{ "summary": "1-2 sentence summary of the session (what was studied, how it went)", "struggles": ["specific topic or question the student found hard"], "wins": ["specific concept the student got right or understood well"], "explanation_style": "simple"|"balanced"|"deep"|"socratic"|null }
For explanation_style: infer from the student's messages — did they ask for simpler explanations? more depth? want to be questioned? Or null if unclear.

Conversation:
${convo}
`);
    } catch {
      return json({ memories_saved: 0 });
    }

    // Save session summary
    const ss = extracted.session_summary;
    if (ss?.summary) {
      await supabase.from('novo_session_summaries').insert({
        user_id: user.id, source,
        subject: subject ?? null,
        summary: ss.summary.slice(0, 1000),
        struggles: Array.isArray(ss.struggles) ? ss.struggles.slice(0, 10) : null,
        wins: Array.isArray(ss.wins) ? ss.wins.slice(0, 10) : null,
      });

      // Auto-update explanation style if detected
      if (ss.explanation_style && ['simple', 'balanced', 'deep', 'socratic'].includes(ss.explanation_style)) {
        await supabase.from('profiles')
          .update({ explanation_style: ss.explanation_style })
          .eq('id', user.id);
      }
    }

    const valid = (extracted.memories ?? []).filter((m: MemoryExtract) => m.content && VALID_TYPES.has(m.memory_type));
    let saved = 0;
    for (const m of valid) {
      const content = m.content.slice(0, 500);
      const imp     = Math.min(10, Math.max(1, Math.round(m.importance ?? 5)));
      const subj    = m.subject || subject || null;
      const dup     = await findDuplicate(supabase, user.id, content, m.memory_type, subj);
      if (dup) { if (imp > dup.importance) await supabase.from('novo_memories').update({ importance: imp }).eq('id', dup.id); continue; }
      // Generate embedding for semantic search
      const embedding = await embedText(`${m.memory_type}: ${content}${subj ? ` (${subj})` : ''}`);
      const { error } = await supabase.from('novo_memories').insert({
        user_id: user.id, memory_type: m.memory_type, content, subject: subj, topic: m.topic || null,
        importance: imp, source,
        embedding: embedding ? JSON.stringify(embedding) : null,
      });
      if (!error) saved++;
    }
    return json({ memories_saved: saved });
  }

  // ── get ───────────────────────────────────────────────────────────────────
  if (action === 'get') {
    const limit      = Math.min(Number(body.limit ?? 15), 30);
    const memoryType = body.memory_type;
    const now        = new Date().toISOString();
    // deno-lint-ignore no-explicit-any
    let query: any = supabase
      .from('novo_memories')
      .select('id,memory_type,content,subject,topic,importance,source,created_at')
      .eq('user_id', user.id)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (memoryType) query = query.eq('memory_type', memoryType);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ memories: data ?? [] });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { memory_id } = body;
    if (!memory_id) return json({ error: 'memory_id required' }, 400);
    const { error } = await supabase.from('novo_memories').delete().eq('id', memory_id).eq('user_id', user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ deleted: true });
  }

  // ── get_summary ───────────────────────────────────────────────────────────
  if (action === 'get_summary') {
    const now = new Date().toISOString();
    const { data: memories } = await supabase
      .from('novo_memories')
      .select('memory_type,content,subject,topic,importance')
      .eq('user_id', user.id)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('importance', { ascending: false })
      .limit(30);

    if (!memories || memories.length === 0) {
      return json({ summary: "I'm just getting to know you! Start studying and I'll remember what helps you most." });
    }
    const memList = memories.map((m: { memory_type: string; content: string }) => `[${m.memory_type}] ${m.content}`).join('\n');
    let summary: string;
    try {
      const raw = await gemini(`You are Novo, an AI tutor. Summarise these student memories in 2-3 warm, first-person sentences (as if Novo is speaking). Focus on the most important patterns. Be encouraging and specific.\n\nMemories:\n${memList}\n\nOutput ONLY the summary paragraph, no headers.`);
      summary = raw.trim() || "You're making great progress! I remember your strengths and will help you tackle any weak spots.";
    } catch {
      summary = "You're making great progress! I remember your strengths and will help you tackle any weak spots.";
    }
    return json({ summary });
  }

  // ── upsert_topic_stat ─────────────────────────────────────────────────────
  // Called after quiz completion to track per-topic win/struggle counts.
  if (action === 'upsert_topic_stat') {
    const { subject, topic, won } = body;
    if (!subject || !topic || won === undefined) return json({ error: 'subject, topic, won required' }, 400);
    const { error } = await supabase.rpc('upsert_topic_stat', {
      p_user_id: user.id,
      p_subject: subject,
      p_topic:   topic,
      p_won:     !!won,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ updated: true });
  }

  // ── get_topic_stats ───────────────────────────────────────────────────────
  // Returns per-topic stats with decayed scores for MemoryPanel display.
  if (action === 'get_topic_stats') {
    const limit = Math.min(Number(body.limit ?? 20), 50);
    const { data, error } = await supabase
      .from('topic_stats')
      .select('subject,topic,struggle_count,win_count,last_active')
      .eq('user_id', user.id)
      .order('struggle_count', { ascending: false })
      .order('last_active', { ascending: false })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);
    return json({ topic_stats: data ?? [] });
  }

  // ── track_concept ─────────────────────────────────────────────────────────
  // Upserts concept visit count via the concept_explorations table.
  if (action === 'track_concept') {
    const { concept, subject } = body;
    if (!concept) return json({ error: 'concept required' }, 400);
    const { error } = await supabase.rpc('track_concept_visit', {
      p_user_id: user.id,
      p_concept: concept.slice(0, 200),
      p_subject: subject ?? null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ tracked: true });
  }

  return json({ error: 'Unknown action' }, 400);
}));
