
create policy "admin_audit_service_all" on public."admin_action_audit" as permissive for ALL to public
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- rag_query_cache doesn't exist yet at this point in migration history --
-- created later by 20260802000002_rag_advanced.sql. Guarded as a no-op;
-- that later migration is responsible for its own RLS setup.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rag_query_cache') then
    execute $q$create policy "rag_cache_service_all" on public."rag_query_cache" as permissive for ALL to public USING ((select auth.role()) = 'service_role'::text) WITH CHECK ((select auth.role()) = 'service_role'::text)$q$;
  end if;
end $$;
