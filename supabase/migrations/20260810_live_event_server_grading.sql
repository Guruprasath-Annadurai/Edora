-- ─────────────────────────────────────────────────────────────────────────────
-- Live event server-side answer grading (CSO-003 fix)
--
-- Replaces the old submit_live_event_score RPC that trusted a client-provided
-- integer. The new RPC accepts an array of {question_id, chosen_idx} pairs,
-- grades them against pyq_questions.correct_idx, and returns the computed score.
--
-- Old RPC is kept (renamed) so in-flight app versions don't crash — it now
-- rejects all calls with a 403-equivalent error message embedded in the result.
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


-- ── 2. New server-graded RPC ──────────────────────────────────────────────────
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
  v_correct_idx        SMALLINT;
BEGIN
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
      SELECT correct_idx INTO v_correct_idx
      FROM public.pyq_questions
      WHERE id = v_question_id;

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
