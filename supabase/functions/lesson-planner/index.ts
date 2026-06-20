// ─────────────────────────────────────────────────────────────────────────────
// lesson-planner — Novo generates & manages full weekly lesson plans
// Actions:
//   generate       — create a new plan for a subject + week
//   get_current    — fetch the active plan (latest week) for a subject
//   get_history    — list all plans for a user
//   complete_task  — mark a single task as done (triggers progress sync)
//   regenerate_day — regenerate one day's tasks via Gemini
// Enterprise: rate limiting, Gemini retry with exponential backoff
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
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function geminiJSON<T>(prompt: string): Promise<T> {
  const raw = await gemini(prompt + '\n\nRespond with valid JSON only. No markdown fences.');
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON found in Gemini response');
  return JSON.parse(match[0]) as T;
}

// Retry up to maxRetries times with 500ms→1000ms exponential backoff.
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekStart(offsetWeeks = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offsetWeeks * 7);
  return mon.toISOString().slice(0, 10);
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface LessonTask {
  index: number;
  type: 'study' | 'practice' | 'review' | 'quiz' | 'milestone_quiz';
  title: string;
  topic: string | null;
  duration_min: number;
  description: string;
}

interface LessonDay {
  day: number;
  day_name: string;
  theme: string;
  tasks: LessonTask[];
  is_milestone_day: boolean;
  milestone_topics?: string[];
}

interface PlanData {
  subject: string;
  week_start: string;
  goal: string;
  total_hours: number;
  exam_aligned: boolean;
  days: LessonDay[];
}

