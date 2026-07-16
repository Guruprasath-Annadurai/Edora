// ─────────────────────────────────────────────────────────────────────────────
// admin-console — staff-only operations, gated by public.has_role(uid,'admin')
//
// Actions:
//   create_live_event  — schedule a new live quiz event
//   list_live_events    — recent events + participant counts
//   cancel_live_event   — mark an event cancelled
//   list_audit_log      — recent admin_action_audit rows
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { logAdminAction } from '../_shared/auditLog.ts';

serve(withSentry('admin-console', async (req) => {
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

  // Every action here is staff-only — verify the 'admin' role server-side via
  // the existing has_role() function rather than trusting a client-sent flag.
  const { data: isAdmin } = await serviceDb.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'Forbidden — admin role required' }, 403);

  const rl = await checkRateLimit(serviceDb, user.id, 'admin_console', 60, 60);
  if (!rl.allowed) return json({ error: 'Too many requests', retry_after_secs: rl.retryAfterSecs }, 429);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ── create_live_event ───────────────────────────────────────────────────────
  if (action === 'create_live_event') {
    const {
      title, subject, scheduled_at, duration_mins = 15,
      question_ids, reward_badge = 'Champion', reward_pro_days = 30,
      status = 'scheduled',
    } = body as {
      title: string; subject: string; scheduled_at: string; duration_mins?: number;
      question_ids: string[]; reward_badge?: string; reward_pro_days?: number; status?: string;
    };

    if (!title || !subject || !scheduled_at || !Array.isArray(question_ids) || question_ids.length === 0) {
      return json({ error: 'title, subject, scheduled_at, question_ids[] required' }, 400);
    }

    // Verify every question_id actually exists in pyq_content — a typo'd ID
    // here would silently zero out max_score for every participant later.
    const { data: found } = await serviceDb
      .from('pyq_content').select('id').in('id', question_ids);
    const foundIds = new Set((found ?? []).map((r: { id: string }) => r.id));
    const missing = question_ids.filter(id => !foundIds.has(id));
    if (missing.length > 0) {
      return json({ error: 'Unknown question_ids (not in pyq_content)', missing }, 400);
    }

    const { data: event, error } = await serviceDb
      .from('live_events')
      .insert({
        title, subject, scheduled_at, duration_mins,
        question_ids, reward_badge, reward_pro_days, status,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    await logAdminAction(serviceDb, {
      actorId: user.id, actorRole: 'service',
      action: 'live_event_created', source: 'admin-console:create_live_event',
      targetId: event.id, metadata: { title, subject, question_count: question_ids.length },
    });

    return json({ ok: true, event });
  }

  // ── list_live_events ─────────────────────────────────────────────────────────
  if (action === 'list_live_events') {
    const { data: events } = await serviceDb
      .from('live_events')
      .select('*')
      .order('scheduled_at', { ascending: false })
      .limit(50);

    const eventIds = (events ?? []).map((e: { id: string }) => e.id);
    const { data: counts } = eventIds.length
      ? await serviceDb.from('live_event_participants').select('event_id').in('event_id', eventIds)
      : { data: [] };
    const countMap: Record<string, number> = {};
    for (const c of (counts ?? []) as { event_id: string }[]) {
      countMap[c.event_id] = (countMap[c.event_id] ?? 0) + 1;
    }

    return json({
      events: (events ?? []).map((e: { id: string }) => ({ ...e, participant_count: countMap[e.id] ?? 0 })),
    });
  }

  // ── cancel_live_event ────────────────────────────────────────────────────────
  if (action === 'cancel_live_event') {
    const { event_id } = body as { event_id: string };
    if (!event_id) return json({ error: 'event_id required' }, 400);

    const { error } = await serviceDb
      .from('live_events').update({ status: 'cancelled' }).eq('id', event_id);
    if (error) return json({ error: error.message }, 500);

    await logAdminAction(serviceDb, {
      actorId: user.id, actorRole: 'service',
      action: 'live_event_cancelled', source: 'admin-console:cancel_live_event', targetId: event_id,
    });

    return json({ ok: true });
  }

  // ── list_audit_log ───────────────────────────────────────────────────────────
  // Supports filtering (action, source, actor_id, date range, free-text search
  // over action/source/target_id) and offset-based pagination for a real UI.
  if (action === 'list_audit_log') {
    const limit  = Math.min(body.limit ?? 50, 500);
    const offset = Math.max(body.offset ?? 0, 0);
    const { action_filter, source_filter, actor_id, date_from, date_to, search } = body as {
      action_filter?: string; source_filter?: string; actor_id?: string;
      date_from?: string; date_to?: string; search?: string;
    };

    let q = serviceDb
      .from('admin_action_audit')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (action_filter) q = q.eq('action', action_filter);
    if (source_filter) q = q.eq('source', source_filter);
    if (actor_id)      q = q.eq('actor_id', actor_id);
    if (date_from)     q = q.gte('created_at', date_from);
    if (date_to)       q = q.lte('created_at', date_to);
    if (search) {
      const s = search.replace(/[%_]/g, '');
      q = q.or(`action.ilike.%${s}%,source.ilike.%${s}%,target_id.ilike.%${s}%`);
    }

    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return json({ error: error.message }, 500);
    return json({ entries: data ?? [], total: count ?? 0, offset, limit });
  }

  // ── list_audit_actions — distinct action/source values for filter dropdowns ──
  if (action === 'list_audit_actions') {
    const { data } = await serviceDb
      .from('admin_action_audit')
      .select('action, source')
      .order('created_at', { ascending: false })
      .limit(2000);
    const actions = Array.from(new Set((data ?? []).map((r: { action: string }) => r.action))).sort();
    const sources = Array.from(new Set((data ?? []).map((r: { source: string }) => r.source))).sort();
    return json({ actions, sources });
  }

  // ── list_admins — everyone holding a staff role ─────────────────────────────
  if (action === 'list_admins') {
    const { data: roles, error } = await serviceDb
      .from('user_roles')
      .select('user_id, role, created_at')
      .in('role', ['admin', 'moderator'])
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);

    const userIds = (roles ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profiles } = userIds.length
      ? await serviceDb.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]));

    return json({
      admins: (roles ?? []).map((r: { user_id: string; role: string; created_at: string }) => ({
        user_id: r.user_id,
        role: r.role,
        granted_at: r.created_at,
        full_name: (profileMap.get(r.user_id) as { full_name?: string } | undefined)?.full_name ?? null,
        email: (profileMap.get(r.user_id) as { email?: string } | undefined)?.email ?? null,
      })),
    });
  }

  // ── get_observability — error rates per edge function + DB connection load ──
  if (action === 'get_observability') {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since1h  = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: errors24h } = await serviceDb
      .from('edge_function_errors')
      .select('function_name, error_message, created_at')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(1000);

    const byFunction: Record<string, { count_1h: number; count_24h: number; last_error: string; last_seen: string }> = {};
    for (const row of (errors24h ?? []) as { function_name: string; error_message: string; created_at: string }[]) {
      const bucket = byFunction[row.function_name] ??= { count_1h: 0, count_24h: 0, last_error: row.error_message, last_seen: row.created_at };
      bucket.count_24h += 1;
      if (row.created_at >= since1h) bucket.count_1h += 1;
    }

    const { data: connStats } = await serviceDb.rpc('get_connection_stats');

    return json({
      functions: Object.entries(byFunction)
        .map(([function_name, stats]) => ({ function_name, ...stats }))
        .sort((a, b) => b.count_24h - a.count_24h),
      total_errors_24h: errors24h?.length ?? 0,
      connection_stats: connStats ?? null,
      checked_at: new Date().toISOString(),
    });
  }

  // Note: role granting/revoking (grant_role / revoke_role) is intentionally
  // NOT implemented here. Elevating a user to admin/moderator is a real
  // privilege-escalation action — do it via a direct SQL migration reviewed
  // by a human, not a self-service edge-function button.

  return json({
    error: 'Unknown action. Use: create_live_event | list_live_events | cancel_live_event | list_audit_log | list_audit_actions | list_admins | get_observability',
  }, 400);
}));
