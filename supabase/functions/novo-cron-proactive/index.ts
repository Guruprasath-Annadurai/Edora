// ─────────────────────────────────────────────────────────────────────────────
// novo-cron-proactive — Scheduled cron worker for Proactive Novo Intelligence
//
// Designed to run every 8 hours via Supabase pg_cron.
// For each active user who hasn't received a proactive message in MIN_GAP_HOURS:
//   1. Gathers rich context (memories, sprint stats, exam days, confidence)
//   2. Picks an emotionally-intelligent message type
//   3. Generates a personalised message via Gemini
//   4. Stores it in novo_proactive_messages
//   5. Sends a push notification via the novo-push edge function
//
// Security: only callable with the service-role key (no user JWT).
// Rate limiting: max 5 users per invocation to stay within edge function limits.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

const MIN_GAP_HOURS  = 8;
const BATCH_SIZE     = 5; // users per invocation — prevents timeout
const VALID_MSG_TYPES = new Set([
  'diagnostic', 'exam_reminder', 'streak_check', 'milestone',
  'lesson_nudge', 'memory_callback', 'welcome_back', 'goal_check',
  'encouragement', 'comeback', 'revision_mode',
]);

// ── Gemini helpers ────────────────────────────────────────────────────────────

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

async function geminiJSONWithRetry<T>(prompt: string, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try { return await geminiJSON<T>(prompt); }
    catch (e) {
      lastErr = e;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

// ── Send push notification ────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function sendPush(supabase: any, userId: string, title: string, body: string, route?: string | null) {
  try {
    await supabase.functions.invoke('novo-push', {
      body: {
        user_id: userId,
        title,
        body: body.slice(0, 200),
        data: { route: route ?? '/chat', type: 'proactive' },
      },
    });
  } catch { /* non-critical */ }
}

// ── Process one user ──────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function processUser(supabase: any, userId: string): Promise<{ generated: boolean; reason?: string }> {
  const now           = new Date();
  const sevenDaysAgo  = new Date(now.getTime() - 7 * 86400000).toISOString();
  const threeDaysAgo  = new Date(now.getTime() - 3 * 86400000).toISOString();
  const todayStr      = now.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: memories },
    { data: recentSprints },
    { data: recentQuizzes },
    { data: activePlan },
    { data: topicStats },
    { data: recentActivity },
    { data: recentCerts },
  ] = await Promise.all([
    supabase.from('profiles')
      .select('full_name,study_level,exam_name,exam_date,streak_count,xp,novo_personality')
      .eq('id', userId).single(),
    supabase.from('novo_memories')
      .select('memory_type,content,importance').eq('user_id', userId)
      .order('importance', { ascending: false }).limit(8),
    supabase.from('sprint_sessions')
      .select('subject,topic,completed,created_at')
      .eq('user_id', userId).gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('quiz_sessions')
      .select('subject,topic,score').eq('user_id', userId)
      .gte('created_at', sevenDaysAgo).limit(5),
    supabase.from('lesson_plans')
      .select('subject,done_tasks,total_tasks').eq('user_id', userId)
      .eq('status', 'active').limit(1),
    supabase.from('topic_stats')
      .select('subject,topic,struggle_count,win_count,last_active')
      .eq('user_id', userId)
      .order('struggle_count', { ascending: false })
      .limit(10),
    supabase.from('sprint_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', threeDaysAgo),
    supabase.from('novo_certifications')
      .select('subject,topic,pct_score,issued_at').eq('user_id', userId)
      .order('issued_at', { ascending: false }).limit(2),
  ]);

  const firstName    = profile?.full_name?.split(' ')[0] ?? 'there';
  const examDate     = profile?.exam_date;
  const daysToExam   = examDate
    ? Math.max(0, Math.floor((new Date(examDate).getTime() - now.getTime()) / 86400000))
    : null;

  const completedSprints  = (recentSprints ?? []).filter((s: { completed: boolean }) => s.completed);
  const sessions7          = completedSprints.length;
  const studiedSubjects    = [...new Set(
    completedSprints.map((s: { subject: string }) => s.subject).filter(Boolean),
  )];
  const memoryContext      = (memories ?? [])
    .map((m: { memory_type: string; content: string }) => `[${m.memory_type}] ${m.content}`)
    .join('\n') || 'No memories yet.';

  // ── Emotional intelligence signals ──────────────────────────────────────────
  const stats = topicStats ?? [];
  const avgConfidence = stats.length > 0
    ? stats.reduce((sum: number, s: { struggle_count: number; win_count: number }) => {
        const total = s.struggle_count + s.win_count;
        return sum + (total > 0 ? s.win_count / total : 0.5);
      }, 0) / stats.length
    : 0.5;

  const lowConfidence   = stats.length >= 3 && avgConfidence < 0.4;
  const worstTopic      = stats.length > 0
    ? [...stats].sort((a: { struggle_count: number }, b: { struggle_count: number }) => b.struggle_count - a.struggle_count)[0]
    : null;
  const recentCount     = (recentActivity as unknown as { count?: number })?.count ?? 0;
  const missedSessions  = recentCount === 0 && sessions7 === 0;
  const examUrgent      = daysToExam !== null && daysToExam <= 7;

  // ── Pick message type ─────────────────────────────────────────────────────
  let messageTypeHint = 'welcome_back';
  if (examUrgent)                                                                              messageTypeHint = 'revision_mode';
  else if (daysToExam !== null && daysToExam <= 14)                                            messageTypeHint = 'exam_reminder';
  else if (lowConfidence)                                                                      messageTypeHint = 'encouragement';
  else if (missedSessions)                                                                     messageTypeHint = 'comeback';
  else if (sessions7 === 0)                                                                    messageTypeHint = 'streak_check';
  else if ((activePlan?.[0]?.done_tasks ?? 0) < (activePlan?.[0]?.total_tasks ?? 1) * 0.5)    messageTypeHint = 'lesson_nudge';
  else if (memories?.some((m: { memory_type: string; importance: number }) => m.memory_type === 'struggle' && m.importance >= 7)) messageTypeHint = 'memory_callback';
  else if (recentCerts && recentCerts.length > 0)                                              messageTypeHint = 'milestone';
  else if (sessions7 >= 5)                                                                     messageTypeHint = 'goal_check';

  type CheckinResult = { message: string; message_type: string; cta_label: string | null; cta_route: string | null };

  let result: CheckinResult;
  try {
    result = await geminiJSONWithRetry<CheckinResult>(`
You are Novo, a warm emotionally intelligent AI tutor checking in on ${firstName}.
Today: ${todayStr}. Personality mode: ${profile?.novo_personality ?? 'teacher'}.
Streak: ${profile?.streak_count ?? 0}. Sessions this week: ${sessions7}. XP: ${profile?.xp ?? 0}.
Subjects studied: ${(studiedSubjects as string[]).join(', ') || 'none this week'}.
${daysToExam !== null ? `Days to ${profile?.exam_name ?? 'exam'}: ${daysToExam}` : ''}
Confidence: avg win rate ${Math.round(avgConfidence * 100)}%, worst topic: ${(worstTopic as { topic?: string } | null)?.topic ?? 'N/A'}.
Missed last 3 days: ${missedSessions ? 'YES' : 'No'}. Exam urgent: ${examUrgent ? 'YES' : 'No'}.
Active plan progress: ${activePlan?.[0] ? `${activePlan[0].done_tasks}/${activePlan[0].total_tasks} tasks` : 'none'}.
Memories:\n${memoryContext}

Message type: "${messageTypeHint}". Write ONE message (1-3 sentences, warm, specific, achievable next step).
Return JSON: { "message": "...", "message_type": "${messageTypeHint}", "cta_label": "...", "cta_route": "..." }
CTA options: "Start Sprint"→"/sprint", "Chat with Novo"→"/chat", "View Lesson Plan"→"/lesson-plan", "Review Weak Topics"→"/weakness-radar", null
`);
    if (!VALID_MSG_TYPES.has(result.message_type)) result.message_type = 'welcome_back';
    if (!result.message || result.message.trim().length < 10) throw new Error('empty');
  } catch {
    result = {
      message:      `Hey ${firstName}! Ready to keep the momentum going? A quick 15-min sprint today goes a long way. 🚀`,
      message_type: 'welcome_back',
      cta_label:    'Start Sprint',
      cta_route:    '/sprint',
    };
  }

  const { data: msg, error: insertErr } = await supabase
    .from('novo_proactive_messages')
    .insert({
      user_id:      userId,
      message:      result.message.slice(0, 1000),
      message_type: result.message_type,
      cta_label:    result.cta_label || null,
      cta_route:    result.cta_route || null,
      context_data: {
        days_to_exam:    daysToExam,
        sessions7,
        streak:          profile?.streak_count,
        avg_confidence:  Math.round(avgConfidence * 100),
        low_confidence:  lowConfidence,
        missed_sessions: missedSessions,
        exam_urgent:     examUrgent,
        worst_topic:     (worstTopic as { topic?: string } | null)?.topic ?? null,
        cron_generated:  true,
      },
    })
    .select('id')
    .single();

  if (insertErr) return { generated: false, reason: insertErr.message };

  // Push notification — title is the personality mode, body is the message
  await sendPush(
    supabase, userId,
    examUrgent ? `⏰ ${profile?.exam_name ?? 'Exam'} in ${daysToExam} days` : '📚 Novo has a message for you',
    result.message,
    result.cta_route,
  );

  return { generated: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Validate this is being called by an authorized caller (service key or cron header)
  const authHeader   = req.headers.get('Authorization') ?? '';
  const cronHeader   = req.headers.get('x-cron-secret') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret   = Deno.env.get('CRON_SECRET') ?? serviceKey.slice(0, 20);

  const isServiceKey = authHeader === `Bearer ${serviceKey}`;
  const isCron       = cronHeader === cronSecret;

  if (!isServiceKey && !isCron) {
    return json({ error: 'Unauthorized' }, 401);
  }
  // No per-user rate limit — internal/cron-triggered only

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  // allow caller to override batch size (e.g. for testing)
  const limit = Math.min(Number(body.limit ?? BATCH_SIZE), 20);

  // Find active users who haven't gotten a proactive message recently
  const cutoff = new Date(Date.now() - MIN_GAP_HOURS * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Users active in last 7 days who haven't received a message in MIN_GAP_HOURS
  const { data: recentMessageUserIds } = await supabase
    .from('novo_proactive_messages')
    .select('user_id')
    .gte('created_at', cutoff);

  const alreadyMessaged = new Set((recentMessageUserIds ?? []).map((r: { user_id: string }) => r.user_id));

  // Get active users (had a sprint in last 7 days) excluding those already messaged
  const { data: activeUsers } = await supabase
    .from('sprint_sessions')
    .select('user_id')
    .gte('created_at', sevenDaysAgo)
    .limit(200);

  const uniqueUserIds = [...new Set((activeUsers ?? []).map((r: { user_id: string }) => r.user_id))]
    .filter((uid: string) => !alreadyMessaged.has(uid))
    .slice(0, limit);

  if (uniqueUserIds.length === 0) {
    return json({ processed: 0, message: 'No eligible users at this time' });
  }

  // Process users sequentially (avoid Gemini rate-limit spikes)
  const results: Array<{ userId: string; generated: boolean; reason?: string }> = [];
  for (const userId of uniqueUserIds) {
    try {
      const r = await processUser(supabase, userId as string);
      results.push({ userId: userId as string, ...r });
    } catch (e) {
      results.push({ userId: userId as string, generated: false, reason: String(e) });
    }
    // 300ms gap between users to be gentle on Gemini quota
    await new Promise(r => setTimeout(r, 300));
  }

  const generated = results.filter(r => r.generated).length;
  return json({ processed: results.length, generated, results });
});
