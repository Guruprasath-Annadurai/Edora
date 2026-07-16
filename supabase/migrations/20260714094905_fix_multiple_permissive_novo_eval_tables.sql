
-- novo_eval_cases
drop policy if exists "auth_read_cases" on public."novo_eval_cases";
drop policy if exists "service_all_cases" on public."novo_eval_cases";

create policy "cases_select" on public."novo_eval_cases" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text) OR ((select auth.role()) = 'service_role'::text));

create policy "cases_service_insert" on public."novo_eval_cases" as permissive for INSERT to public
  WITH CHECK ((select auth.role()) = 'service_role'::text);

create policy "cases_service_update" on public."novo_eval_cases" as permissive for UPDATE to public
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

create policy "cases_service_delete" on public."novo_eval_cases" as permissive for DELETE to public
  USING ((select auth.role()) = 'service_role'::text);

-- novo_eval_runs
drop policy if exists "auth_read_runs" on public."novo_eval_runs";
drop policy if exists "service_all_runs" on public."novo_eval_runs";

create policy "runs_select" on public."novo_eval_runs" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text) OR ((select auth.role()) = 'service_role'::text));

create policy "runs_service_insert" on public."novo_eval_runs" as permissive for INSERT to public
  WITH CHECK ((select auth.role()) = 'service_role'::text);

create policy "runs_service_update" on public."novo_eval_runs" as permissive for UPDATE to public
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

create policy "runs_service_delete" on public."novo_eval_runs" as permissive for DELETE to public
  USING ((select auth.role()) = 'service_role'::text);
