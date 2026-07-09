// ═══════════════════════════════════════════════════════════════
// Edora — Novo Insights Edge Function
//
// Runs every Sunday 08:00 UTC via pg_cron.
// For every user active in the last 30 days:
//   1. Aggregates quiz, sprint, and mistake-journal data (last 7 days)
//   2. Calls Gemini 1.5 Flash (JSON mode) for personalised analysis
//   3. Upserts novo_insights row
//   4. Sends FCM push notification (if FIREBASE_SERVER_KEY is set)
//
// Deploy:  supabase functions deploy novo-insights
// Trigger: pg_cron → pg_net → this function (every Sunday 08:00 UTC)
// Manual:  curl -X POST <url> -H "Authorization: Bearer <service_role_key>"
//
// Secrets required:
//   GEMINI_API_KEY       — already set
//   FIREBASE_SERVER_KEY  — Firebase Console → Project Settings → Cloud Messaging
//                          (optional — skipped silently if absent)
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const FCM_LEGACY_URL = 'https://fcm.googleapis.com/fcm/send';

// Maximum users processed per invocation (guards against timeouts on large user bases)
const MAX_USERS_PER_RUN = 200;
// FCM multicast batch size (legacy API supports up to 1000 — we use 500 for safety)
const FCM_BATCH_SIZE = 500;
// Gemini per-user timeout
const GEMINI_TIMEOUT_MS = 30_000;

