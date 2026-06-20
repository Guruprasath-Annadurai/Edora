// ─────────────────────────────────────────────────────────────────────────────
// teacher-export — mastery map + error log + improvement trajectory as HTML PDF
// Actions: generate | get_latest
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
async function geminiJSON<T>(prompt: string): Promise<T> {
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
  const d = await res.json();
  const raw = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : raw) as T;
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function gradeColor(p: number) {
  if (p >= 80) return '#16a34a';
  if (p >= 65) return '#2563eb';
  if (p >= 50) return '#d97706';
  return '#dc2626';
}

function buildExportHTML(
  studentName: string,
  mastery: Record<string, { mastered: number; total: number; avg_ef: number; weak_topics: string[]; strong_topics: string[] }>,
  errorPatterns: Array<{ subject: string; pattern: string; frequency: number }>,
  trajectory: { direction: string; weekly_xp: number[]; trend: string },
  prediction: { predicted_score: number; predicted_grade: string } | null,
  narrative: string,
  generatedAt: string,
): string {
  const masteryHTML = Object.entries(mastery).map(([sub, m]) => {
    const p = pct(m.mastered, m.total);
    const weakList = m.weak_topics.slice(0, 5).map(t => `<li style="margin:2px 0">${t}</li>`).join('');
    const strongList = m.strong_topics.slice(0, 3).map(t => `<li style="margin:2px 0">${t}</li>`).join('');
    return `
<div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-weight:700;font-size:16px">${sub}</span>
    <span style="font-weight:700;font-size:20px;color:${gradeColor(p)}">${p}%</span>
  </div>
  <div style="height:8px;background:#e5e7eb;border-radius:4px;margin-bottom:12px">
    <div style="height:8px;background:linear-gradient(90deg,#5B6AF5,#8B5CF6);border-radius:4px;width:${p}%"></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
    <div>
      <div style="font-weight:600;color:#dc2626;margin-bottom:4px">⚠ Needs Work</div>
      <ul style="list-style:none;padding:0;color:#4b5563">${weakList || '<li>None identified</li>'}</ul>
    </div>
    <div>
      <div style="font-weight:600;color:#16a34a;margin-bottom:4px">✓ Strong Areas</div>
      <ul style="list-style:none;padding:0;color:#4b5563">${strongList || '<li>Building up</li>'}</ul>
    </div>
  </div>
  <div style="font-size:12px;color:#6b7280;margin-top:8px">${m.mastered} of ${m.total} topics mastered · Avg retention factor: ${m.avg_ef}</div>
</div>`;
  }).join('');

  const errorRows = errorPatterns.slice(0, 10).map(ep =>
    `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:10px 12px">${ep.subject}</td>
      <td style="padding:10px 12px">${ep.pattern}</td>
      <td style="padding:10px 12px;text-align:center">
        <span style="background:${ep.frequency >= 5 ? '#fee2e2' : ep.frequency >= 3 ? '#fef9c3' : '#f0fdf4'};color:${ep.frequency >= 5 ? '#dc2626' : ep.frequency >= 3 ? '#92400e' : '#166534'};padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600">${ep.frequency}×</span>
      </td>
    </tr>`
  ).join('');

  const xpPoints = trajectory.weekly_xp
    .map((v, i) => {
      const max = Math.max(...trajectory.weekly_xp, 1);
      const x = (i / Math.max(trajectory.weekly_xp.length - 1, 1)) * 260 + 20;
      const y = 60 - (v / max) * 50 + 10;
      return `${x},${y}`;
    })
    .join(' ');

  const sparkline = trajectory.weekly_xp.length >= 2
    ? `<svg width="300" height="70" style="display:block">
        <polyline points="${xpPoints}" fill="none" stroke="#5B6AF5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    : '<p style="color:#9ca3af;font-size:13px">Not enough data for trajectory yet</p>';

  const formattedNarrative = narrative
    .split('\n\n')
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 12px;line-height:1.7">${p}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edora Teacher Report — ${studentName}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f7ff; color: #1f2937; }
.page { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
.header { background: linear-gradient(135deg, #1e1b4b, #4c1d95); border-radius: 20px; padding: 32px; color: white; margin-bottom: 20px; }
.header h1 { font-size: 24px; font-weight: 800; }
.header .sub { font-size: 14px; opacity: 0.8; margin-top: 6px; }
.badge { display: inline-block; background: rgba(255,255,255,0.2); border-radius: 8px; padding: 4px 12px; font-size: 13px; margin-top: 12px; }
.card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
.card h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #111827; display:flex;align-items:center;gap:6px }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #f3f4f6; }
.footer { text-align: center; padding: 20px; font-size: 12px; color: #9ca3af; }
@media print { body { background: white; } .page { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div style="font-size:12px;opacity:0.7;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Edora · Student Progress Report</div>
    <h1>${studentName}</h1>
    <div class="sub">Generated ${new Date(generatedAt).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
    ${prediction ? `<div class="badge">Projected Exam Score: ${prediction.predicted_score}% (${prediction.predicted_grade})</div>` : ''}
  </div>

  <div class="card">
    <h2>🎯 Subject Mastery Map</h2>
    ${masteryHTML || '<p style="color:#9ca3af">No mastery data yet — student is building up their flashcard deck.</p>'}
  </div>

  ${errorRows ? `<div class="card">
    <h2>⚠ Recurring Error Patterns</h2>
    <table>
      <thead><tr><th>Subject</th><th>Error Pattern</th><th>Frequency</th></tr></thead>
      <tbody>${errorRows}</tbody>
    </table>
  </div>` : ''}

  <div class="card">
    <h2>📈 Learning Trajectory</h2>
    <p style="font-size:14px;margin-bottom:12px;color:#6b7280">Weekly XP earned (last 8 weeks)</p>
    ${sparkline}
    <p style="font-size:14px;margin-top:10px">Trend: <strong style="color:${trajectory.direction === 'improving' ? '#16a34a' : trajectory.direction === 'declining' ? '#dc2626' : '#d97706'}">${trajectory.trend}</strong></p>
  </div>

  <div class="card">
    <h2>💬 AI Assessment</h2>
    <div style="font-size:14px;color:#374151">${formattedNarrative}</div>
  </div>

  <div class="footer">
    Confidential — For teacher use only &nbsp;·&nbsp; Generated by Edora AI &nbsp;·&nbsp; ${new Date(generatedAt).toLocaleDateString()}
  </div>
</div>
</body>
</html>`;
}

