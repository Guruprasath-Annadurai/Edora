// ═══════════════════════════════════════════════════════════════
// Edora — Roadmap Generator Edge Function
//
// Two modes:
//   generate    — Builds a fresh week-by-week study plan from scratch.
//   recalibrate — Reads missed topics, regenerates remaining weeks only.
//
// Both modes return the full updated roadmap record.
//
// ── Key invariant ────────────────────────────────────────────────
// Day numbers in the plan are STUDY-day indices, not calendar-day
// indices.  A plan with 5 days/week maps:
//   study day 1 → start_date (Mon)
//   study day 5 → start_date + 4 (Fri)
//   study day 6 → start_date + 7 (next Mon)  ← NOT start_date + 5
//
// todayStudyDayIndex() converts calendar days elapsed → study day
// using the same mapping.  This prevents rest days from being
// counted as missed.
//
// Deploy:  supabase functions deploy roadmap-generator
// Secrets: GEMINI_API_KEY (already set)
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PLAN_WEEKS     = 16;   // cap to avoid token overflow

// ── Gemini responseSchema ─────────────────────────────────────────────────────
const ROADMAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    plan_summary: { type: 'STRING' },
    subjects: { type: 'ARRAY', items: { type: 'STRING' } },
    weeks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          week_number: { type: 'INTEGER' },
          theme:       { type: 'STRING' },
          days: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                day:              { type: 'INTEGER' },
                subject:          { type: 'STRING' },
                topic:            { type: 'STRING' },
                description:      { type: 'STRING' },
                duration_minutes: { type: 'INTEGER' },
              },
              required: ['day', 'subject', 'topic', 'description', 'duration_minutes'],
            },
          },
        },
        required: ['week_number', 'theme', 'days'],
      },
    },
  },
  required: ['plan_summary', 'subjects', 'weeks'],
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoadmapDay {
  day: number;
  subject: string;
  topic: string;
  description: string;
  duration_minutes: number;
}
interface RoadmapWeek {
  week_number: number;
  theme: string;
  days: RoadmapDay[];
}
interface GeminiRoadmap {
  plan_summary: string;
  subjects: string[];
  weeks: RoadmapWeek[];
}

// ── Soft-error codes (returned as 200 so the client can read data.code) ───────
const ERR_EXAM_TOO_CLOSE    = 'EXAM_TOO_CLOSE';
const ERR_MISSING_ROADMAP   = 'MISSING_ROADMAP_ID';
const ERR_ROADMAP_NOT_FOUND = 'ROADMAP_NOT_FOUND';

function softError(error: string, code: string, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error, code, ...extra }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}

// ── Calendar helpers ──────────────────────────────────────────────────────────
function daysUntil(examDate: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / 86_400_000));
}

function weeksUntil(examDate: string): number {
  return Math.ceil(daysUntil(examDate) / 7);
}

function studyDaysPerWeek(weeks: number): number {
  if (weeks < 4)  return 7;
  if (weeks < 8)  return 6;
  return 5;
}

function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function studyLevelLabel(level: string): string {
  const map: Record<string, string> = {
    school:   'secondary school student',
    college:  'undergraduate student',
    jee_neet: 'JEE / NEET aspirant',
    sat_act:  'SAT / ACT test-taker',
  };
  return map[level] ?? 'student';
}

/**
 * Converts calendar days elapsed since start_date into the correct
 * study-day index, skipping rest days.
 *
 * Mapping (example: daysPerWeek = 5):
 *   elapsed 0-4  → study days 1-5  (Mon-Fri of week 1)
 *   elapsed 5-6  → study day  5    (Sat-Sun = rest, clamped to last study day)
 *   elapsed 7-11 → study days 6-10 (Mon-Fri of week 2)
 *
 * Returns the 1-based study day index. Never returns 0.
 */
function todayStudyDayIndex(startDate: string, daysPerWeek: number): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
  const calWeek  = Math.floor(elapsed / 7);
  const dayOfWeek = elapsed % 7;
  // Clamp to last study day of the week on rest days
  return calWeek * daysPerWeek + Math.min(dayOfWeek, daysPerWeek - 1) + 1;
}

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(systemPrompt: string, userPrompt: string, apiKey: string): Promise<GeminiRoadmap> {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema:   ROADMAP_SCHEMA,
          temperature:      0.6,
          maxOutputTokens:  6000,
        },
      }),
    });

    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${msg.slice(0, 200)}`);
    }
    const json = await resp.json();
    const raw  = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return JSON.parse(raw) as GeminiRoadmap;
  } finally {
    clearTimeout(tid);
  }
}

// ── Experimental: Nemotron-powered recalibration ─────────────────────────────
// Only used for the recalibrate path, only when the caller opts in
// (body.use_nemotron). Nemotron gets a richer input than Gemini currently
// does — actual per-topic mastery/decay from sr_cards (easiness factor +
// repetitions), not just a flat "missed topics" list — so it can reason
// about which weak topics need more time vs. which just need a touch-up.
// Any failure (missing key, bad JSON, API error) falls back to callGemini
// with the original prompt so recalibration never breaks for the user.
async function callNemotronRecalibrate(
  system: string,
  userPrompt: string,
  masteryContext: string,
): Promise<GeminiRoadmap> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) throw new Error('NVIDIA_API_KEY not configured');

  const fullPrompt = `${system}

