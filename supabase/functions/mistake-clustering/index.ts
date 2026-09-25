// mistake-clustering — proactive, Nemotron-powered root-cause pattern
// detection. Writes into the EXISTING error_patterns table (same schema and
// upsert semantics as src/lib/errorPatterns.ts's client-triggered scan) so it
// shows up automatically in the existing ErrorPatternsPage UI — this is a
// server-side, cron-capable UPGRADE of that feature's brain, not a second
// parallel system. Reasons ONLY over real wrong-answer text already recorded
// for that student (classification, never generation): every cluster's
// question indices are validated against the real input list, invalid or
// incomplete model output is dropped rather than trusted.
// The cron path reports its outcome to cron_health.
// Actions: run_clustering (self-triggered OR cron via x-cron-secret)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
type DbClient = SupabaseClient<any, any, any>;
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { reportCronHealth } from '../_shared/cronHealth.ts';

const MAX_MISSES_PER_RUN = 30;
const MIN_MISSES_TO_CLUSTER = 4;
const MIN_CLUSTER_SIZE = 2;
const MAX_CRON_USERS_PER_RUN = 25;

async function gemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }) },
  );
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

async function nemotron(prompt: string): Promise<string> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) throw new Error('NVIDIA_API_KEY not configured');
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? '{}';
}

async function reasonAboutClusters(prompt: string): Promise<{ text: string; model: string }> {
  try {
    const text = await nemotron(prompt);
    if (text.trim()) return { text, model: 'nemotron-3-ultra-550b' };
    throw new Error('empty response');
  } catch (e) {
    console.error('Nemotron mistake clustering failed, falling back to Gemini:', e);
    return { text: await gemini(prompt), model: 'gemini-flash-latest' };
  }
}

interface Miss { question: string; student_answer: string; correct_answer: string; subject: string }
interface RawCluster {
  pattern_type?: string; description?: string; subject?: string; question_indices?: number[];
}

function parseClusters(raw: string): RawCluster[] {
  try {
    const parsed = JSON.parse(raw);
    const clusters = Array.isArray(parsed) ? parsed : parsed.clusters;
    return Array.isArray(clusters) ? clusters : [];
  } catch {
    return [];
  }
}

async function collectMisses(supabase: DbClient, userId: string): Promise<Miss[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('subject, questions, user_answers, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);

  const misses: Miss[] = [];
  for (const s of sessions ?? []) {
    const qs = (s.questions ?? []) as Array<{ question: string; options?: string[]; correct: number }>;
    const answers = (s.user_answers ?? []) as number[];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q?.question) continue;
      const ua = answers[i];
      if (typeof ua !== 'number' || ua === q.correct) continue;
      misses.push({
        question: q.question,
        student_answer: q.options?.[ua] ?? String(ua),
        correct_answer: q.options?.[q.correct] ?? String(q.correct),
        subject: s.subject ?? 'General',
      });
      if (misses.length >= MAX_MISSES_PER_RUN) return misses;
    }
  }
  return misses;
}

async function clusterForUser(supabase: DbClient, userId: string): Promise<number> {
  const misses = await collectMisses(supabase, userId);
  if (misses.length < MIN_MISSES_TO_CLUSTER) return 0;

  const itemsForPrompt = misses.map((m, i) => ({ index: i, question: m.question, student_answer: m.student_answer, correct_answer: m.correct_answer, subject: m.subject }));
  const prompt = `Analyse these wrong answers from a student to find recurring root-cause patterns — errors that appear more than once or suggest a systematic misunderstanding, not one-off slips.

Wrong answers (JSON array of {index, question, student_answer, correct_answer, subject}):
${JSON.stringify(itemsForPrompt)}

Group into patterns where multiple misses share the SAME underlying root cause. Only create a pattern with at least 2 supporting misses — do not force every item into a group.

Respond with ONLY this JSON shape:
{ "clusters": [ { "pattern_type": "short_snake_case_identifier", "description": "1 specific sentence starting with a verb, e.g. 'Confuses force with momentum when...'", "subject": "the subject these misses belong to", "question_indices": [0, 3, 7] } ] }`;

  const { text, model } = await reasonAboutClusters(prompt);
  const rawClusters = parseClusters(text);

  const validIndices = new Set(misses.map((_, i) => i));
  const cleanClusters = rawClusters
    .map(c => ({
      pattern_type: typeof c.pattern_type === 'string' ? c.pattern_type : '',
      description: typeof c.description === 'string' ? c.description : '',
      subject: typeof c.subject === 'string' ? c.subject : null,
      indices: Array.isArray(c.question_indices) ? c.question_indices.filter(i => validIndices.has(i)) : [],
    }))
    .filter(c => c.pattern_type && c.description && c.indices.length >= MIN_CLUSTER_SIZE);

  let written = 0;
  for (const c of cleanClusters) {
    const subjectForPattern = c.subject ?? misses[c.indices[0]].subject;
    const exampleErrors = c.indices.slice(0, 5).map(i => ({
      question: misses[i].question, student_answer: misses[i].student_answer, correct_answer: misses[i].correct_answer,
    }));

    const { data: existing } = await supabase
      .from('error_patterns')
      .select('id, occurrence_count, example_errors')
      .eq('user_id', userId)
      .eq('subject', subjectForPattern)
      .eq('pattern_type', c.pattern_type)
      .maybeSingle();

    if (existing) {
      const mergedExamples = [...(existing.example_errors ?? []), ...exampleErrors].slice(0, 5);
      await supabase.from('error_patterns').update({
        description: c.description,
        occurrence_count: existing.occurrence_count + 1,
        example_errors: mergedExamples,
        last_detected_at: new Date().toISOString(),
        is_resolved: false,
      }).eq('id', existing.id);
    } else {
      await supabase.from('error_patterns').insert({
        user_id: userId,
        subject: subjectForPattern,
        pattern_type: c.pattern_type,
        description: c.description,
        occurrence_count: 1,
        example_errors: exampleErrors,
        last_detected_at: new Date().toISOString(),
      });
    }
    written++;
  }
  return written;
}

serve(withSentry('mistake-clustering', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action !== 'run_clustering') return json({ error: 'Unknown action' }, 400);

  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

  if (isCron) {
    try {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSessions } = await supabase
        .from('quiz_sessions')
        .select('user_id')
        .gte('created_at', since)
        .limit(2000);
      const uniqueUsers = [...new Set((recentSessions ?? []).map(s => s.user_id))].slice(0, MAX_CRON_USERS_PER_RUN);

      let totalWritten = 0;
      for (const uid of uniqueUsers) {
        try {
          totalWritten += await clusterForUser(supabase, uid);
        } catch (e) {
          console.error(`Mistake clustering failed for user ${uid}:`, e);
        }
      }

      await reportCronHealth(supabase, 'mistake-clustering-nightly', 'success', {
        users_processed: uniqueUsers.length, patterns_written: totalWritten,
      });
      return json({ users_processed: uniqueUsers.length, patterns_written: totalWritten });
    } catch (e) {
      await reportCronHealth(supabase, 'mistake-clustering-nightly', 'error', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(supabase, user.id, 'mistake_clustering_run', 10, 60);
  if (!rl.allowed) return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);

  const written = await clusterForUser(supabase, user.id);
  return json({ patterns_written: written });
}));