serve(withSentry('teacher-export', async (req) => {
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
    const { data: exps } = await supabase
      .from('teacher_exports')
      .select('*')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(1);
    return json({ export: exps?.[0] ?? null });
  }

  // ── generate ──────────────────────────────────────────────────────────────
  if (action === 'generate') {
    // Gather all data
    const [
      { data: profile },
      { data: srCards },
      { data: errorLog },
      { data: sprints },
      { data: prediction },
    ] = await Promise.all([
      supabase.from('profiles').select('full_name,xp,level,exam_date,study_level').eq('id', user.id).single(),
      supabase.from('sr_cards').select('subject,topic,ef_factor,repetitions,last_reviewed_at').eq('user_id', user.id),
      supabase.from('error_patterns').select('subject,pattern_type,frequency,example_question').eq('user_id', user.id).order('frequency', { ascending: false }).limit(15),
      supabase.from('sprint_sessions').select('xp_earned,completed,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(56), // ~8 weeks
      supabase.from('exam_predictions').select('predicted_score,predicted_grade').eq('user_id', user.id).maybeSingle(),
    ]);

    const studentName = profile?.full_name ?? 'Student';

    // Build mastery map
    const masteryBySubject: Record<string, { mastered: number; total: number; avg_ef: number; weak_topics: string[]; strong_topics: string[] }> = {};
    for (const card of srCards ?? []) {
      if (!masteryBySubject[card.subject]) {
        masteryBySubject[card.subject] = { mastered: 0, total: 0, avg_ef: 0, weak_topics: [], strong_topics: [] };
      }
      const s = masteryBySubject[card.subject];
      s.total++;
      s.avg_ef += card.ef_factor;
      if (card.ef_factor >= 2.5 && card.repetitions >= 3) {
        s.mastered++;
        if (!s.strong_topics.includes(card.topic)) s.strong_topics.push(card.topic);
      } else if (card.ef_factor < 2.0) {
        if (!s.weak_topics.includes(card.topic)) s.weak_topics.push(card.topic);
      }
    }
    for (const sub of Object.keys(masteryBySubject)) {
      const s = masteryBySubject[sub];
      s.avg_ef = s.total > 0 ? Math.round((s.avg_ef / s.total) * 100) / 100 : 2.5;
    }

    // Weekly XP trajectory (last 8 weeks)
    const weeklyXP: number[] = Array(8).fill(0);
    for (const s of (sprints ?? []).filter(sp => sp.completed)) {
      const weeksAgo = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksAgo < 8) weeklyXP[7 - weeksAgo] += (s.xp_earned || 0);
    }
    const recentAvg = weeklyXP.slice(4).reduce((s, v) => s + v, 0) / 4;
    const oldAvg = weeklyXP.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
    const direction = recentAvg > oldAvg * 1.1 ? 'improving' : recentAvg < oldAvg * 0.9 ? 'declining' : 'stable';
    const trend = direction === 'improving' ? '↑ Improving — engagement is increasing'
      : direction === 'declining' ? '↓ Declining — study sessions have dropped'
      : '→ Stable — consistent study pattern';

    // Error patterns from DB
    const errorPatterns = (errorLog ?? []).map(e => ({
      subject: e.subject,
      pattern: e.pattern_type ?? e.example_question?.slice(0, 60) ?? 'Repeated error',
      frequency: e.frequency,
    }));

    // AI narrative for teacher
    const masteryText = Object.entries(masteryBySubject)
      .map(([sub, m]) => `${sub}: ${pct(m.mastered, m.total)}% mastered, weak in: ${m.weak_topics.slice(0,3).join(', ') || 'none'}`)
      .join('\n');

    interface TeacherNarrative { narrative: string; }
    const { narrative } = await geminiJSON<TeacherNarrative>(`
Write a concise teacher progress report for a student using an AI tutoring app.
This report is FOR A TEACHER — use appropriate academic language.

Student: ${studentName}
Study level: ${profile?.study_level ?? 'school'}
Exam date: ${profile?.exam_date ?? 'not set'}
${prediction ? `Projected exam score: ${prediction.predicted_score}% (${prediction.predicted_grade})` : ''}
XP level: ${profile?.level ?? 0}

Mastery by subject:
${masteryText || 'No data yet'}

Trajectory: ${direction} (${trend})

Top error patterns: ${errorPatterns.slice(0,3).map(e => e.pattern).join('; ') || 'none recorded'}

Write 3 paragraphs for a teacher:
1. Overall academic standing and learning engagement
2. Subject-specific strengths and weaknesses (cite specific topics)
3. Recommended classroom interventions or support strategies

Be precise and actionable. This is a professional document.

Return JSON: {"narrative": "full 3-paragraph text"}`);

    const generatedAt = new Date().toISOString();
    const export_html = buildExportHTML(
      studentName,
      masteryBySubject,
      errorPatterns,
      { direction, weekly_xp: weeklyXP, trend },
      prediction ?? null,
      narrative,
      generatedAt,
    );

    const export_data = { mastery_by_subject: masteryBySubject, error_patterns: errorPatterns, trajectory: { direction, weekly_xp: weeklyXP }, prediction };

    const { data: saved } = await supabase
      .from('teacher_exports')
      .insert({ user_id: user.id, export_html, export_data, generated_at: generatedAt })
      .select('*')
      .single();

    return json({ export: saved });
  }

  return json({ error: 'Unknown action' }, 400);
}));
