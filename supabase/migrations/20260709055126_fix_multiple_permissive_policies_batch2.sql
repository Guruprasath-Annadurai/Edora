-- institution_members: ALL(admin) + INSERT(self-join) + SELECT(self OR admin, already covers admin)
-- merge INSERT to preserve admin's prior insert ability; add admin-only UPDATE/DELETE (nothing else covered those)
drop policy "inst_mem_admin_write" on "institution_members";
drop policy "inst_mem_self_join" on "institution_members";
create policy "inst_mem_insert" on "institution_members" for insert with check (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from institutions i where i.id = institution_members.institution_id and i.admin_user_id = (select auth.uid())))
);
create policy "inst_mem_admin_update" on "institution_members" for update using (
  exists (select 1 from institutions i where i.id = institution_members.institution_id and i.admin_user_id = (select auth.uid()))
) with check (
  exists (select 1 from institutions i where i.id = institution_members.institution_id and i.admin_user_id = (select auth.uid()))
);
create policy "inst_mem_admin_delete" on "institution_members" for delete using (
  exists (select 1 from institutions i where i.id = institution_members.institution_id and i.admin_user_id = (select auth.uid()))
);
-- inst_mem_own (SELECT) left untouched -- already self OR admin, unchanged.

-- institutions: ALL(admin) + SELECT(buggy member-read, m.institution_id = m.id is always false) -> split + fix + merge
drop policy "inst_admin_all" on "institutions";
drop policy "inst_member_read" on "institutions";
create policy "inst_admin_insert" on "institutions" for insert with check ((select auth.uid()) = admin_user_id);
create policy "inst_admin_update" on "institutions" for update using ((select auth.uid()) = admin_user_id) with check ((select auth.uid()) = admin_user_id);
create policy "inst_admin_delete" on "institutions" for delete using ((select auth.uid()) = admin_user_id);
create policy "inst_read" on "institutions" for select using (
  ((select auth.uid()) = admin_user_id)
  or (exists (select 1 from institution_members m where m.institution_id = institutions.id and m.user_id = (select auth.uid())))
);

-- knowledge_graph: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "service_write" on "knowledge_graph";
create policy "knowledge_graph_service_insert" on "knowledge_graph" for insert with check (auth.role() = 'service_role');
create policy "knowledge_graph_service_update" on "knowledge_graph" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "knowledge_graph_service_delete" on "knowledge_graph" for delete using (auth.role() = 'service_role');

-- live_event_participants: ALL(own) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "lep_own_write" on "live_event_participants";
create policy "lep_insert" on "live_event_participants" for insert with check ((select auth.uid()) = user_id);
create policy "lep_update" on "live_event_participants" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lep_delete" on "live_event_participants" for delete using ((select auth.uid()) = user_id);

-- live_events: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "live_events_service_write" on "live_events";
create policy "live_events_service_insert" on "live_events" for insert with check (auth.role() = 'service_role');
create policy "live_events_service_update" on "live_events" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "live_events_service_delete" on "live_events" for delete using (auth.role() = 'service_role');

-- live_study_rooms: ALL(host) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "live_rooms_host_write" on "live_study_rooms";
create policy "live_rooms_insert" on "live_study_rooms" for insert with check ((select auth.uid()) = host_id);
create policy "live_rooms_update" on "live_study_rooms" for update using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy "live_rooms_delete" on "live_study_rooms" for delete using ((select auth.uid()) = host_id);

-- ncert_paragraphs: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy "ncert_paragraphs_service_write" on "ncert_paragraphs";
create policy "ncert_paragraphs_service_insert" on "ncert_paragraphs" for insert with check (auth.role() = 'service_role');
create policy "ncert_paragraphs_service_update" on "ncert_paragraphs" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "ncert_paragraphs_service_delete" on "ncert_paragraphs" for delete using (auth.role() = 'service_role');
