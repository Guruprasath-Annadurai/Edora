// ─────────────────────────────────────────────────────────────────────────────
// streak-challenges — personalised AI-generated streak challenges from weak areas
// Actions: get_active | generate | complete_day | abandon | list_history
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
async function geminiJSONOnce<T>(prompt: string): Promise<T> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + '\n\nReturn valid JSON only. No markdown fences.' }] }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

// Single-attempt generation previously meant one bad response killed
// challenge creation / today's task outright with a non-2xx.
async function geminiJSON<T>(prompt: string, validateFn?: (v: T) => boolean, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await geminiJSONOnce<T>(prompt);
      if (validateFn && !validateFn(result)) throw new Error('Gemini response failed validation');
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to get valid JSON from Gemini');
}

serve(withSentry('streak-challenges', async (req) => {
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

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const rl = await checkRateLimit(supabase, user.id, `streak_challenges_${action}`, 40, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_active ────────────────────────────────────────────────────────────
  if (action === 'get_active') {
    const { data: challenges } = await supabase
      .from('streak_challenges')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active'])
      .order('created_at', { ascending: false });

    if (!challenges?.length) return json({ challenges: [] });

    // For each, get completion days
    const enriched = await Promise.all(challenges.map(async (c) => {
      const { data: days } = await supabase
        .from('streak_challenge_days')
        .select('day_number, task_date, completed_at')
        .eq('challenge_id', c.id)
        .order('day_number');

      const today = new Date().toISOString().slice(0, 10);
      const completedToday = (days ?? []).some(d => d.task_date === today);

      return { ...c, days: days ?? [], completed_today: completedToday };
    }));

    return json({ challenges: enriched });
  }

  // ── generate ──────────────────────────────────────────────────────────────
  if (action === 'generate') {
    const { subject, topic, target_days = 7 } = body;

    // Get user's weak areas from error_patterns / sr_cards if subject not specified
    let focusSubject = subject;
    let focusTopic = topic;

    if (!focusSubject) {
      // Check SR cards with low EF factor (weak areas)
      const { data: weakCards } = await supabase
        .from('sr_cards')
        .select('subject, topic, easiness_factor')
        .eq('user_id', user.id)
        .lt('easiness_factor', 2.2)
        .order('easiness_factor')
        .limit(5);

      if (weakCards?.length) {
        focusSubject = weakCards[0].subject;
        focusTopic = weakCards[0].topic;
      }
    }

    // Limit concurrent active challenges
    const { count } = await supabase
      .from('streak_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active');
    if ((count ?? 0) >= 3) return json({ error: 'Maximum 3 active streak challenges' }, 400);

    interface ChallengeGen {
      title: string;
      description: string;
      daily_task: string;
      subject: string;
      topic: string;
    }
    const gen = await geminiJSON<ChallengeGen>(`
Generate a personalised streak challenge for a student.
${focusSubject ? `Subject: ${focusSubject}` : 'Pick any subject'}
${focusTopic ? `Topic: ${focusTopic}` : 'Pick any topic'}
Duration: ${target_days} days

Create a focused daily practice challenge that will genuinely improve their mastery.
The daily task should take 5-10 minutes and be completable by typing a short answer.

Return JSON:
{
  "title": "Catchy challenge title (e.g. '7-Day Differentiation Sprint')",
  "description": "2 sentences explaining what this challenge is and why it will help",
  "daily_task": "Single clear daily task description (e.g. 'Differentiate one function and explain each step')",
  "subject": "${focusSubject || 'the subject you chose'}",
  "topic": "${focusTopic || 'the topic you chose'}"
}`, v => !!v?.title && !!v?.daily_task);

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + target_days - 1);

    const { data: challenge } = await supabase
      .from('streak_challenges')
      .insert({
        user_id: user.id,
        subject: gen.subject || focusSubject || 'Mathematics',
        topic: gen.topic || focusTopic || 'General',
        title: gen.title,
        description: gen.description,
        target_days,
        daily_task: gen.daily_task,
        daily_xp: 50,
        bonus_xp: target_days * 30,
        target_end_date: endDate.toISOString().slice(0, 10),
      })
      .select('*')
      .single();

    return json({ challenge });
  }

  // ── complete_day ──────────────────────────────────────────────────────────
  if (action === 'complete_day') {
    const { challenge_id, answer } = body;

    const { data: challenge } = await supabase
      .from('streak_challenges')
      .select('*')
      .eq('id', challenge_id)
      .eq('user_id', user.id)
      .single();
    if (!challenge) return json({ error: 'Challenge not found' }, 404);
    if (challenge.status !== 'active') return json({ error: 'Challenge not active' }, 400);

    const today = new Date().toISOString().slice(0, 10);

    // Check already completed today (maybeSingle — usually won't exist, that's the normal path)
    const { data: existingDay } = await supabase
      .from('streak_challenge_days')
      .select('id')
      .eq('challenge_id', challenge_id)
      .eq('task_date', today)
      .maybeSingle();
    if (existingDay) return json({ error: 'Already completed today' }, 409);

    // Day number = total completions + 1
    const { count: completedCount } = await supabase
      .from('streak_challenge_days')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challenge_id);
    const day_number = (completedCount ?? 0) + 1;

    await supabase
      .from('streak_challenge_days')
      .insert({ challenge_id, user_id: user.id, day_number, task_date: today, answer, xp_earned: challenge.daily_xp });

    // Update challenge streak
    const lastDate = challenge.last_completed_date;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const newStreak = (lastDate === yesterdayStr || lastDate === today)
      ? challenge.current_streak + 1
      : 1;
    const longestStreak = Math.max(newStreak, challenge.longest_streak);

    const isComplete = day_number >= challenge.target_days;
    const status = isComplete ? 'completed' : 'active';
    const xp_bonus = isComplete ? challenge.bonus_xp : 0;

    await supabase
      .from('streak_challenges')
      .update({
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_completed_date: today,
        status,
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq('id', challenge_id);

    // Award XP
    const total_xp = challenge.daily_xp + xp_bonus;
    await supabase.rpc('increment_xp', { user_id: user.id, amount: total_xp });

    // Update profile streak_count if this is the user's longest app streak
    await supabase.rpc('update_streak_on_challenge', { p_user_id: user.id }).catch(e =>
      console.error('[streak-challenges] update_streak_on_challenge failed:', e?.message)
    );

    return json({
      day_number,
      current_streak: newStreak,
      is_complete: isComplete,
      xp_earned: total_xp,
      days_remaining: challenge.target_days - day_number,
    });
  }

  // ── get_today_task ────────────────────────────────────────────────────────
  // Returns a fresh AI-generated specific task for today based on the challenge topic
  if (action === 'get_today_task') {
    const { challenge_id } = body;
    const { data: challenge } = await supabase
      .from('streak_challenges')
      .select('subject, topic, daily_task, current_streak')
      .eq('id', challenge_id)
      .eq('user_id', user.id)
      .single();
    if (!challenge) return json({ error: 'Not found' }, 404);

    interface TodayTask { task: string; hint: string; example_answer: string; }
    const task = await geminiJSON<TodayTask>(`
Generate today's specific task for a streak challenge.

Subject: ${challenge.subject}
Topic: ${challenge.topic}
Daily task template: "${challenge.daily_task}"
Current streak day: ${challenge.current_streak + 1}

Generate ONE specific problem/question for today (slightly harder each day based on streak).
Return JSON:
{
  "task": "The specific task/problem for today (1-3 sentences)",
  "hint": "A brief hint if they get stuck (1 sentence)",
  "example_answer": "What a good answer would include (1-2 sentences)"
}`, v => !!v?.task);

    return json({ task });
  }

  // ── abandon ───────────────────────────────────────────────────────────────
  if (action === 'abandon') {
    const { challenge_id } = body;
    await supabase
      .from('streak_challenges')
      .update({ status: 'abandoned' })
      .eq('id', challenge_id)
      .eq('user_id', user.id);
    return json({ success: true });
  }

  // ── list_history ──────────────────────────────────────────────────────────
  if (action === 'list_history') {
    const { data: challenges } = await supabase
      .from('streak_challenges')
      .select('id,title,subject,topic,status,current_streak,longest_streak,target_days,started_at,completed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    return json({ challenges: challenges ?? [] });
  }

  return json({ error: 'Unknown action' }, 400);
}));
