// ─────────────────────────────────────────────────────────────────────────────
// exam-prediction — the "Exam-Day Readiness Score": projects likely exam
// score + minimum daily effort needed. Nemotron-primary/Gemini-fallback.
// Weighs real mock_test_attempts percentile trend over self-reported
// confidence when both are present. Low scores (<30) always ship with a
// concrete quick-win in the narrative — never a bare demoralizing number.
// Actions: predict (self) | get_cached | clear_cache | run_cron (cron-only,
// proactive weekly refresh for active users so the score is ready before
// they open the app, not just computed on-demand).
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

async function geminiJSON<T>(prompt: string): Promise<T> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + '\n\nReturn valid JSON only. No markdown.' }] }],
      }),
    }
  );
  const d = await res.json();
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

async function nemotronJSON<T>(prompt: string): Promise<T> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) throw new Error('NVIDIA_API_KEY not configured');
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt + '\n\nReturn valid JSON only. No markdown.' }],
      temperature: 0.4,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const d = await res.json();
  const raw = d.choices?.[0]?.message?.content ?? '{}';
  if (!raw.trim()) throw new Error('empty response');
  return JSON.parse(raw) as T;
}

async function reasonAboutReadiness<T>(prompt: string): Promise<{ result: T; model: string }> {
  try {
    return { result: await nemotronJSON<T>(prompt), model: 'nemotron-3-ultra-550b' };
  } catch (e) {
    console.error('Nemotron readiness prediction failed, falling back to Gemini:', e);
    return { result: await geminiJSON<T>(prompt), model: 'gemini-1.5-flash' };
  }
}

interface PredictionResult {
  predicted_score: number;
  predicted_grade: string;
  target_score: number;
  target_grade: string;
  daily_hours_needed: number;
  confidence_level: string;
  weak_topics: string[];
  strong_topics: string[];
  narrative: string;
  study_plan: Array<{ week: string; focus: string; hours_per_day: number; topics: string[] }>;
}

