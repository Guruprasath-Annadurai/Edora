// ═══════════════════════════════════════════════════════════════════════════
// school-report — Beautiful HTML reports for parents, teachers, and principals
//
// Actions:
//   weekly_parent    → generates a polished HTML report card for parent/student
//   school_summary   → school-level dashboard snapshot for principal
//   setup_bq_views   → creates Looker Studio–ready BigQuery views
//
// The reports are:
//   - Mobile-responsive HTML (open in browser, print to PDF)
//   - Self-contained (no external CSS dependencies)
//   - Shareable link via Supabase storage
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//          GCP_SERVICE_ACCOUNT_JSON (for BigQuery views)
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
// ── Grade letter helper ────────────────────────────────────────────────────────
function gradeLabel(score: number): { letter: string; color: string } {
  if (score >= 90) return { letter: 'A+', color: '#10B981' };
  if (score >= 80) return { letter: 'A',  color: '#10B981' };
  if (score >= 70) return { letter: 'B',  color: '#5B6AF5' };
  if (score >= 60) return { letter: 'C',  color: '#F59E0B' };
  if (score >= 50) return { letter: 'D',  color: '#F97316' };
  return                  { letter: 'F',  color: '#EF4444' };
}

// ── Trend emoji ───────────────────────────────────────────────────────────────
function trendEmoji(direction: string): string {
  if (direction === 'improving') return '📈';
  if (direction === 'declining') return '📉';
  return '➡️';
}

// ── Skill bar HTML ────────────────────────────────────────────────────────────
function skillBar(label: string, value: number, color: string): string {
  return `
  <div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:13px;font-weight:500;color:#374151;">${label}</span>
      <span style="font-size:13px;font-weight:700;color:${color};">${value}%</span>
    </div>
    <div style="height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden;">
      <div style="height:100%;width:${value}%;background:${color};border-radius:4px;transition:width 0.3s;"></div>
    </div>
  </div>`;
}

