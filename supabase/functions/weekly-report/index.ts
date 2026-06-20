// ─────────────────────────────────────────────────────────────────────────────
// weekly-report — Novo generates plain-English parent report
// Actions: generate | get_latest | get_history
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
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

function getWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now); mon.setDate(now.getDate() + diff);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

function buildReportHTML(studentName: string, weekStart: string, reportText: string, data: Record<string, unknown>): string {
  const stats = data.stats as Record<string, number | null>;
  const mastery = data.mastery_by_subject as Record<string, { mastered: number; total: number; avg_ef: number }>;

  const masteryRows = Object.entries(mastery ?? {}).map(([sub, m]) => {
    const pct = m.total > 0 ? Math.round((m.mastered / m.total) * 100) : 0;
    const bar = `<div style="height:6px;border-radius:3px;background:#e5e7eb;margin-top:4px"><div style="height:6px;border-radius:3px;background:linear-gradient(90deg,#5B6AF5,#8B5CF6);width:${pct}%"></div></div>`;
    return `<tr><td style="padding:8px 12px;font-weight:500">${sub}</td><td style="padding:8px 12px">${m.mastered}/${m.total} topics${bar}</td><td style="padding:8px 12px;color:${pct>=70?'#16a34a':pct>=40?'#d97706':'#dc2626'};font-weight:600">${pct}%</td></tr>`;
  }).join('');

  const formattedReport = reportText
    .split('\n\n')
    .map(para => para.trim())
    .filter(Boolean)
    .map(para => `<p style="margin:0 0 14px;line-height:1.7;color:#374151">${para}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edora Weekly Report — ${studentName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f7ff; color: #1f2937; }
  .container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
  .header { background: linear-gradient(135deg, #5B6AF5, #8B5CF6); border-radius: 20px; padding: 28px; color: white; margin-bottom: 20px; }
  .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header p { font-size: 14px; opacity: 0.85; }
  .section { background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .section h2 { font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
  .stat-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; }
  .stat { background: #f9fafb; border-radius: 12px; padding: 12px; text-align: center; }
  .stat .val { font-size: 26px; font-weight: 700; color: #5B6AF5; }
  .stat .lbl { font-size: 11px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { text-align: center; padding: 16px; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📚 ${studentName}'s Weekly Report</h1>
    <p>Week of ${new Date(weekStart).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })} &nbsp;·&nbsp; Powered by Edora</p>
  </div>

  <div class="section">
    <h2>📊 This Week at a Glance</h2>
    <div class="stat-grid">
      <div class="stat"><div class="val">${stats?.sprints_completed ?? 0}</div><div class="lbl">Study Sessions</div></div>
      <div class="stat"><div class="val">${stats?.sr_cards_total ?? 0}</div><div class="lbl">Flashcards Active</div></div>
      <div class="stat"><div class="val">${stats?.xp_earned ?? 0}</div><div class="lbl">XP Earned</div></div>
      <div class="stat"><div class="val">${stats?.challenges_attempted ?? 0}</div><div class="lbl">Challenges Done</div></div>
    </div>
  </div>

  ${masteryRows ? `<div class="section">
    <h2>🎯 Subject Mastery</h2>
    <table><tbody>${masteryRows}</tbody></table>
  </div>` : ''}

  <div class="section">
    <h2>💬 Novo's Assessment</h2>
    ${formattedReport}
  </div>

  <div class="footer">Generated by Edora AI &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</div>
</div>
</body>
</html>`;
}

serve(withSentry('weekly-report', async (req) => {
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

  // ── get_latest ────────────────────────────────────────────────────────────
  if (action === 'get_latest') {
    const { data: reports } = await supabase
      .from('parent_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1);
    return json({ report: reports?.[0] ?? null });
  }

  // ── get_history ───────────────────────────────────────────────────────────
  if (action === 'get_history') {
    const { data: reports } = await supabase
      .from('parent_reports')
      .select('id,week_start,generated_at,report_data')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(12);
    return json({ reports: reports ?? [] });
  }

  // ── generate ──────────────────────────────────────────────────────────────
  if (action === 'generate') {
    const { week_start } = body;
    const { start } = week_start ? { start: week_start } : getWeekBounds();
    const since = new Date(start).toISOString();
    const weekEnd = new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Check if already generated this week (allow re-gen if forced)
    const { data: existing } = await supabase
      .from('parent_reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start', start)
      .maybeSingle();
    if (existing && !body.force) {
      const { data: cached } = await supabase.from('parent_reports').select('*').eq('id', existing.id).single();
      return json({ report: cached, from_cache: true });
    }

    // Gather data
    const [
      { data: profile },
      { data: sprints },
      { data: srCards },
      { data: challenges },
      { data: stories },
      { data: debates },
      { data: streaks },
    ] = await Promise.all([
      supabase.from('profiles').select('full_name,xp,level,streak_count,exam_date').eq('id', user.id).single(),
      supabase.from('sprint_sessions').select('xp_earned,completed,subject,created_at').eq('user_id', user.id).gte('created_at', since).lte('created_at', weekEnd),
      supabase.from('sr_cards').select('subject,topic,ef_factor,repetitions').eq('user_id', user.id),
      supabase.from('user_challenge_attempts').select('score,subject,status,xp_earned').eq('user_id', user.id).gte('challenge_date', start).lte('challenge_date', weekEnd),
      supabase.from('story_sessions').select('scenario_title,concepts_covered,xp_earned,status').eq('user_id', user.id).gte('created_at', since),
      supabase.from('debate_sessions').select('topic,score').eq('user_id', user.id).gte('created_at', since),
      supabase.from('streak_challenges').select('title,current_streak').eq('user_id', user.id).eq('status', 'active'),
    ]);

    const studentName = profile?.full_name ?? 'Your child';
    const completedSprints = (sprints ?? []).filter(s => s.completed);
    const totalXP = completedSprints.reduce((s, sp) => s + (sp.xp_earned || 0), 0)
      + (challenges ?? []).reduce((s, c) => s + (c.xp_earned || 0), 0);

    // Mastery
    const masteryBySubject: Record<string, { mastered: number; total: number; avg_ef: number; weak_topics: string[] }> = {};
    for (const card of srCards ?? []) {
      if (!masteryBySubject[card.subject]) masteryBySubject[card.subject] = { mastered: 0, total: 0, avg_ef: 0, weak_topics: [] };
      const s = masteryBySubject[card.subject];
      s.total++;
      s.avg_ef += card.ef_factor;
      if (card.ef_factor >= 2.5 && card.repetitions >= 3) s.mastered++;
      else if (card.ef_factor < 1.9) s.weak_topics.push(card.topic);
    }
    for (const sub of Object.keys(masteryBySubject)) {
      const s = masteryBySubject[sub];
      s.avg_ef = s.total > 0 ? Math.round((s.avg_ef / s.total) * 100) / 100 : 2.5;
    }

    const examDate = profile?.exam_date;
    const daysToExam = examDate
      ? Math.max(0, Math.floor((new Date(examDate).getTime() - Date.now()) / 86400000))
      : null;

    // Gemini generates the plain-English narrative
    const masteryText = Object.entries(masteryBySubject)
      .map(([sub, m]) => `${sub}: ${m.total > 0 ? Math.round(m.mastered / m.total * 100) : 0}% mastered`)
      .join(', ');

    const reportText = await gemini(`
You are Novo, an AI tutor writing a weekly progress report for a parent.
Write in warm, plain English — NO educational jargon. Imagine you are a trusted tutor writing a letter home.

Student: ${studentName}
Week: ${start} to ${weekEnd}

Activity this week:
- Study sessions completed: ${completedSprints.length}
- Challenges attempted: ${(challenges ?? []).length}, average score: ${(challenges ?? []).length > 0 ? Math.round((challenges ?? []).reduce((s,c) => s+(c.score||0), 0) / (challenges ?? []).length) : 'N/A'}%
- Stories completed: ${(stories ?? []).filter(s => s.status === 'completed').length}
- Debates completed: ${(debates ?? []).length}
- Active streak challenges: ${(streaks ?? []).length}
${daysToExam !== null ? `- Days until exam: ${daysToExam}` : ''}

Subject mastery: ${masteryText || 'No data yet'}

Weakest areas: ${Object.entries(masteryBySubject).flatMap(([_, m]) => m.weak_topics).slice(0,3).join(', ') || 'none identified yet'}

Write 3-4 paragraphs:
1. Warm opener: overall tone of the week (encouraging, concerned, or excellent?)
2. What ${studentName} actually did this week — be specific and concrete
3. Areas of strength and areas that need more attention — plain language
4. One clear actionable suggestion for the parent (e.g. "encourage 15 more minutes on Chemistry this weekend")
${daysToExam !== null && daysToExam <= 30 ? `5. Brief exam readiness comment — ${daysToExam} days to go` : ''}

Do NOT use bullet points. Write in natural flowing prose. No headers.`);

    const stats = {
      sprints_completed: completedSprints.length,
      sr_cards_total: (srCards ?? []).length,
      xp_earned: totalXP,
      challenges_attempted: (challenges ?? []).length,
      avg_challenge_score: (challenges ?? []).length > 0
        ? Math.round((challenges ?? []).reduce((s, c) => s + (c.score || 0), 0) / (challenges ?? []).length)
        : null,
    };

    const report_data = { stats, mastery_by_subject: masteryBySubject, student_name: studentName };
    const report_html = buildReportHTML(studentName, start, reportText, report_data);

    // Save
    const { data: saved } = await supabase
      .from('parent_reports')
      .upsert({ user_id: user.id, week_start: start, report_html, report_data, generated_at: new Date().toISOString() },
               { onConflict: 'user_id,week_start' })
      .select('*')
      .single();

    return json({ report: saved });
  }

  return json({ error: 'Unknown action' }, 400);
}));
