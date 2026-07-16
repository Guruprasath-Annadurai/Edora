
create policy "admin_audit_service_all" on public."admin_action_audit" as permissive for ALL to public
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

create policy "rag_cache_service_all" on public."rag_query_cache" as permissive for ALL to public
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);