async function computeReadinessForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  targetScore?: number,
  targetGrade?: string,
): Promise<{ prediction: PredictionResult; masteryBySubject: Record<string, unknown>; daysRemaining: number | null; hasExamDate: boolean }> {
  const [
    { data: profile },
    { data: srCards },
    { data: challenges },
    { data: sprintSessions },
    { data: confidenceEvents },
    { data: mockAttempts },
  ] = await Promise.all([
    supabase.from('profiles').select('full_name,xp,level,exam_date,study_level').eq('id', userId).single(),
    supabase.from('sr_cards').select('subject,topic,ef_factor,repetitions,last_reviewed_at,next_review_date').eq('user_id', userId),
    supabase.from('user_challenge_attempts').select('score,subject,challenge_date').eq('user_id', userId).eq('status', 'completed').order('challenge_date', { ascending: false }).limit(30),
    supabase.from('sprint_sessions').select('xp_earned,completed,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    supabase.from('confidence_events').select('subject,topic,confidence_score').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    // Real mock-test percentile trend — the signal this feature was missing
    // versus the v3.8 blueprint's "Exam-Day Readiness Score" pitch.
    supabase.from('mock_test_attempts').select('exam_type,score,max_score,percentile,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(6),
  ]);

  const examDate = profile?.exam_date ? new Date(profile.exam_date) : null;
  const hasExamDate = examDate !== null;
  const daysRemaining = examDate
    ? Math.max(0, Math.floor((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const masteryBySubject: Record<string, { avg_ef: number; mastered: number; total: number; weak_topics: string[] }> = {};
  for (const card of srCards ?? []) {
    if (!masteryBySubject[card.subject]) {
      masteryBySubject[card.subject] = { avg_ef: 0, mastered: 0, total: 0, weak_topics: [] };
    }
    const sub = masteryBySubject[card.subject];
    sub.total++;
    sub.avg_ef += card.ef_factor;
    if (card.ef_factor >= 2.5 && card.repetitions >= 3) sub.mastered++;
    if (card.ef_factor < 2.0) sub.weak_topics.push(card.topic);
  }
  const subjects = Object.keys(masteryBySubject);
  for (const sub of subjects) {
    const s = masteryBySubject[sub];
    s.avg_ef = s.total > 0 ? Math.round((s.avg_ef / s.total) * 100) / 100 : 2.5;
    s.weak_topics = [...new Set(s.weak_topics)];
  }

  const challengeAvg = (challenges ?? []).length > 0
    ? Math.round((challenges ?? []).reduce((s, c) => s + (c.score || 0), 0) / (challenges ?? []).length)
    : null;

  const completedSprints = (sprintSessions ?? []).filter(s => s.completed).length;
  const sprintsPerWeek = completedSprints / 4;

  const confAvg = (confidenceEvents ?? []).length > 0
    ? Math.round((confidenceEvents ?? []).reduce((s, e) => s + e.confidence_score, 0) / (confidenceEvents ?? []).length)
    : null;

  const mocks = mockAttempts ?? [];
  const latestMockPercentile = mocks[0]?.percentile ?? null;
  const mockTrendDelta = mocks.length >= 2 ? Math.round((mocks[0].percentile - mocks[1].percentile) * 10) / 10 : null;

  const masteryLines = subjects.map(sub => {
    const s = masteryBySubject[sub];
    const pct = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
    return `  ${sub}: ${pct}% mastered (avg EF ${s.avg_ef}), weak: ${s.weak_topics.slice(0,3).join(', ') || 'none'}`;
  }).join('\n');

  const readinessMode = !hasExamDate;
  const weekCount = daysRemaining ? Math.min(Math.ceil(daysRemaining / 7), 8) : 4;

  const predictionPrompt = `
You are an expert exam performance predictor and academic coach.

${readinessMode
  ? '⚠️  NO EXAM DATE SET — this is a CURRENT READINESS ASSESSMENT, not a countdown prediction. Frame your narrative as "based on current performance, this student would score approximately X% in an exam today." Give a general 4-week improvement plan regardless of any hypothetical exam date.'
  : `Exam is in ${daysRemaining} days (${profile!.exam_date}).`}

Student data:
- Study level: ${profile?.study_level ?? 'school'}
- XP level: ${profile?.level ?? 0}
- Sprints per week: ${sprintsPerWeek.toFixed(1)}
- Challenge score average: ${challengeAvg ?? 'no data'}%
- Confidence score: ${confAvg ?? 'no data'}/100
- Latest mock test percentile: ${latestMockPercentile !== null ? `${latestMockPercentile}${mockTrendDelta !== null ? ` (${mockTrendDelta >= 0 ? '+' : ''}${mockTrendDelta} vs previous mock)` : ''}` : 'no mock attempts yet'}

Subject mastery:
${masteryLines || '  No mastery data yet'}

Target: ${targetGrade ? `Grade ${targetGrade}` : targetScore ? `${targetScore}%` : 'Not specified'}

Based on this data:
1. Estimate the student's current exam-readiness score (what they would score today) — weigh the real mock percentile above heavily if present, it's ground truth over self-reported confidence
2. Assess whether the target is achievable
3. Recommend minimum daily study hours
4. Identify specific weak areas
5. Provide a ${weekCount}-week study plan

IMPORTANT: if the predicted_score is below 30, the narrative MUST still name one concrete, encouraging quick-win the student can act on this week — never present a low score without an actionable next step. Do not soften the number itself, only ensure the framing is constructive.

Return JSON:
{
  "predicted_score": <0-100 integer>,
  "predicted_grade": "<A*|A|B|C|D|E|U or equivalent>",
  "target_score": <integer 0-100, use ${targetScore ?? 75} if not specified>,
  "target_grade": "<grade string>",
  "daily_hours_needed": <decimal, e.g. 1.5>,
  "confidence_level": "<high|medium|low based on data quality>",
  "weak_topics": ["topic1", "topic2", "topic3"],
  "strong_topics": ["topic1", "topic2"],
  "narrative": "${readinessMode ? '2-3 sentences framing this as current readiness: where the student stands right now, biggest risk, one actionable insight. Do NOT mention exam date.' : '2-3 plain English sentences: where the student stands, what the biggest risk is, one key actionable insight'}",
  "study_plan": [
    { "week": "Week 1", "focus": "one-sentence focus", "hours_per_day": 1.5, "topics": ["topic1", "topic2"] }
  ]
}

Include exactly ${weekCount} weeks in the study_plan array.`;

  const { result: prediction, model: modelUsed } = await reasonAboutReadiness<PredictionResult>(predictionPrompt);

  await supabase.from('exam_predictions').upsert({
    user_id: userId,
    exam_subject: subjects[0] ?? null,
    days_remaining: daysRemaining,
    predicted_score: prediction.predicted_score,
    predicted_grade: prediction.predicted_grade,
    target_score: prediction.target_score,
    target_grade: prediction.target_grade,
    daily_hours_needed: prediction.daily_hours_needed,
    confidence_level: prediction.confidence_level,
    weak_topics: prediction.weak_topics,
    strong_topics: prediction.strong_topics,
    study_plan: prediction.study_plan,
    narrative: prediction.narrative,
    mastery_snapshot: masteryBySubject,
    model_used: modelUsed,
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'user_id' });

  return { prediction, masteryBySubject, daysRemaining, hasExamDate };
}

serve(withSentry('exam-prediction', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── run_cron ─────────────────────────────────────────────────────────────
  // Proactive weekly refresh so the readiness score is ready before a
  // student opens the app, not only computed on-demand. Targets users with
  // an exam within 90 days OR recent sr_cards/quiz activity in the last 7
  // days, capped per run to bound cost.
  const cronSecret = req.headers.get('x-cron-secret');
  if (action === 'run_cron') {
    if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) return json({ error: 'Unauthorized' }, 401);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: examSoon }, { data: recentlyActive }] = await Promise.all([
      supabase.from('profiles').select('id').not('exam_date', 'is', null).lte('exam_date', ninetyDaysOut).gte('exam_date', new Date().toISOString()),
      supabase.from('sr_cards').select('user_id').gte('last_reviewed_at', since).limit(500),
    ]);
    const uniqueUsers = [...new Set([
      ...(examSoon ?? []).map(p => p.id),
      ...(recentlyActive ?? []).map(c => c.user_id),
    ])].slice(0, 30);

    let computed = 0;
    for (const uid of uniqueUsers) {
      try {
        await computeReadinessForUser(supabase, uid);
        computed++;
      } catch (e) {
        console.error(`Readiness score cron failed for user ${uid}:`, e);
      }
    }
    return json({ users_processed: uniqueUsers.length, computed });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(supabase, user.id, `exam_prediction_${action}`, 25, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_cached ────────────────────────────────────────────────────────────
  if (action === 'get_cached') {
    const { data: pred } = await supabase
      .from('exam_predictions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!pred) return json({ prediction: null });
    const expired = new Date(pred.expires_at) < new Date();
    return json({ prediction: pred, expired });
  }

  // ── predict ───────────────────────────────────────────────────────────────
  if (action === 'predict') {
    const { target_score, target_grade, force_refresh = false } = body;

    if (!force_refresh) {
      const { data: cached } = await supabase
        .from('exam_predictions')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (cached && new Date(cached.expires_at) > new Date()) {
        return json({ prediction: cached, from_cache: true });
      }
    }

    const { prediction, masteryBySubject, daysRemaining, hasExamDate } =
      await computeReadinessForUser(supabase, user.id, target_score, target_grade);

    return json({
      prediction: {
        ...prediction,
        mastery_snapshot: masteryBySubject,
        days_remaining: daysRemaining,
        has_exam_date: hasExamDate,
      },
    });
  }

  // ── clear_cache ───────────────────────────────────────────────────────────
  if (action === 'clear_cache') {
    await supabase.from('exam_predictions').delete().eq('user_id', user.id);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
}));
