// ─────────────────────────────────────────────────────────────────────────────
// novo-challenges — daily boss-level problems with XP multiplier
// Actions: get_today | submit_answer | get_hint | get_leaderboard | get_history
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
// ── Gemini text helper ────────────────────────────────────────────────────────
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

// ── XP multiplier based on completion time ────────────────────────────────────
function computeXP(baseXP: number, multiplier: number, timeLimitSecs: number, timeTakenSecs: number, score: number): number {
  const timeBonus = timeTakenSecs < timeLimitSecs * 0.5 ? 1.5
    : timeTakenSecs < timeLimitSecs * 0.75 ? 1.2 : 1.0;
  return Math.round((baseXP * multiplier * timeBonus * score) / 100);
}

serve(withSentry('novo-challenges', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Verify user JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(supabase, user.id, 'novo_challenges', 40, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action, subject } = body;

  // ── get_today ─────────────────────────────────────────────────────────────
  if (action === 'get_today') {
    const today = new Date().toISOString().slice(0, 10);
    const sub = subject || 'Mathematics';

    // Check existing challenge (maybeSingle — may not exist yet on first visit today)
    let { data: challenge } = await supabase
      .from('daily_challenges')
      .select('id,challenge_date,subject,topic,difficulty,problem,hints,xp_reward,xp_multiplier,time_limit_secs,answer_type,options')
      .eq('challenge_date', today)
      .eq('subject', sub)
      .maybeSingle();

    // Generate if missing
    if (!challenge) {
      interface ChallengeGen {
        topic: string;
        problem: string;
        solution: string;
        hints: string[];
        answer_type: 'text' | 'mcq';
        options?: string[];
        correct_idx?: number;
      }
      const gen = await geminiJSON<ChallengeGen>(`
You are creating a "Boss Challenge" — the hardest daily problem for a student studying ${sub}.
Today is ${today}.

Generate ONE extremely challenging but solvable boss-level problem. Mix conceptual depth with problem-solving.

Return JSON:
{
  "topic": "specific topic within ${sub}",
  "problem": "Full problem statement (can be multi-part). Use \\n for newlines.",
  "solution": "Complete step-by-step solution",
  "hints": ["hint 1 (vague)", "hint 2 (more specific)", "hint 3 (almost gives it away)"],
  "answer_type": "text",
  "options": null,
  "correct_idx": null
}

For maths/science: prefer open-ended. For humanities/languages: can use MCQ with answer_type="mcq" and 4 options.`);

      const { data: inserted } = await supabase
        .from('daily_challenges')
        .insert({
          challenge_date: today,
          subject: sub,
          topic: gen.topic,
          problem: gen.problem,
          solution: gen.solution,
          hints: gen.hints,
          answer_type: gen.answer_type || 'text',
          options: gen.options || null,
          correct_idx: gen.correct_idx ?? null,
          xp_reward: 150,
          xp_multiplier: 2.0,
          time_limit_secs: 300,
        })
        .select('id,challenge_date,subject,topic,difficulty,problem,hints,xp_reward,xp_multiplier,time_limit_secs,answer_type,options')
        .single();
      challenge = inserted;
    }

    // Get user's attempt for today (maybeSingle — user may not have attempted yet)
    const { data: attempt } = await supabase
      .from('user_challenge_attempts')
      .select('*')
      .eq('user_id', user.id)
      .eq('challenge_id', challenge!.id)
      .maybeSingle();

    return json({ challenge, attempt: attempt ?? null });
  }

  // ── start_attempt ─────────────────────────────────────────────────────────
  if (action === 'start_attempt') {
    const { challenge_id, challenge_date, subject: sub } = body;
    // maybeSingle — user may not have an attempt yet (that's the normal new-attempt path)
    const { data: existing } = await supabase
      .from('user_challenge_attempts')
      .select('*')
      .eq('user_id', user.id)
      .eq('challenge_id', challenge_id)
      .maybeSingle();
    if (existing) return json({ attempt: existing });

    const { data: attempt } = await supabase
      .from('user_challenge_attempts')
      .insert({ user_id: user.id, challenge_id, challenge_date, subject: sub, status: 'started' })
      .select('*')
      .single();
    return json({ attempt });
  }

  // ── get_hint ──────────────────────────────────────────────────────────────
  if (action === 'get_hint') {
    const { challenge_id, hint_index } = body;
    const { data: challenge } = await supabase
      .from('daily_challenges')
      .select('hints')
      .eq('id', challenge_id)
      .single();
    if (!challenge) return json({ error: 'Challenge not found' }, 404);
    const hint = (challenge.hints as string[])[hint_index] ?? null;

    // Record hint usage
    await supabase
      .from('user_challenge_attempts')
      .update({ hint_count: hint_index + 1 })
      .eq('user_id', user.id)
      .eq('challenge_id', challenge_id);

    return json({ hint });
  }

  // ── submit_answer ─────────────────────────────────────────────────────────
  if (action === 'submit_answer') {
    const { challenge_id, answer, time_taken_secs } = body;

    const { data: challenge } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('id', challenge_id)
      .single();
    if (!challenge) return json({ error: 'Challenge not found' }, 404);

    // Grade answer with Gemini (for text) or index check (for MCQ)
    let score = 0;
    let feedback = '';
    let correct_answer = '';

    if (challenge.answer_type === 'mcq') {
      const chosen = parseInt(answer, 10);
      const correct = challenge.correct_idx as number;
      score = chosen === correct ? 100 : 0;
      const opts = challenge.options as string[];
      correct_answer = opts[correct];
      feedback = chosen === correct
        ? '🎯 Correct! Well done on the boss challenge.'
        : `The correct answer was: ${correct_answer}`;
    } else {
      // AI grading
      interface GradeResult { score: number; feedback: string; correct_answer: string; }
      const grade = await geminiJSON<GradeResult>(`
Grade this student answer for a boss-level challenge.

Problem: ${challenge.problem}
Expected solution: ${challenge.solution}
Student answer: ${answer}

Return JSON:
{
  "score": <0-100, partial credit allowed>,
  "feedback": "2-3 sentences of specific feedback — what was right, what was wrong, what they missed",
  "correct_answer": "Brief correct answer/key insight (1-2 sentences)"
}`);
      score = grade.score;
      feedback = grade.feedback;
      correct_answer = grade.correct_answer;
    }

    const xp_earned = computeXP(
      challenge.xp_reward,
      challenge.xp_multiplier,
      challenge.time_limit_secs,
      time_taken_secs,
      score
    );

    // Update attempt
    await supabase
      .from('user_challenge_attempts')
      .update({
        answer,
        score,
        xp_earned,
        time_taken_secs,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('challenge_id', challenge_id);

    // Award XP
    if (xp_earned > 0) {
      await supabase.rpc('increment_xp', { user_id: user.id, amount: xp_earned });
    }

    return json({ score, xp_earned, feedback, correct_answer });
  }

  // ── get_leaderboard ───────────────────────────────────────────────────────
  if (action === 'get_leaderboard') {
    const { challenge_id } = body;
    const { data: rows } = await supabase
      .from('user_challenge_attempts')
      .select('user_id, score, time_taken_secs, xp_earned, completed_at')
      .eq('challenge_id', challenge_id)
      .eq('status', 'completed')
      .order('score', { ascending: false })
      .order('time_taken_secs', { ascending: true })
      .limit(20);

    if (!rows?.length) return json({ leaderboard: [] });

    // Fetch display names
    const userIds = rows.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      name: profileMap.get(r.user_id)?.full_name ?? 'Student',
      avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
      score: r.score,
      time_taken_secs: r.time_taken_secs,
      xp_earned: r.xp_earned,
      is_me: r.user_id === user.id,
    }));

    return json({ leaderboard });
  }

  // ── get_history ───────────────────────────────────────────────────────────
  if (action === 'get_history') {
    const { data: rows } = await supabase
      .from('user_challenge_attempts')
      .select(`
        id, challenge_date, subject, score, xp_earned, status, time_taken_secs,
        daily_challenges (topic, problem, xp_multiplier)
      `)
      .eq('user_id', user.id)
      .order('challenge_date', { ascending: false })
      .limit(30);
    return json({ history: rows ?? [] });
  }

  return json({ error: 'Unknown action' }, 400);
}));
