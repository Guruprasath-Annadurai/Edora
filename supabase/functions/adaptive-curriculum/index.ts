// adaptive-curriculum — nightly background agent (Retention outcomes loop)
// Watches subtopic_mastery + sr_cards for stagnation signals, logs a weak-topic
// memory, proactively schedules revision, and reprioritizes the student's
// revision plan so the stuck topic surfaces sooner.
//
// study → assess → adapt → study
//
// Triggered by pg_cron (see 20260701_adaptive_curriculum_loop.sql).
// Runs entirely server-side: no client, no streaming.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }  from '../_shared/cors.ts';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_USERS_PER_RUN      = 50;
const ACTIVITY_WINDOW_DAYS   = 21;  // only scan students active in the last N days
const RECHECK_COOLDOWN_DAYS  = 7;   // don't re-flag the same topic within N days
const MASTERY_STAGNATION_MAX = 0.6; // mastery below this is "not improving"
const MIN_ATTEMPTS           = 3;
const MIN_CONSECUTIVE_WRONG  = 2;
const SR_MIN_REPETITIONS     = 2;
const SR_MAX_LAST_QUALITY    = 2;   // SM-2 quality 0-5, <=2 is a fail

interface StagnantTopic {
  subject: string;
  topic: string;
  reason: 'stagnant_mastery' | 'struggling_sr_card';
  mastery_score: number | null;
  consecutive_wrong: number | null;
}

interface RevisionPlanRow {
  id: string;
  weeks: Array<{ chapters?: Array<{ name?: string; done?: boolean; priority?: boolean }> }>;
}

// ── Detect stagnation for one user ──────────────────────────────────────────
async function detectStagnation(userId: string): Promise<StagnantTopic[]> {
  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86400_000).toISOString();
  const found: StagnantTopic[] = [];

  const { data: masteryRows } = await db
    .from('subtopic_mastery')
    .select('subject, subtopic, mastery_score, attempts, consecutive_wrong, last_attempted_at')
    .eq('user_id', userId)
    .gte('attempts', MIN_ATTEMPTS)
    .gte('consecutive_wrong', MIN_CONSECUTIVE_WRONG)
    .lte('mastery_score', MASTERY_STAGNATION_MAX)
    .gte('last_attempted_at', cutoff);

  for (const r of (masteryRows ?? []) as Array<{ subject: string; subtopic: string; mastery_score: number; consecutive_wrong: number }>) {
    found.push({
      subject: r.subject, topic: r.subtopic, reason: 'stagnant_mastery',
      mastery_score: r.mastery_score, consecutive_wrong: r.consecutive_wrong,
    });
  }

  const { data: srRows } = await db
    .from('sr_cards')
    .select('subject, topic, repetitions, last_quality, last_reviewed_at')
    .eq('user_id', userId)
    .gte('repetitions', SR_MIN_REPETITIONS)
    .lte('last_quality', SR_MAX_LAST_QUALITY)
    .gte('last_reviewed_at', cutoff);

  for (const r of (srRows ?? []) as Array<{ subject: string; topic: string }>) {
    if (found.some(f => f.topic.toLowerCase() === r.topic.toLowerCase() && f.subject.toLowerCase() === r.subject.toLowerCase())) continue;
    found.push({ subject: r.subject, topic: r.topic, reason: 'struggling_sr_card', mastery_score: null, consecutive_wrong: null });
  }

  return found;
}

// ── Reprioritize the student's active revision plan ─────────────────────────
async function reprioritizePlan(userId: string, topic: string): Promise<string | null> {
  const { data: plan } = await db
    .from('revision_plans')
    .select('id, weeks')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const p = plan as RevisionPlanRow;
  let changed = false;
  const needle = topic.toLowerCase();

  for (const week of p.weeks ?? []) {
    if (!week.chapters?.length) continue;
    const idx = week.chapters.findIndex(c => !c.done && (c.name ?? '').toLowerCase().includes(needle));
    if (idx > 0) {
      const [chapter] = week.chapters.splice(idx, 1);
      chapter.priority = true;
      week.chapters.unshift(chapter);
      changed = true;
      break; // only bump in the first week where it's found
    } else if (idx === 0 && !week.chapters[0].priority) {
      week.chapters[0].priority = true;
      changed = true;
      break;
    }
  }

  if (!changed) return null;

  await db.from('revision_plans')
    .update({ weeks: p.weeks, updated_at: new Date().toISOString() })
    .eq('id', p.id);

  return p.id;
}

// ── Apply adjustment for one stagnant topic ─────────────────────────────────
async function applyAdjustment(userId: string, t: StagnantTopic): Promise<void> {
  const cooldown = new Date(Date.now() - RECHECK_COOLDOWN_DAYS * 86400_000).toISOString();
  const { data: recent } = await db
    .from('curriculum_adjustments')
    .select('id')
    .eq('user_id', userId)
    .eq('topic', t.topic)
    .gte('created_at', cooldown)
    .limit(1);
  if (recent?.length) return; // already flagged recently, skip

  const now = new Date().toISOString();

  // Mirror gemini-chat's log_weak_topic + schedule_revision tool behavior
  await db.from('novo_memories').insert([
    {
      user_id: userId, memory_type: 'struggle',
      content: `Weak: ${t.topic} — stagnating (${t.reason})`,
      subject: t.subject, topic: t.topic, importance: 8,
      source: 'adaptive_curriculum', last_used_at: now,
    },
    {
      user_id: userId, memory_type: 'schedule_request',
      content: `Schedule revision: ${t.topic}`,
      subject: t.subject, topic: t.topic, importance: 9,
      source: 'adaptive_curriculum', last_used_at: now,
    },
  ]);

  const planId = await reprioritizePlan(userId, t.topic);

  await db.from('curriculum_adjustments').insert({
    user_id: userId, subject: t.subject, topic: t.topic, reason: t.reason,
    mastery_score: t.mastery_score, consecutive_wrong: t.consecutive_wrong,
    action_taken: planId ? 'plan_reprioritized' : 'scheduled_revision',
    revision_plan_id: planId,
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCors(req) });

  const secret         = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  // No per-user rate limit — internal/cron-triggered only

  const t0 = Date.now();
  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86400_000).toISOString();

  const { data: activeUsers } = await db
    .from('subtopic_mastery')
    .select('user_id')
    .gte('last_attempted_at', cutoff)
    .order('last_attempted_at', { ascending: false })
    .limit(MAX_USERS_PER_RUN * 3);

  const userIds = [...new Set((activeUsers ?? []).map((r: { user_id: string }) => r.user_id))].slice(0, MAX_USERS_PER_RUN);

  let usersScanned = 0;
  let adjustmentsMade = 0;

  for (const userId of userIds) {
    usersScanned++;
    const stagnant = await detectStagnation(userId);
    for (const t of stagnant) {
      await applyAdjustment(userId, t);
      adjustmentsMade++;
    }
  }

  const summary = { users_scanned: usersScanned, adjustments_made: adjustmentsMade, elapsed_ms: Date.now() - t0 };
  console.log(`[adaptive-curriculum] ${JSON.stringify(summary)}`);

  return new Response(JSON.stringify(summary), {
    headers: { ...getCors(req), 'Content-Type': 'application/json' },
  });
});
