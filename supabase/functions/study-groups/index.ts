// ─────────────────────────────────────────────────────────────────────────────
// study-groups — Social study groups with weekly leaderboards
// Actions:
//   create          — create a new group (caller becomes admin)
//   join            — join via 8-char invite code
//   leave           — leave a group
//   get_my_groups   — list groups the caller belongs to
//   get_group       — full group detail (members + metadata)
//   get_leaderboard — weekly XP ranking for members of a group
//   delete          — admin deletes the group
// Rate limited: 5 group creates per hour
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
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

  if ((count ?? 0) >= maxRequests) return { allowed: false, retryAfterSecs: windowMinutes * 60 };
  supabase.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {});
  return { allowed: true, retryAfterSecs: 0 };
}

// Monday of the current week (ISO date)
function weekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

serve(withSentry('study-groups', async (req) => {
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

  // ── create ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { name, description, avatar_emoji = '📚', is_public = false } = body;
    if (!name || name.trim().length < 2) return json({ error: 'name must be at least 2 characters' }, 400);
    if (name.trim().length > 50) return json({ error: 'name too long (max 50 chars)' }, 400);

    // Rate limit: 5 group creates per hour
    const rl = await checkRateLimit(supabase, user.id, 'group_create', 5, 60);
    if (!rl.allowed) return json({ error: 'Too many groups created recently.', retry_after_secs: rl.retryAfterSecs }, 429);

    // Max 10 groups per user
    const { count: myGroupCount } = await supabase
      .from('study_group_members')
      .select('group_id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((myGroupCount ?? 0) >= 10) return json({ error: 'Maximum 10 groups per user' }, 400);

    const { data: group, error: gErr } = await supabase
      .from('study_groups')
      .insert({ name: name.trim(), description: description?.trim() ?? null, avatar_emoji, is_public, created_by: user.id })
      .select('*')
      .single();
    if (gErr) return json({ error: gErr.message }, 500);

    // Creator automatically joins as admin
    await supabase.from('study_group_members').insert({
      group_id: group.id, user_id: user.id, role: 'admin',
    });

    return json({ group });
  }

  // ── join ──────────────────────────────────────────────────────────────────
  if (action === 'join') {
    const { invite_code } = body;
    if (!invite_code) return json({ error: 'invite_code required' }, 400);

    const { data: group } = await supabase
      .from('study_groups')
      .select('id, name, avatar_emoji')
      .eq('invite_code', invite_code.trim().toLowerCase())
      .maybeSingle();
    if (!group) return json({ error: 'Invalid invite code' }, 404);

    // Already a member?
    const { data: existing } = await supabase
      .from('study_group_members')
      .select('group_id')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) return json({ group, already_member: true });

    // Max 50 members per group
    const { count: memberCount } = await supabase
      .from('study_group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', group.id);
    if ((memberCount ?? 0) >= 50) return json({ error: 'Group is full (max 50 members)' }, 400);

    const { error: joinErr } = await supabase
      .from('study_group_members')
      .insert({ group_id: group.id, user_id: user.id, role: 'member' });
    if (joinErr) return json({ error: joinErr.message }, 500);

    return json({ group, already_member: false });
  }

  // ── leave ─────────────────────────────────────────────────────────────────
  if (action === 'leave') {
    const { group_id } = body;
    if (!group_id) return json({ error: 'group_id required' }, 400);

    // Prevent the last admin from leaving
    const { data: membership } = await supabase
      .from('study_group_members')
      .select('role')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return json({ error: 'Not a member of this group' }, 404);

    if (membership.role === 'admin') {
      const { count: adminCount } = await supabase
        .from('study_group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', group_id)
        .eq('role', 'admin');
      if ((adminCount ?? 0) <= 1) {
        return json({ error: 'You are the only admin. Transfer admin rights or delete the group before leaving.' }, 400);
      }
    }

    await supabase.from('study_group_members')
      .delete().eq('group_id', group_id).eq('user_id', user.id);

    return json({ left: true });
  }

  // ── get_my_groups ─────────────────────────────────────────────────────────
  if (action === 'get_my_groups') {
    const { data: memberships } = await supabase
      .from('study_group_members')
      .select('group_id, role, joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (!memberships || memberships.length === 0) return json({ groups: [] });

    const groupIds = memberships.map(m => m.group_id);

    const { data: groups } = await supabase
      .from('study_groups')
      .select('*')
      .in('id', groupIds);

    // Attach member count to each group
    const enriched = await Promise.all((groups ?? []).map(async g => {
      const { count } = await supabase
        .from('study_group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', g.id);
      const membership = memberships.find(m => m.group_id === g.id);
      return { ...g, member_count: count ?? 0, my_role: membership?.role ?? 'member' };
    }));

    return json({ groups: enriched });
  }

  // ── get_group ─────────────────────────────────────────────────────────────
  if (action === 'get_group') {
    const { group_id } = body;
    if (!group_id) return json({ error: 'group_id required' }, 400);

    // Verify membership
    const { data: membership } = await supabase
      .from('study_group_members')
      .select('role')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return json({ error: 'Not a member of this group' }, 403);

    const [{ data: group }, { data: members }] = await Promise.all([
      supabase.from('study_groups').select('*').eq('id', group_id).single(),
      supabase.from('study_group_members')
        .select('group_id, user_id, role, joined_at')
        .eq('group_id', group_id),
    ]);

    if (!group) return json({ error: 'Group not found' }, 404);

    // Enrich members with profile data
    const userIds = (members ?? []).map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, xp, streak_count')
      .in('id', userIds);

    const enrichedMembers = (members ?? []).map(m => {
      const p = profiles?.find(p => p.id === m.user_id);
      return { ...m, full_name: p?.full_name ?? null, xp: p?.xp ?? 0, streak_count: p?.streak_count ?? 0 };
    });

    return json({ group: { ...group, my_role: membership.role }, members: enrichedMembers });
  }

  // ── get_leaderboard ───────────────────────────────────────────────────────
  if (action === 'get_leaderboard') {
    const { group_id } = body;
    if (!group_id) return json({ error: 'group_id required' }, 400);

    // Verify membership
    const { data: membership } = await supabase
      .from('study_group_members')
      .select('role')
      .eq('group_id', group_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return json({ error: 'Not a member of this group' }, 403);

    // Get all group member ids
    const { data: members } = await supabase
      .from('study_group_members')
      .select('user_id')
      .eq('group_id', group_id);

    if (!members || members.length === 0) return json({ leaderboard: [] });

    const memberIds = members.map(m => m.user_id);
    const weekStartDate = weekStart();

    // Get profile data
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, xp, streak_count')
      .in('id', memberIds);

    // Get weekly XP from sprint sessions for this week
    const { data: weekSprints } = await supabase
      .from('sprint_sessions')
      .select('user_id, xp_earned')
      .in('user_id', memberIds)
      .eq('completed', true)
      .gte('created_at', `${weekStartDate}T00:00:00.000Z`);

    const weeklyXpByUser: Record<string, number> = {};
    for (const s of weekSprints ?? []) {
      weeklyXpByUser[s.user_id] = (weeklyXpByUser[s.user_id] ?? 0) + (s.xp_earned ?? 0);
    }

    // Build leaderboard sorted by weekly XP desc
    const leaderboard = (profiles ?? [])
      .map(p => ({
        user_id:        p.id,
        full_name:      p.full_name,
        xp:             p.xp,
        weekly_xp:      weeklyXpByUser[p.id] ?? 0,
        streak_count:   p.streak_count,
        is_current_user: p.id === user.id,
      }))
      .sort((a, b) => b.weekly_xp - a.weekly_xp || b.xp - a.xp)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    return json({ leaderboard, week_start: weekStartDate });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { group_id } = body;
    if (!group_id) return json({ error: 'group_id required' }, 400);

    // Only the group creator or admin can delete
    const { data: group } = await supabase
      .from('study_groups')
      .select('created_by')
      .eq('id', group_id)
      .maybeSingle();

    if (!group) return json({ error: 'Group not found' }, 404);
    if (group.created_by !== user.id) return json({ error: 'Only the group creator can delete it' }, 403);

    await supabase.from('study_groups').delete().eq('id', group_id);
    return json({ deleted: true });
  }

  return json({ error: 'Unknown action' }, 400);
}));
