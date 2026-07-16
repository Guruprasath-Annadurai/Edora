-- novo_certifications: ALL(own) + SELECT(share_code) -> split + merge
drop policy "users_own_certs" on "novo_certifications";
create policy "certs_insert" on "novo_certifications" for insert with check ((select auth.uid()) = user_id);
create policy "certs_update" on "novo_certifications" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "certs_delete" on "novo_certifications" for delete using ((select auth.uid()) = user_id);
drop policy "cert_public_share" on "novo_certifications";
create policy "certs_read" on "novo_certifications" for select using (
  ((select auth.uid()) = user_id) or (share_code is not null)
);

-- profiles: ALL(own) + UPDATE(own, exact duplicate) -> drop the redundant UPDATE-specific one
drop policy "profiles_own_update_secured" on "profiles";
-- profiles_own (ALL) left untouched -- already covers UPDATE identically.

-- question_translations: ALL(service_role) + INSERT(authenticated) + SELECT(true, dominates)
drop policy "question_translations_service_write" on "question_translations";
drop policy "question_translations_auth_insert" on "question_translations";
create policy "question_translations_insert" on "question_translations" for insert with check (
  (auth.role() = 'service_role') or (auth.role() = 'authenticated')
);
create policy "question_translations_service_update" on "question_translations" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "question_translations_service_delete" on "question_translations" for delete using (auth.role() = 'service_role');

-- roadmap_reoptimizations: ALL(service_role) + SELECT(own) -> split + merge
drop policy "reopt_service_all" on "roadmap_reoptimizations";
create policy "reopt_service_insert" on "roadmap_reoptimizations" for insert with check (auth.role() = 'service_role');
create policy "reopt_service_update" on "roadmap_reoptimizations" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "reopt_service_delete" on "roadmap_reoptimizations" for delete using (auth.role() = 'service_role');
drop policy "reopt_own_read" on "roadmap_reoptimizations";
create policy "reopt_read" on "roadmap_reoptimizations" for select using (
  (auth.uid() = user_id) or (auth.role() = 'service_role')
);

-- solved_examples: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "solved_examples_service_write" on "solved_examples";
create policy "solved_examples_service_insert" on "solved_examples" for insert with check (auth.role() = 'service_role');
create policy "solved_examples_service_update" on "solved_examples" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "solved_examples_service_delete" on "solved_examples" for delete using (auth.role() = 'service_role');
