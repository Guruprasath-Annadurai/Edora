// ─────────────────────────────────────────────────────────────────────────────
// analytics — attention heatmap + confidence scores + overview stats
// Actions: get_heatmap | get_confidence | record_confidence | record_activity
//          get_overview | sync_from_existing
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
// ── Confidence scoring formula ────────────────────────────────────────────────
// fast+correct=100, slow+correct=70, fast+wrong=20(overconfident), slow+wrong=0
function computeConfidence(correct: boolean, responseMs: number | null): number {
  const fast = !responseMs || responseMs < 8000;   // under 8s = fast
  const medium = responseMs && responseMs < 20000;  // 8-20s = medium
  if (correct && fast)    return 95;
  if (correct && medium)  return 75;
  if (correct)            return 60;   // slow + correct = shaky
  if (!correct && fast)   return 20;   // fast + wrong = overconfident
  if (!correct && medium) return 10;
  return 5;                            // slow + wrong
}

// ── EF factor → confidence (for SR cards without explicit events) ─────────────
function efToConfidence(ef: number, repetitions: number): number {
  if (repetitions < 2) return 50; // not enough data
  if (ef >= 2.6) return 90;
  if (ef >= 2.3) return 75;
  if (ef >= 2.0) return 55;
  if (ef >= 1.7) return 35;
  return 20;
}

