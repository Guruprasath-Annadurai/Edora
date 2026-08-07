-- Phase 1.1 security fix: get_school_leaderboard() previously exposed real
-- student full_name and avatar_url for ANY school to ANY authenticated user,
-- with no check that the caller actually belongs to the requested school.
-- Only "is someone logged in" was checked, not "does this someone belong
-- here." Given the primary user base is minors, this is a real cross-tenant
-- PII exposure, not a theoretical one.
--
-- Fix: real names/avatars are now shown only when the caller's own
-- profiles.school_name matches the requested school. Everyone else
-- (including authenticated users from a different school) gets the same
-- masked-name treatment previously reserved for anonymous callers.

create or replace function public.get_school_leaderboard(p_school_name text)
returns table(rank_pos integer, full_name text, avatar_url text, xp integer, streak_count integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_caller_school text;
  v_same_school boolean;
begin
  perform public.enforce_rate_limit(
    v_caller, p_school_name, 'get_school_leaderboard', 30, 200, 60
  );

  if v_caller is not null then
    select p.school_name into v_caller_school from public.profiles p where p.id = v_caller;
  end if;

  v_same_school := v_caller is not null and v_caller_school is not null and v_caller_school = p_school_name;

  return query
  select
    row_number() over (order by p.xp desc)::integer as rank_pos,
    coalesce(
      case
        when v_same_school then p.full_name
        when p.full_name is null then null
        when position(' ' in trim(p.full_name)) > 0 then
          split_part(trim(p.full_name), ' ', 1) || ' ' || left(split_part(trim(p.full_name), ' ', 2), 1) || '.'
        else trim(p.full_name)
      end,
      'Student'
    ) as full_name,
    case when v_same_school then p.avatar_url else null end as avatar_url,
    p.xp, p.streak_count
  from public.profiles p
  where p.school_name = p_school_name
  order by p.xp desc
  limit 10;
end;
$function$;
