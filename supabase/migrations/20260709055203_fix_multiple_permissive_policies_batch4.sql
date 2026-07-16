-- study_buddies: ALL(service_role) + SELECT(participants) -> split + merge
drop policy "buddies_service_write" on "study_buddies";
create policy "buddies_service_insert" on "study_buddies" for insert with check (auth.role() = 'service_role');
create policy "buddies_service_update" on "study_buddies" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "buddies_service_delete" on "study_buddies" for delete using (auth.role() = 'service_role');
drop policy "buddies_participants" on "study_buddies";
create policy "buddies_read" on "study_buddies" for select using (
  (auth.uid() = user_id) or (auth.uid() = buddy_id) or (auth.role() = 'service_role')
);

-- study_group_members: ALL(own) + SELECT(BUGGY -- me.group_id = me.group_id, tautology,
-- lets any member of ANY group read membership of EVERY group). Split + FIX + merge.
drop policy "sgm_all" on "study_group_members";
drop policy "sgm_read_peers" on "study_group_members";
create policy "sgm_insert" on "study_group_members" for insert with check ((select auth.uid()) = user_id);
create policy "sgm_update" on "study_group_members" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sgm_delete" on "study_group_members" for delete using ((select auth.uid()) = user_id);
create policy "sgm_read" on "study_group_members" for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from study_group_members me where me.group_id = study_group_members.group_id and me.user_id = (select auth.uid())))
);

-- teacher_assignments: ALL(teacher) + SELECT(student via classroom_members) -> split + merge
drop policy "ta_teacher_manage" on "teacher_assignments";
drop policy "ta_student_read" on "teacher_assignments";
create policy "ta_teacher_insert" on "teacher_assignments" for insert with check ((select auth.uid()) = teacher_id);
create policy "ta_teacher_update" on "teacher_assignments" for update using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);
create policy "ta_teacher_delete" on "teacher_assignments" for delete using ((select auth.uid()) = teacher_id);
create policy "ta_read" on "teacher_assignments" for select using (
  ((select auth.uid()) = teacher_id)
  or (exists (select 1 from classroom_members where classroom_members.classroom_id = teacher_assignments.classroom_id and classroom_members.user_id = (select auth.uid())))
);

-- tournament_participants: ALL(own) + SELECT(authenticated-broad, already dominates for auth users)
-- own only mattered for anon (never true since auth.uid() is null) -- split ALL, leave SELECT unchanged
drop policy "Users manage own participation" on "tournament_participants";
create policy "tp_insert" on "tournament_participants" for insert with check ((select auth.uid()) = user_id);
create policy "tp_update" on "tournament_participants" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tp_delete" on "tournament_participants" for delete using ((select auth.uid()) = user_id);

-- verified_question_bank: ALL(admin/service) + SELECT(approved OR admin) -> split + merge
drop policy "vqb_admin_write" on "verified_question_bank";
create policy "vqb_admin_insert" on "verified_question_bank" for insert with check (
  (exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[])))
  or (auth.role() = 'service_role')
);
create policy "vqb_admin_update" on "verified_question_bank" for update using (
  (exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[])))
  or (auth.role() = 'service_role')
) with check (
  (exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[])))
  or (auth.role() = 'service_role')
);
create policy "vqb_admin_delete" on "verified_question_bank" for delete using (
  (exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[])))
  or (auth.role() = 'service_role')
);
drop policy "vqb_read_approved" on "verified_question_bank";
create policy "vqb_read" on "verified_question_bank" for select using (
  (is_approved = true)
  or (exists (select 1 from user_roles ur where ur.user_id = (select auth.uid()) and ur.role = any (array['admin','moderator']::app_role[])))
  or (auth.role() = 'service_role')
);
