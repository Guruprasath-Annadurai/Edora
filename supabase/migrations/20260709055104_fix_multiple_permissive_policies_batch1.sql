-- api_rate_limits: ALL(qual=false, pure deny) contributes nothing (false OR X = X
-- for every other command's policy). Safe to drop outright, no replacement needed.
drop policy if exists "service_role_only_rate_limits" on "api_rate_limits";

-- assignment_completions: ALL(own) + SELECT(teacher-read) -> split + merge
drop policy if exists "ac_student_own" on "assignment_completions";
drop policy if exists "ac_teacher_read" on "assignment_completions";
drop policy if exists "ac_student_insert" on "assignment_completions";
create policy "ac_student_insert" on "assignment_completions" for insert with check ((select auth.uid()) = student_id);
drop policy if exists "ac_student_update" on "assignment_completions";
create policy "ac_student_update" on "assignment_completions" for update using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
drop policy if exists "ac_student_delete" on "assignment_completions";
create policy "ac_student_delete" on "assignment_completions" for delete using ((select auth.uid()) = student_id);
drop policy if exists "ac_read" on "assignment_completions";
create policy "ac_read" on "assignment_completions" for select using (
  ((select auth.uid()) = student_id)
  or (exists (select 1 from teacher_assignments ta where ta.id = assignment_completions.assignment_id and ta.teacher_id = (select auth.uid())))
);

-- buddy_checkins: ALL(own) + SELECT(pair-read) -> split + merge
drop policy if exists "checkins_own" on "buddy_checkins";
drop policy if exists "checkins_pair_read" on "buddy_checkins";
drop policy if exists "checkins_insert" on "buddy_checkins";
create policy "checkins_insert" on "buddy_checkins" for insert with check ((select auth.uid()) = user_id);
drop policy if exists "checkins_update" on "buddy_checkins";
create policy "checkins_update" on "buddy_checkins" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "checkins_delete" on "buddy_checkins";
create policy "checkins_delete" on "buddy_checkins" for delete using ((select auth.uid()) = user_id);
drop policy if exists "checkins_read" on "buddy_checkins";
create policy "checkins_read" on "buddy_checkins" for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from study_buddies sb where sb.id = buddy_checkins.buddy_pair_id and (sb.user_id = (select auth.uid()) or sb.buddy_id = (select auth.uid()))))
);

-- classroom_assignments: ALL(teacher-write) + SELECT(true, dominates) -> just split ALL, leave SELECT
drop policy if exists "assignment_teacher_write" on "classroom_assignments";
drop policy if exists "assignment_teacher_insert" on "classroom_assignments";
create policy "assignment_teacher_insert" on "classroom_assignments" for insert with check (teacher_id = (select auth.uid()));
drop policy if exists "assignment_teacher_update" on "classroom_assignments";
create policy "assignment_teacher_update" on "classroom_assignments" for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
drop policy if exists "assignment_teacher_delete" on "classroom_assignments";
create policy "assignment_teacher_delete" on "classroom_assignments" for delete using (teacher_id = (select auth.uid()));

-- classroom_members: ALL(self) + SELECT(teacher-read) -> split + merge
drop policy if exists "classroom_members_self" on "classroom_members";
drop policy if exists "classroom_members_teacher_read" on "classroom_members";
drop policy if exists "classroom_members_insert" on "classroom_members";
create policy "classroom_members_insert" on "classroom_members" for insert with check ((select auth.uid()) = user_id);
drop policy if exists "classroom_members_update" on "classroom_members";
create policy "classroom_members_update" on "classroom_members" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "classroom_members_delete" on "classroom_members";
create policy "classroom_members_delete" on "classroom_members" for delete using ((select auth.uid()) = user_id);
drop policy if exists "classroom_members_read" on "classroom_members";
create policy "classroom_members_read" on "classroom_members" for select using (
  ((select auth.uid()) = user_id)
  or (exists (select 1 from classrooms where classrooms.id = classroom_members.classroom_id and classrooms.teacher_id = (select auth.uid())))
);

-- classrooms: ALL(teacher-full) + SELECT(buggy member-read, always false) -> split + fix + merge
drop policy if exists "classroom_teacher_full" on "classrooms";
drop policy if exists "classroom_members_read_own" on "classrooms";
-- classroom_teacher_insert/update/delete and classroom_members_read on
-- classrooms already existed independently (drifted ahead of migration
-- history, same RISK-033 pattern) -- guard with drop-if-exists so this
-- split is idempotent instead of erroring on duplicate policy name.
drop policy if exists "classroom_teacher_insert" on "classrooms";
drop policy if exists "classroom_teacher_update" on "classrooms";
drop policy if exists "classroom_teacher_delete" on "classrooms";
drop policy if exists "classroom_members_read" on "classrooms";
drop policy if exists "classroom_teacher_insert" on "classrooms";
create policy "classroom_teacher_insert" on "classrooms" for insert with check ((select auth.uid()) = teacher_id);
drop policy if exists "classroom_teacher_update" on "classrooms";
create policy "classroom_teacher_update" on "classrooms" for update using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);
drop policy if exists "classroom_teacher_delete" on "classrooms";
create policy "classroom_teacher_delete" on "classrooms" for delete using ((select auth.uid()) = teacher_id);
drop policy if exists "classroom_members_read" on "classrooms";
create policy "classroom_members_read" on "classrooms" for select using (
  ((select auth.uid()) = teacher_id)
  or (exists (select 1 from classroom_members where classroom_members.classroom_id = classrooms.id and classroom_members.user_id = (select auth.uid())))
);

-- concept_reels: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy if exists "concept_reels_service_write" on "concept_reels";
drop policy if exists "concept_reels_service_insert" on "concept_reels";
create policy "concept_reels_service_insert" on "concept_reels" for insert with check (auth.role() = 'service_role');
drop policy if exists "concept_reels_service_update" on "concept_reels";
create policy "concept_reels_service_update" on "concept_reels" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "concept_reels_service_delete" on "concept_reels";
create policy "concept_reels_service_delete" on "concept_reels" for delete using (auth.role() = 'service_role');

-- feed_reactions: ALL(own) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy if exists "fr_own" on "feed_reactions";
drop policy if exists "fr_insert" on "feed_reactions";
create policy "fr_insert" on "feed_reactions" for insert with check ((select auth.uid()) = user_id);
drop policy if exists "fr_update" on "feed_reactions";
create policy "fr_update" on "feed_reactions" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "fr_delete" on "feed_reactions";
create policy "fr_delete" on "feed_reactions" for delete using ((select auth.uid()) = user_id);

-- formulas: ALL(service_role) + SELECT(true, dominates) -> split ALL, leave SELECT
drop policy if exists "formulas_service_write" on "formulas";
drop policy if exists "formulas_service_insert" on "formulas";
create policy "formulas_service_insert" on "formulas" for insert with check (auth.role() = 'service_role');
drop policy if exists "formulas_service_update" on "formulas";
create policy "formulas_service_update" on "formulas" for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "formulas_service_delete" on "formulas";
create policy "formulas_service_delete" on "formulas" for delete using (auth.role() = 'service_role');
