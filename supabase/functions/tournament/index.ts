// ─────────────────────────────────────────────────────────────────────────────
// tournament — weekly AI-generated tournaments, async head-to-head leaderboard
// Actions: get_active | join | submit | get_leaderboard | create_weekly
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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + '\n\nReturn valid JSON only. No markdown.' }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

// Single-attempt generation previously meant one bad response killed weekly
// tournament creation outright with a non-2xx.
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

// ── Week boundaries (Mon–Sun) ─────────────────────────────────────────────────
function getWeekBounds(date = new Date()): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end:   sun.toISOString().slice(0, 10),
  };
}

// ── Strip correct_idx before sending to client ────────────────────────────────
function sanitizeQuestions(questions: unknown[]): unknown[] {
  return questions.map((q: unknown) => {
    const question = q as Record<string, unknown>;
    const { correct_idx, ...rest } = question;
    void correct_idx;
    return rest;
  });
}

serve(withSentry('tournament', async (req) => {
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

  const rl = await checkRateLimit(supabase, user.id, `tournament_${action}`, 40, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  // ── get_active ────────────────────────────────────────────────────────────
  // Auto-bootstraps this week's tournaments if none exist yet.
  // The first user to open the page each Monday triggers generation for everyone.
  // No pg_cron / Pro plan required.
  if (action === 'get_active') {
    const { start, end } = getWeekBounds();

    let { data: tournaments } = await supabase
      .from('tournaments')
      .select('id,name,subject,week_start,week_end,status,question_count,time_limit_secs,xp_1st,xp_2nd,xp_3rd,participant_count')
      .gte('week_end', start)
      .lte('week_start', end)
      .order('subject');

    // ── Auto-generate if no tournaments exist for this week ───────────────
    if (!tournaments?.length) {
      const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English'];
      const created = [];

      for (const subject of subjects) {
        // Guard against duplicate inserts (maybeSingle — tournament won't exist yet on Monday)
        const { data: existing } = await supabase
          .from('tournaments')
          .select('id')
          .eq('subject', subject)
          .eq('week_start', start)
          .maybeSingle();
        if (existing) continue;

        interface TournamentGen {
          name: string;
          questions: Array<{
            question: string;
            options: string[];
            correct_idx: number;
            explanation: string;
            points: number;
          }>;
        }
        const gen = await geminiJSON<TournamentGen>(`
Create a weekly tournament for ${subject}.
Week: ${start} to ${end}

Generate:
{
  "name": "creative tournament name (e.g. 'The Calculus Gauntlet')",
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correct_idx": 0,
      "explanation": "Why this is correct",
      "points": 10
    }
  ]
}
Include exactly 10 questions, increasing difficulty.`, v => !!v?.name && Array.isArray(v?.questions) && v.questions.length > 0).catch(() => null);

        if (!gen) continue;

        const { data: inserted } = await supabase
          .from('tournaments')
          .insert({
            name: gen.name,
            subject,
            week_start: start,
            week_end:   end,
            status:     'open',
            questions:  gen.questions,
            question_count: gen.questions.length,
          })
          .select('id,name,subject,week_start,week_end,status,question_count,time_limit_secs,xp_1st,xp_2nd,xp_3rd,participant_count')
          .maybeSingle();

        if (inserted) created.push(inserted);
      }

      // Use freshly created rows
      tournaments = created.length ? created : [];
    }

    // Get user's participation
    const ids = (tournaments ?? []).map(t => t.id);
    const { data: participations } = ids.length
      ? await supabase
          .from('tournament_participants')
          .select('tournament_id, score, rank, completed_at')
          .eq('user_id', user.id)
          .in('tournament_id', ids)
      : { data: [] };

    const partMap = new Map((participations ?? []).map(p => [p.tournament_id, p]));
    const enriched = (tournaments ?? []).map(t => ({
      ...t,
      my_participation: partMap.get(t.id) ?? null,
    }));

    return json({ tournaments: enriched, week_start: start, week_end: end });
  }

  // ── join ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    const { tournament_id } = body;
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();
    if (!tournament) return json({ error: 'Tournament not found' }, 404);

    // Check already joined
    const { data: existing } = await supabase
      .from('tournament_participants')
      .select('id')
      .eq('tournament_id', tournament_id)
      .eq('user_id', user.id)
      .single();
    if (existing) return json({ error: 'Already joined' }, 409);

    // Create participation entry
    const { data: participant } = await supabase
      .from('tournament_participants')
      .insert({ tournament_id, user_id: user.id })
      .select('*')
      .single();

    // Return questions WITHOUT correct_idx
    const questions = sanitizeQuestions(tournament.questions as unknown[]);
    return json({ participant, questions, time_limit_secs: tournament.time_limit_secs });
  }

  // ── get_questions ─────────────────────────────────────────────────────────
  if (action === 'get_questions') {
    const { tournament_id } = body;
    // Verify participant
    const { data: participant } = await supabase
      .from('tournament_participants')
      .select('id, completed_at')
      .eq('tournament_id', tournament_id)
      .eq('user_id', user.id)
      .single();
    if (!participant) return json({ error: 'Not joined' }, 403);
    if (participant.completed_at) return json({ error: 'Already submitted' }, 409);

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('questions, time_limit_secs')
      .eq('id', tournament_id)
      .single();
    if (!tournament) return json({ error: 'Not found' }, 404);

    return json({
      questions: sanitizeQuestions(tournament.questions as unknown[]),
      time_limit_secs: tournament.time_limit_secs,
      started_at: new Date().toISOString(),
    });
  }

  // ── submit ────────────────────────────────────────────────────────────────
  if (action === 'submit') {
    const { tournament_id, answers, time_taken_ms } = body;
    // answers = [{q_idx, chosen_idx}]

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('questions, xp_1st, xp_2nd, xp_3rd')
      .eq('id', tournament_id)
      .single();
    if (!tournament) return json({ error: 'Tournament not found' }, 404);

    const questions = tournament.questions as Array<{ correct_idx: number; points?: number }>;
    let score = 0;
    let maxScore = 0;
    const gradedAnswers = (answers as Array<{ q_idx: number; chosen_idx: number }>).map(a => {
      const q = questions[a.q_idx];
      const pts = q?.points ?? 10;
      maxScore += pts;
      const correct = a.chosen_idx === q?.correct_idx;
      if (correct) score += pts;
      return { ...a, correct, correct_idx: q?.correct_idx };
    });
    // Fill maxScore for any un-answered questions
    if (maxScore === 0) maxScore = questions.length * 10;

    await supabase
      .from('tournament_participants')
      .update({
        score,
        max_score: maxScore,
        time_taken_ms,
        answers: gradedAnswers,
        completed_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournament_id)
      .eq('user_id', user.id);

    // Re-rank all participants
    const { data: allParts } = await supabase
      .from('tournament_participants')
      .select('id, user_id, score, time_taken_ms')
      .eq('tournament_id', tournament_id)
      .not('completed_at', 'is', null)
      .order('score', { ascending: false })
      .order('time_taken_ms', { ascending: true });

    if (allParts) {
      for (let i = 0; i < allParts.length; i++) {
        await supabase
          .from('tournament_participants')
          .update({ rank: i + 1 })
          .eq('id', allParts[i].id);
      }
    }

    // Award XP based on rank
    const myRank = (allParts ?? []).findIndex(p => p.user_id === user.id) + 1;
    const xpMap: Record<number, number> = { 1: tournament.xp_1st, 2: tournament.xp_2nd, 3: tournament.xp_3rd };
    const xp_earned = xpMap[myRank] ?? (score > 0 ? 50 : 0);
    if (xp_earned > 0) {
      await supabase.rpc('increment_xp', { user_id: user.id, amount: xp_earned });
    }

    return json({ score, max_score: maxScore, rank: myRank, xp_earned, graded_answers: gradedAnswers });
  }

  // ── get_leaderboard ───────────────────────────────────────────────────────
  if (action === 'get_leaderboard') {
    const { tournament_id } = body;
    const { data: rows } = await supabase
      .from('tournament_participants')
      .select('user_id, score, max_score, time_taken_ms, rank, completed_at')
      .eq('tournament_id', tournament_id)
      .not('completed_at', 'is', null)
      .order('rank', { ascending: true })
      .limit(50);

    if (!rows?.length) return json({ leaderboard: [] });

    const userIds = rows.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

    const leaderboard = rows.map(r => ({
      rank: r.rank,
      user_id: r.user_id,
      name: profileMap.get(r.user_id)?.full_name ?? 'Student',
      avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
      score: r.score,
      max_score: r.max_score,
      time_taken_ms: r.time_taken_ms,
      is_me: r.user_id === user.id,
    }));

    return json({ leaderboard });
  }

  // ── create_weekly — called by pg_cron or manual admin trigger ─────────────
  if (action === 'create_weekly') {
    const { start, end } = getWeekBounds();
    const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English'];
    const created = [];

    for (const subject of subjects) {
      // Skip if already exists
      const { data: existing } = await supabase
        .from('tournaments')
        .select('id')
        .eq('subject', subject)
        .eq('week_start', start)
        .maybeSingle();
      if (existing) continue;

      interface TournamentGen {
        name: string;
        questions: Array<{
          question: string;
          options: string[];
          correct_idx: number;
          explanation: string;
          points: number;
        }>;
      }
      const gen = await geminiJSON<TournamentGen>(`
Create a weekly tournament for ${subject}.
Week: ${start} to ${end}

Generate:
{
  "name": "creative tournament name (e.g. 'The Calculus Gauntlet')",
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correct_idx": 0,
      "explanation": "Why this is correct",
      "points": 10
    }
    ... 10 questions total, increasing difficulty
  ]
}`, v => !!v?.name && Array.isArray(v?.questions) && v.questions.length > 0);

      const { data: tournament } = await supabase
        .from('tournaments')
        .insert({
          name: gen.name,
          subject,
          week_start: start,
          week_end: end,
          status: 'open',
          questions: gen.questions,
          question_count: gen.questions.length,
        })
        .select('id, name, subject')
        .single();

      created.push(tournament);
    }

    return json({ created, week_start: start, week_end: end });
  }

  return json({ error: 'Unknown action' }, 400);
}));
