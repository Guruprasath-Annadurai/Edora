
create or replace function public.get_school_leaderboard(p_school_name text)
returns table(rank_pos integer, full_name text, avatar_url text, xp integer, streak_count integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.enforce_rate_limit(
    (select auth.uid()), p_school_name, 'get_school_leaderboard', 30, 200, 60
  );

  return query
  select
    row_number() over (order by p.xp desc)::integer as rank_pos,
    p.full_name, p.avatar_url, p.xp, p.streak_count
  from public.profiles p
  where p.school_name = p_school_name
  order by p.xp desc
  limit 10;
end;
$function$;
