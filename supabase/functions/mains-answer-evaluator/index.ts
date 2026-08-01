// ─────────────────────────────────────────────────────────────────────────────
// mains-answer-evaluator — staff-only, gated by public.has_role(uid,'admin')
//
// NOTE — scope: there is no UPSC/CBSE Mains content or grading pipeline yet
// (see mains_questions/mains_submissions in 20260801_admin_qa_pipelines.sql,
// added schema-only). This function does NOT grade anything. It exists so
// the admin "Mains QA" tab shows an honest, real, empty state instead of a
// 404 — admin_list_recent returns whatever submissions exist (none, today),
// and override_band performs a real, safe write against real tables.
//
// Actions: admin_list_recent | override_band
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

serve(withSentry('mains-answer-evaluator', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: isAdmin } = await serviceDb.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'Forbidden — admin role required' }, 403);

  const rl = await checkRateLimit(serviceDb, user.id, 'mains_answer_evaluator', 20, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'admin_list_recent') {
    const limit = Math.min(Number(body.limit) || 50, 200);
    const { data, error } = await serviceDb
      .from('mains_submissions')
      .select('*, mains_questions(exam, paper, topic, question_text)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    const { data: stats } = await serviceDb.from('mains_band_stats').select('*').maybeSingle();
    return json({ submissions: data ?? [], stats: stats ?? { total_overrides: 0, total_submissions: 0, override_rate_pct: null } });
  }

  if (action === 'override_band') {
    const { submission_id, override_band, note } = body as { submission_id: string; override_band: string; note?: string };
    if (!submission_id || !override_band) return json({ error: 'submission_id and override_band required' }, 400);

    const { data: submission } = await serviceDb.from('mains_submissions').select('id').eq('id', submission_id).maybeSingle();
    if (!submission) return json({ error: 'Submission not found' }, 404);

    const { error: insertErr } = await serviceDb.from('mains_band_overrides').insert({
      submission_id, override_band, note: note ?? null,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    const { error: updateErr } = await serviceDb.from('mains_submissions').update({ score_band: override_band }).eq('id', submission_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true });
  }

  return json({ error: 'Unknown action. Use: admin_list_recent | override_band' }, 400);
}));