${userPrompt}

Additional signal — the student's actual per-topic retention data (easiness factor: higher = well-retained, lower = decaying; repetitions = times reviewed):
${masteryContext}

Use this to decide which weak/decaying topics need MORE time in the redistributed schedule vs. which missed topics were likely easy misses that just need a quick pass.

Respond with ONLY a single JSON object, no markdown fencing, matching exactly this shape:
{
  "plan_summary": "string",
  "subjects": ["string"],
  "weeks": [ { "week_number": number, "theme": "string", "days": [ { "day": number, "subject": "string", "topic": "string", "description": "string", "duration_minutes": number } ] } ]
}`;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.4,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
    const d = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? '{}';
    return JSON.parse(raw) as GeminiRoadmap;
  } finally {
    clearTimeout(tid);
  }
}

// ── Normalise Gemini weeks ────────────────────────────────────────────────────
// Ensures sequential day numbers, correct week numbers, and caps to maxWeeks.
function normaliseWeeks(
  rawWeeks: RoadmapWeek[],
  maxWeeks: number,
  daysPerWeek: number,
  startWeekNumber = 1,
  startDay = 1,
): { weeks: RoadmapWeek[]; nextDay: number } {
  let globalDay = startDay;
  const weeks: RoadmapWeek[] = rawWeeks
    .slice(0, maxWeeks)          // cap: Gemini sometimes returns extras
    .map((week, wi) => ({
      week_number: startWeekNumber + wi,
      theme: (week.theme ?? '').trim() || `Week ${startWeekNumber + wi}`,
      days: (week.days ?? [])
        .slice(0, daysPerWeek)   // cap: never more study days than configured
        .map(d => ({ ...d, day: globalDay++ })),
    }))
    .filter(w => w.days.length > 0);  // drop empty weeks Gemini may emit
  return { weeks, nextDay: globalDay };
}

// ── Generate prompt ───────────────────────────────────────────────────────────
function buildGeneratePrompt(
  examName: string,
  examDate: string,
  planWeeks: number,
  daysPerWeek: number,
  totalDays: number,
  studyLevel: string,
  startDate: string,
): { system: string; user: string } {
  const system = `You are an expert academic coach who builds personalised, day-by-day study roadmaps for competitive exams.
Your plans are:
- Progressive: foundations first, advanced topics later, revision at the end
- Specific: each day has one focused topic with a concrete description
- Realistic: duration 60–120 minutes per day depending on topic complexity
- Exam-aligned: topics are drawn from the official ${examName} syllabus
Output ONLY valid JSON that matches the requested schema.`;

  const user = `Build a ${planWeeks}-week study roadmap for a ${studyLevelLabel(studyLevel)} preparing for ${examName}.

Exam date: ${examDate}
Plan start: ${startDate}
Study days per week: ${daysPerWeek} (skip rest days — do NOT include them in the JSON)
Total study days to generate: exactly ${totalDays}

Rules:
1. Day numbers are sequential (1 to ${totalDays}) across all weeks.
2. Each week has exactly ${daysPerWeek} days.
3. Final 2 weeks = pure revision + mock practice (no new topics).
4. Every 4th week = revision week (revisit weakest topics from prior 3 weeks).
5. Each day: ONE subject + ONE specific topic + 2-sentence description + realistic duration.
6. Distribute subjects evenly, weighted by ${examName} mark distribution.
7. plan_summary: 2-sentence overall strategy description.`;

  return { system, user };
}

// ── Recalibrate prompt ────────────────────────────────────────────────────────
function buildRecalibratePrompt(
  examName: string,
  examDate: string,
  remainingWeeks: number,
  daysPerWeek: number,
  totalRemainingDays: number,
  missedTopics: Array<{ subject: string; topic: string }>,
  startWeekNumber: number,
  studyLevel: string,
): { system: string; user: string } {
  const system = `You are an expert academic coach who recalibrates study plans after a student falls behind.
