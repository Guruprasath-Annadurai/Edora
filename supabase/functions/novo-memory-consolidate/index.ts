// novo-memory-consolidate — nightly background agent
// Triggered by pg_cron. Clusters similar memories, decays mastered topics,
// prunes stale low-importance entries, and bumps importance on frequently-hit memories.
//
// Runs entirely server-side: no client, no streaming.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }  from '../_shared/cors.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY')!;
const GROQ_API_KEY      = Deno.env.get('GROQ_API_KEY')!;
const GROQ_BASE_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const EMBED_URL         = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';
const GROQ_MODEL        = 'llama-3.1-8b-instant'; // lightweight — summary tasks only

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_USERS_PER_RUN  = 50;   // process at most N users per nightly run
const PRUNE_DAYS         = 60;   // delete memories untouched > 60 days, importance < 4
const DECAY_DAYS         = 14;   // decay importance by 1 if not accessed in 14 days
const CLUSTER_SIMILARITY = 0.88; // cosine threshold for merging duplicate memories
const MASTERY_THRESHOLD  = 85;   // subtopic_mastery score → decay struggle memories

// ── Supabase service client ───────────────────────────────────────────────────
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBED_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
    });
    if (!res.ok) return null;
    const j = await res.json() as { embedding?: { values?: number[] } };
    return j.embedding?.values ?? null;
  } catch { return null; }
}

