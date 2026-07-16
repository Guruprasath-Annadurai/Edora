drop policy if exists "sg_insert" on public."study_groups";
create policy "sg_insert" on public."study_groups" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = created_by));

drop policy if exists "sg_read" on public."study_groups";
create policy "sg_read" on public."study_groups" as permissive for SELECT to public
  USING ((((select auth.uid()) = created_by) OR (EXISTS ( SELECT 1
   FROM study_group_members m
  WHERE ((m.group_id = study_groups.id) AND (m.user_id = (select auth.uid()))))) OR (is_public = true)));

drop policy if exists "sg_update" on public."study_groups";
create policy "sg_update" on public."study_groups" as permissive for UPDATE to public
  USING (((select auth.uid()) = created_by));

drop policy if exists "Users own their study packs" on public."study_packs";
create policy "Users own their study packs" on public."study_packs" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "Authenticated users read members" on public."study_room_members";
create policy "Authenticated users read members" on public."study_room_members" as permissive for SELECT to public
  USING (((select auth.uid()) IS NOT NULL));

drop policy if exists "Members leave room" on public."study_room_members";
create policy "Members leave room" on public."study_room_members" as permissive for DELETE to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "Members update own record" on public."study_room_members";
create policy "Members update own record" on public."study_room_members" as permissive for UPDATE to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "Users join rooms" on public."study_room_members";
create policy "Users join rooms" on public."study_room_members" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = user_id));

drop policy if exists "Authenticated users read rooms" on public."study_rooms";
create policy "Authenticated users read rooms" on public."study_rooms" as permissive for SELECT to public
  USING (((select auth.uid()) IS NOT NULL));

drop policy if exists "Host deletes room" on public."study_rooms";
create policy "Host deletes room" on public."study_rooms" as permissive for DELETE to public
  USING (((select auth.uid()) = host_id));

drop policy if exists "Host updates room" on public."study_rooms";
create policy "Host updates room" on public."study_rooms" as permissive for UPDATE to public
  USING (((select auth.uid()) = host_id));

drop policy if exists "Users create rooms" on public."study_rooms";
create policy "Users create rooms" on public."study_rooms" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = host_id));

drop policy if exists "classroom_members_read_broadcasts" on public."teacher_broadcasts";
create policy "classroom_members_read_broadcasts" on public."teacher_broadcasts" as permissive for SELECT to public
  USING ((EXISTS ( SELECT 1
   FROM classroom_members
  WHERE ((classroom_members.classroom_id = teacher_broadcasts.classroom_id) AND (classroom_members.user_id = (select auth.uid()))))));

drop policy if exists "teachers_insert_broadcasts" on public."teacher_broadcasts";
create policy "teachers_insert_broadcasts" on public."teacher_broadcasts" as permissive for INSERT to public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM classrooms
  WHERE ((classrooms.id = teacher_broadcasts.classroom_id) AND (classrooms.teacher_id = (select auth.uid()))))));

drop policy if exists "Authenticated read all participants" on public."tournament_participants";
create policy "Authenticated read all participants" on public."tournament_participants" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "Authenticated read tournaments" on public."tournaments";
create policy "Authenticated read tournaments" on public."tournaments" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "users_own_enrollments" on public."user_curriculum_enrollments";
create policy "users_own_enrollments" on public."user_curriculum_enrollments" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "roles_read_own" on public."user_roles";
create policy "roles_read_own" on public."user_roles" as permissive for SELECT to public
  USING ((user_id = (select auth.uid())));

drop policy if exists "users_own_topic_progress" on public."user_topic_progress";
create policy "users_own_topic_progress" on public."user_topic_progress" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "vqb_admin_delete" on public."verified_question_bank";
create policy "vqb_admin_delete" on public."verified_question_bank" as permissive for DELETE to public
  USING (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND (ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role]))))) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "vqb_admin_insert" on public."verified_question_bank";
create policy "vqb_admin_insert" on public."verified_question_bank" as permissive for INSERT to public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND (ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role]))))) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "vqb_admin_update" on public."verified_question_bank";
create policy "vqb_admin_update" on public."verified_question_bank" as permissive for UPDATE to public
  USING (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND (ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role]))))) OR ((select auth.role()) = 'service_role'::text)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND (ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role]))))) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "vqb_read" on public."verified_question_bank";
create policy "vqb_read" on public."verified_question_bank" as permissive for SELECT to public
  USING (((is_approved = true) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND (ur.role = ANY (ARRAY['admin'::app_role, 'moderator'::app_role]))))) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "users_own_video_sessions" on public."video_sessions";
create policy "users_own_video_sessions" on public."video_sessions" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "users_own_voice_sessions" on public."voice_tutor_sessions";
create policy "users_own_voice_sessions" on public."voice_tutor_sessions" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "users_own_whiteboard" on public."whiteboard_analyses";
create policy "users_own_whiteboard" on public."whiteboard_analyses" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));
