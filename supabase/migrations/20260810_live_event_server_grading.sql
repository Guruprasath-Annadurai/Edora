-- ─────────────────────────────────────────────────────────────────────────────
-- Live event server-side answer grading (CSO-003 fix)
--
-- Deprecates the old submit_live_event_score RPC that trusted a
-- client-provided integer score.
--
-- Found live 2026-08-19 while getting pgTAP running end to end in CI: this
-- migration's submit_live_event_answers originally re-queried
-- public.pyq_questions.correct_idx -- the exact wrong-table bug that
-- 20260702095948_fix_submit_live_event_answers_wrong_table.sql already
-- fixed over a week earlier (pyq_questions is a real but unrelated,
-- unpopulated legacy table; live_events.question_ids actually reference
-- pyq_content). Confirmed via a live pg_proc query that production's
-- actual submit_live_event_answers was never overwritten by this file (it
-- still runs the correct 20260702 version) and that this file's version
-- was never in production's migration ledger at all -- so this was a
-- real, previously-uncommitted regression that only ever existed in this
-- repo, not in production. Rewritten to match what's actually live: the
-- submit_live_event_score deprecation below IS live in production (found
-- via the same pg_proc query, applied out-of-band, same undocumented-
-- drift pattern as RISK-029/033/034), so that part is kept; only the
-- submit_live_event_answers body was corrected back to the pyq_content-
-- based logic.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Rename old trusted-score RPC to make it inert ─────────────────────────

DROP FUNCTION IF EXISTS public.submit_live_event_score(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.submit_live_event_score(
  p_event_id  UUID,
  p_score     INTEGER,
  p_time_secs INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Deprecated: client-provided scores are no longer accepted.
  -- Clients must call submit_live_event_answers() instead.
  RAISE EXCEPTION 'submit_live_event_score is deprecated. Use submit_live_event_answers.';
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_live_event_score TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_live_event_score(uuid, integer, integer) FROM anon;
-- DROP FUNCTION + CREATE FUNCTION resets grants to Postgres defaults, which
-- includes an implicit PUBLIC EXECUTE grant that a per-role REVOKE does not
-- remove (PUBLIC is a pseudo-role every role inherits from unless
-- explicitly revoked) -- caught live via information_schema.role_routine_grants
-- immediately after applying this to production. Harmless in practice (the
-- function only ever raises an exception), but inconsistent with the
-- explicit-anon-revoke intent above, so closing it properly.
REVOKE EXECUTE ON FUNCTION public.submit_live_event_score(uuid, integer, integer) FROM public;


-- ── 2. Server-graded RPC (unchanged from the 20260702 fix, restated here so
--       this migration is idempotent against production rather than
--       clobbering it with the wrong-table version) ───────────────────────
-- p_answers format: [{"question_id": "<uuid>", "chosen_idx": 2}, ...]
-- Returns: {"score": N, "max_score": M}

CREATE OR REPLACE FUNCTION public.submit_live_event_answers(
  p_event_id  UUID,
  p_answers   JSONB,
  p_time_secs INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_question_ids UUID[];
  v_score              INTEGER := 0;
  v_max_score          INTEGER := 0;
  v_answer             JSONB;
  v_question_id        UUID;
  v_chosen_idx         INTEGER;
  v_correct_idx        INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Fetch the authoritative question list for this event
  SELECT question_ids INTO v_event_question_ids
  FROM public.live_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  -- Grade each submitted answer
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    v_question_id := (v_answer->>'question_id')::UUID;
    v_chosen_idx  := (v_answer->>'chosen_idx')::INTEGER;

    -- Only count questions that belong to this event (prevents injection of
    -- answers for questions from other events)
    IF v_question_id = ANY(v_event_question_ids) THEN
      -- pyq_content stores options as a jsonb array of {text,label,correct}
      -- objects, not a correct_idx column -- derive the 0-based index of
      -- the entry flagged correct=true.
      SELECT (elem.ord - 1) INTO v_correct_idx
      FROM public.pyq_content pc,
           jsonb_array_elements(pc.options) WITH ORDINALITY AS elem(val, ord)
      WHERE pc.id = v_question_id
        AND (elem.val->>'correct')::boolean IS TRUE;

      IF FOUND THEN
        v_max_score := v_max_score + 1;
        IF v_chosen_idx = v_correct_idx THEN
          v_score := v_score + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Upsert participant record with server-computed score
  INSERT INTO public.live_event_participants (event_id, user_id, score, time_secs, completed_at)
  VALUES (p_event_id, auth.uid(), v_score, p_time_secs, now())
  ON CONFLICT (event_id, user_id) DO UPDATE SET
    score        = EXCLUDED.score,
    time_secs    = EXCLUDED.time_secs,
    completed_at = now();

  RETURN jsonb_build_object('score', v_score, 'max_score', v_max_score);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_live_event_answers TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_live_event_answers(uuid, jsonb, integer) FROM anon;
