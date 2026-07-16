drop policy if exists "qexp_service_write" on public."question_explanations";
create policy "qexp_service_write" on public."question_explanations" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "question_translations_insert" on public."question_translations";
create policy "question_translations_insert" on public."question_translations" as permissive for INSERT to public
  WITH CHECK ((((select auth.role()) = 'service_role'::text) OR ((select auth.role()) = 'authenticated'::text)));

drop policy if exists "question_translations_service_delete" on public."question_translations";
create policy "question_translations_service_delete" on public."question_translations" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "question_translations_service_update" on public."question_translations";
create policy "question_translations_service_update" on public."question_translations" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "users_own_reading_sessions" on public."reading_sessions";
create policy "users_own_reading_sessions" on public."reading_sessions" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "reel_interactions_own" on public."reel_interactions";
create policy "reel_interactions_own" on public."reel_interactions" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "referrals_own" on public."referrals";
create policy "referrals_own" on public."referrals" as permissive for SELECT to public
  USING ((((select auth.uid()) = referrer_id) OR ((select auth.uid()) = referee_id)));

drop policy if exists "revision_plans_own" on public."revision_plans";
create policy "revision_plans_own" on public."revision_plans" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "reopt_read" on public."roadmap_reoptimizations";
create policy "reopt_read" on public."roadmap_reoptimizations" as permissive for SELECT to public
  USING ((((select auth.uid()) = user_id) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "reopt_service_delete" on public."roadmap_reoptimizations";
create policy "reopt_service_delete" on public."roadmap_reoptimizations" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "reopt_service_insert" on public."roadmap_reoptimizations";
create policy "reopt_service_insert" on public."roadmap_reoptimizations" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "reopt_service_update" on public."roadmap_reoptimizations";
create policy "reopt_service_update" on public."roadmap_reoptimizations" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "saved_examples_own" on public."saved_examples";
create policy "saved_examples_own" on public."saved_examples" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "sl_admin_only" on public."school_licenses";
create policy "sl_admin_only" on public."school_licenses" as permissive for ALL to public
  USING (((select auth.uid()) = admin_user_id));

drop policy if exists "school_insert_auth" on public."school_profiles";
create policy "school_insert_auth" on public."school_profiles" as permissive for INSERT to public
  WITH CHECK (((select auth.uid()) IS NOT NULL));

drop policy if exists "users_read_own_audit_log" on public."security_audit_log";
create policy "users_read_own_audit_log" on public."security_audit_log" as permissive for SELECT to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "Users insert own session messages" on public."session_messages";
create policy "Users insert own session messages" on public."session_messages" as permissive for INSERT to public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tutoring_sessions ts
  WHERE ((ts.id = session_messages.session_id) AND (ts.user_id = (select auth.uid()))))));

drop policy if exists "Users read own session messages" on public."session_messages";
create policy "Users read own session messages" on public."session_messages" as permissive for SELECT to public
  USING ((EXISTS ( SELECT 1
   FROM tutoring_sessions ts
  WHERE ((ts.id = session_messages.session_id) AND (ts.user_id = (select auth.uid()))))));

drop policy if exists "solved_examples_service_delete" on public."solved_examples";
create policy "solved_examples_service_delete" on public."solved_examples" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "solved_examples_service_insert" on public."solved_examples";
create policy "solved_examples_service_insert" on public."solved_examples" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "solved_examples_service_update" on public."solved_examples";
create policy "solved_examples_service_update" on public."solved_examples" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "users_own_sr_cards" on public."sr_cards";
create policy "users_own_sr_cards" on public."sr_cards" as permissive for ALL to public
  USING (((select auth.uid()) = user_id));

drop policy if exists "buddies_read" on public."study_buddies";
create policy "buddies_read" on public."study_buddies" as permissive for SELECT to public
  USING ((((select auth.uid()) = user_id) OR ((select auth.uid()) = buddy_id) OR ((select auth.role()) = 'service_role'::text)));

drop policy if exists "buddies_service_delete" on public."study_buddies";
create policy "buddies_service_delete" on public."study_buddies" as permissive for DELETE to public
  USING (((select auth.role()) = 'service_role'::text));

drop policy if exists "buddies_service_insert" on public."study_buddies";
create policy "buddies_service_insert" on public."study_buddies" as permissive for INSERT to public
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "buddies_service_update" on public."study_buddies";
create policy "buddies_service_update" on public."study_buddies" as permissive for UPDATE to public
  USING (((select auth.role()) = 'service_role'::text))
  WITH CHECK (((select auth.role()) = 'service_role'::text));

drop policy if exists "circle_members_read" on public."study_circles";
create policy "circle_members_read" on public."study_circles" as permissive for SELECT to public
  USING ((EXISTS ( SELECT 1
   FROM study_circle_members
  WHERE ((study_circle_members.circle_id = study_circles.id) AND (study_circle_members.user_id = (select auth.uid()))))));

drop policy if exists "sg_delete" on public."study_groups";
create policy "sg_delete" on public."study_groups" as permissive for DELETE to public
  USING (((select auth.uid()) = created_by));