// ── Response schema enforced by Gemini JSON mode ──────────────────────────────
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    weakest_subjects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          subject:   { type: 'STRING' },
          score_pct: { type: 'INTEGER' },
          reason:    { type: 'STRING' },
          study_tip: { type: 'STRING' },
        },
        required: ['subject', 'score_pct', 'reason', 'study_tip'],
      },
    },
    strongest_subjects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          subject:   { type: 'STRING' },
          score_pct: { type: 'INTEGER' },
          reason:    { type: 'STRING' },
        },
        required: ['subject', 'score_pct', 'reason'],
      },
    },
    streak_insight: { type: 'STRING' },
    recovery_plan: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day:   { type: 'STRING' },
          focus: { type: 'STRING' },
          tasks: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['day', 'focus', 'tasks'],
      },
    },
    motivation: { type: 'STRING' },
  },
  required: [
    'headline', 'weakest_subjects', 'strongest_subjects',
    'streak_insight', 'recovery_plan', 'motivation',
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface QuizSession {
  subject: string;
  score: number | null;
  questions: unknown[];
  completed_at: string | null;
}

interface MistakeEntry {
  subject: string;
  topic: string;
  description: string;
}

interface SprintSession {
  subject: string;
  completed: boolean;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  study_level: string | null;
  streak_count: number;
  xp: number;
  last_sprint_date: string | null;
  push_token: string | null;
}

interface SubjectStats {
  attempts: number;
  correct: number;
  totalQuestions: number;
}

interface NovoInsightPayload {
  headline: string;
  weakest_subjects: Array<{ subject: string; score_pct: number; reason: string; study_tip: string }>;
  strongest_subjects: Array<{ subject: string; score_pct: number; reason: string }>;
  streak_insight: string;
  recovery_plan: Array<{ day: string; focus: string; tasks: string[] }>;
  motivation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the ISO Monday of the current UTC week (YYYY-MM-DD) */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

/** Returns a Date for N days ago (UTC midnight) as ISO string */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Aggregate quiz sessions into per-subject stats */
function aggregateQuiz(sessions: QuizSession[]): Record<string, SubjectStats> {
  const map: Record<string, SubjectStats> = {};
  for (const s of sessions) {
    if (!s.completed_at) continue;
    const key = s.subject || 'General';
    if (!map[key]) map[key] = { attempts: 0, correct: 0, totalQuestions: 0 };
    const total = Array.isArray(s.questions) ? s.questions.length : 0;
    map[key].attempts++;
    map[key].totalQuestions += total;
    map[key].correct += s.score ?? 0;
  }
  return map;
}

/** Count active study days in a set of ISO date strings */
function countActiveDays(dates: string[]): number {
  const unique = new Set(dates.map(d => d.slice(0, 10)));
  return unique.size;
}

/** Build a human-readable data summary for the Gemini prompt */
function buildDataSummary(
  profile: ProfileRow,
  quizAgg: Record<string, SubjectStats>,
  mistakes: MistakeEntry[],
  sprints: SprintSession[],
  activeDays: number,
  xpThisWeek: number,
): string {
  const studyLevel = profile.study_level ?? 'school';

  // Quiz breakdown
  const quizLines = Object.entries(quizAgg).map(([subj, stats]) => {
    const pct = stats.totalQuestions > 0
      ? Math.round((stats.correct / stats.totalQuestions) * 100)
      : 0;
    return `  • ${subj}: ${stats.attempts} quiz(es), ${stats.correct}/${stats.totalQuestions} correct (${pct}%)`;
  }).join('\n');

  // Mistake breakdown
  const mistakesBySubject: Record<string, string[]> = {};
  for (const m of mistakes) {
    const k = m.subject || 'General';
    if (!mistakesBySubject[k]) mistakesBySubject[k] = [];
    mistakesBySubject[k].push(m.topic || m.description?.slice(0, 60));
  }
  const mistakeLines = Object.entries(mistakesBySubject)
    .map(([s, topics]) => `  • ${s}: ${topics.slice(0, 3).join(', ')}`)
    .join('\n');

  // Sprint breakdown
  const sprintsBySubject: Record<string, number> = {};
  for (const sp of sprints) {
    if (sp.completed) {
      sprintsBySubject[sp.subject] = (sprintsBySubject[sp.subject] ?? 0) + 1;
    }
  }
  const sprintLines = Object.entries(sprintsBySubject)
    .map(([s, n]) => `  • ${s}: ${n} sprint(s) completed`)
    .join('\n') || '  (none this week)';

  return `Student profile:
  Study level: ${studyLevel}
  Current streak: ${profile.streak_count} day(s)
  Total XP: ${profile.xp}
  XP earned this week: ${xpThisWeek}
  Active study days this week: ${activeDays}/7
  Last sprint date: ${profile.last_sprint_date ?? 'unknown'}

Quiz performance (last 7 days):
${quizLines || '  (no quizzes this week)'}

Mistakes logged (last 7 days):
${mistakeLines || '  (none logged)'}

Sprint sessions (last 7 days):
${sprintLines}`;
}

/** Call Gemini 1.5 Flash in JSON mode and return the parsed payload */
async function callGemini(
  dataSummary: string,
  apiKey: string,
): Promise<NovoInsightPayload> {
  const systemPrompt = `You are Novo, the AI study coach inside the Edora learning app.
Analyse the student data below and produce a concise, motivating weekly intelligence report.
Rules:
- Headline: ≤ 12 words, specific, mention the biggest win or biggest gap.
- weakest_subjects: list 1–3 subjects with score_pct < 70, or the lowest-scoring ones.
  If the student took no quizzes, identify subjects where mistakes were logged.
  If truly no data, return empty array.
- strongest_subjects: list 1–2 subjects with score_pct ≥ 70, or best performers.
  If no data, return empty array.
- streak_insight: 1–2 sentences about their study pattern this week.
- recovery_plan: exactly 3 days (Monday / Tuesday / Wednesday labels), each with 2–3 specific tasks.
  Tasks must reference real subjects/topics from the data. Be concrete, not generic.
- motivation: 1–2 sentences, personal and encouraging.`;

  const userPrompt = `Generate a Novo Insights report for this student:\n\n${dataSummary}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const json = await resp.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return JSON.parse(raw) as NovoInsightPayload;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Send FCM push via Legacy HTTP API (multicast batch) */
async function sendFcmBatch(
  tokens: string[],
  title: string,
  body: string,
  serverKey: string,
): Promise<void> {
  // Batch into FCM_BATCH_SIZE chunks
  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    await fetch(FCM_LEGACY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${serverKey}`,
      },
      body: JSON.stringify({
        registration_ids: batch,
        priority: 'high',
        notification: { title, body, sound: 'default' },
        data: { route: '/novo-insights' },
      }),
    }).catch(err => console.error('[FCM] batch error:', err.message));
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(withSentry('novo-insights', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const startTime = Date.now();

  try {
    // ── 1. Auth: require the actual service-role key, not just any Bearer-shaped
    //    string. This job fans out Gemini calls + FCM pushes across ALL active
    //    users, so an unauthenticated trigger is a real cost/spam DoS vector.
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceKey = authHeader === `Bearer ${serviceRoleKey}`;
    const isCron = !!cronSecret && cronHeader === cronSecret;
    if (!isServiceKey && !isCron) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // No per-user rate limit — internal/cron-triggered batch job (processes many users per run)
    // ── 2. Build service-role client for cross-user data access ──────────────
    const geminiApiKey     = Deno.env.get('GEMINI_API_KEY') ?? '';
    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY') ?? '';

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Service-role client — bypasses RLS, can read all users
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // ── 3. Discover active users (had quiz/sprint/mistake in last 30 days) ──
    const thirtyDaysAgo = daysAgo(30);
    const sevenDaysAgo  = daysAgo(7);
    const weekStart     = getWeekStart();

    // Get distinct user_ids from recent activity
    const [quizUsers, sprintUsers, mistakeUsers] = await Promise.all([
      db.from('quiz_sessions')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo)
        .not('score', 'is', null),
      db.from('sprint_sessions')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo)
        .eq('completed', true),
      db.from('mistake_journal')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo),
    ]);

    const activeUserIds = [
      ...new Set([
        ...(quizUsers.data ?? []).map((r: { user_id: string }) => r.user_id),
        ...(sprintUsers.data ?? []).map((r: { user_id: string }) => r.user_id),
        ...(mistakeUsers.data ?? []).map((r: { user_id: string }) => r.user_id),
      ]),
    ].slice(0, MAX_USERS_PER_RUN);

    if (activeUserIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No active users found', processed: 0 }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Fetch profiles ────────────────────────────────────────────────────
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name, study_level, streak_count, xp, last_sprint_date, push_token')
      .in('id', activeUserIds);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No profiles found', processed: 0 }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── 5. Fetch this-week XP snapshot (approximate from sprint xp_earned) ──
    const { data: weekSprints } = await db
      .from('sprint_sessions')
      .select('user_id, xp_earned')
      .in('user_id', activeUserIds)
      .gte('created_at', sevenDaysAgo);

    const xpByUser: Record<string, number> = {};
    for (const s of (weekSprints ?? [])) {
      xpByUser[s.user_id] = (xpByUser[s.user_id] ?? 0) + (s.xp_earned ?? 0);
    }

    // ── 6. Process each user ─────────────────────────────────────────────────
    const pushTokens: string[] = [];
    let processed = 0;
    let errors = 0;

    for (const profile of (profiles as ProfileRow[])) {
      try {
        // Fetch this user's last-7-days data in parallel
        const [quizRes, mistakeRes, sprintRes] = await Promise.all([
          db.from('quiz_sessions')
            .select('subject, score, questions, completed_at')
            .eq('user_id', profile.id)
            .gte('created_at', sevenDaysAgo),
          db.from('mistake_journal')
            .select('subject, topic, description')
            .eq('user_id', profile.id)
            .gte('created_at', sevenDaysAgo),
          db.from('sprint_sessions')
            .select('subject, completed, created_at')
            .eq('user_id', profile.id)
            .gte('created_at', sevenDaysAgo),
        ]);

        const quizSessions = (quizRes.data ?? []) as QuizSession[];
        const mistakes     = (mistakeRes.data ?? []) as MistakeEntry[];
        const sprintData   = (sprintRes.data ?? []) as SprintSession[];

        // Aggregate quiz stats per subject
        const quizAgg = aggregateQuiz(quizSessions);

        // Count active days (dates that had any activity)
        const activityDates = [
          ...quizSessions.filter(s => s.completed_at).map(s => s.completed_at!),
          ...mistakes.map(() => new Date().toISOString()),
          ...sprintData.map(s => s.created_at),
        ];
        const activeDays = countActiveDays(activityDates);

        const xpThisWeek = xpByUser[profile.id] ?? 0;

        // Build the prompt data summary
        const dataSummary = buildDataSummary(
          profile, quizAgg, mistakes, sprintData, activeDays, xpThisWeek,
        );

        // Call Gemini
        const insight = await callGemini(dataSummary, geminiApiKey);

        // Ensure recovery_plan has exactly 3 entries
        const plan = insight.recovery_plan ?? [];
        const days = ['Monday', 'Tuesday', 'Wednesday'];
        const recoveryPlan = days.map((day, i) => plan[i] ?? {
          day, focus: 'Mixed revision', tasks: ['Review your notes', 'Practice 5 problems'],
        });

        // Upsert insight
        const { error: upsertErr } = await db
          .from('novo_insights')
          .upsert({
            user_id:            profile.id,
            week_start:         weekStart,
            headline:           insight.headline ?? '',
            weakest_subjects:   insight.weakest_subjects ?? [],
            strongest_subjects: insight.strongest_subjects ?? [],
            streak_insight:     insight.streak_insight ?? '',
            recovery_plan:      recoveryPlan,
            motivation:         insight.motivation ?? '',
            xp_this_week:       xpThisWeek,
            quizzes_taken:      quizSessions.filter(s => s.completed_at).length,
            sprints_completed:  sprintData.filter(s => s.completed).length,
            mistakes_logged:    mistakes.length,
            generated_at:       new Date().toISOString(),
          }, { onConflict: 'user_id,week_start' });

        if (upsertErr) {
          console.error(`[Novo] upsert error for ${profile.id}:`, upsertErr.message);
          errors++;
          continue;
        }

        // Collect push token for batch notification
        if (profile.push_token) {
          pushTokens.push(profile.push_token);
        }

        processed++;
      } catch (userErr) {
        console.error(`[Novo] error for user ${profile.id}:`,
          userErr instanceof Error ? userErr.message : String(userErr));
        errors++;
      }
    }

    // ── 7. Send FCM push notifications (batch) ───────────────────────────────
    if (pushTokens.length > 0 && firebaseServerKey) {
      await sendFcmBatch(
        pushTokens,
        '✨ Your Novo Insights are ready',
        'See your personalised study plan for this week',
        firebaseServerKey,
      );
      console.log(`[Novo] FCM push sent to ${pushTokens.length} device(s)`);
    } else if (!firebaseServerKey) {
      console.log('[Novo] FIREBASE_SERVER_KEY not set — skipping push notifications');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Novo] Done: ${processed} succeeded, ${errors} failed in ${elapsed}s`);

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        push_sent: pushTokens.length,
        elapsed_s: parseFloat(elapsed),
        week_start: weekStart,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Novo] Fatal error:', err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
}));
