// ═══════════════════════════════════════════════════════════════
// Edora — Parent-Link Edge Function
//
// Actions (all require JWT auth):
//   generate_code  — student generates a 6-char invite code
//   accept_code    — parent claims a code to link to a child
//   get_children   — parent lists all linked children
//   get_parents    — student lists all linked parents
//   get_child_stats — parent fetches comprehensive stats for a child
//
// Security:
//   - JWT required for all actions
//   - accept_code / get_children: caller must be (or become) a parent
//   - get_child_stats: only parents linked to that child may call it
//   - service-role key used for cross-user reads
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { withSentry }   from '../_shared/sentry.ts';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

Deno.serve(withSentry('parent-link', async (req) => {
  const CORS    = getCors(req);
  const jsonRes = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonRes({ error: 'Missing authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceDb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonRes({ error: 'Unauthorized' }, 401);

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) {}

  const { action } = body as { action?: string };

  // ════════════════════════════════════════════════════════════════════════════
  // generate_code — student creates a 7-day invite code
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'generate_code') {
    // Expire any old unused codes for this student first
    await serviceDb
      .from('parent_invite_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .is('used_by', null)
      .then(() => {});

    // Generate unique code (retry on collision)
    let code = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateCode();
      const { data: existing } = await serviceDb
        .from('parent_invite_codes')
        .select('id')
        .eq('code', candidate)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (!existing) { code = candidate; break; }
    }
    if (!code) return jsonRes({ error: 'Code generation failed — please retry' }, 500);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await serviceDb
      .from('parent_invite_codes')
      .insert({ student_id: user.id, code, expires_at: expiresAt });

    if (insertErr) return jsonRes({ error: insertErr.message }, 500);

    return jsonRes({ code, expires_at: expiresAt });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // accept_code — parent claims code to link with child
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'accept_code') {
    const { code } = body as { code?: string };
    if (!code) return jsonRes({ error: 'code is required' }, 400);

    const upperCode = String(code).toUpperCase().trim();

    // Look up the invite code
    const { data: invite, error: lookupErr } = await serviceDb
      .from('parent_invite_codes')
      .select('id, student_id, used_by')
      .eq('code', upperCode)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (lookupErr) return jsonRes({ error: lookupErr.message }, 500);
    if (!invite) return jsonRes({ error: 'Invalid or expired code' }, 404);
    if (invite.used_by) return jsonRes({ error: 'This code has already been used' }, 409);
    if (invite.student_id === user.id) return jsonRes({ error: 'You cannot link to yourself' }, 400);

    // Check if already linked
    const { data: existing } = await serviceDb
      .from('parent_child_links')
      .select('id')
      .eq('parent_id', user.id)
      .eq('child_id', invite.student_id)
      .maybeSingle();

    if (existing) return jsonRes({ error: 'Already linked to this student' }, 409);

    // Mark code as used
    await serviceDb
      .from('parent_invite_codes')
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq('id', invite.id)
      .then(() => {});

    // Create parent-child link
    const { error: linkErr } = await serviceDb
      .from('parent_child_links')
      .insert({ parent_id: user.id, child_id: invite.student_id });

    if (linkErr) return jsonRes({ error: linkErr.message }, 500);

    // Get child profile for the response
    const { data: childProfile } = await serviceDb
      .from('profiles')
      .select('full_name, xp, level')
      .eq('id', invite.student_id)
      .maybeSingle();

    return jsonRes({
      success: true,
      child_id: invite.student_id,
      child_name: childProfile?.full_name ?? 'Student',
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // get_children — parent lists all linked children
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'get_children') {
    const { data: links, error: linksErr } = await serviceDb
      .from('parent_child_links')
      .select('child_id, linked_at')
      .eq('parent_id', user.id)
      .order('linked_at', { ascending: true });

    if (linksErr) return jsonRes({ error: linksErr.message }, 500);
    if (!links || links.length === 0) return jsonRes({ children: [] });

    const childIds = links.map((l: { child_id: string; linked_at: string }) => l.child_id);

    const { data: profiles } = await serviceDb
      .from('profiles')
      .select('id, full_name, xp, level, streak_count')
      .in('id', childIds);

    const children = links.map((link: { child_id: string; linked_at: string }) => {
      const p = profiles?.find((pr: { id: string }) => pr.id === link.child_id);
      return {
        child_id:   link.child_id,
        child_name: p?.full_name ?? 'Student',
        xp:         p?.xp ?? 0,
        level:      p?.level ?? 1,
        streak:     p?.streak_count ?? 0,
        linked_at:  link.linked_at,
      };
    });

    return jsonRes({ children });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // get_parents — student lists all linked parents
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'get_parents') {
    const { data: links, error: linksErr } = await serviceDb
      .from('parent_child_links')
      .select('parent_id, linked_at')
      .eq('child_id', user.id)
      .order('linked_at', { ascending: true });

    if (linksErr) return jsonRes({ error: linksErr.message }, 500);
    if (!links || links.length === 0) return jsonRes({ parents: [] });

    const parentIds = links.map((l: { parent_id: string; linked_at: string }) => l.parent_id);

    const { data: profiles } = await serviceDb
      .from('profiles')
      .select('id, full_name')
      .in('id', parentIds);

    const parents = links.map((link: { parent_id: string; linked_at: string }) => {
      const p = profiles?.find((pr: { id: string }) => pr.id === link.parent_id);
      return {
        parent_id:   link.parent_id,
        parent_name: p?.full_name ?? 'Parent',
        linked_at:   link.linked_at,
      };
    });

    return jsonRes({ parents });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // get_child_stats — comprehensive stats for parent's dashboard
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'get_child_stats') {
    const { child_id } = body as { child_id?: string };
    if (!child_id) return jsonRes({ error: 'child_id is required' }, 400);

    // Verify this parent is actually linked to this child
    const { data: link } = await serviceDb
      .from('parent_child_links')
      .select('id')
      .eq('parent_id', user.id)
      .eq('child_id', child_id)
      .maybeSingle();

    if (!link) return jsonRes({ error: 'Not authorized to view this student' }, 403);

    // ── Profile ──────────────────────────────────────────────────────────────
    const { data: profile } = await serviceDb
      .from('profiles')
      .select('full_name, xp, level, streak_count, target_exam, exam_date')
      .eq('id', child_id)
      .maybeSingle();

    // ── Weekly stats (last 7 days) ────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: quizSessions },
      { data: studySessions },
      { data: bossData },
    ] = await Promise.all([
      serviceDb
        .from('quiz_sessions')
        .select('score, total, xp_earned, subject, created_at')
        .eq('user_id', child_id)
        .gte('created_at', sevenDaysAgo),
      serviceDb
        .from('daily_sessions')
        .select('duration_seconds, xp_earned, created_at')
        .eq('user_id', child_id)
        .gte('created_at', sevenDaysAgo),
      serviceDb
        .from('boss_fight_sessions')
        .select('boss_name, subject, xp_earned, completed_at, questions_correct, questions_total')
        .eq('user_id', child_id)
        .order('completed_at', { ascending: false })
        .limit(10),
    ]);

    // Week aggregations
    const totalStudyMinutes = Math.round(
      (studySessions ?? []).reduce((s: number, r: { duration_seconds: number }) => s + (r.duration_seconds ?? 0), 0) / 60
    );
    const quizAccuracy = (() => {
      const qs = quizSessions ?? [];
      if (qs.length === 0) return 0;
      const correct = qs.reduce((s: number, r: { score: number }) => s + (r.score ?? 0), 0);
      const total   = qs.reduce((s: number, r: { total: number }) => s + (r.total ?? 1), 0);
      return Math.round((correct / total) * 100);
    })();
    const weekXP        = (studySessions ?? []).reduce((s: number, r: { xp_earned: number }) => s + (r.xp_earned ?? 0), 0)
                        + (quizSessions  ?? []).reduce((s: number, r: { xp_earned: number }) => s + (r.xp_earned ?? 0), 0);
    const sessionsCount = (studySessions ?? []).length;

    // ── Subject breakdown ─────────────────────────────────────────────────────
    const subjectMap: Record<string, { correct: number; total: number; sessions: number }> = {};
    for (const q of (quizSessions ?? []) as { subject: string; score: number; total: number }[]) {
      if (!q.subject) continue;
      if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, total: 0, sessions: 0 };
      subjectMap[q.subject].correct  += q.score ?? 0;
      subjectMap[q.subject].total    += q.total ?? 1;
      subjectMap[q.subject].sessions += 1;
    }
    const subjects = Object.entries(subjectMap).map(([subject, v]) => ({
      subject,
      accuracy: Math.round((v.correct / v.total) * 100),
      sessions: v.sessions,
    }));

    // ── Boss fights summary ───────────────────────────────────────────────────
    const bfList = bossData ?? [];
    const bossStats = {
      total:     bfList.length,
      victories: bfList.filter((b: { questions_correct: number; questions_total: number }) =>
        b.questions_correct >= Math.ceil(b.questions_total * 0.6)
      ).length,
      last_boss: bfList[0]?.boss_name ?? null,
    };

    // ── Weak topics (subjects with < 60% accuracy) ────────────────────────────
    const weakTopics = subjects
      .filter(s => s.accuracy < 60)
      .map(s => ({ subject: s.subject, accuracy: s.accuracy }));

    // ── XP history (last 7 days) ──────────────────────────────────────────────
    const xpByDay: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      xpByDay[d.toISOString().slice(0, 10)] = 0;
    }
    for (const s of (studySessions ?? []) as { created_at: string; xp_earned: number }[]) {
      const day = s.created_at.slice(0, 10);
      if (day in xpByDay) xpByDay[day] += s.xp_earned ?? 0;
    }
    for (const q of (quizSessions ?? []) as { created_at: string; xp_earned: number }[]) {
      const day = q.created_at.slice(0, 10);
      if (day in xpByDay) xpByDay[day] += q.xp_earned ?? 0;
    }
    const xpHistory = Object.entries(xpByDay).map(([date, xp]) => ({ date, xp }));

    // ── Recent activity ───────────────────────────────────────────────────────
    type RawActivity = { created_at: string; subject?: string; xp_earned?: number; score?: number; total?: number; duration_seconds?: number };
    const recentActivity: { type: string; label: string; xp: number; accuracy?: number; created_at: string }[] = [
      ...(quizSessions ?? []).slice(0, 5).map((q: RawActivity) => ({
        type:       'quiz',
        label:      `${q.subject ?? 'Quiz'} quiz`,
        xp:         q.xp_earned ?? 0,
        accuracy:   q.total ? Math.round(((q.score ?? 0) / q.total) * 100) : undefined,
        created_at: q.created_at,
      })),
      ...(studySessions ?? []).slice(0, 5).map((s: RawActivity) => ({
        type:       'study',
        label:      `Study session (${Math.round((s.duration_seconds ?? 0) / 60)} min)`,
        xp:         s.xp_earned ?? 0,
        created_at: s.created_at,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);

    return jsonRes({
      profile: {
        full_name:    profile?.full_name ?? 'Student',
        xp:           profile?.xp ?? 0,
        level:        profile?.level ?? 1,
        streak_count: profile?.streak_count ?? 0,
        target_exam:  profile?.target_exam ?? null,
        exam_date:    profile?.exam_date ?? null,
      },
      week: {
        study_minutes:       totalStudyMinutes,
        quiz_accuracy:       quizAccuracy,
        xp_earned:           weekXP,
        sessions_completed:  sessionsCount,
      },
      subjects,
      weak_topics:     weakTopics,
      boss_fights:     bossStats,
      xp_history:      xpHistory,
      recent_activity: recentActivity,
    });
  }

  return jsonRes({ error: `Unknown action: ${action}` }, 400);
}));
