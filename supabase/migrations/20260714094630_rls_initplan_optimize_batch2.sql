-- freeze_gifts doesn't exist yet at this point in migration history --
-- created later by 20260718_battle_elo_mission.sql, which establishes
-- this exact pair of policies itself. Guarded as a no-op here (unlike
-- DROP POLICY, CREATE POLICY has no IF EXISTS-equivalent guard against a
-- missing table).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'freeze_gifts') then
    execute 'drop policy if exists "Users create gifts" on public."freeze_gifts"';
    execute $q$create policy "Users create gifts" on public."freeze_gifts" as permissive for INSERT to public WITH CHECK (((select auth.uid()) = from_user_id))$q$;
    execute 'drop policy if exists "Users see their own gifts" on public."freeze_gifts"';
    execute $q$create policy "Users see their own gifts" on public."freeze_gifts" as permissive for SELECT to public USING ((((select auth.uid()) = from_user_id) OR ((select auth.uid()) = to_user_id)))$q$;
  end if;
end $$;

drop policy if exists "inst_mem_own" on public."institution_members";
create policy "inst_mem_own" on public."institution_members" as permissive for SELECT to public
  USING ((((select auth.uid()) = user_id) OR is_institution_admin(institution_id, (select auth.uid()))));

drop policy if exists "knowledge_graph_service_delete" on public."knowledge_graph";
create policy "knowledge_graph_service_delete" on public."knowledge_graph" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "knowledge_graph_service_insert" on public."knowledge_graph";
create policy "knowledge_graph_service_insert" on public."knowledge_graph" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "knowledge_graph_service_update" on public."knowledge_graph";
create policy "knowledge_graph_service_update" on public."knowledge_graph" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "users_own_learning_style" on public."learning_style_profiles";
create policy "users_own_learning_style" on public."learning_style_profiles" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

-- lesson_progress doesn't exist yet at this point in migration history --
-- it's created later by 20260721_lesson_progress.sql, which establishes
-- its own RLS policies directly (this optimize-pass reference predates
-- the table). Guarded so this is a no-op instead of a hard error.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lesson_progress') then
    execute 'drop policy if exists "Users own their progress" on public."lesson_progress"';
    execute $q$create policy "Users own their progress" on public."lesson_progress" as permissive for ALL to public USING (((select auth.uid()) = user_id))$q$;
  end if;
end $$;

drop policy if exists "live_events_service_delete" on public."live_events";
create policy "live_events_service_delete" on public."live_events" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "live_events_service_insert" on public."live_events";
create policy "live_events_service_insert" on public."live_events" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "live_events_service_update" on public."live_events";
create policy "live_events_service_update" on public."live_events" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "live_messages_insert_auth" on public."live_room_messages";
create policy "live_messages_insert_auth" on public."live_room_messages" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) IS NOT NULL));

drop policy if exists "ncert_para_bookmarks_own" on public."ncert_paragraph_bookmarks";
create policy "ncert_para_bookmarks_own" on public."ncert_paragraph_bookmarks" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "ncert_paragraphs_service_delete" on public."ncert_paragraphs";
create policy "ncert_paragraphs_service_delete" on public."ncert_paragraphs" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "ncert_paragraphs_service_insert" on public."ncert_paragraphs";
create policy "ncert_paragraphs_service_insert" on public."ncert_paragraphs" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "ncert_paragraphs_service_update" on public."ncert_paragraphs";
create policy "ncert_paragraphs_service_update" on public."ncert_paragraphs" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "auth_read_cases" on public."novo_eval_cases";
create policy "auth_read_cases" on public."novo_eval_cases" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "service_all_cases" on public."novo_eval_cases";
create policy "service_all_cases" on public."novo_eval_cases" as permissive for ALL to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "auth_read_runs" on public."novo_eval_runs";
create policy "auth_read_runs" on public."novo_eval_runs" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "service_all_runs" on public."novo_eval_runs";
create policy "service_all_runs" on public."novo_eval_runs" as permissive for ALL to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "Users read own insights" on public."novo_insights";
create policy "Users read own insights" on public."novo_insights" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "novo_memories_insert" on public."novo_memories";
create policy "novo_memories_insert" on public."novo_memories" as permissive for INSERT to public
  WITH CHECK ((((select auth.uid()) = user_id) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "novo_memories_user_delete" on public."novo_memories";
create policy "novo_memories_user_delete" on public."novo_memories" as permissive for DELETE to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "novo_memories_user_select" on public."novo_memories";
create policy "novo_memories_user_select" on public."novo_memories" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "users_own_photo_solves" on public."photo_solves";
create policy "users_own_photo_solves" on public."photo_solves" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "pinned_formulas_own" on public."pinned_formulas";
create policy "pinned_formulas_own" on public."pinned_formulas" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "qexp_read_all" on public."question_explanations";
create policy "qexp_read_all" on public."question_explanations" as permissive for SELECT to public
  USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));

drop policy if exists "qexp_service_update" on public."question_explanations";
create policy "qexp_service_update" on public."question_explanations" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));