Redistribute missed topics naturally across remaining weeks while maintaining a progressive structure.
Output ONLY valid JSON that matches the requested schema.`;

  const missedList = missedTopics.length > 0
    ? missedTopics.map(m => `  - ${m.subject}: ${m.topic}`).join('\n')
    : '  (none — recalibrating pacing only)';

  const startDay = (startWeekNumber - 1) * daysPerWeek + 1;
  const endDay   = startDay + totalRemainingDays - 1;

  const user = `Recalibrate the remaining study plan for a ${studyLevelLabel(studyLevel)} preparing for ${examName}.

Exam date: ${examDate}
Remaining weeks: ${remainingWeeks} (weeks ${startWeekNumber} onward)
Study days per week: ${daysPerWeek}
Total remaining study days: exactly ${totalRemainingDays}
Starting week number: ${startWeekNumber}
Starting day number: ${startDay}

Missed topics that must be redistributed:
${missedList}

Rules:
1. Incorporate missed topics in the first 2–3 weeks naturally alongside new topics.
2. Day numbers continue from ${startDay} to ${endDay}.
3. Week numbers start at ${startWeekNumber}.
4. Final 2 weeks = pure revision + mock practice.
5. Maintain ${examName} syllabus coverage for remaining topics.
6. plan_summary: update to reflect the recalibrated focus.`;

  return { system, user };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(withSentry('roadmap-generator', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!geminiApiKey) return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not set' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

    // Service-role client for DB writes (bypasses RLS)
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const rl = await checkRateLimit(db, user.id, 'roadmap-generator', 25, 60);
    if (!rl.allowed) return new Response(
      JSON.stringify({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }),
      { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

    const body = await req.json();
    const mode: 'generate' | 'recalibrate' = body.mode ?? 'generate';

    // ════════════════════════════════════════════════════════════════
    // MODE: GENERATE
    // ════════════════════════════════════════════════════════════════
    if (mode === 'generate') {
      const { exam_name, exam_date, study_level = 'school' } = body as {
        exam_name: string; exam_date: string; study_level?: string;
      };

      if (!exam_name || !exam_date) return new Response(
        JSON.stringify({ error: 'exam_name and exam_date are required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );

      const weeksLeft = weeksUntil(exam_date);
      if (weeksLeft < 1) return new Response(
        JSON.stringify({ error: 'Exam date must be at least 1 week in the future' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );

      const planWeeks   = Math.min(weeksLeft, MAX_PLAN_WEEKS);
      const daysPerWeek = studyDaysPerWeek(weeksLeft);
      const totalDays   = planWeeks * daysPerWeek;
      const startDate   = tomorrow();

      const { system, user: userPrompt } = buildGeneratePrompt(
        exam_name, exam_date, planWeeks, daysPerWeek, totalDays, study_level, startDate,
      );

      const roadmapData = await callGemini(system, userPrompt, geminiApiKey);

      // Normalise: enforce sequential day numbers, cap to expected weeks/days
      const { weeks: normalisedWeeks, nextDay } = normaliseWeeks(
        roadmapData.weeks, planWeeks, daysPerWeek,
      );
      const actualTotalDays = nextDay - 1;

      // Archive any existing active roadmap for this user
      await db.from('study_roadmaps')
        .update({ status: 'archived' })
        .eq('user_id', user.id)
        .eq('status', 'active');

      // Insert new roadmap (includes study_level for future recalibrations)
      const { data: inserted, error: insertErr } = await db
        .from('study_roadmaps')
        .insert({
          user_id:             user.id,
          exam_name,
          exam_date,
          plan_summary:        roadmapData.plan_summary ?? '',
          subjects:            roadmapData.subjects ?? [],
          weeks:               normalisedWeeks,
          start_date:          startDate,
          total_days:          actualTotalDays,
          plan_weeks:          normalisedWeeks.length,
          study_days_per_week: daysPerWeek,
          study_level,                              // stored for recalibrate
          generated_at:        new Date().toISOString(),
          status:              'active',
        })
        .select()
        .single();

      if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to save roadmap');

      return new Response(
        JSON.stringify({ roadmap: inserted }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ════════════════════════════════════════════════════════════════
    // MODE: RECALIBRATE
    // ════════════════════════════════════════════════════════════════
    if (mode === 'recalibrate') {
      const { roadmap_id, completed_day_indices = [] } = body as {
        roadmap_id?: string; completed_day_indices?: number[];
      };

      // Guard: roadmap_id must be present
      if (!roadmap_id) return softError(
        'roadmap_id is required for recalibration', ERR_MISSING_ROADMAP,
      );

      // Fetch roadmap — verify ownership via user_id
      const { data: roadmap, error: fetchErr } = await db
        .from('study_roadmaps')
        .select('*')
        .eq('id', roadmap_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (fetchErr || !roadmap) return softError(
        'Roadmap not found or no longer active', ERR_ROADMAP_NOT_FOUND,
      );

      // ── Study-day-aware today index ────────────────────────────────────────
      // Uses calendar-week mapping so rest days are never counted as missed.
      const daysPerWeek  = roadmap.study_days_per_week as number;
      const todayDayIdx  = todayStudyDayIndex(roadmap.start_date, daysPerWeek);

      // ── Identify missed topics ─────────────────────────────────────────────
      const completedSet = new Set<number>(completed_day_indices);
      const allWeeks     = roadmap.weeks as RoadmapWeek[];
      const missedTopics: Array<{ subject: string; topic: string }> = [];

      for (const week of allWeeks) {
        for (const day of week.days) {
          if (day.day < todayDayIdx && !completedSet.has(day.day)) {
            missedTopics.push({ subject: day.subject, topic: day.topic });
          }
        }
      }

      // ── Determine which weeks to keep and which to regenerate ─────────────
      // Keep all past weeks (fully before today's week), regenerate current onward.
      const currentWeekNum = Math.max(1, Math.ceil(todayDayIdx / daysPerWeek));
      const keptWeeks      = allWeeks.filter(w => w.week_number < currentWeekNum);

      const weeksLeft      = weeksUntil(roadmap.exam_date);
      const remainingWeeks = Math.min(weeksLeft, MAX_PLAN_WEEKS - keptWeeks.length);

      // Soft error: exam too close to regenerate meaningfully
      if (remainingWeeks <= 0) return softError(
        'Your exam is too close to recalibrate — generate a fresh focused plan instead.',
        ERR_EXAM_TOO_CLOSE,
      );

      const totalRemainingDays = remainingWeeks * daysPerWeek;
      const startDay           = keptWeeks.length * daysPerWeek + 1;

      const { system, user: userPrompt } = buildRecalibratePrompt(
        roadmap.exam_name,
        roadmap.exam_date,
        remainingWeeks,
        daysPerWeek,
        totalRemainingDays,
        missedTopics,
        currentWeekNum,
        roadmap.study_level ?? 'school',   // use stored level — never hardcode
      );

      let recalData: GeminiRoadmap;
      let recalModel = 'gemini-1.5-flash';
      if (body.use_nemotron) {
        try {
          const { data: cards } = await db
            .from('sr_cards')
            .select('subject, topic, easiness_factor, repetitions, correct_reviews, total_reviews')
            .eq('user_id', user.id)
            .order('easiness_factor', { ascending: true })
            .limit(40);
          const masteryContext = (cards ?? [])
            .map(c => `${c.subject} / ${c.topic}: EF=${c.easiness_factor}, reps=${c.repetitions}, correct=${c.correct_reviews}/${c.total_reviews}`)
            .join('\n') || '(no spaced-repetition history yet)';

          recalData = await callNemotronRecalibrate(system, userPrompt, masteryContext);
          recalModel = 'nemotron-3-ultra-550b';

          await db.from('roadmap_reoptimizations').insert({
            user_id: user.id,
            roadmap_id,
            reasoning: `Re-optimized using ${cards?.length ?? 0} tracked topics' retention data alongside ${missedTopics.length} missed topics.`,
            changes_summary: { missed_topics: missedTopics.length, remaining_weeks: remainingWeeks, mastery_signals_used: cards?.length ?? 0 },
            model_used: recalModel,
          });
        } catch (e) {
          console.error('Nemotron recalibration failed, falling back to Gemini:', e);
          recalData = await callGemini(system, userPrompt, geminiApiKey);
        }
      } else {
        recalData = await callGemini(system, userPrompt, geminiApiKey);
      }

      // Normalise regenerated weeks (sequential from startDay, capped to remainingWeeks)
      const { weeks: newWeeks, nextDay } = normaliseWeeks(
        recalData.weeks, remainingWeeks, daysPerWeek, currentWeekNum, startDay,
      );

      const mergedWeeks  = [...keptWeeks, ...newWeeks];
      const newTotalDays = nextDay - 1;

      const { data: updated, error: updateErr } = await db
        .from('study_roadmaps')
        .update({
          weeks:           mergedWeeks,
          total_days:      newTotalDays,
          plan_weeks:      mergedWeeks.length,
          plan_summary:    recalData.plan_summary ?? roadmap.plan_summary,
          recalibrated_at: new Date().toISOString(),
        })
        .eq('id', roadmap_id)
        .select()
        .single();

      if (updateErr || !updated) throw new Error(updateErr?.message ?? 'Failed to update roadmap');

      return new Response(
        JSON.stringify({ roadmap: updated, missed_count: missedTopics.length }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown mode: ${mode}` }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('AbortError') || msg.includes('abort');
    console.error('[roadmap-generator] Error:', msg);
    return new Response(
      JSON.stringify({ error: isTimeout ? 'Request timed out — please try again' : msg }),
      { status: isTimeout ? 504 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
}));
