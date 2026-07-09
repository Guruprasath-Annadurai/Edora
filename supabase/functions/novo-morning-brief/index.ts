// ─────────────────────────────────────────────────────────────────────────────
// novo-morning-brief — Personalised daily 7 AM push notification
//
// Cron mode: called by pg_cron at 01:30 UTC (7 AM IST) with no user JWT.
//   Processes all users who have morning_brief_enabled = true.
//
// Manual mode: POST with user JWT + { action: 'preview' } → returns brief text
//   without sending a push (used for settings preview).
//
// Brief content (all AI-generated, personalised per user):
//   • Today's focus topic (weakest from topic_stats)
//   • Exam countdown days + syllabus pace warning
//   • Rival XP delta overnight ("Riya gained 40 XP while you slept")
//   • Streak status (on fire / at risk)
//
// Output: saves to morning_brief_log, sends via novo-push FCM dispatcher.
// ─────────────────────────────────────────────────────────────────────────────
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';

import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// ── Build personalised brief text ─────────────────────────────────────────────
async function buildBrief(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{
  text: string; focusTopic: string | null; rivalName: string | null;
  xpDelta: number | null; examDays: number | null;
} | null> {
  // 1. Profile (name, exam, streak)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, exam_name, exam_date, streak_count, xp')
    .eq('id', userId)
    .single();
  if (!profile) return null;

  const firstName  = profile.full_name?.split(' ')[0] ?? 'there';
  const examDays   = profile.exam_date
    ? Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86_400_000)
    : null;
  const streakCount = profile.streak_count ?? 0;

  // 2. Weakest topic from topic_stats
  const { data: topicStats } = await supabase
    .from('topic_stats')
    .select('topic, subject, struggle_count, win_count')
    .eq('user_id', userId)
    .order('struggle_count', { ascending: false })
    .limit(1);
  const weakTopic = topicStats?.[0] ?? null;

  // 3. Rival XP delta (first rival in rivals table)
  let rivalName: string | null = null;
  let xpDelta: number | null = null;
  const { data: rival } = await supabase
    .from('rivals')
    .select('rival_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (rival) {
    const { data: rivalProfile } = await supabase
      .from('profiles')
      .select('full_name, xp')
      .eq('id', rival.rival_id)
      .single();
    if (rivalProfile) {
      rivalName = rivalProfile.full_name?.split(' ')[0] ?? null;
      // XP delta = rival current XP minus their snapshot from yesterday
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const { data: snap } = await supabase
        .from('xp_snapshots')
        .select('xp_value')
        .eq('user_id', rival.rival_id)
        .eq('snapshot_at', yesterday.toISOString().slice(0, 10))
        .single();
      xpDelta = snap ? (rivalProfile.xp - snap.xp_value) : null;
    }
  }

  // 4. Generate brief via Gemini
  const context = [
    `Student: ${firstName}`,
    weakTopic ? `Weakest topic: ${weakTopic.topic} (${weakTopic.struggle_count} struggles, ${weakTopic.win_count} wins)` : '',
    examDays !== null ? `Exam: ${profile.exam_name ?? 'upcoming exam'} in ${examDays} days` : '',
    streakCount > 0 ? `Current streak: ${streakCount} days` : 'Streak broken — needs to restart',
    rivalName && xpDelta !== null ? `Rival ${rivalName} gained ${xpDelta} XP overnight` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are Novo, an AI study coach. Write a VERY SHORT motivational morning push notification (max 2 sentences, 120 chars max) for a student based on this context:

${context}

Rules:
- Be specific (mention the actual topic/rival name/days)
- Create urgency WITHOUT being harsh
- No hashtags, no exclamation spam, no emojis in text
- Sound like a smart coach who cares, not a marketing bot
- End with a clear action ("Open Edora →" is added automatically)

Output ONLY the notification text, nothing else.`;

  const text = await gemini(prompt);
  return { text, focusTopic: weakTopic?.topic ?? null, rivalName, xpDelta, examDays };
}

// ── Send push via novo-push dispatcher ────────────────────────────────────────
async function sendPush(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  await fetch(`${supabaseUrl}/functions/v1/novo-push`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ action: 'send_to_user', user_id: userId, title, body }),
  }).catch(() => {});
}

serve(withSentry('novo-morning-brief', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const isCron = req.headers.get('x-cron-secret') === CRON_SECRET
    || req.headers.get('Authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

  const body = await req.json().catch(() => ({}));

  // ── Preview mode (authenticated user wants to see their brief) ────────────
  if (body.action === 'preview') {
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return json({ error: 'Unauthorized' }, 401);

    const rl = await checkRateLimit(supabase, user.id, 'novo-morning-brief_preview', 40, 60);
    if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

    const brief = await buildBrief(supabase, user.id);
    if (!brief) return json({ error: 'Could not generate brief' }, 500);
    return json({ brief_text: brief.text, focus_topic: brief.focusTopic, rival_name: brief.rivalName });
  }

  // ── Cron mode — process all eligible users ────────────────────────────────
  if (!isCron) return json({ error: 'Unauthorized' }, 401);

  const today = new Date().toISOString().slice(0, 10);

  // Fetch users who haven't received a brief today and have it enabled
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, morning_brief_enabled, last_brief_sent_at')
    .eq('morning_brief_enabled', true)
    .or(`last_brief_sent_at.is.null,last_brief_sent_at.lt.${today}`)
    .limit(500);

  if (!users?.length) return json({ sent: 0 });

  let sent = 0;
  let failed = 0;

  // Process in batches of 10 to respect Gemini rate limits
  for (let i = 0; i < users.length; i += 10) {
    const batch = users.slice(i, i + 10);
    await Promise.all(batch.map(async (u) => {
      try {
        const brief = await buildBrief(supabase, u.id);
        if (!brief) { failed++; return; }

        const title = '☀️ Novo Morning Brief';
        const notifBody = `${brief.text} Open Edora →`;

        // Log the brief
        await supabase.from('morning_brief_log').upsert({
          user_id:     u.id,
          sent_date:   today,
          brief_text:  brief.text,
          focus_topic: brief.focusTopic,
          rival_name:  brief.rivalName,
          xp_delta:    brief.xpDelta,
          exam_days:   brief.examDays,
        }, { onConflict: 'user_id,sent_date' });

        // Update last_brief_sent_at
        await supabase.from('profiles')
          .update({ last_brief_sent_at: today })
          .eq('id', u.id);

        // Send push
        await sendPush(supabase, u.id, title, notifBody);
        sent++;
      } catch { failed++; }
    }));

    // 200ms pause between batches to avoid Gemini rate limits
    if (i + 10 < users.length) await new Promise(r => setTimeout(r, 200));
  }

  return json({ sent, failed, total: users.length });
}));
