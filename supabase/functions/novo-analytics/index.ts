// ─────────────────────────────────────────────────────────────────────────────
// novo-analytics — Advanced learning analytics for Novo Pro
// Actions:
//   get_stats    — full analytics dashboard data (Pro only)
//   get_preview  — lightweight summary for free users (teaser)
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// Must mirror src/lib/trial.ts exactly. The frontend treats free-trial users
// as Pro-eligible and calls get_stats for them, but this check previously
// only looked at profile.is_pro — every trial user hit a 403 here that the
// frontend didn't expect, surfacing as a generic "Something went wrong"
// instead of the analytics dashboard.
const TRIAL_DAYS = 30;
function isInFreeTrial(createdAt: string): boolean {
  const end = new Date(createdAt);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return Date.now() < end.getTime();
}

serve(withSentry('novo-analytics', async (req) => {
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
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const rl = await checkRateLimit(supabase, user.id, `novo_analytics_${action}`, 80, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_preview ───────────────────────────────────────────────────────────
  // Quick teaser stats for free users — no AI, minimal DB queries.
  if (action === 'get_preview') {
    const [
      { count: totalSprints },
      { count: totalQuizzes },
      { data: profile },
    ] = await Promise.all([
      supabase.from('sprint_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('completed', true),
      supabase.from('quiz_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).not('completed_at', 'is', null),
      supabase.from('profiles').select('xp, streak_count, level').eq('id', user.id).single(),
    ]);

    return json({
      preview: {
        total_sprints: totalSprints ?? 0,
        total_quizzes: totalQuizzes ?? 0,
        xp:            profile?.xp ?? 0,
        streak:        profile?.streak_count ?? 0,
        level:         profile?.level ?? 1,
      },
      pro_required: true,
    });
  }

  // ── get_stats ─────────────────────────────────────────────────────────────
  if (action === 'get_stats') {
    // Check Pro status
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, pro_expires_at, exam_date, exam_name')
      .eq('id', user.id)
      .single();

    const hasProSubscription = profile?.is_pro && (
      !profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()
    );
    const isPro = hasProSubscription || isInFreeTrial(user.created_at);
    if (!isPro) return json({ error: 'Novo Pro required', pro_required: true }, 403);

    const since30d = daysAgo(30);
    const since14d = daysAgo(14);

    // Parallel data fetch
    const [
      { data: sprints },
      { data: quizzes },
      { data: certs },
      { data: recentSprints },
    ] = await Promise.all([
      supabase.from('sprint_sessions')
        .select('subject, topic, completed, xp_earned, created_at')
        .eq('user_id', user.id).eq('completed', true)
        .gte('created_at', since30d)
        .order('created_at', { ascending: true }),
      supabase.from('quiz_sessions')
        .select('subject, topic, score, questions, created_at')
        .eq('user_id', user.id).not('completed_at', 'is', null)
        .gte('created_at', since30d),
      supabase.from('certification_assessments')
        .select('subject, topic, pct_score, status, completed_at')
        .eq('user_id', user.id).not('completed_at', 'is', null)
        .gte('completed_at', since30d),
      supabase.from('sprint_sessions')
        .select('subject, xp_earned, created_at')
        .eq('user_id', user.id).eq('completed', true)
        .gte('created_at', since14d)
        .order('created_at', { ascending: true }),
    ]);

    // ── Subject accuracy ──────────────────────────────────────────────────────
    const subjectMap: Record<string, { correct: number; total: number }> = {};

    for (const q of quizzes ?? []) {
      if (!q.subject) continue;
      const questions = Array.isArray(q.questions) ? q.questions : [];
      const total = questions.length;
      const correct = q.score ?? 0;
      if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, total: 0 };
      subjectMap[q.subject].correct += correct;
      subjectMap[q.subject].total   += total;
    }

    for (const c of certs ?? []) {
      if (!c.subject) continue;
      if (!subjectMap[c.subject]) subjectMap[c.subject] = { correct: 0, total: 0 };
      // Treat cert score as weighted assessment (10 questions)
      subjectMap[c.subject].correct += Math.round((c.pct_score / 100) * 10);
      subjectMap[c.subject].total   += 10;
    }

    const subject_accuracy = Object.entries(subjectMap)
      .filter(([, v]) => v.total > 0)
      .map(([subject, v]) => ({
        subject,
        accuracy: Math.round((v.correct / v.total) * 100),
        total:    v.total,
      }))
      .sort((a, b) => b.total - a.total);

    // ── Weak topics ───────────────────────────────────────────────────────────
    const topicMap: Record<string, { subject: string; correct: number; total: number }> = {};

    for (const q of quizzes ?? []) {
      if (!q.topic) continue;
      const questions = Array.isArray(q.questions) ? q.questions : [];
      const total   = questions.length;
      const correct = q.score ?? 0;
      const key = `${q.subject}||${q.topic}`;
      if (!topicMap[key]) topicMap[key] = { subject: q.subject, correct: 0, total: 0 };
      topicMap[key].correct += correct;
      topicMap[key].total   += total;
    }

    const weak_topics = Object.entries(topicMap)
      .filter(([, v]) => v.total >= 3) // need at least 3 questions to be meaningful
      .map(([key, v]) => ({
        topic:    key.split('||')[1],
        subject:  v.subject,
        accuracy: Math.round((v.correct / v.total) * 100),
        count:    v.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 8);

    // ── XP by day (last 14 days) ──────────────────────────────────────────────
    const xpByDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      xpByDay[d] = 0;
    }
    for (const s of recentSprints ?? []) {
      const d = s.created_at.slice(0, 10);
      if (d in xpByDay) xpByDay[d] += s.xp_earned ?? 0;
    }
    const xp_by_day = Object.entries(xpByDay).map(([date, xp]) => ({ date, xp }));

    // ── Study time by subject ─────────────────────────────────────────────────
    const timeBySubject: Record<string, number> = {};
    for (const s of sprints ?? []) {
      if (!s.subject) continue;
      // Each completed sprint = ~25 min average
      timeBySubject[s.subject] = (timeBySubject[s.subject] ?? 0) + 25;
    }
    const study_time_by_subject = Object.entries(timeBySubject)
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    // ── Predicted exam score ──────────────────────────────────────────────────
    // Simple weighted average of recent quiz + cert performance, with recency bias.
    let predicted_score: number | null = null;
    const recentScores: { score: number; weight: number }[] = [];

    for (const q of (quizzes ?? []).slice(-10)) {
      const questions = Array.isArray(q.questions) ? q.questions : [];
      if (questions.length > 0) {
        const pct = ((q.score ?? 0) / questions.length) * 100;
        const agedays = (Date.now() - new Date(q.created_at).getTime()) / 86400000;
        recentScores.push({ score: pct, weight: Math.max(0.1, 1 - agedays / 30) });
      }
    }
    for (const c of (certs ?? []).slice(-5)) {
      const agedays = (Date.now() - new Date(c.completed_at!).getTime()) / 86400000;
      recentScores.push({ score: c.pct_score, weight: Math.max(0.1, 1.5 - agedays / 30) });
    }

    if (recentScores.length >= 3) {
      const totalWeight = recentScores.reduce((s, r) => s + r.weight, 0);
      predicted_score = Math.round(
        recentScores.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight,
      );
    }

    // ── Summary stats ─────────────────────────────────────────────────────────
    const total_sessions_30d = (sprints?.length ?? 0);
    const allAccuracies = subject_accuracy.map(s => s.accuracy);
    const avg_accuracy_30d = allAccuracies.length > 0
      ? Math.round(allAccuracies.reduce((a, b) => a + b, 0) / allAccuracies.length)
      : 0;

    const best_subject  = subject_accuracy.find(s => s.accuracy === Math.max(...allAccuracies))?.subject ?? null;
    const worst_subject = subject_accuracy.find(s => s.accuracy === Math.min(...allAccuracies))?.subject ?? null;

    return json({
      stats: {
        subject_accuracy,
        weak_topics,
        xp_by_day,
        study_time_by_subject,
        predicted_score,
        total_sessions_30d,
        avg_accuracy_30d,
        best_subject,
        worst_subject,
      },
      pro_required: false,
    });
  }

  return json({ error: 'Unknown action' }, 400);
}));
