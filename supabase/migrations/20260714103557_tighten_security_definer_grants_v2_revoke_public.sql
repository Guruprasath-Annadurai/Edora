
-- Called only by already-authenticated app flows: strip PUBLIC (which anon inherits from), re-grant explicitly
revoke execute on function public.process_referral(uuid, text) from public;
grant execute on function public.process_referral(uuid, text) to authenticated, service_role;

revoke execute on function public.create_institution(text, text, text, text) from public;
grant execute on function public.create_institution(text, text, text, text) to authenticated, service_role;

revoke execute on function public.get_institution_weak_topics(uuid) from public;
grant execute on function public.get_institution_weak_topics(uuid) to authenticated, service_role;

revoke execute on function public.increment_follow_up(uuid) from public;
grant execute on function public.increment_follow_up(uuid) to authenticated, service_role;

-- Zero references anywhere in client code or edge functions
revoke execute on function public.get_ab_variant(uuid, text) from public;
grant execute on function public.get_ab_variant(uuid, text) to authenticated, service_role;

revoke execute on function public.join_institution(text) from public;
grant execute on function public.join_institution(text) to authenticated, service_role;

-- Pure server-side maintenance/cache functions: service_role only
revoke execute on function public.prune_novo_memories() from public;
grant execute on function public.prune_novo_memories() to service_role;

revoke execute on function public.purge_rag_cache() from public;
grant execute on function public.purge_rag_cache() to service_role;

revoke execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) from public;
grant execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) to service_role;

revoke execute on function public.get_rag_cache(text) from public;
grant execute on function public.get_rag_cache(text) to service_role;
