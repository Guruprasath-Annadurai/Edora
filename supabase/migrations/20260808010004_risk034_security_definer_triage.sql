-- RISK-034 triage: individually reviewed all 7 ERROR-level security_definer_view
-- findings and the live 48 SECURITY DEFINER function findings on production
-- (mlkzabspcwfockbmkmzl) — not sampled. The risk register's original "156 WARN"
-- figure was captured against edora-staging post-full-migration-replay and
-- substantially overstates production's live exposure: most of those functions
-- already carry a pinned search_path in production (confirmed by direct
-- pg_proc inspection), a hardening pass this migration never captured in any
-- committed file — the same undocumented-production-drift pattern already
-- named in RISK-029/033. This migration fixes what's genuinely live and wrong,
-- and formally commits the view fix that was already applied to production
-- out-of-band (so `apply_migration` here is idempotent on prod, and actually
-- fixes the drift on staging where it's missing).

-- 1. Real bug found during this review: buddy_checkin() never verified the
--    caller is actually a party to the pair (v_pair.user_id or v_pair.buddy_id).
--    A malicious authenticated caller could invoke buddy_checkin(<any pair id>),
--    have their own auth.uid() recorded as a checkin against a pair they're not
--    in, and — if the real second party had already checked in that day —
--    trigger the "both studied" bonus-XP grant to two uninvolved real users at
--    the attacker's will. Fixed by requiring auth.uid() to be one of the pair's
--    two members before doing anything else.
create or replace function public.buddy_checkin(p_pair_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_pair RECORD;
  v_other_id UUID;
  v_other_checked BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT * INTO v_pair FROM public.study_buddies WHERE id = p_pair_id;
  IF v_pair IS NULL THEN RAISE EXCEPTION 'pair_not_found'; END IF;

  IF auth.uid() IS DISTINCT FROM v_pair.user_id AND auth.uid() IS DISTINCT FROM v_pair.buddy_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_other_id := CASE WHEN v_pair.user_id = auth.uid() THEN v_pair.buddy_id ELSE v_pair.user_id END;

  INSERT INTO public.buddy_checkins (buddy_pair_id, user_id, checkin_date)
  VALUES (p_pair_id, auth.uid(), CURRENT_DATE)
  ON CONFLICT (buddy_pair_id, user_id, checkin_date) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.buddy_checkins
    WHERE buddy_pair_id = p_pair_id AND user_id = v_other_id AND checkin_date = CURRENT_DATE
  ) INTO v_other_checked;

  IF v_other_checked THEN
    PERFORM public.increment_xp_unchecked(v_pair.user_id, 50);
    PERFORM public.increment_xp_unchecked(v_pair.buddy_id, 50);
    UPDATE public.study_buddies SET
      pair_streak = CASE
        WHEN last_both_studied = CURRENT_DATE - 1 THEN pair_streak + 1
        WHEN last_both_studied = CURRENT_DATE THEN pair_streak
        ELSE 1
      END,
      last_both_studied = CURRENT_DATE
    WHERE id = p_pair_id;
    v_result := jsonb_build_object('both_studied', true, 'bonus_xp', 50);
  ELSE
    v_result := jsonb_build_object('both_studied', false, 'bonus_xp', 0);
  END IF;

  RETURN v_result;
END;
$function$;

-- 2. set_rag_cache/get_rag_cache: confirmed via full codebase grep that both
--    are called exclusively from gemini-chat's service-role client, never from
--    an authenticated client session. A prior migration (20260802000003) closed
--    the anon side of this exact cache-poisoning vector but left `authenticated`
--    grantable — meaning any signed-in user could still write directly into the
--    shared RAG response cache via /rest/v1/rpc/set_rag_cache, poisoning
--    AI-generated academic answers served to other students who later hit the
--    same cache key. Closing the gap the prior migration's own reasoning
--    (incorrectly) assumed was already closed.
-- Signature updated 2026-08-18: 20260806_tier3_rag.sql (applied to
-- production the same day, after being found never-applied) added a
-- trailing p_embedding param and now also revokes authenticated/anon/
-- PUBLIC itself at creation time -- this statement is redundant against
-- a fresh replay but kept (idempotent REVOKE) so this migration's own
-- history stays accurate and it doesn't error against the signature
-- that now actually exists.
revoke execute on function public.set_rag_cache(text, text, text, uuid[], text, text, integer, vector) from authenticated;
revoke execute on function public.get_rag_cache(text) from authenticated;

-- 3. has_role(_user_id, _role): confirmed via grep + pg_policies that this is
--    called exclusively from service-role edge functions and is NOT embedded
--    in any RLS policy (unlike is_institution_admin/is_institution_member/
--    is_in_study_group, which ARE embedded in policies on institutions/
--    institution_members/study_group_members and therefore must keep their
--    `authenticated` grant — revoking those would break RLS evaluation for
--    every authenticated user on those tables). has_role's unrestricted
--    _user_id parameter let any authenticated caller probe an arbitrary
--    user's role via /rest/v1/rpc/has_role (admin/moderator enumeration).
--    Revoking direct client access; internal SECURITY DEFINER callers are
--    unaffected since they run as the definer regardless of grants.
revoke execute on function public.has_role(uuid, app_role) from authenticated;

-- 4. check_memory_opt_out / increment_tournament_participants: both are
--    `RETURNS trigger` functions confirmed (pg_trigger) to run only via a real
--    attached trigger (enforce_memory_opt_out on novo_memories,
--    trg_tournament_participant_count on tournament_participants). Trigger
--    invocation does not require the triggering role to hold EXECUTE on the
--    trigger function — only the underlying table's INSERT/UPDATE privilege —
--    so the direct anon/authenticated EXECUTE grant on these was pure
--    unnecessary API surface (calling either directly via RPC already errors
--    with "trigger functions can only be called as triggers", but there's no
--    reason to leave the grant present for a security scanner to keep flagging).
revoke execute on function public.check_memory_opt_out() from anon, authenticated;
revoke execute on function public.increment_tournament_participants() from authenticated;

-- 5. The 7 views (weekly_leaderboard, my_friends, classroom_leaderboard,
--    v_school_daily_activity, v_student_weekly_summary, at_risk_students,
--    novo_memories_scored) already carry security_invoker=on in production —
--    confirmed via direct pg_class.reloptions inspection — but no committed
--    migration ever set it; it was applied out-of-band at some point, the same
--    undocumented-drift pattern RISK-029/033 already found elsewhere. Idempotent
--    on production; this is what actually fixes the 7 ERROR-level findings on
--    edora-staging, which never received this fix during its migration replay.
alter view public.weekly_leaderboard set (security_invoker = true);
alter view public.my_friends set (security_invoker = true);
alter view public.classroom_leaderboard set (security_invoker = true);
alter view public.v_school_daily_activity set (security_invoker = true);
alter view public.v_student_weekly_summary set (security_invoker = true);
alter view public.at_risk_students set (security_invoker = true);
alter view public.novo_memories_scored set (security_invoker = true);

-- 6. check_memory_opt_out also carried a separate, implicit `GRANT EXECUTE TO
--    PUBLIC` (the Postgres default for newly-created functions) that a
--    per-role REVOKE FROM anon, authenticated does NOT remove — PUBLIC is a
--    pseudo-role every role inherits from unless explicitly revoked. Caught
--    by re-running the security advisor immediately after step 4 above and
--    finding this function still flagged; confirmed no other function in this
--    file had the same leftover PUBLIC grant.
revoke execute on function public.check_memory_opt_out() from public;

-- 7. enforce_rate_limit, expand_weak_concepts, search_ncert, search_ncert_fts,
--    search_ncert_hybrid, search_corpus_unified: confirmed via full-repo grep
--    (src/, supabase/functions/) that every one of these is only ever invoked
--    from a service-role edge-function client (gemini-chat, novo-ncert) or
--    internally from another SECURITY DEFINER function (which runs as its own
--    definer regardless of grants — verified live post-revoke by calling
--    get_school_leaderboard, which internally calls enforce_rate_limit, with
--    no permission error). None are called via supabase.rpc() from an
--    anon-key or authenticated-session client anywhere in the app. Their
--    anon/authenticated grants were pure unnecessary API surface.
revoke execute on function public.enforce_rate_limit(uuid, text, text, integer, integer, integer) from anon, authenticated;
revoke execute on function public.expand_weak_concepts(text[]) from anon, authenticated;
revoke execute on function public.search_ncert(vector, integer, text, integer) from authenticated;
revoke execute on function public.search_ncert_fts(text, integer, text, integer) from authenticated;
revoke execute on function public.search_ncert_hybrid(vector, text, integer, text, integer, integer) from anon, authenticated;
revoke execute on function public.search_corpus_unified(vector, text, uuid, uuid, text, smallint, smallint, text[], uuid[], boolean, boolean, boolean, integer, integer, text) from authenticated;

-- 8. expand_weak_concepts, search_ncert_hybrid, submit_live_event_answers,
--    submit_live_event_score also carried the same leftover PUBLIC grant as
--    check_memory_opt_out (step 6) — caught by re-running the advisor after
--    step 7 and finding expand_weak_concepts/search_ncert_hybrid still
--    flagged despite the explicit per-role revoke. submit_live_event_answers
--    and submit_live_event_score keep their separate, explicit `authenticated`
--    grant (confirmed via information_schema.role_routine_grants) — the real
--    LiveEventPage.tsx feature is unaffected; only the redundant PUBLIC/anon
--    surface closes.
revoke execute on function public.expand_weak_concepts(text[]) from public;
revoke execute on function public.search_ncert_hybrid(vector, text, integer, text, integer, integer) from public;
revoke execute on function public.submit_live_event_answers(uuid, jsonb, integer) from public;
revoke execute on function public.submit_live_event_score(uuid, integer, integer) from public;
