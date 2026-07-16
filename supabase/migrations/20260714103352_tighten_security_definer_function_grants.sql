
-- Called only by already-authenticated app flows; anon should not reach these directly
revoke execute on function public.process_referral(uuid, text) from anon;
revoke execute on function public.create_institution(text, text, text, text) from anon;
revoke execute on function public.get_institution_weak_topics(uuid) from anon;
revoke execute on function public.increment_follow_up(uuid) from anon;

-- Zero references anywhere in client code or edge functions — pure excess grant
revoke execute on function public.get_ab_variant(uuid, text) from anon;
revoke execute on function public.join_institution(text) from anon;
revoke execute on function public.prune_novo_memories() from anon;
revoke execute on function public.prune_novo_memories() from authenticated;
revoke execute on function public.purge_rag_cache() from anon;
revoke execute on function public.purge_rag_cache() from authenticated;
revoke execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer) from anon;
