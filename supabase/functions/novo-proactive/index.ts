// ─────────────────────────────────────────────────────────────────────────────
// novo-proactive — Novo initiates conversations, not just responds
// Actions:
//   generate_checkin — generate a fresh proactive message based on user context
//   get_pending      — fetch unread messages (for home screen / chat header)
//   mark_read        — mark a message (or all) as read
//   get_history      — list recent messages
// Enterprise: rate limiting (force-mode hard cap), Gemini retry, safe fallback
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
// ── Gemini with retry ─────────────────────────────────────────────────────────
async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 400 },
      }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]) as T;
}

// Retry up to maxRetries times before throwing (caller provides fallback).
async function geminiJSONWithRetry<T>(prompt: string, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await geminiJSON<T>(prompt);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= maxRequests) {
    return { allowed: false, retryAfterSecs: windowMinutes * 60 };
  }
  supabase.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

// Minimum gap between auto-generated messages (server-enforced, no force bypass)
const MIN_GAP_HOURS = 8;

serve(withSentry('novo-proactive', async (req) => {
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

  // ── generate_checkin ──────────────────────────────────────────────────────
  if (action === 'generate_checkin') {
    const { force = false } = body;

    if (force) {
      // Hard server-side cap on force-generates: 20 per day, non-bypassable.
      // This stops anyone hitting the API directly with force:true in a loop.
      const rl = await checkRateLimit(supabase, user.id, 'generate_checkin_force', 20, 1440);
      if (!rl.allowed) {
        return json({
          error: 'Daily limit for manual check-ins reached. Novo will check in automatically tomorrow.',
          retry_after_secs: rl.retryAfterSecs,
        }, 429);
      }
    } else {
      // Standard auto-generate: enforce 8-hour server cooldown
      const cutoff = new Date(Date.now() - MIN_GAP_HOURS * 3600 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('novo_proactive_messages')
        .select('id').eq('user_id', user.id).gte('created_at', cutoff).limit(1);

      if (recent && recent.length > 0) {
        const { data: pending } = await supabase
          .from('novo_proactive_messages')
          .select('*').eq('user_id', user.id).is('read_at', null)
          .order('created_at', { ascending: false }).limit(1);
        return json({ message: pending?.[0] ?? null, from_cache: true });
      }
    }

    // Gather rich context about the user
    const now          = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
    const todayStr     = now.toISOString().slice(0, 10);

    const [
      { data: profile },
      { data: memories },
      { data: recentSprints },
      { data: recentQuizzes },
      { data: streak },
      { data: activePlan },
      { data: pendingTasks },
      { data: recentCerts },
      { data: topicStats },
      { data: recentActivity },
    ] = await Promise.all([
      supabase.from('profiles')
        .select('full_name,study_level,exam_name,exam_date,streak_count,xp,novo_personality')
        .eq('id', user.id).single(),
      supabase.from('novo_memories')
        .select('memory_type,content,importance').eq('user_id', user.id)
        .order('importance', { ascending: false }).limit(8),
      supabase.from('sprint_sessions')
        .select('subject,topic,completed,xp_earned,created_at')
        .eq('user_id', user.id).gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('quiz_sessions')
        .select('subject,topic,score,completed_at').eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(5),
      supabase.from('streak_challenges')
        .select('title,current_streak,best_streak').eq('user_id', user.id)
        .eq('status', 'active').limit(3),
      supabase.from('lesson_plans')
        .select('subject,goal,done_tasks,total_tasks,week_start').eq('user_id', user.id)
        .eq('status', 'active').order('week_start', { ascending: false }).limit(1),
      supabase.from('lesson_plan_tasks')
        .select('title,task_type,day_index').eq('user_id', user.id)
        .eq('completed', false).order('day_index').limit(3),
      supabase.from('novo_certifications')
        .select('subject,topic,pct_score,issued_at').eq('user_id', user.id)
        .order('issued_at', { ascending: false }).limit(2),
      // Confidence/struggle signals
      supabase.from('topic_stats')
        .select('subject,topic,struggle_count,win_count,last_active')
        .eq('user_id', user.id)
        .order('struggle_count', { ascending: false })
        .limit(10),
      // Activity in last 3 days (detect absence)
      supabase.from('sprint_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', threeDaysAgo),
    ]);

    const firstName   = profile?.full_name?.split(' ')[0] ?? 'there';
    const examDate    = profile?.exam_date;
    const daysToExam  = examDate
      ? Math.max(0, Math.floor((new Date(examDate).getTime() - now.getTime()) / 86400000))
      : null;

    const completedSprints  = (recentSprints ?? []).filter((s: { completed: boolean }) => s.completed);
    const streak7           = completedSprints.length;
    const studiedSubjects   = [...new Set(
      completedSprints.map((s: { subject: string }) => s.subject).filter(Boolean),
    )];
    const memoryContext     = (memories ?? [])
      .map((m: { memory_type: string; content: string }) => `[${m.memory_type}] ${m.content}`)
      .join('\n') || 'None yet.';

    // ── Emotional intelligence signals ────────────────────────────────────────
    // 1. Confidence signal: if avg struggle_count >> win_count → low confidence
    const stats = topicStats ?? [];
    const avgConfidence = stats.length > 0
      ? stats.reduce((sum: number, s: { struggle_count: number; win_count: number }) => {
          const total = s.struggle_count + s.win_count;
          return sum + (total > 0 ? s.win_count / total : 0.5);
        }, 0) / stats.length
      : 0.5;
    const lowConfidence = stats.length >= 3 && avgConfidence < 0.4; // losing >60% of attempts

    // Worst struggling topic for targeted message
    const worstTopic = stats.length > 0
      ? stats.sort((a: { struggle_count: number }, b: { struggle_count: number }) => b.struggle_count - a.struggle_count)[0]
      : null;

    // 2. Absence signal: no activity in last 3 days
    const recentActivityCount = (recentActivity as unknown as { count?: number })?.count ?? 0;
    const missedSessions = recentActivityCount === 0 && streak7 === 0;

    // 3. Exam < 7 days → revision mode
    const examUrgent = daysToExam !== null && daysToExam <= 7;

    const confidenceContext = stats.length > 0
      ? `Confidence signals: avg win rate ${Math.round(avgConfidence * 100)}%, worst topic: ${worstTopic?.topic ?? 'N/A'} (${worstTopic?.struggle_count ?? 0} struggles vs ${worstTopic?.win_count ?? 0} wins)`
      : 'No quiz data yet.';

    // Pick message type based on emotional intelligence priority
    let messageTypeHint = 'welcome_back';
    if (examUrgent)                                                                           messageTypeHint = 'revision_mode';
    else if (daysToExam !== null && daysToExam <= 14)                                         messageTypeHint = 'exam_reminder';
    else if (lowConfidence)                                                                   messageTypeHint = 'encouragement';
    else if (missedSessions)                                                                  messageTypeHint = 'comeback';
    else if (streak7 === 0)                                                                   messageTypeHint = 'streak_check';
    else if ((activePlan?.[0]?.done_tasks ?? 0) < (activePlan?.[0]?.total_tasks ?? 1) * 0.5) messageTypeHint = 'lesson_nudge';
    else if (memories?.some((m: { memory_type: string; importance: number }) => m.memory_type === 'struggle' && m.importance >= 7)) messageTypeHint = 'memory_callback';
    else if (recentCerts && recentCerts.length > 0)                                           messageTypeHint = 'milestone';
    else if (streak7 >= 5)                                                                    messageTypeHint = 'goal_check';

    type CheckinResult = {
      message: string;
      message_type: string;
      cta_label: string | null;
      cta_route: string | null;
    };

    // Try Gemini with retry; safe fallback if all attempts fail
    let result: CheckinResult;
    try {
      result = await geminiJSONWithRetry<CheckinResult>(`
You are Novo, a warm, emotionally intelligent AI tutor checking in on your student ${firstName}.
Today is ${todayStr}.

Student context:
- Study level: ${profile?.study_level}
- Personality mode preference: ${profile?.novo_personality}
- Streak count: ${profile?.streak_count ?? 0} days
- Sessions this week: ${streak7}
- Subjects studied: ${(studiedSubjects as string[]).join(', ') || 'none this week'}
${daysToExam !== null ? `- Days to ${profile?.exam_name ?? 'exam'}: ${daysToExam}` : ''}
${activePlan?.[0] ? `- Active lesson plan: ${activePlan[0].subject} — ${activePlan[0].done_tasks}/${activePlan[0].total_tasks} tasks done` : ''}
${pendingTasks && pendingTasks.length > 0 ? `- Next pending tasks: ${pendingTasks.slice(0, 2).map((t: { title: string }) => t.title).join(', ')}` : ''}

Emotional signals:
- ${confidenceContext}
- Missed last 3 days: ${missedSessions ? 'YES — student has been away' : 'No, studying recently'}
- Exam urgency: ${examUrgent ? `URGENT — only ${daysToExam} days left!` : 'Not urgent'}

Key memories (struggles & strengths):
${memoryContext}

Recent certifications:
${(recentCerts ?? []).map((c: { topic: string; subject: string; pct_score: number }) => `${c.topic} in ${c.subject} (${c.pct_score}%)`).join('\n') || 'None yet'}

Your message type should be: "${messageTypeHint}"

Message type guidance:
- encouragement: Student is losing confidence (low win rate). Be genuinely warm. Acknowledge the difficulty. Name the specific topic they're struggling with. Tell them you believe in them. Suggest one small, winnable step.
- comeback: Student was away for 3+ days. Be welcoming, not guilt-tripping. Express you missed them. Make it easy to return.
- revision_mode: Exam is in 7 days or less. Switch into focused revision coach mode. Be specific about what to prioritise. Create urgency without panic.
- exam_reminder: Exam is 8-14 days away. Motivating but calm.
- memory_callback: Reference a specific struggle from memory. Show you remember. Ask if they've made progress on it.
- streak_check: No sessions this week. Gentle nudge.
- lesson_nudge: Lesson plan falling behind. Specific next step.
- milestone: Celebrate a certification or win.
- goal_check: Strong streak. Challenge them further.
- welcome_back: Default warm check-in.

Write ONE proactive message that:
1. Feels like a real tutor who notices emotional signals (anxiety, absence, confidence)
2. References SPECIFIC data (topic name, struggle count, days, task title)
3. Is 1-3 sentences — warm, direct, never robotic or generic
4. Ends with a clear, achievable next step

Also pick the best CTA:
- "Start Sprint" → "/sprint"
- "Chat with Novo" → "/chat"
- "View Lesson Plan" → "/lesson-plan"
- "Take Certification" → "/certifications"
- "View Insights" → "/novo-insights"
- "Review Weak Topics" → "/weakness-radar"
- null (no CTA)

Return JSON:
{
  "message": "...",
  "message_type": "${messageTypeHint}",
  "cta_label": "...",
  "cta_route": "..."
}
`);

      // Validate message type
      const VALID_TYPES = new Set([
        'diagnostic', 'exam_reminder', 'streak_check', 'milestone',
        'lesson_nudge', 'memory_callback', 'welcome_back', 'goal_check',
        'encouragement', 'comeback', 'revision_mode',
      ]);
      if (!VALID_TYPES.has(result.message_type)) result.message_type = 'welcome_back';
      if (!result.message || result.message.trim().length < 10) throw new Error('Empty message');

    } catch {
      // Safe fallback — always deliver something useful
      result = {
        message:      `Hey ${firstName}! Ready to keep that momentum going? Let's get a quick study session in today! 🚀`,
        message_type: 'welcome_back',
        cta_label:    'Start Sprint',
        cta_route:    '/sprint',
      };
    }

    const { data: msg, error: insertErr } = await supabase
      .from('novo_proactive_messages')
      .insert({
        user_id:      user.id,
        message:      result.message.slice(0, 1000),
        message_type: result.message_type,
        cta_label:    result.cta_label || null,
        cta_route:    result.cta_route || null,
        context_data: {
          days_to_exam:        daysToExam,
          sessions_this_week:  streak7,
          streak:              profile?.streak_count,
          force_generated:     force,
          avg_confidence:      Math.round(avgConfidence * 100),
          low_confidence:      lowConfidence,
          missed_sessions:     missedSessions,
          exam_urgent:         examUrgent,
          worst_topic:         worstTopic?.topic ?? null,
        },
      })
      .select('*')
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ message: msg, from_cache: false });
  }

  // ── get_pending ───────────────────────────────────────────────────────────
  if (action === 'get_pending') {
    const limit = Math.min(Number(body.limit ?? 5), 20);
    const { data: messages } = await supabase
      .from('novo_proactive_messages')
      .select('*')
      .eq('user_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    return json({ messages: messages ?? [] });
  }

  // ── mark_read ─────────────────────────────────────────────────────────────
  if (action === 'mark_read') {
    const { message_id, all = false } = body;
    const readAt = new Date().toISOString();

    if (all) {
      await supabase
        .from('novo_proactive_messages')
        .update({ read_at: readAt })
        .eq('user_id', user.id)
        .is('read_at', null);
      return json({ marked: 'all' });
    }

    if (!message_id) return json({ error: 'message_id or all required' }, 400);

    const { error } = await supabase
      .from('novo_proactive_messages')
      .update({ read_at: readAt })
      .eq('id', message_id)
      .eq('user_id', user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ marked: message_id });
  }

  // ── get_history ───────────────────────────────────────────────────────────
  if (action === 'get_history') {
    const limit = Math.min(Number(body.limit ?? 20), 50);
    const { data: messages } = await supabase
      .from('novo_proactive_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    return json({ messages: messages ?? [] });
  }

  return json({ error: 'Unknown action' }, 400);
}));