serve(withSentry('analytics', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(supabase, user.id, 'analytics', 80, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── get_heatmap ───────────────────────────────────────────────────────────
  // Returns per-topic "days since last studied" + Novo alerts for neglected topics
  if (action === 'get_heatmap') {
    const now = new Date();

    // 1. SR card last reviews (most granular — topic level)
    const { data: srCards } = await supabase
      .from('sr_cards')
      .select('subject, topic, last_reviewed_at, next_review_date, ef_factor, repetitions')
      .eq('user_id', user.id)
      .not('last_reviewed_at', 'is', null);

    // 2. topic_attention_log (cross-feature activity)
    const { data: attentionLog } = await supabase
      .from('topic_attention_log')
      .select('subject, topic, source, studied_at')
      .eq('user_id', user.id);

    // 3. user_topic_progress (curriculum progress)
    const { data: topicProgress } = await supabase
      .from('user_topic_progress')
      .select('topic_id, status, updated_at, curriculum_topics(title, subject)')
      .eq('user_id', user.id);

    // Build a map of (subject::topic) → most recent timestamp
    const lastStudied = new Map<string, { date: Date; source: string }>();

    const upsert = (subject: string, topic: string, date: Date | null, source: string) => {
      if (!date) return;
      const key = `${subject}::${topic}`;
      const existing = lastStudied.get(key);
      if (!existing || date > existing.date) {
        lastStudied.set(key, { date, source });
      }
    };

    for (const c of srCards ?? []) {
      upsert(c.subject, c.topic, c.last_reviewed_at ? new Date(c.last_reviewed_at) : null, 'sr_review');
    }
    for (const a of attentionLog ?? []) {
      upsert(a.subject, a.topic, new Date(a.studied_at), a.source);
    }
    for (const p of topicProgress ?? []) {
      const ct = p.curriculum_topics as { title: string; subject: string } | null;
      if (ct) upsert(ct.subject, ct.title, new Date(p.updated_at), 'curriculum');
    }

    // Build heatmap entries
    const entries = Array.from(lastStudied.entries()).map(([key, { date, source }]) => {
      const [subject, topic] = key.split('::');
      const daysSince = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      return { subject, topic, days_since: daysSince, last_studied: date.toISOString(), source };
    });

    // Sort by days_since descending (most neglected first)
    entries.sort((a, b) => b.days_since - a.days_since);

    // Generate Novo alerts for topics neglected >7 days
    const neglected = entries.filter(e => e.days_since >= 7).slice(0, 5);
    const alerts = neglected.map(e => ({
      subject: e.subject,
      topic: e.topic,
      days_since: e.days_since,
      message: e.days_since >= 30
        ? `You haven't touched ${e.topic} in ${e.days_since} days — this could hurt your exam.`
        : e.days_since >= 14
        ? `${e.topic} hasn't been reviewed in ${e.days_since} days. Time to revisit.`
        : `You haven't touched ${e.topic} in ${e.days_since} days.`,
      urgency: e.days_since >= 21 ? 'high' : e.days_since >= 14 ? 'medium' : 'low',
    }));

    // Group by subject for heatmap grid
    const bySubject: Record<string, typeof entries> = {};
    for (const e of entries) {
      if (!bySubject[e.subject]) bySubject[e.subject] = [];
      bySubject[e.subject].push(e);
    }

    return json({ heatmap: bySubject, alerts, total_topics: entries.length });
  }

  // ── get_confidence ────────────────────────────────────────────────────────
  // Computes per-topic confidence from ALL available data — never empty for
  // any user who has done anything in the app.
  if (action === 'get_confidence') {
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: events },
      { data: srCards },
      { data: challenges },
      { data: stories },
      { data: debates },
      { data: streakDays },
      { data: sprintSessions },
    ] = await Promise.all([
      // Explicit timed events (most precise — weight 3)
      supabase.from('confidence_events').select('subject,topic,correct,response_time_ms,confidence_score').eq('user_id', user.id).gte('created_at', since90),
      // SR cards — EF factor is a strong proxy (weight 2)
      supabase.from('sr_cards').select('subject,topic,ef_factor,repetitions').eq('user_id', user.id),
      // Challenge scores → subject-level confidence proxy (weight 1)
      supabase.from('user_challenge_attempts').select('subject,score,status').eq('user_id', user.id).eq('status','completed'),
      // Story sessions — concept checkpoints passed = understood (weight 1)
      supabase.from('story_sessions').select('subject,topic,checkpoints_passed,status').eq('user_id', user.id),
      // Debate scores — arguing a topic = deep engagement (weight 1)
      supabase.from('debate_sessions').select('subject,topic,score').eq('user_id', user.id).not('score','is',null),
      // Streak completions — daily practice = competence (weight 1)
      supabase.from('streak_challenge_days').select('completed_at,streak_challenges(subject,topic)').eq('user_id', user.id),
      // Sprint sessions — give subject-level signal (weight 1)
      supabase.from('sprint_sessions').select('subject,xp_earned,completed').eq('user_id', user.id).eq('completed', true).limit(100),
    ]);

    const topicData = new Map<string, { scores: number[]; subject: string; topic: string }>();

    const addScore = (subject: string, topic: string, score: number, weight = 1) => {
      if (!subject || !topic) return;
      const key = `${subject}::${topic}`;
      if (!topicData.has(key)) topicData.set(key, { scores: [], subject, topic });
      for (let i = 0; i < weight; i++) topicData.get(key)!.scores.push(Math.max(0, Math.min(100, score)));
    };

    // Subject-level data: distribute across existing topics for that subject,
    // or create a synthetic "[subject] General" entry
    const addSubjectScore = (subject: string, score: number, weight = 1) => {
      if (!subject) return;
      const existingTopics = Array.from(topicData.values()).filter(t => t.subject === subject);
      if (existingTopics.length > 0) {
        for (const t of existingTopics) addScore(subject, t.topic, score, weight);
      } else {
        addScore(subject, 'General Practice', score, weight);
      }
    };

    // 1. Explicit timed events (weight 3 — gold standard)
    for (const ev of events ?? []) addScore(ev.subject, ev.topic, ev.confidence_score, 3);

    // 2. SR cards via EF factor (weight 2 — strong academic signal)
    for (const card of srCards ?? []) {
      addScore(card.subject, card.topic, efToConfidence(card.ef_factor, card.repetitions), 2);
    }

    // 3. Challenge scores → subject confidence (weight 1)
    for (const c of challenges ?? []) {
      // score 0-100 maps directly to confidence
      addSubjectScore(c.subject, c.score ?? 50, 1);
    }

    // 4. Story sessions — checkpoints passed → topic engagement (weight 1)
    for (const s of stories ?? []) {
      const checkpoints = s.checkpoints_passed ?? 0;
      const storyScore = s.status === 'completed' ? 75 : checkpoints > 0 ? 55 : 40;
      if (s.topic) addScore(s.subject, s.topic, storyScore, 1);
      else addSubjectScore(s.subject, storyScore, 1);
    }

    // 5. Debate scores → topic confidence (weight 1)
    for (const d of debates ?? []) {
      const debateScore = d.score ? Math.min(100, d.score * 0.8) : 50; // debate 0-100 → slightly deflated
      if (d.topic) addScore(d.subject ?? 'General', d.topic, debateScore, 1);
    }

    // 6. Streak completions → topic practice confidence (weight 1)
    for (const day of streakDays ?? []) {
      const sc = day.streak_challenges as { subject: string; topic: string } | null;
      if (!sc) continue;
      addScore(sc.subject, sc.topic, 65, 1); // completing daily tasks = medium-high confidence
    }

    // 7. Sprint sessions → subject signal (weight 1, lowest confidence proxy)
    for (const sp of sprintSessions ?? []) {
      if (!sp.subject) continue;
      const sprintScore = Math.min(90, 40 + (sp.xp_earned ?? 0) / 5); // xp ≈ quality proxy
      addSubjectScore(sp.subject, sprintScore, 1);
    }

    const results = Array.from(topicData.values()).map(({ subject, topic, scores }) => {
      const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
      const level = avg >= 80 ? 'high' : avg >= 55 ? 'medium' : avg >= 35 ? 'shaky' : 'low';
      const drill = avg >= 80
        ? 'Challenge yourself with harder problems in Boss Challenges'
        : avg >= 55
        ? 'Practice with timed questions in Sprint Mode to build speed'
        : avg >= 35
        ? 'Review core concepts, then practice step-by-step with AI Tutor'
        : 'Return to fundamentals — use Story Mode or 1-on-1 Tutoring';
      return { subject, topic, score: avg, level, drill, sample_count: scores.length };
    });

    results.sort((a, b) => a.score - b.score); // weakest first

    const bySubject: Record<string, { avg: number; topics: typeof results }> = {};
    for (const r of results) {
      if (!bySubject[r.subject]) bySubject[r.subject] = { avg: 0, topics: [] };
      bySubject[r.subject].topics.push(r);
    }
    for (const sub of Object.keys(bySubject)) {
      const topics = bySubject[sub].topics;
      bySubject[sub].avg = Math.round(topics.reduce((s, t) => s + t.score, 0) / topics.length);
    }

    return json({ by_subject: bySubject, all_topics: results });
  }

  // ── record_confidence ─────────────────────────────────────────────────────
  // Called by quiz, sprint, challenge pages when an answer is submitted
  if (action === 'record_confidence') {
    const { subject, topic, correct, response_time_ms, source = 'unknown' } = body;
    const score = computeConfidence(correct, response_time_ms);

    await supabase.from('confidence_events').insert({
      user_id: user.id, subject, topic, source, correct, response_time_ms, confidence_score: score,
    });

    // Also upsert topic attention log
    await supabase.from('topic_attention_log').upsert(
      { user_id: user.id, subject, topic, source, studied_at: new Date().toISOString() },
      { onConflict: 'user_id,subject,topic' }
    );

    return json({ confidence_score: score });
  }

  // ── record_activity ───────────────────────────────────────────────────────
  // Lightweight — just marks that a topic was studied
  if (action === 'record_activity') {
    const { subject, topic, source = 'unknown' } = body;
    await supabase.from('topic_attention_log').upsert(
      { user_id: user.id, subject, topic, source, studied_at: new Date().toISOString() },
      { onConflict: 'user_id,subject,topic' }
    );
    return json({ ok: true });
  }

  // ── sync_from_existing ────────────────────────────────────────────────────
  // Comprehensive backfill from ALL data sources — runs on first heatmap view.
  // Safe to call multiple times (upsert keeps only the latest timestamp per topic).
  // Uses batched upserts (one call per source) to avoid N+1 sequential round-trips.
  if (action === 'sync_from_existing') {
    type ActivityRow = { user_id: string; subject: string; topic: string; source: string; studied_at: string };

    // Fetch all 10 sources in parallel
    const [
      { data: srCards },
      { data: streakDays },
      { data: stories },
      { data: debates },
      { data: topicProgress },
      { data: challenges },
      { data: whiteboards },
      { data: photos },
      { data: reads },
      { data: videos },
    ] = await Promise.all([
      supabase.from('sr_cards').select('subject,topic,last_reviewed_at,created_at').eq('user_id', user.id),
      supabase.from('streak_challenge_days').select('completed_at,streak_challenges(subject,topic)').eq('user_id', user.id),
      supabase.from('story_sessions').select('subject,topic,created_at,updated_at').eq('user_id', user.id),
      supabase.from('debate_sessions').select('subject,topic,created_at,updated_at').eq('user_id', user.id),
      supabase.from('user_topic_progress').select('updated_at,curriculum_topics(title,subject)').eq('user_id', user.id),
      supabase.from('user_challenge_attempts').select('subject,challenge_date,daily_challenges(topic)').eq('user_id', user.id).eq('status','completed'),
      supabase.from('whiteboard_analyses').select('subject,created_at').eq('user_id', user.id),
      supabase.from('photo_solves').select('subject,created_at').eq('user_id', user.id),
      supabase.from('reading_sessions').select('subject,topic,created_at').eq('user_id', user.id),
      supabase.from('video_sessions').select('topic_tags,created_at').eq('user_id', user.id),
    ]);

    // Build one batch array from all sources
    const rows: ActivityRow[] = [];

    const add = (subject: string, topic: string, source: string, studied_at: string) => {
      if (!subject || !topic || !studied_at) return;
      rows.push({ user_id: user.id, subject, topic, source, studied_at });
    };

    // 1. SR cards
    for (const c of srCards ?? []) add(c.subject, c.topic, 'sr_review', c.last_reviewed_at ?? c.created_at);

    // 2. Streak challenge completions
    for (const d of streakDays ?? []) {
      const sc = d.streak_challenges as { subject: string; topic: string } | null;
      if (sc) add(sc.subject, sc.topic, 'streak', d.completed_at);
    }

    // 3. Story sessions
    for (const s of stories ?? []) {
      if (s.topic) add(s.subject, s.topic, 'story', s.updated_at ?? s.created_at);
    }

    // 4. Debate sessions
    for (const d of debates ?? []) {
      if (d.topic) add(d.subject ?? 'General', d.topic, 'debate', d.updated_at ?? d.created_at);
    }

    // 5. Curriculum progress
    for (const p of topicProgress ?? []) {
      const ct = p.curriculum_topics as { title: string; subject: string } | null;
      if (ct) add(ct.subject, ct.title, 'curriculum', p.updated_at);
    }

    // 6. Challenge attempts
    for (const c of challenges ?? []) {
      const dc = c.daily_challenges as { topic: string } | null;
      add(c.subject, dc?.topic ?? 'Boss Challenge', 'challenge', c.challenge_date + 'T12:00:00Z');
    }

    // 7. Whiteboard analyses
    for (const w of whiteboards ?? []) {
      if (w.subject) add(w.subject, 'Whiteboard Practice', 'whiteboard', w.created_at);
    }

    // 8. Photo solves
    for (const p of photos ?? []) {
      if (p.subject) add(p.subject, 'Photo Problem Solving', 'photo_solver', p.created_at);
    }

    // 9. Novo Reads sessions
    for (const r of reads ?? []) {
      add(r.subject ?? 'General', r.topic ?? 'Reading & Comprehension', 'novo_reads', r.created_at);
    }

    // 10. Video sessions
    for (const v of videos ?? []) {
      for (const tag of ((v.topic_tags as string[]) ?? []).slice(0, 3)) {
        add('General', tag, 'video_companion', v.created_at);
      }
    }

    // Batch upsert — single DB call instead of N sequential calls
    const synced = rows.length;
    if (rows.length > 0) {
      await supabase.from('topic_attention_log').upsert(rows, { onConflict: 'user_id,subject,topic' });
    }

    return json({ synced });
  }

  // ── get_overview ──────────────────────────────────────────────────────────
  // Dashboard summary stats for parent/teacher views
  if (action === 'get_overview') {
    const { days = 30 } = body;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: profile },
      { data: sprints },
      { data: srReviews },
      { data: challenges },
      { data: debates },
      { data: stories },
    ] = await Promise.all([
      supabase.from('profiles').select('full_name,xp,level,streak_count,exam_date').eq('id', user.id).single(),
      supabase.from('sprint_sessions').select('xp_earned,completed,created_at').eq('user_id', user.id).gte('created_at', since),
      supabase.from('sr_cards').select('subject,topic,ef_factor,repetitions,last_reviewed_at').eq('user_id', user.id),
      supabase.from('user_challenge_attempts').select('score,xp_earned,challenge_date,subject').eq('user_id', user.id).gte('challenge_date', since.slice(0,10)),
      supabase.from('debate_sessions').select('score,topic,created_at').eq('user_id', user.id).gte('created_at', since),
      supabase.from('story_sessions').select('xp_earned,concepts_covered,created_at').eq('user_id', user.id).gte('created_at', since),
    ]);

    const completedSprints = (sprints ?? []).filter(s => s.completed);
    const totalXPPeriod = completedSprints.reduce((s, sp) => s + (sp.xp_earned || 0), 0)
      + (challenges ?? []).reduce((s, c) => s + (c.xp_earned || 0), 0);

    // Mastery by subject (from SR cards)
    // NOTE: field is named `total` (not `cards`) to match what ParentDashboardPage expects
    const masteryBySubject: Record<string, { total: number; avg_ef: number; mastered: number }> = {};
    for (const card of srReviews ?? []) {
      if (!masteryBySubject[card.subject]) masteryBySubject[card.subject] = { total: 0, avg_ef: 0, mastered: 0 };
      const sub = masteryBySubject[card.subject];
      sub.total++;
      sub.avg_ef += card.ef_factor;
      if (card.ef_factor >= 2.5 && card.repetitions >= 3) sub.mastered++;
    }
    for (const sub of Object.keys(masteryBySubject)) {
      const s = masteryBySubject[sub];
      s.avg_ef = s.total > 0 ? Math.round((s.avg_ef / s.total) * 100) / 100 : 2.5;
    }

    // Top concepts from story sessions
    const conceptSet = new Set<string>();
    for (const s of stories ?? []) {
      for (const c of (s.concepts_covered as string[] || [])) conceptSet.add(c);
    }

    return json({
      profile,
      period_days: days,
      stats: {
        sprints_completed: completedSprints.length,
        sr_cards_total: (srReviews ?? []).length,
        challenges_attempted: (challenges ?? []).length,
        debates_completed: (debates ?? []).length,
        stories_completed: (stories ?? []).length,
        xp_earned: totalXPPeriod,
        avg_challenge_score: (challenges ?? []).length
          ? Math.round((challenges ?? []).reduce((s, c) => s + (c.score || 0), 0) / (challenges ?? []).length)
          : null,
      },
      mastery_by_subject: masteryBySubject,
      concepts_learned: Array.from(conceptSet).slice(0, 20),
    });
  }

  return json({ error: 'Unknown action' }, 400);
}));