serve(withSentry('lesson-planner', async (req) => {
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

  // ── generate ──────────────────────────────────────────────────────────────
  if (action === 'generate') {
    const { subject, week_offset = 0, force = false } = body;
    if (!subject) return json({ error: 'subject is required' }, 400);

    // Rate limit: 5 fresh plan generations per 2 hours per user
    const rl = await checkRateLimit(supabase, user.id, 'lesson_generate', 5, 120);
    if (!rl.allowed) {
      return json({
        error: 'You\'ve generated several plans recently. Please wait before creating another.',
        retry_after_secs: rl.retryAfterSecs,
      }, 429);
    }

    const weekStart = getWeekStart(week_offset);

    // Return cached plan if it already exists for this week
    const { data: existing } = await supabase
      .from('lesson_plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('subject', subject)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existing && !force) {
      const { data: plan } = await supabase
        .from('lesson_plans').select('*').eq('id', existing.id).single();
      const { data: tasks } = await supabase
        .from('lesson_plan_tasks').select('*').eq('plan_id', existing.id)
        .order('day_index').order('task_index');
      return json({ plan, tasks, from_cache: true });
    }

    // Fetch user context
    const [{ data: profile }, { data: memories }, { data: recentSprints }] = await Promise.all([
      supabase.from('profiles')
        .select('full_name,study_level,exam_name,exam_date,novo_personality')
        .eq('id', user.id).single(),
      supabase.from('novo_memories')
        .select('memory_type,content,importance').eq('user_id', user.id)
        .order('importance', { ascending: false }).limit(10),
      supabase.from('sprint_sessions')
        .select('topic,completed').eq('user_id', user.id)
        .eq('subject', subject).eq('completed', true)
        .order('created_at', { ascending: false }).limit(20),
    ]);

    const examDate    = profile?.exam_date;
    const daysToExam  = examDate
      ? Math.max(0, Math.floor((new Date(examDate).getTime() - Date.now()) / 86400000))
      : null;
    const studyLevel  = profile?.study_level ?? 'college';
    const studentName = profile?.full_name?.split(' ')[0] ?? 'Student';

    const studiedTopics  = [...new Set(
      (recentSprints ?? []).map((s: { topic: string }) => s.topic).filter(Boolean),
    )].slice(0, 10);
    const memoryContext  = (memories ?? [])
      .map((m: { memory_type: string; content: string }) => `[${m.memory_type}] ${m.content}`)
      .join('\n') || 'No memories yet.';

    let planData: PlanData;
    try {
      planData = await geminiJSONWithRetry<PlanData>(`
You are Novo, an expert AI study planner. Generate a full 7-day lesson plan for a student studying ${subject}.

Student context:
- Study level: ${studyLevel}
- Week starting: ${weekStart}
${examDate ? `- Exam: ${profile?.exam_name ?? 'Upcoming exam'} in ${daysToExam} days` : ''}
- Recently studied topics: ${studiedTopics.join(', ') || 'none yet'}

Student memories (known struggles & strengths):
${memoryContext}

Requirements:
- Create exactly 7 days (Monday through Sunday)
- Each day has 2-4 tasks of types: "study" | "practice" | "review" | "quiz" | "milestone_quiz"
- Day 3 (Thursday) and Day 6 (Sunday) must be milestone_quiz days (is_milestone_day: true)
- Sunday should be lighter — 1-2 review/quiz tasks only
- Total study time 5-8 hours across the week
- Make topics progressive — build on each other logically
- Address known struggle areas from memories
${daysToExam !== null && daysToExam <= 30 ? '- URGENT: focus on exam-critical topics only' : ''}

Return EXACTLY this JSON structure:
{
  "subject": "${subject}",
  "week_start": "${weekStart}",
  "goal": "one sentence goal for the week",
  "total_hours": 6.0,
  "exam_aligned": ${daysToExam !== null && daysToExam <= 60},
  "days": [
    {
      "day": 0,
      "day_name": "Monday",
      "theme": "short theme label",
      "is_milestone_day": false,
      "tasks": [
        {
          "index": 0,
          "type": "study",
          "title": "task title",
          "topic": "specific topic",
          "duration_min": 30,
          "description": "what to do in 1-2 sentences"
        }
      ]
    }
  ]
}
`);
    } catch (e) {
      return json({ error: `Plan generation failed after retries: ${e}` }, 500);
    }

    // Validate structure before touching the DB
    if (!planData.days || planData.days.length !== 7) {
      return json({ error: 'Plan generation failed — returned wrong number of days' }, 500);
    }
    for (const day of planData.days) {
      if (!Array.isArray(day.tasks) || day.tasks.length === 0) {
        return json({ error: `Plan generation failed — day ${day.day} has no tasks` }, 500);
      }
      for (const task of day.tasks) {
        if (!task.title || !task.type || typeof task.duration_min !== 'number') {
          return json({ error: 'Plan generation failed — malformed task' }, 500);
        }
      }
    }

    const totalTasks = planData.days.reduce((sum, d) => sum + d.tasks.length, 0);

    const { data: plan, error: planErr } = await supabase
      .from('lesson_plans')
      .upsert({
        user_id: user.id,
        subject,
        week_start: weekStart,
        goal: planData.goal,
        plan_data: planData,
        status: 'active',
        total_tasks: totalTasks,
        done_tasks: 0,
      }, { onConflict: 'user_id,subject,week_start' })
      .select('*')
      .single();

    if (planErr) return json({ error: planErr.message }, 500);

    // Replace tasks (delete old if regenerating)
    await supabase.from('lesson_plan_tasks').delete().eq('plan_id', plan.id);

    const taskRows = planData.days.flatMap(day =>
      day.tasks.map(task => ({
        plan_id:      plan.id,
        user_id:      user.id,
        day_index:    day.day,
        task_index:   task.index,
        title:        task.title,
        task_type:    task.type,
        topic:        task.topic || null,
        duration_min: task.duration_min,
        description:  task.description,
      }))
    );

    const { data: tasks, error: taskErr } = await supabase
      .from('lesson_plan_tasks').insert(taskRows).select('*');
    if (taskErr) return json({ error: taskErr.message }, 500);

    // Notify via proactive message
    await supabase.from('novo_proactive_messages').insert({
      user_id:      user.id,
      message:      `Hey ${studentName}! I've put together your ${subject} study plan for this week. Your goal: ${planData.goal} Let's make this week count! 📅`,
      message_type: 'lesson_nudge',
      cta_label:    'View Plan',
      cta_route:    '/lesson-plan',
      context_data: { subject, week_start: weekStart },
    }).catch(() => {}); // non-fatal

    return json({ plan, tasks, from_cache: false });
  }

  // ── get_current ───────────────────────────────────────────────────────────
  if (action === 'get_current') {
    const { subject } = body;

    // deno-lint-ignore no-explicit-any
    let planQuery: any = supabase
      .from('lesson_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1);
    if (subject) planQuery = planQuery.eq('subject', subject);

    const { data: plans } = await planQuery;
    const plan = plans?.[0] ?? null;
    if (!plan) return json({ plan: null, tasks: [] });

    const { data: tasks } = await supabase
      .from('lesson_plan_tasks').select('*').eq('plan_id', plan.id)
      .order('day_index').order('task_index');

    return json({ plan, tasks: tasks ?? [] });
  }

  // ── get_history ───────────────────────────────────────────────────────────
  if (action === 'get_history') {
    const { data: plans } = await supabase
      .from('lesson_plans')
      .select('id,subject,week_start,goal,status,total_tasks,done_tasks,created_at')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(20);
    return json({ plans: plans ?? [] });
  }

  // ── complete_task ─────────────────────────────────────────────────────────
  if (action === 'complete_task') {
    const { task_id, completed = true } = body;
    if (!task_id) return json({ error: 'task_id required' }, 400);

    const { data: task, error } = await supabase
      .from('lesson_plan_tasks')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', task_id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) return json({ error: error.message }, 500);

    const { data: plan } = await supabase
      .from('lesson_plans')
      .select('id,done_tasks,total_tasks,status,subject')
      .eq('id', task.plan_id)
      .single();

    // Auto-complete plan if all tasks done
    if (plan && plan.done_tasks >= plan.total_tasks && plan.status === 'active') {
      await supabase.from('lesson_plans')
        .update({ status: 'completed' }).eq('id', plan.id);

      await supabase.from('novo_memories').insert({
        user_id:     user.id,
        memory_type: 'milestone',
        content:     `Completed the full ${plan.subject} lesson plan for the week`,
        subject:     plan.subject ?? null,
        importance:  7,
        source:      'system',
      }).catch(() => {});
    }

    return json({ task, plan });
  }

  // ── regenerate_day ────────────────────────────────────────────────────────
  if (action === 'regenerate_day') {
    const { plan_id, day_index } = body;
    if (!plan_id || day_index === undefined) {
      return json({ error: 'plan_id and day_index required' }, 400);
    }

    // Rate limit: 10 day regenerations per hour per user
    const rl = await checkRateLimit(supabase, user.id, 'lesson_regenerate_day', 10, 60);
    if (!rl.allowed) {
      return json({
        error: 'Too many regenerations. Please wait a moment.',
        retry_after_secs: rl.retryAfterSecs,
      }, 429);
    }

    const { data: plan } = await supabase
      .from('lesson_plans').select('*')
      .eq('id', plan_id).eq('user_id', user.id).maybeSingle();
    if (!plan) return json({ error: 'Plan not found' }, 404);

    const dayName    = DAY_NAMES[day_index] ?? `Day ${day_index + 1}`;
    const existingDay = plan.plan_data?.days?.[day_index];

    type TaskRaw = {
      index: number;
      type: 'study' | 'practice' | 'review' | 'quiz' | 'milestone_quiz';
      title: string;
      topic: string | null;
      duration_min: number;
      description: string;
    };

    let newTasks: TaskRaw[];
    try {
      newTasks = await geminiJSONWithRetry<TaskRaw[]>(`
Generate 2-4 fresh study tasks for ${dayName} in the subject "${plan.subject}".
Week plan goal: ${plan.goal}
Day theme: ${existingDay?.theme ?? 'General study'}

Return a JSON array of task objects:
[{
  "index": 0,
  "type": "study"|"practice"|"review"|"quiz"|"milestone_quiz",
  "title": "...",
  "topic": "...",
  "duration_min": 25,
  "description": "..."
}]
`);
    } catch (e) {
      return json({ error: `Day regeneration failed after retries: ${e}` }, 500);
    }

    if (!Array.isArray(newTasks) || newTasks.length === 0) {
      return json({ error: 'Day regeneration returned no tasks' }, 500);
    }

    // Validate each task
    for (const t of newTasks) {
      if (!t.title || !t.type || typeof t.duration_min !== 'number') {
        return json({ error: 'Malformed task returned from AI' }, 500);
      }
    }

    await supabase.from('lesson_plan_tasks')
      .delete().eq('plan_id', plan_id).eq('day_index', day_index).eq('user_id', user.id);

    const taskRows = newTasks.map(t => ({
      plan_id,
      user_id:      user.id,
      day_index,
      task_index:   t.index,
      title:        t.title,
      task_type:    t.type,
      topic:        t.topic || null,
      duration_min: t.duration_min,
      description:  t.description,
    }));

    const { data: tasks, error } = await supabase
      .from('lesson_plan_tasks').insert(taskRows).select('*');
    if (error) return json({ error: error.message }, 500);

    return json({ tasks });
  }

  return json({ error: 'Unknown action' }, 400);
}));
