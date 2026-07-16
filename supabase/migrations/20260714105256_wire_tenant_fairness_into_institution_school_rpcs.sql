
create or replace function public.get_institution_weak_topics(p_institution_id uuid)
returns table(subject text, topic text, avg_struggle numeric, student_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.enforce_rate_limit(
    (select auth.uid()), p_institution_id::text, 'get_institution_weak_topics', 30, 200, 60
  );

  return query
  select
    ts.subject,
    ts.topic,
    round(avg(ts.struggle_count)::numeric, 1) as avg_struggle,
    count(distinct ts.user_id) as student_count
  from public.topic_stats ts
  join public.institution_members im on im.user_id = ts.user_id
  where im.institution_id = p_institution_id
    and im.role = 'student'
    and ts.struggle_count > 2
  group by ts.subject, ts.topic
  order by avg_struggle desc
  limit 20;
end;
$function$;

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
    row_number() over (order by xp desc)::integer as rank_pos,
    full_name, avatar_url, xp, streak_count
  from public.profiles
  where school_name = p_school_name
  order by xp desc
  limit 10;
end;
$function$;

create or replace function public.get_school_summary(p_school_name text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_total_xp integer;
  v_student_count integer;
  v_school_rank integer;
begin
  perform public.enforce_rate_limit(
    (select auth.uid()), p_school_name, 'get_school_summary', 30, 200, 60
  );

  select coalesce(sum(xp), 0), count(*) into v_total_xp, v_student_count
  from public.profiles where school_name = p_school_name;

  select count(*) + 1 into v_school_rank
  from (
    select school_name, sum(xp) as school_xp
    from public.profiles
    where school_name is not null
    group by school_name
    having sum(xp) > v_total_xp
  ) t;

  return jsonb_build_object(
    'school_name', p_school_name,
    'total_xp', v_total_xp,
    'student_count', v_student_count,
    'school_rank', v_school_rank
  );
end;
$function$;
