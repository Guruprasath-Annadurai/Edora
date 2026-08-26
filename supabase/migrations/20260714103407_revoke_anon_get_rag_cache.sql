-- get_rag_cache doesn't exist yet at this point in migration history --
-- created later by 20260802000002_rag_advanced.sql. REVOKE has no IF
-- EXISTS form; guard via to_regprocedure.
do $$
begin
  if to_regprocedure('public.get_rag_cache(text)') is not null then
    execute 'revoke execute on function public.get_rag_cache(text) from anon';
  end if;
end $$;
