// revision-planner — AI-powered exam revision schedule generator
//
// Actions:
//   generate  — create week-by-week plan given subjects, exam_date, daily_hours
//   update    — toggle chapter done/undone
//   status    — get plan progress and on-track status
//
// Requires secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const GEMINI_MODEL = 'gemini-1.5-flash';

async function callGeminiOnce(prompt: string, apiKey: string): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse(match ? match[1] : text);
}

// This function previously made a single attempt with zero retries at all —
// any transient Gemini hiccup (rate limit, timeout, malformed JSON) failed
// the whole request immediately. This was the direct cause of "revision plan
// failing to generate" reports.
async function callGemini(prompt: string, apiKey: string, maxRetries = 2): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callGeminiOnce(prompt, apiKey);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

serve(withSentry('revision-planner', async (req) => {
  const CORS = getCors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: CORS });

  const rl = await checkRateLimit(supabase, user.id, 'revision-planner', 25, 60);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }), {
      status: 429,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const { action } = body;
  const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

  try {
    // ── Generate plan ──────────────────────────────────────────────────────
    if (action === 'generate') {
      const { subjects, exam_date, exam_name, daily_hours } = body;
      const daysLeft = Math.ceil((new Date(exam_date).getTime() - Date.now()) / 86400000);
      const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));

      // Chapter lists for subjects
      const CHAPTERS: Record<string, string[]> = {
        Physics: ['Motion in a Straight Line','Laws of Motion','Work Energy & Power','Gravitation','Thermodynamics','Waves','Electric Charges','Current Electricity','Electromagnetic Induction','Optics','Atoms','Nuclei'],
        Chemistry: ['Atomic Structure','Chemical Bonding','Thermodynamics','Equilibrium','Electrochemistry','Chemical Kinetics','Solutions','Organic Basics','Hydrocarbons','Aldehydes & Ketones','Coordination Compounds'],
        Mathematics: ['Algebra','Trigonometry','Sequences','Calculus','Differential Equations','Vectors','3D Geometry','Probability'],
        Biology: ['Cell Biology','Photosynthesis','Genetics','Evolution','Physiology','Ecology'],
      };

      const allChapters = subjects.flatMap((s: string) =>
        (CHAPTERS[s] ?? []).map((ch: string, i: number) => ({ id: `${s.slice(0,3).toLowerCase()}_${i}`, subject: s, chapter: ch }))
      );

      const prompt = `Create a ${weeksLeft}-week revision plan for ${exam_name} in ${daysLeft} days.
Daily study: ${daily_hours} hours.
Chapters (${allChapters.length} total): ${JSON.stringify(allChapters)}

Rules:
1. Distribute ALL chapters across ${weeksLeft} weeks
2. High-priority JEE/NEET chapters get first 60% of the plan
3. Last 2 weeks: only revision + mock tests
4. Include buffer_day:true every 3rd week
5. Include mock_test:true at weeks 4, 8, 12 if applicable
6. 3-6 chapters per week max
7. Priority: high for most-tested chapters, medium for moderate, low for rarely-tested

Return ONLY JSON:
{
  "daily_hours": ${daily_hours},
  "weeks": [
    {
      "week": 1,
      "label": "Week 1 — <dates>",
      "mock_test": false,
      "buffer_day": false,
      "chapters": [
        {"id":"ch_id","subject":"Physics","chapter":"Laws of Motion","hours":4,"priority":"high","done":false}
      ]
    }
  ]
}`;

      const result = await callGemini(prompt, geminiKey) as { daily_hours: number; weeks: unknown[] };

      const plan = {
        id: crypto.randomUUID(),
        user_id: user.id,
        exam_name,
        exam_date,
        weeks: result.weeks ?? [],
        chapters_count: allChapters.length,
        daily_hours,
        created_at: new Date().toISOString(),
      };

      await supabase.from('revision_plans').upsert(plan);
      return new Response(JSON.stringify({ plan }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── Update chapter done status ─────────────────────────────────────────
    if (action === 'update') {
      const { plan_id, chapter_id, done } = body;
      const { data: plan } = await supabase.from('revision_plans')
        .select('weeks').eq('id', plan_id).eq('user_id', user.id).single();

      if (!plan) return new Response(JSON.stringify({ error: 'Plan not found' }), { status: 404, headers: CORS });

      const weeks = (plan.weeks as { chapters: { id: string; done: boolean }[] }[]).map(w => ({
        ...w,
        chapters: w.chapters.map(ch => ch.id === chapter_id ? { ...ch, done } : ch),
      }));

      await supabase.from('revision_plans').update({ weeks }).eq('id', plan_id).eq('user_id', user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── Get plan status ────────────────────────────────────────────────────
    if (action === 'status') {
      const { data: plan } = await supabase.from('revision_plans')
        .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();

      if (!plan) return new Response(JSON.stringify({ plan: null }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

      const allChapters = (plan.weeks as { chapters: { done: boolean }[] }[]).flatMap(w => w.chapters);
      const done = allChapters.filter(c => c.done).length;
      const total = allChapters.length;
      const daysElapsed = Math.ceil((Date.now() - new Date(plan.created_at).getTime()) / 86400000);
      const totalDays = Math.ceil((new Date(plan.exam_date).getTime() - new Date(plan.created_at).getTime()) / 86400000);
      const expectedRatio = Math.min(daysElapsed / totalDays, 1);
      const actualRatio = total ? done / total : 0;
      const daysBehind = Math.max(0, Math.round((expectedRatio - actualRatio) * totalDays));

      return new Response(JSON.stringify({
        plan,
        status: { done, total, on_track: daysBehind === 0, days_behind: daysBehind },
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}));
