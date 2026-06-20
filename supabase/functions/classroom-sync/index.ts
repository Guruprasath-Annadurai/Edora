// ═══════════════════════════════════════════════════════════════════════════
// classroom-sync — Create assignments + sync student grades to Google Classroom
//
// Actions:
//   create_assignment  → create coursework in Classroom + store in DB
//   grade_submission   → student submits their Edora score for an assignment
//   sync_grades        → push pending submissions to Classroom gradebook (cron-safe)
//   list_assignments   → teacher's assignments with student progress summary
//   student_link       → student gets assignments they need to complete (by email)
//   delete_assignment  → archive in Edora + optionally delete from Classroom
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
const CLASSROOM_API = 'https://classroom.googleapis.com/v1';

// ── Token helper (shared with classroom-auth) ─────────────────────────────────
async function getValidAccessToken(
  teacherId: string,
  db: ReturnType<typeof createClient>,
): Promise<string | null> {
  const clientId     = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

  const { data: conn } = await db
    .from('classroom_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('teacher_id', teacherId)
    .single();

  if (!conn) return null;

  if (new Date(conn.expires_at as string).getTime() > Date.now() + 60_000) {
    return conn.access_token as string;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token as string,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await db.from('classroom_connections').update({
    access_token: data.access_token,
    expires_at:   newExpiry,
    updated_at:   new Date().toISOString(),
  }).eq('teacher_id', teacherId);

  return data.access_token;
}

// ── Edora deep-link URL ───────────────────────────────────────────────────────
function edoraActivityUrl(
  assignmentId: string,
  type: string,
  subject: string,
  classNum: number,
): string {
  const base = 'https://edora-bb02e.web.app';
  const params = new URLSearchParams({
    assignment_id: assignmentId,
    subject,
    class:         String(classNum),
  });
  switch (type) {
    case 'quiz':      return `${base}/quiz?${params}`;
    case 'sprint':    return `${base}/sprint?${params}`;
    case 'flashcard': return `${base}/flashcard?${params}`;
    case 'exam':      return `${base}/exam-simulator?${params}`;
    default:          return `${base}/quiz?${params}`;
  }
}

serve(withSentry('classroom-sync', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb    = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body   = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ── create_assignment ────────────────────────────────────────────────────
  if (action === 'create_assignment') {
    const {
      course_id, course_name, title, description,
      subject, class_num, edora_type = 'quiz',
      max_points = 100, due_date,
    } = body as {
      course_id: string; course_name: string; title: string; description?: string;
      subject: string; class_num: number; edora_type?: string;
      max_points?: number; due_date?: string;
    };

    if (!course_id || !title || !subject || !class_num) {
      return json({ error: 'course_id, title, subject, class_num required' }, 400);
    }

    // Insert DB record first to get the assignment ID (needed for deep-link)
    const { data: assignment, error: dbErr } = await serviceDb
      .from('classroom_assignments')
      .insert({
        teacher_id:  user.id,
        course_id,
        course_name,
        title,
        description: description ?? `Complete this ${edora_type} on Edora to earn your grade.`,
        subject,
        class_num,
        edora_type,
        max_points,
        due_date:    due_date ?? null,
      })
      .select()
      .single();

    if (dbErr) return json({ error: dbErr.message }, 500);

    // Build the Edora activity link for students
    const activityUrl = edoraActivityUrl(assignment.id, edora_type, subject, class_num);

    // Create coursework in Google Classroom
    const token = await getValidAccessToken(user.id, serviceDb);

    let courseworkId: string | null = null;
    if (token) {
      const dueObj = due_date ? {
        dueDate: {
          year:  new Date(due_date).getFullYear(),
          month: new Date(due_date).getMonth() + 1,
          day:   new Date(due_date).getDate(),
        },
        dueTime: { hours: 23, minutes: 59 },
      } : {};

      const cwRes = await fetch(
        `${CLASSROOM_API}/courses/${course_id}/courseWork`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            title,
            description: assignment.description,
            workType:    'ASSIGNMENT',
            state:       'PUBLISHED',
            maxPoints:   max_points,
            materials:   [{ link: { url: activityUrl, title: `Open in Edora`, thumbnailUrl: 'https://edora-bb02e.web.app/icons/icon-192.png' } }],
            ...dueObj,
          }),
        },
      );

      if (cwRes.ok) {
        const cwData = await cwRes.json() as { id: string };
        courseworkId = cwData.id;

        // Update DB with Classroom coursework ID
        await serviceDb
          .from('classroom_assignments')
          .update({ coursework_id: courseworkId })
          .eq('id', assignment.id);
      }
    }

    return json({
      ok:             true,
      assignment_id:  assignment.id,
      coursework_id:  courseworkId,
      activity_url:   activityUrl,
      classroom_synced: !!courseworkId,
    });
  }

  // ── grade_submission — student records their Edora score ─────────────────
  if (action === 'grade_submission') {
    const { assignment_id, score, edora_session_id } = body as {
      assignment_id: string; score: number; edora_session_id?: string;
    };

    if (!assignment_id || score === undefined) {
      return json({ error: 'assignment_id and score required' }, 400);
    }

    const { error: insertErr } = await serviceDb
      .from('classroom_submissions')
      .upsert({
        assignment_id,
        student_id:        user.id,
        student_email:     user.email,
        score:             Math.round(Math.min(100, Math.max(0, score))),
        edora_session_id:  edora_session_id ?? null,
        submitted_at:      new Date().toISOString(),
        synced_to_classroom: false,
      }, { onConflict: 'assignment_id,student_id' });

    if (insertErr) return json({ error: insertErr.message }, 500);

    return json({ ok: true });
  }

  // ── sync_grades — push pending submissions to Classroom gradebook ─────────
  if (action === 'sync_grades') {
    // Get all unsynced submissions with their assignment's teacher
    const { data: pending } = await serviceDb
      .from('classroom_submissions')
      .select(`
        id, student_email, score, classroom_sub_id,
        classroom_assignments!inner (
          id, teacher_id, course_id, coursework_id, max_points
        )
      `)
      .eq('synced_to_classroom', false)
      .limit(100);

    if (!pending || pending.length === 0) {
      return json({ synced: 0, message: 'Nothing to sync' });
    }

    let synced = 0;
    let failed = 0;

    // Group by teacher (each teacher has their own OAuth token)
    const byTeacher = new Map<string, typeof pending>();
    for (const sub of pending) {
      const a = sub.classroom_assignments as { teacher_id: string; course_id: string; coursework_id: string | null; max_points: number };
      if (!a.coursework_id) continue; // No Classroom coursework created yet
      const tid = a.teacher_id;
      if (!byTeacher.has(tid)) byTeacher.set(tid, []);
      byTeacher.get(tid)!.push(sub);
    }

    for (const [teacherId, subs] of byTeacher) {
      const token = await getValidAccessToken(teacherId, serviceDb);
      if (!token) { failed += subs.length; continue; }

      for (const sub of subs) {
        const a = sub.classroom_assignments as { teacher_id: string; course_id: string; coursework_id: string | null; max_points: number };
        try {
          // Look up student submission by email
          const studentsRes = await fetch(
            `${CLASSROOM_API}/courses/${a.course_id}/courseWork/${a.coursework_id}/studentSubmissions?pageSize=50`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!studentsRes.ok) { failed++; continue; }

          const studentsData = await studentsRes.json() as {
            studentSubmissions?: Array<{ id: string; userId: string; assignedGrade?: number }>;
          };

          // Find the submission matching by student email
          const classroomSub = studentsData.studentSubmissions?.find(
            ss => ss.userId === sub.student_email || ss.userId === sub.classroom_sub_id,
          );
          if (!classroomSub) { failed++; continue; }

          // Patch the grade
          const scaledGrade = Math.round((sub.score / 100) * a.max_points);
          const patchRes = await fetch(
            `${CLASSROOM_API}/courses/${a.course_id}/courseWork/${a.coursework_id}/studentSubmissions/${classroomSub.id}?updateMask=assignedGrade,draftGrade`,
            {
              method:  'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body:    JSON.stringify({ assignedGrade: scaledGrade, draftGrade: scaledGrade }),
            },
          );

          if (patchRes.ok) {
            await serviceDb
              .from('classroom_submissions')
              .update({ synced_to_classroom: true, classroom_sub_id: classroomSub.id })
              .eq('id', sub.id);
            synced++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
    }

    return json({ synced, failed, total_pending: pending.length });
  }

  // ── list_assignments — teacher's assignments with progress ───────────────
  if (action === 'list_assignments') {
    const { data: assignments } = await serviceDb
      .from('classroom_assignments')
      .select(`
        id, course_name, title, subject, class_num, edora_type, max_points,
        due_date, state, coursework_id, created_at,
        classroom_submissions ( student_id, score, synced_to_classroom, submitted_at )
      `)
      .eq('teacher_id', user.id)
      .eq('state', 'active')
      .order('created_at', { ascending: false });

    const enriched = (assignments ?? []).map(a => {
      const subs = a.classroom_submissions as Array<{
        student_id: string; score: number; synced_to_classroom: boolean; submitted_at: string;
      }>;
      const scores = subs.map(s => s.score);
      return {
        ...a,
        classroom_submissions: undefined,
        submission_count: subs.length,
        avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        synced_count: subs.filter(s => s.synced_to_classroom).length,
        activity_url: edoraActivityUrl(a.id, a.edora_type, a.subject, a.class_num),
      };
    });

    return json({ assignments: enriched });
  }

  // ── student_link — get assignments a student can complete ─────────────────
  if (action === 'student_link') {
    const { assignment_id } = body as { assignment_id: string };
    if (!assignment_id) return json({ error: 'assignment_id required' }, 400);

    const { data: assignment } = await serviceDb
      .from('classroom_assignments')
      .select('id, title, subject, class_num, edora_type, max_points, due_date')
      .eq('id', assignment_id)
      .single();

    if (!assignment) return json({ error: 'Assignment not found' }, 404);

    // Check if student already submitted
    const { data: submission } = await serviceDb
      .from('classroom_submissions')
      .select('score, submitted_at')
      .eq('assignment_id', assignment_id)
      .eq('student_id', user.id)
      .maybeSingle();

    return json({
      assignment,
      submitted:    !!submission,
      score:        submission?.score ?? null,
      submitted_at: submission?.submitted_at ?? null,
      activity_url: edoraActivityUrl(assignment_id, assignment.edora_type, assignment.subject, assignment.class_num),
    });
  }

  // ── delete_assignment ────────────────────────────────────────────────────
  if (action === 'delete_assignment') {
    const { assignment_id } = body as { assignment_id: string };
    await serviceDb
      .from('classroom_assignments')
      .update({ state: 'archived' })
      .eq('id', assignment_id)
      .eq('teacher_id', user.id);

    return json({ ok: true });
  }

  return json({
    error: 'Unknown action. Use: create_assignment | grade_submission | sync_grades | list_assignments | student_link | delete_assignment',
  }, 400);
}));
