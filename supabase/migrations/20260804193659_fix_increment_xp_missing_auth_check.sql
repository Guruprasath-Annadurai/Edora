-- RBAC audit finding, severe: increment_xp(user_id, amount) had NO auth
-- check at all, and `authenticated` had direct EXECUTE via PostgREST RPC
-- (confirmed via has_function_privilege). Any logged-in user could call
-- increment_xp with ANY other user's id, repeatedly, to inflate XP/level
-- arbitrarily for themselves or anyone else — a live leaderboard/gamification
-- integrity bug, reachable today.
--
-- Fix is not a blanket revoke: 18+ legitimate call sites across src/pages,
-- src/lib, and several edge functions call increment_xp directly with the
-- CALLER's own id (self-award for quiz/streak/sprint/etc completion) — a
-- blanket revoke would break all of them. But 4 internal SECURITY DEFINER
-- functions (record_battle_tie, record_battle_result, buddy_checkin,
-- finalize_live_event) legitimately award XP to a DIFFERENT user (an
-- opponent, a study buddy, an event winner) and must keep working.
--
-- Split: increment_xp_unchecked does the real work, never granted to any
-- client-facing role (anon/authenticated/public) — reachable only via
-- internal calls from other SECURITY DEFINER functions, which execute as
-- the function owner regardless of the original caller's role/grants.
-- increment_xp keeps its exact existing signature (no call-site changes
-- needed anywhere in src/ or supabase/functions/) but now enforces
-- self-only before delegating.
--
-- Verified live (not just reviewed): simulated request.jwt.claims for a
-- test user, confirmed increment_xp(self, ...) succeeds silently and
-- increment_xp(other_user, ...) raises 'unauthorized'.
create or replace function public.increment_xp_unchecked(user_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if amount < -1000 or amount > 1000 then
    raise exception 'xp amount out of allowed range';
  end if;
  update public.profiles set
    xp    = greatest(0, xp + amount),
    level = floor(sqrt(greatest(0, xp + amount)::float / 100))
  where id = user_id;
end;
$function$;

revoke all on function public.increment_xp_unchecked(uuid, integer) from public, anon, authenticated;

create or replace function public.increment_xp(user_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if user_id <> auth.uid() then
    raise exception 'unauthorized: can only award xp to yourself directly';
  end if;
  perform public.increment_xp_unchecked(user_id, amount);
end;
$function$;

create or replace function public.record_battle_tie(p_battle_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_p1 uuid;
  v_p2 uuid;
begin
  select status, player1_id, player2_id into v_status, v_p1, v_p2
    from public.battles where id = p_battle_id;
  if v_status is null or v_status = 'completed' then
    return;
  end if;
  if auth.uid() <> v_p1 and auth.uid() <> v_p2 then
    raise exception 'unauthorized';
  end if;

  update public.battles
    set winner_id = null, status = 'completed', completed_at = now()
    where id = p_battle_id;

  perform public.increment_xp_unchecked(v_p1, 40);
  if v_p2 is not null then
    perform public.increment_xp_unchecked(v_p2, 40);
  end if;
end;
$function$;

create or replace function public.record_battle_result(p_battle_id uuid, p_winner_id uuid, p_loser_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week date := date_trunc('week', now())::date;
  v_wins integer;
  v_status text;
  v_p1 uuid;
  v_p2 uuid;
begin
  select status, player1_id, player2_id into v_status, v_p1, v_p2
  from public.battles where id = p_battle_id;

  if v_status is null or v_status = 'completed' then
    return;
  end if;
  if auth.uid() <> v_p1 and auth.uid() <> v_p2 then
    raise exception 'unauthorized';
  end if;
  if not ((p_winner_id = v_p1 and p_loser_id = v_p2) or (p_winner_id = v_p2 and p_loser_id = v_p1)) then
    raise exception 'winner/loser do not match battle participants';
  end if;

  update public.battles
    set winner_id = p_winner_id, status = 'completed', completed_at = now()
    where id = p_battle_id;
  perform public.increment_xp_unchecked(p_winner_id, 150);
  insert into public.battle_pass (user_id, week_start, wins) values (p_winner_id, v_week, 1)
    on conflict (user_id, week_start) do update set wins = battle_pass.wins + 1;
  insert into public.battle_pass (user_id, week_start, losses) values (p_loser_id, v_week, 1)
    on conflict (user_id, week_start) do update set losses = battle_pass.losses + 1;
  select wins into v_wins from public.battle_pass where user_id = p_winner_id and week_start = v_week;
  if v_wins >= 5 then
    update public.battle_pass set trophy_earned = true where user_id = p_winner_id and week_start = v_week;
  end if;
end;
$function$;

create or replace function public.buddy_checkin(p_pair_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_pair RECORD;
  v_other_id UUID;
  v_other_checked BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT * INTO v_pair FROM public.study_buddies WHERE id = p_pair_id;
  IF v_pair IS NULL THEN RAISE EXCEPTION 'pair_not_found'; END IF;

  v_other_id := CASE WHEN v_pair.user_id = auth.uid() THEN v_pair.buddy_id ELSE v_pair.user_id END;

  INSERT INTO public.buddy_checkins (buddy_pair_id, user_id, checkin_date)
  VALUES (p_pair_id, auth.uid(), CURRENT_DATE)
  ON CONFLICT (buddy_pair_id, user_id, checkin_date) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.buddy_checkins
    WHERE buddy_pair_id = p_pair_id AND user_id = v_other_id AND checkin_date = CURRENT_DATE
  ) INTO v_other_checked;

  IF v_other_checked THEN
    PERFORM public.increment_xp_unchecked(v_pair.user_id, 50);
    PERFORM public.increment_xp_unchecked(v_pair.buddy_id, 50);
    UPDATE public.study_buddies SET
      pair_streak = CASE
        WHEN last_both_studied = CURRENT_DATE - 1 THEN pair_streak + 1
        WHEN last_both_studied = CURRENT_DATE THEN pair_streak
        ELSE 1
      END,
      last_both_studied = CURRENT_DATE
    WHERE id = p_pair_id;
    v_result := jsonb_build_object('both_studied', true, 'bonus_xp', 50);
  ELSE
    v_result := jsonb_build_object('both_studied', false, 'bonus_xp', 0);
  END IF;

  RETURN v_result;
END;
$function$;

create or replace function public.finalize_live_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE v_winner UUID;
BEGIN
  SELECT user_id INTO v_winner
  FROM public.live_event_participants
  WHERE event_id = p_event_id
  ORDER BY score DESC, time_secs ASC
  LIMIT 1;

  UPDATE public.live_events SET status = 'completed', winner_id = v_winner WHERE id = p_event_id;

  IF v_winner IS NOT NULL THEN
    PERFORM public.increment_xp_unchecked(v_winner, 500);
    PERFORM public.post_achievement(
      v_winner, 'achievement_unlocked', 'National Champion! 🏆',
      'Won the live event', '🏆', jsonb_build_object('event_id', p_event_id)
    );
  END IF;

  RETURN v_winner;
END;
$function$;
