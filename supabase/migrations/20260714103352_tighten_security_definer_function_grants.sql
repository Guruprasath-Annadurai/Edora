
-- Called only by already-authenticated app flows; anon should not reach these directly
revoke execute on function public.process_referral(uuid, text) from anon;
revoke execute on function public.create_institution(text, text, text, text) from anon;
revoke execute on function public.get_institution_weak_topics(uuid) from anon;

-- Zero references anywhere in client code or edge functions — pure excess grant
revoke execute on function public.get_ab_variant(uuid, text) from anon;
revoke execute on function public.join_institution(text) from anon;
revoke execute on function public.prune_novo_memories() from anon;
revoke execute on function public.prune_novo_memories() from authenticated;

-- increment_follow_up, purge_rag_cache, set_rag_cache don't exist yet at
-- this point in migration history -- created later by
-- 20260731_increment_follow_up.sql and 20260802000002_rag_advanced.sql,
-- which grant their own execute permissions. REVOKE has no IF EXISTS
-- form, so guard via to_regprocedure (returns NULL instead of erroring
-- when the function doesn't exist).
do $$
begin
  if to_regprocedure('public.increment_follow_up(uuid)') is not null then
    execute 'revoke execute on function public.increment_follow_up(uuid) from anon';
  end if;
  if to_regprocedure('public.purge_rag_cache()') is not null then
    execute 'revoke execute on function public.purge_rag_cache() from anon';
    execute 'revoke execute on function public.purge_rag_cache() from authenticated';
  end if;
  if to_regprocedure('public.set_rag_cache(text, text, text, uuid[], text, text, integer)') is not null then
    execute 'revoke execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) from anon';
  end if;
end $$;
