// ─────────────────────────────────────────────────────────────────────────────
// anomaly-detection — staff-only, gated by public.has_role(uid,'admin')
//
// Flags suspicious battle-timing patterns: a player finishing a multi-question
// battle implausibly fast with a perfect/near-perfect score is the classic
// signature of pre-knowing the answers (leaked question set, screen-sharing,
// or an automated solver) rather than genuine mastery.
//
// This is heuristic (SQL thresholds), not ML — reasoning is a plain-English
// explanation of which threshold(s) tripped, not an LLM call. Flags only;
// no auto-punishment. A human always makes the final call.
//
// Actions: run_scan | list_flags | resolve_flag
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

// A 10-question battle answered in under this many seconds total, at a
// near-perfect score, is implausibly fast for genuine reading + solving.
const FAST_BATTLE_SECONDS = 25;
const HIGH_SCORE_RATIO    = 0.9;
const LOOKBACK_DAYS       = 14;
const MIN_BATTLES_FOR_PATTERN = 3;

serve(withSentry('anomaly-detection', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: isAdmin } = await serviceDb.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'Forbidden — admin role required' }, 403);

  const rl = await checkRateLimit(serviceDb, user.id, 'anomaly_detection', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'run_scan') {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: battles, error } = await serviceDb
      .from('battles')
      .select('id, player1_id, player2_id, player1_score, player2_score, question_ids, started_at, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', since)
      .not('started_at', 'is', null);
    if (error) return json({ error: error.message }, 500);

    const { data: existingFlags } = await serviceDb.from('anomaly_flags').select('user_id').eq('status', 'open');
    const alreadyFlagged = new Set((existingFlags ?? []).map((f: { user_id: string }) => f.user_id));

    // For each player, count "fast + near-perfect" battles in the window.
    const perPlayer = new Map<string, { fastPerfect: number; total: number; evidenceBattles: string[] }>();
    for (const b of (battles ?? []) as Record<string, unknown>[]) {
      const durationSec = (new Date(b.completed_at as string).getTime() - new Date(b.started_at as string).getTime()) / 1000;
      const qCount = ((b.question_ids as string[]) ?? []).length || 10;
      for (const [uid, score] of [[b.player1_id as string, b.player1_score as number], [b.player2_id as string, b.player2_score as number]] as const) {
        const entry = perPlayer.get(uid) ?? { fastPerfect: 0, total: 0, evidenceBattles: [] };
        entry.total += 1;
        const scoreRatio = qCount > 0 ? score / qCount : 0;
        if (durationSec > 0 && durationSec < FAST_BATTLE_SECONDS && scoreRatio >= HIGH_SCORE_RATIO) {
          entry.fastPerfect += 1;
          entry.evidenceBattles.push(b.id as string);
        }
        perPlayer.set(uid, entry);
      }
    }

    let created = 0;
    for (const [userId, stats] of perPlayer.entries()) {
      if (alreadyFlagged.has(userId)) continue;
      if (stats.fastPerfect < MIN_BATTLES_FOR_PATTERN) continue;
      const severity = stats.fastPerfect >= 6 ? 'high' : stats.fastPerfect >= 4 ? 'medium' : 'low';
      await serviceDb.from('anomaly_flags').insert({
        user_id: userId,
        flag_type: 'fast_perfect_battles',
        severity,
        reasoning: `${stats.fastPerfect} of ${stats.total} battles in the last ${LOOKBACK_DAYS} days were completed in under ${FAST_BATTLE_SECONDS}s with a score at or above ${Math.round(HIGH_SCORE_RATIO * 100)}% — plausible with strong genuine mastery, but worth a human look given the frequency.`,
        model_used: 'sql-heuristic',
        evidence: { fast_perfect_count: stats.fastPerfect, total_battles: stats.total, battle_ids: stats.evidenceBattles },
        status: 'open',
      });
      created += 1;
    }
    return json({ ok: true, flags_created: created, battles_scanned: (battles ?? []).length });
  }

  if (action === 'list_flags') {
    const status = (body.status as string | undefined) ?? 'open';
    const { data, error } = await serviceDb
      .from('anomaly_flags')
      .select('*, profiles(full_name)')
      .eq('status', status)
      .order('created_at', { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ flags: data ?? [] });
  }

  if (action === 'resolve_flag') {
    const { flag_id, status } = body as { flag_id: string; status: 'actioned' | 'dismissed' };
    if (!flag_id || !status) return json({ error: 'flag_id and status required' }, 400);
    const { error } = await serviceDb.from('anomaly_flags').update({ status }).eq('id', flag_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: run_scan | list_flags | resolve_flag' }, 400);
}));
