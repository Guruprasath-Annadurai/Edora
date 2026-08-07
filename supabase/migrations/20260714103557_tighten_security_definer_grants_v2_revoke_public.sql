
-- Called only by already-authenticated app flows: strip PUBLIC (which anon inherits from), re-grant explicitly
revoke execute on function public.process_referral(uuid, text) from public;
grant execute on function public.process_referral(uuid, text) to authenticated, service_role;

revoke execute on function public.create_institution(text, text, text, text) from public;
grant execute on function public.create_institution(text, text, text, text) to authenticated, service_role;

revoke execute on function public.get_institution_weak_topics(uuid) from public;
grant execute on function public.get_institution_weak_topics(uuid) to authenticated, service_role;

-- Zero references anywhere in client code or edge functions
revoke execute on function public.get_ab_variant(uuid, text) from public;
grant execute on function public.get_ab_variant(uuid, text) to authenticated, service_role;

revoke execute on function public.join_institution(text) from public;
grant execute on function public.join_institution(text) to authenticated, service_role;

-- Pure server-side maintenance/cache functions: service_role only
revoke execute on function public.prune_novo_memories() from public;
grant execute on function public.prune_novo_memories() to service_role;

-- increment_follow_up, purge_rag_cache, set_rag_cache, get_rag_cache don't
-- exist yet at this point in migration history -- created later by
-- 20260731_increment_follow_up.sql and 20260802000002_rag_advanced.sql,
-- which grant their own execute permissions. REVOKE/GRANT have no IF
-- EXISTS form; guard via to_regprocedure.
do $$
begin
  if to_regprocedure('public.increment_follow_up(uuid)') is not null then
    execute 'revoke execute on function public.increment_follow_up(uuid) from public';
    execute 'grant execute on function public.increment_follow_up(uuid) to authenticated, service_role';
  end if;
  if to_regprocedure('public.purge_rag_cache()') is not null then
    execute 'revoke execute on function public.purge_rag_cache() from public';
    execute 'grant execute on function public.purge_rag_cache() to service_role';
  end if;
  if to_regprocedure('public.set_rag_cache(text, text, text, uuid[], text, text, integer)') is not null then
    execute 'revoke execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) from public';
    execute 'grant execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) to service_role';
  end if;
  if to_regprocedure('public.get_rag_cache(text)') is not null then
    execute 'revoke execute on function public.get_rag_cache(text) from public';
    execute 'grant execute on function public.get_rag_cache(text) to service_role';
  end if;
end $$;