async function summarizeMerge(contents: string[]): Promise<string> {
  try {
    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL, stream: false, max_tokens: 200, temperature: 0.3,
        messages: [{
          role: 'user',
          content: `Merge these student memory notes into ONE concise sentence (max 150 chars). Keep key facts.\n\n${contents.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        }],
      }),
    });
    if (!res.ok) return contents[0];
    const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content?.trim() ?? contents[0];
  } catch { return contents[0]; }
}

// ── Per-user consolidation ────────────────────────────────────────────────────
async function consolidateUser(userId: string): Promise<{ pruned: number; merged: number; decayed: number }> {
  const stats = { pruned: 0, merged: 0, decayed: 0 };
  const now   = new Date();

  // 1. Prune: old low-importance memories not recently used
  const pruneDate = new Date(now.getTime() - PRUNE_DAYS * 86400_000).toISOString();
  const { data: pruneTargets } = await db
    .from('novo_memories')
    .select('id')
    .eq('user_id', userId)
    .lt('importance', 4)
    .lt('last_used_at', pruneDate);
  if (pruneTargets && pruneTargets.length > 0) {
    const ids = pruneTargets.map(r => r.id);
    await db.from('novo_memories').delete().in('id', ids);
    stats.pruned += ids.length;
  }

  // 2. Decay: reduce importance on memories not accessed recently (floor = 1)
  const decayDate = new Date(now.getTime() - DECAY_DAYS * 86400_000).toISOString();
  const { data: decayTargets } = await db
    .from('novo_memories')
    .select('id, importance')
    .eq('user_id', userId)
    .gt('importance', 1)
    .lt('last_used_at', decayDate)
    .not('memory_type', 'in', '("note","schedule_request")');
  if (decayTargets && decayTargets.length > 0) {
    for (const m of decayTargets as Array<{ id: string; importance: number }>) {
      await db.from('novo_memories').update({ importance: Math.max(1, m.importance - 1) }).eq('id', m.id);
      stats.decayed++;
    }
  }

  // 3. Decay struggle memories for mastered topics
  const { data: masteredTopics } = await db
    .from('subtopic_mastery')
    .select('topic, subject')
    .eq('user_id', userId)
    .gte('mastery_score', MASTERY_THRESHOLD);
  if (masteredTopics && masteredTopics.length > 0) {
    for (const t of masteredTopics as Array<{ topic: string; subject: string }>) {
      await db
        .from('novo_memories')
        .update({ importance: 2 })
        .eq('user_id', userId)
        .in('memory_type', ['struggle', 'weakness'])
        .ilike('topic', t.topic);
    }
  }

  // 4. Cluster: merge near-duplicate struggle/weakness memories
  const { data: struggles } = await db
    .from('novo_memories')
    .select('id, content, topic, subject, importance, embedding')
    .eq('user_id', userId)
    .in('memory_type', ['struggle', 'weakness'])
    .order('importance', { ascending: false })
    .limit(80);

  if (struggles && struggles.length > 1) {
    const mems = struggles as Array<{ id: string; content: string; topic?: string; subject?: string; importance: number; embedding?: string }>;
    const merged = new Set<string>();

    // Embed any that lack embeddings
    const embeds: Record<string, number[]> = {};
    for (const m of mems) {
      if (m.embedding) {
        try { embeds[m.id] = JSON.parse(m.embedding) as number[]; } catch { /* skip */ }
      }
      if (!embeds[m.id]) {
        const v = await embed(m.content);
        if (v) {
          embeds[m.id] = v;
          await db.from('novo_memories').update({ embedding: JSON.stringify(v) }).eq('id', m.id);
        }
      }
    }

    for (let i = 0; i < mems.length; i++) {
      if (merged.has(mems[i].id) || !embeds[mems[i].id]) continue;
      const cluster: typeof mems = [mems[i]];
      for (let j = i + 1; j < mems.length; j++) {
        if (merged.has(mems[j].id) || !embeds[mems[j].id]) continue;
        if (cosineSim(embeds[mems[i].id], embeds[mems[j].id]) >= CLUSTER_SIMILARITY) {
          cluster.push(mems[j]);
          merged.add(mems[j].id);
        }
      }
      if (cluster.length < 2) continue;

      // Merge cluster into first memory
      const merged_content = await summarizeMerge(cluster.map(c => c.content));
      const max_importance = Math.min(10, Math.max(...cluster.map(c => c.importance)));
      await db.from('novo_memories').update({
        content:      merged_content,
        importance:   max_importance,
        last_used_at: now.toISOString(),
      }).eq('id', mems[i].id);
      const deleteIds = cluster.slice(1).map(c => c.id);
      await db.from('novo_memories').delete().in('id', deleteIds);
      stats.merged += deleteIds.length;
    }
  }

  return stats;
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  // Validate internal secret to prevent unauthorized runs
  const secret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (expectedSecret && secret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  // No per-user rate limit — internal/cron-triggered only

  const t0 = Date.now();
  let totalPruned = 0, totalMerged = 0, totalDecayed = 0, usersProcessed = 0;

  try {
    // Get users with recent memory activity (last 7 days active = worth consolidating)
    const { data: activeUsers } = await db
      .from('novo_memories')
      .select('user_id')
      .gte('last_used_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .limit(MAX_USERS_PER_RUN * 5); // fetch more, deduplicate

    const uniqueUsers = [...new Set((activeUsers ?? []).map((r: { user_id: string }) => r.user_id))].slice(0, MAX_USERS_PER_RUN);

    for (const uid of uniqueUsers) {
      try {
        const stats = await consolidateUser(uid);
        totalPruned  += stats.pruned;
        totalMerged  += stats.merged;
        totalDecayed += stats.decayed;
        usersProcessed++;
      } catch (err) {
        console.error('[consolidate] user error', uid, (err as Error)?.message);
      }
    }
  } catch (err) {
    console.error('[consolidate] fatal', (err as Error)?.message);
    return new Response(JSON.stringify({ error: (err as Error)?.message }), {
      status: 500, headers: { ...getCors(req), 'Content-Type': 'application/json' },
    });
  }

  const summary = {
    ok: true,
    elapsed_ms:     Date.now() - t0,
    users_processed: usersProcessed,
    pruned:          totalPruned,
    merged:          totalMerged,
    decayed:         totalDecayed,
  };
  console.log('[consolidate] done', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { ...getCors(req), 'Content-Type': 'application/json' },
  });
});