// ── Main HTML report template ─────────────────────────────────────────────────
function buildParentReportHTML(data: {
  studentName:   string;
  studentEmail:  string;
  weekStart:     string;
  weekEnd:       string;
  schoolName:    string;
  activeDays:    number;
  quizzes:       number;
  avgQuizScore:  number;
  studyHours:    number;
  chatMessages:  number;
  flashcards:    number;
  xpEarned:      number;
  currentLevel:  number;
  streak:        number;
  subjectStats:  Array<{ subject: string; quizzes: number; avgScore: number }>;
  topStrengths:  string[];
  areasToImprove: string[];
  trajectoryDir: string;
  novoMessage:   string;
}): string {
  const grade = gradeLabel(data.avgQuizScore || 0);
  const weekLabel = `${new Date(data.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(data.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Edora Weekly Report — ${data.studentName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#F8FAFC;color:#1F2937; }
  .container { max-width:640px;margin:0 auto;padding:24px; }
  .header { background:linear-gradient(135deg,#5B6AF5,#8B5CF6);border-radius:20px;padding:32px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden; }
  .header::before { content:'';position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:rgba(255,255,255,0.08);border-radius:50%; }
  .header::after  { content:'';position:absolute;bottom:-30px;left:-30px;width:150px;height:150px;background:rgba(255,255,255,0.06);border-radius:50%; }
  .card { background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .stat-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px; }
  .stat-box { background:#F9FAFB;border-radius:12px;padding:16px;text-align:center; }
  .stat-num { font-size:28px;font-weight:800;line-height:1; }
  .stat-lbl { font-size:11px;color:#6B7280;margin-top:4px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px; }
  .badge { display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600; }
  .section-title { font-size:14px;font-weight:700;color:#374151;margin-bottom:14px;text-transform:uppercase;letter-spacing:0.5px; }
  .novo-bubble { background:linear-gradient(135deg,#EEF2FF,#F5F3FF);border:1px solid #C7D2FE;border-radius:16px;padding:20px;margin-bottom:16px; }
  .subject-row { display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F3F4F6; }
  .subject-row:last-child { border-bottom:none; }
  .tag { display:inline-block;background:#EEF2FF;color:#4F46E5;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:500;margin:3px; }
  .tag.red { background:#FEF2F2;color:#EF4444; }
  .footer { text-align:center;color:#9CA3AF;font-size:12px;padding:16px; }
  @media print { body { background:#fff; } .container { padding:12px; } }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <div style="position:relative;z-index:1;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;">📊</div>
        <div>
          <div style="font-size:12px;opacity:0.8;font-weight:500;">EDORA WEEKLY REPORT</div>
          <div style="font-size:18px;font-weight:800;">${data.studentName}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 12px;font-size:12px;">📅 ${weekLabel}</span>
        ${data.schoolName ? `<span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 12px;font-size:12px;">🏫 ${data.schoolName}</span>` : ''}
        <span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 12px;font-size:12px;">${trendEmoji(data.trajectoryDir)} ${data.trajectoryDir.charAt(0).toUpperCase() + data.trajectoryDir.slice(1)}</span>
      </div>
    </div>
  </div>

  <!-- At-a-glance stats -->
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-num" style="color:${grade.color};">${data.avgQuizScore ? grade.letter : '—'}</div>
      <div class="stat-lbl">Avg Grade</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#5B6AF5;">${data.activeDays}/7</div>
      <div class="stat-lbl">Active Days</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#F59E0B;">${data.streak}🔥</div>
      <div class="stat-lbl">Day Streak</div>
    </div>
  </div>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-num" style="color:#10B981;">${data.quizzes}</div>
      <div class="stat-lbl">Quizzes</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#8B5CF6;">${data.studyHours.toFixed(1)}h</div>
      <div class="stat-lbl">Study Time</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#EC4899;">+${data.xpEarned}</div>
      <div class="stat-lbl">XP Earned</div>
    </div>
  </div>

  <!-- Novo's message -->
  <div class="novo-bubble">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:20px;">🤖</span>
      <span style="font-size:13px;font-weight:700;color:#4F46E5;">Novo's Assessment</span>
    </div>
    <p style="font-size:14px;color:#374151;line-height:1.6;">${data.novoMessage}</p>
  </div>

  <!-- Subject breakdown -->
  ${data.subjectStats.length > 0 ? `
  <div class="card">
    <div class="section-title">📚 Subject Performance</div>
    ${data.subjectStats.map(s => `
    <div class="subject-row">
      <div>
        <div style="font-weight:600;font-size:14px;">${s.subject}</div>
        <div style="font-size:12px;color:#6B7280;">${s.quizzes} quiz${s.quizzes !== 1 ? 'zes' : ''}</div>
      </div>
      ${s.avgScore ? `
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:800;color:${gradeLabel(s.avgScore).color};">${gradeLabel(s.avgScore).letter}</div>
        <div style="font-size:11px;color:#9CA3AF;">${s.avgScore}%</div>
      </div>` : '<div style="font-size:12px;color:#9CA3AF;">No scores yet</div>'}
    </div>`).join('')}
  </div>` : ''}

  <!-- Skill bars -->
  ${data.avgQuizScore ? `
  <div class="card">
    <div class="section-title">🎯 Performance Snapshot</div>
    ${skillBar('Quiz Accuracy', data.avgQuizScore, '#5B6AF5')}
    ${skillBar('Consistency', Math.round((data.activeDays / 7) * 100), '#10B981')}
    ${skillBar('Engagement', Math.min(100, Math.round((data.chatMessages / 20) * 100 + (data.flashcards / 50) * 100) / 2), '#F59E0B')}
  </div>` : ''}

  <!-- Strengths and improvements -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
    ${data.topStrengths.length > 0 ? `
    <div class="card">
      <div class="section-title" style="color:#10B981;">💪 Strong In</div>
      ${data.topStrengths.map(t => `<span class="tag">${t}</span>`).join('')}
    </div>` : ''}
    ${data.areasToImprove.length > 0 ? `
    <div class="card">
      <div class="section-title" style="color:#F59E0B;">🎯 Focus Areas</div>
      ${data.areasToImprove.map(t => `<span class="tag red">${t}</span>`).join('')}
    </div>` : ''}
  </div>

  <!-- Level badge -->
  <div class="card" style="text-align:center;padding:24px;">
    <div style="font-size:36px;margin-bottom:8px;">🏆</div>
    <div style="font-size:20px;font-weight:800;color:#5B6AF5;">Level ${data.currentLevel}</div>
    <div style="font-size:13px;color:#6B7280;margin-top:4px;">+${data.xpEarned} XP this week • Total ${data.xpEarned} XP</div>
    <div style="margin-top:12px;">
      <a href="https://edora-bb02e.web.app" style="background:linear-gradient(135deg,#5B6AF5,#8B5CF6);color:#fff;padding:10px 24px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;">Open Edora</a>
    </div>
  </div>

  <div class="footer">
    Generated by Edora — AI Study Companion for Indian Students<br/>
    <a href="https://edora-bb02e.web.app" style="color:#5B6AF5;">edora-bb02e.web.app</a>
  </div>

</div>
</body>
</html>`;
}

// ── School summary HTML ───────────────────────────────────────────────────────
function buildSchoolSummaryHTML(data: {
  schoolName:       string;
  reportDate:       string;
  totalStudents:    number;
  activeThisWeek:   number;
  avgQuizScore:     number;
  totalStudyHours:  number;
  subjectBreakdown: Array<{ subject: string; students: number; avgScore: number }>;
  topStudents:      Array<{ name: string; xp: number; streak: number }>;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Edora School Dashboard — ${data.schoolName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#F8FAFC;color:#1F2937; }
  .container { max-width:800px;margin:0 auto;padding:24px; }
  .header { background:linear-gradient(135deg,#0F172A,#1E3A5F);border-radius:20px;padding:32px;color:#fff;margin-bottom:24px; }
  .card { background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .kpi-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px; }
  .kpi { background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08);text-align:center; }
  .kpi-num { font-size:32px;font-weight:800; }
  .kpi-lbl { font-size:12px;color:#6B7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px; }
  .section-title { font-size:15px;font-weight:700;color:#374151;margin-bottom:16px; }
  table { width:100%;border-collapse:collapse; }
  th { text-align:left;font-size:12px;color:#6B7280;font-weight:600;padding:8px 12px;background:#F9FAFB;border-radius:8px; }
  td { padding:12px;border-bottom:1px solid #F3F4F6;font-size:14px; }
  tr:last-child td { border-bottom:none; }
  @media (max-width:600px) { .kpi-grid { grid-template-columns:repeat(2,1fr); } }
  @media print { body { background:#fff; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div style="font-size:12px;opacity:0.7;margin-bottom:8px;">EDORA SCHOOL DASHBOARD</div>
    <div style="font-size:26px;font-weight:800;margin-bottom:8px;">🏫 ${data.schoolName}</div>
    <div style="font-size:13px;opacity:0.7;">Report as of ${new Date(data.reportDate).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-num" style="color:#5B6AF5;">${data.totalStudents}</div><div class="kpi-lbl">Total Students</div></div>
    <div class="kpi"><div class="kpi-num" style="color:#10B981;">${data.activeThisWeek}</div><div class="kpi-lbl">Active This Week</div></div>
    <div class="kpi"><div class="kpi-num" style="color:#F59E0B;">${data.avgQuizScore || '—'}${data.avgQuizScore ? '%' : ''}</div><div class="kpi-lbl">Avg Quiz Score</div></div>
    <div class="kpi"><div class="kpi-num" style="color:#8B5CF6;">${data.totalStudyHours.toFixed(0)}h</div><div class="kpi-lbl">Study Hours (Week)</div></div>
  </div>

  ${data.subjectBreakdown.length > 0 ? `
  <div class="card">
    <div class="section-title">📚 Subject Breakdown</div>
    <table>
      <thead><tr><th>Subject</th><th>Students</th><th>Avg Score</th><th>Grade</th></tr></thead>
      <tbody>
        ${data.subjectBreakdown.map(s => `
        <tr>
          <td style="font-weight:600;">${s.subject}</td>
          <td>${s.students}</td>
          <td>${s.avgScore || '—'}${s.avgScore ? '%' : ''}</td>
          <td><span style="color:${gradeLabel(s.avgScore || 0).color};font-weight:700;">${s.avgScore ? gradeLabel(s.avgScore).letter : '—'}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${data.topStudents.length > 0 ? `
  <div class="card">
    <div class="section-title">🏆 Top Students This Week</div>
    <table>
      <thead><tr><th>Student</th><th>XP Earned</th><th>Streak</th></tr></thead>
      <tbody>
        ${data.topStudents.map((s, i) => `
        <tr>
          <td><span style="font-weight:700;color:#5B6AF5;margin-right:8px;">#${i + 1}</span>${s.name}</td>
          <td style="color:#F59E0B;font-weight:700;">+${s.xp} XP</td>
          <td>${s.streak}🔥</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div style="background:linear-gradient(135deg,#EEF2FF,#F5F3FF);border-radius:16px;padding:20px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:700;color:#4F46E5;margin-bottom:8px;">📊 Connect to Looker Studio</div>
    <p style="font-size:13px;color:#374151;line-height:1.6;">Get live, interactive dashboards for free. Connect your BigQuery dataset <code style="background:#E0E7FF;padding:2px 6px;border-radius:4px;">edora_analytics</code> to Looker Studio → Create report → Add your school filter.</p>
  </div>

  <div style="text-align:center;color:#9CA3AF;font-size:12px;padding:16px;">
    Edora — Enterprise School Analytics · <a href="https://edora-bb02e.web.app" style="color:#5B6AF5;">edora-bb02e.web.app</a>
  </div>
</div>
</body>
</html>`;
}

serve(withSentry('school-report', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb    = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(serviceDb, user.id, 'school-report', 80, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const body   = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ── weekly_parent ─────────────────────────────────────────────────────────
  if (action === 'weekly_parent') {
    const studentId = (body.student_id as string) ?? user.id;

    // Profile + school
    const { data: profile } = await serviceDb
      .from('profiles')
      .select('full_name, email, xp, level, streak_count, school_id, school_profiles(name)')
      .eq('id', studentId)
      .single();

    if (!profile) return json({ error: 'Student not found' }, 404);

    const schoolName = (profile.school_profiles as { name: string } | null)?.name ?? '';

    // Week bounds
    const now       = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Analytics events this week
    const { data: events } = await serviceDb
      .from('analytics_events')
      .select('event_name, properties, created_at')
      .eq('user_id', studentId)
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString());

    const evts = events ?? [];

    // Calculate stats
    const quizEvents   = evts.filter(e => e.event_name === 'quiz_completed');
    const chatEvents   = evts.filter(e => e.event_name === 'chat_message_sent');
    const flashEvents  = evts.filter(e => e.event_name === 'flashcard_studied');
    const activeDates  = new Set(evts.map(e => e.created_at.slice(0, 10)));

    const quizScores   = quizEvents.map(e => (e.properties as Record<string, unknown>)?.score as number).filter(Boolean);
    const avgQuizScore = quizScores.length
      ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
      : 0;

    const studyHours = quizEvents
      .map(e => ((e.properties as Record<string, unknown>)?.time_secs as number) ?? 0)
      .reduce((a, b) => a + b, 0) / 3600;

    // Subject breakdown
    const subjectMap = new Map<string, number[]>();
    for (const e of quizEvents) {
      const subj = (e.properties as Record<string, unknown>)?.subject as string;
      const score = (e.properties as Record<string, unknown>)?.score as number;
      if (subj && score) {
        if (!subjectMap.has(subj)) subjectMap.set(subj, []);
        subjectMap.get(subj)!.push(score);
      }
    }
    const subjectStats = Array.from(subjectMap.entries()).map(([subject, scores]) => ({
      subject,
      quizzes:  scores.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    })).sort((a, b) => b.avgScore - a.avgScore);

    const topStrengths  = subjectStats.filter(s => s.avgScore >= 75).map(s => s.subject).slice(0, 3);
    const areasToImprove = subjectStats.filter(s => s.avgScore < 60).map(s => s.subject).slice(0, 3);

    const trajectoryDir = avgQuizScore >= 70 ? 'improving' : avgQuizScore >= 50 ? 'stable' : 'declining';

    // Generate Novo's message
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    let novoMessage = `${profile.full_name} completed ${quizEvents.length} quizzes this week with an average score of ${avgQuizScore}%. They were active on ${activeDates.size} days.`;

    if (geminiKey && quizEvents.length > 0) {
      try {
        const prompt = `You are Novo, an AI tutor. Write a 2-sentence parent-friendly assessment for ${profile.full_name}'s week:
- Active ${activeDates.size}/7 days
- ${quizEvents.length} quizzes, average score ${avgQuizScore}%
- Strong in: ${topStrengths.join(', ') || 'still building'}
- Needs work on: ${areasToImprove.join(', ') || 'maintaining consistency'}
Be warm, specific, and end with one actionable tip. Max 60 words.`;

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
          },
        );
        if (r.ok) {
          const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          novoMessage = d.candidates?.[0]?.content?.parts?.[0]?.text ?? novoMessage;
        }
      } catch { /* use default message */ }
    }

    const html = buildParentReportHTML({
      studentName:    profile.full_name ?? profile.email,
      studentEmail:   profile.email,
      weekStart:      weekStart.toISOString(),
      weekEnd:        weekEnd.toISOString(),
      schoolName,
      activeDays:     activeDates.size,
      quizzes:        quizEvents.length,
      avgQuizScore,
      studyHours,
      chatMessages:   chatEvents.length,
      flashcards:     flashEvents.length,
      xpEarned:       quizEvents.length * 50 + chatEvents.length * 10,
      currentLevel:   profile.level ?? 0,
      streak:         profile.streak_count ?? 0,
      subjectStats,
      topStrengths,
      areasToImprove,
      trajectoryDir,
      novoMessage,
    });

    return new Response(html, {
      headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── school_summary ────────────────────────────────────────────────────────
  if (action === 'school_summary') {
    const schoolId = body.school_id as string;
    if (!schoolId) return json({ error: 'school_id required' }, 400);

    const { data: school } = await serviceDb.from('school_profiles').select('name').eq('id', schoolId).single();
    if (!school) return json({ error: 'School not found' }, 404);

    const { data: students } = await serviceDb
      .from('profiles')
      .select('id, full_name, xp, level, streak_count')
      .eq('school_id', schoolId);

    const studentIds = (students ?? []).map(s => s.id);
    const totalStudents = studentIds.length;

    // Events last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await serviceDb
      .from('analytics_events')
      .select('event_name, user_id, properties')
      .in('user_id', studentIds)
      .gte('created_at', since);

    const evts = events ?? [];
    const activeStudents = new Set(evts.map(e => e.user_id)).size;
    const quizEvts = evts.filter(e => e.event_name === 'quiz_completed');
    const quizScores = quizEvts
      .map(e => (e.properties as Record<string, unknown>)?.score as number)
      .filter(Boolean);
    const avgQuizScore = quizScores.length
      ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
      : 0;
    const totalStudyHours = quizEvts
      .map(e => ((e.properties as Record<string, unknown>)?.time_secs as number) ?? 0)
      .reduce((a, b) => a + b, 0) / 3600;

    // Subject breakdown
    const subjMap = new Map<string, { users: Set<string>; scores: number[] }>();
    for (const e of quizEvts) {
      const s = (e.properties as Record<string, unknown>)?.subject as string;
      const score = (e.properties as Record<string, unknown>)?.score as number;
      if (s) {
        if (!subjMap.has(s)) subjMap.set(s, { users: new Set(), scores: [] });
        if (e.user_id) subjMap.get(s)!.users.add(e.user_id);
        if (score) subjMap.get(s)!.scores.push(score);
      }
    }
    const subjectBreakdown = Array.from(subjMap.entries())
      .map(([subject, d]) => ({
        subject,
        students: d.users.size,
        avgScore: d.scores.length
          ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length)
          : 0,
      }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 8);

    const topStudents = (students ?? [])
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5)
      .map(s => ({ name: s.full_name ?? 'Student', xp: s.xp ?? 0, streak: s.streak_count ?? 0 }));

    const html = buildSchoolSummaryHTML({
      schoolName:       school.name,
      reportDate:       new Date().toISOString(),
      totalStudents,
      activeThisWeek:   activeStudents,
      avgQuizScore,
      totalStudyHours,
      subjectBreakdown,
      topStudents,
    });

    return new Response(html, {
      headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── setup_bq_views — create Looker Studio–ready BigQuery views ────────────
  if (action === 'setup_bq_views') {
    const gcpSaJson = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');
    if (!gcpSaJson) return json({ error: 'GCP_SERVICE_ACCOUNT_JSON required' }, 500);

    const { getGCPToken } = await import('../_shared/gcp-auth.ts');
    const sa         = JSON.parse(gcpSaJson);
    const projectId  = sa.project_id;
    const token      = await getGCPToken(sa, ['https://www.googleapis.com/auth/bigquery']);

    const DATASET = 'edora_analytics';

    const views = [
      {
        tableId: 'v_daily_active_users',
        query: `SELECT DATE(created_at) as date, platform, COUNT(DISTINCT user_id) as dau FROM \`${projectId}.${DATASET}.events\` WHERE user_id IS NOT NULL GROUP BY 1, 2`,
      },
      {
        tableId: 'v_student_weekly_summary',
        query: `SELECT user_id, DATE_TRUNC(created_at, WEEK) as week_start, COUNTIF(event_name='quiz_completed') as quizzes, COUNTIF(event_name='flashcard_studied') as flashcards, COUNTIF(event_name='chat_message_sent') as chats, AVG(CAST(JSON_VALUE(properties,'$.score') AS FLOAT64)) as avg_score, SUM(CAST(JSON_VALUE(properties,'$.time_secs') AS INT64)) / 3600.0 as study_hours FROM \`${projectId}.${DATASET}.events\` GROUP BY 1, 2`,
      },
      {
        tableId: 'v_subject_engagement',
        query: `SELECT JSON_VALUE(properties,'$.subject') as subject, COUNT(*) as events, COUNT(DISTINCT user_id) as students, AVG(CAST(JSON_VALUE(properties,'$.score') AS FLOAT64)) as avg_score FROM \`${projectId}.${DATASET}.events\` WHERE event_name='quiz_completed' AND JSON_VALUE(properties,'$.subject') IS NOT NULL GROUP BY 1 ORDER BY events DESC`,
      },
      {
        tableId: 'v_pro_funnel',
        query: `SELECT event_name, COUNT(DISTINCT user_id) as users, COUNT(*) as events, DATE(created_at) as date FROM \`${projectId}.${DATASET}.events\` WHERE event_name IN ('pro_page_viewed','pro_checkout_started','pro_subscribed') GROUP BY 1, 4 ORDER BY date DESC`,
      },
      {
        tableId: 'v_feature_usage',
        query: `SELECT event_name, DATE(created_at) as date, platform, COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_events FROM \`${projectId}.${DATASET}.events\` WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY) GROUP BY 1, 2, 3 ORDER BY date DESC`,
      },
    ];

    const results: Array<{ view: string; ok: boolean; error?: string }> = [];

    for (const view of views) {
      const res = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${DATASET}/tables`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            tableReference: { projectId, datasetId: DATASET, tableId: view.tableId },
            view:           { query: view.query, useLegacySql: false },
          }),
        },
      );
      const data = await res.json() as { error?: { code?: number; message?: string } };
      const alreadyExists = data.error?.code === 409;
      results.push({
        view: view.tableId,
        ok:   res.ok || alreadyExists,
        error: (!res.ok && !alreadyExists) ? data.error?.message : undefined,
      });
    }

    return json({
      views_created: results,
      looker_studio_url: `https://lookerstudio.google.com/reporting/create?c.reportId=new&ds.connector=bigQuery&ds.projectId=${projectId}&ds.datasetId=${DATASET}`,
      instructions: [
        '1. Click the Looker Studio URL above to start a new report',
        `2. Select the BigQuery connector → project: ${projectId} → dataset: edora_analytics`,
        '3. Start with v_daily_active_users for the main dashboard',
        '4. Add v_student_weekly_summary for per-student drill-down',
        '5. Share the dashboard link with school principals (view-only)',
      ],
    });
  }

  return json({ error: 'Unknown action. Use: weekly_parent | school_summary | setup_bq_views' }, 400);
}));
