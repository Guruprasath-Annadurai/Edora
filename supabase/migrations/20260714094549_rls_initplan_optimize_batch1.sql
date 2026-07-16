drop policy if exists "af_own_insert" on public."achievement_feed";
create policy "af_own_insert" on public."achievement_feed" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = user_id));

drop policy if exists "af_public_read" on public."achievement_feed";
create policy "af_public_read" on public."achievement_feed" as permissive for SELECT to public
  USING ((is_public OR ((select auth.uid()) = user_id)));

drop policy if exists "Users can insert own achievements" on public."achievements";
create policy "Users can insert own achievements" on public."achievements" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = user_id));

drop policy if exists "Users can view own achievements" on public."achievements";
create policy "Users can view own achievements" on public."achievements" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "events_insert" on public."analytics_events";
create policy "events_insert" on public."analytics_events" as permissive for INSERT to public
  WITH CHECK ((((select auth.uid()) = user_id) OR (user_id IS NULL)));

drop policy if exists "events_service_update" on public."analytics_events";
create policy "events_service_update" on public."analytics_events" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "rate_limits_own_read" on public."api_rate_limits";
create policy "rate_limits_own_read" on public."api_rate_limits" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "rate_limits_service_delete" on public."api_rate_limits";
create policy "rate_limits_service_delete" on public."api_rate_limits" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "rate_limits_service_insert" on public."api_rate_limits";
create policy "rate_limits_service_insert" on public."api_rate_limits" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "cs_circle_members" on public."circle_sprints";
create policy "cs_circle_members" on public."circle_sprints" as permissive for ALL to public
  USING ((EXISTS ( SELECT 1
   FROM study_circle_members
  WHERE ((study_circle_members.circle_id = circle_sprints.circle_id) AND (study_circle_members.user_id = (select auth.uid()))))));

drop policy if exists "submission_student_insert" on public."classroom_submissions";
create policy "submission_student_insert" on public."classroom_submissions" as permissive for INSERT to public
  WITH CHECK ((student_id = (select auth.uid())));

drop policy if exists "submission_teacher_read" on public."classroom_submissions";
create policy "submission_teacher_read" on public."classroom_submissions" as permissive for SELECT to public
  USING (((assignment_id IN ( SELECT classroom_assignments.id
   FROM classroom_assignments
  WHERE (classroom_assignments.teacher_id = (select auth.uid())))) OR (student_id = (select auth.uid()))));

drop policy if exists "cmp_read_all" on public."composed_mock_papers";
create policy "cmp_read_all" on public."composed_mock_papers" as permissive for SELECT to public
  USING (((select auth.role()) = ANY (ARRAY['authenticated'::text, 'service_role'::text])));

drop policy if exists "cmp_service_write" on public."composed_mock_papers";
create policy "cmp_service_write" on public."composed_mock_papers" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "concept_aliases_read" on public."concept_aliases";
create policy "concept_aliases_read" on public."concept_aliases" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "concept_graph_read" on public."concept_graph";
create policy "concept_graph_read" on public."concept_graph" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "concept_reels_service_delete" on public."concept_reels";
create policy "concept_reels_service_delete" on public."concept_reels" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "concept_reels_service_insert" on public."concept_reels";
create policy "concept_reels_service_insert" on public."concept_reels" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "concept_reels_service_update" on public."concept_reels";
create policy "concept_reels_service_update" on public."concept_reels" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "users_read_own_consent_log" on public."consent_audit_log";
create policy "users_read_own_consent_log" on public."consent_audit_log" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "curriculum_adjustments_own" on public."curriculum_adjustments";
create policy "curriculum_adjustments_own" on public."curriculum_adjustments" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "Authenticated users read challenge metadata" on public."daily_challenges";
create policy "Authenticated users read challenge metadata" on public."daily_challenges" as permissive for SELECT to public
  USING (((select auth.role()) = 'authenticated'::text));

drop policy if exists "Users access own mission completions" on public."daily_mission_completions";
create policy "Users access own mission completions" on public."daily_mission_completions" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "doubt_answers_insert_auth" on public."doubt_room_answers";
create policy "doubt_answers_insert_auth" on public."doubt_room_answers" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) IS NOT NULL));

drop policy if exists "doubt_posts_own_write" on public."doubt_room_posts";
create policy "doubt_posts_own_write" on public."doubt_room_posts" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) = user_id));

drop policy if exists "formulas_service_delete" on public."formulas";
create policy "formulas_service_delete" on public."formulas" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "formulas_service_insert" on public."formulas";
create policy "formulas_service_insert" on public."formulas" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "formulas_service_update" on public."formulas";
create policy "formulas_service_update" on public."formulas" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));
