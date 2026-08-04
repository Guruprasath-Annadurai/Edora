-- RBAC audit finding: record_battle_tie was missing the exact auth.uid()
-- participant check its sibling function record_battle_result already has.
-- As written, any caller — including anon (confirmed via Supabase's
-- security advisor: this function is directly executable by the anon role)
-- — could force ANY in-progress battle to a tie and award both players 40
-- XP, without being either participant. Adding the identical check
-- record_battle_result uses.
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

  perform public.increment_xp(v_p1, 40);
  if v_p2 is not null then
    perform public.increment_xp(v_p2, 40);
  end if;
end;
$function$;
