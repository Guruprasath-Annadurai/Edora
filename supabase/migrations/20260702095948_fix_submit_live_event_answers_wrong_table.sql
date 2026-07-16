-- submit_live_event_answers referenced a nonexistent table (public.pyq_questions
-- with a correct_idx smallint column). The real question bank is pyq_content,
-- with options as a jsonb array of {text,label,correct} and no correct_idx
-- column at all. This RPC would have thrown "relation does not exist" the
-- first time anyone ran a live event — caught now, before that ever happened
-- (0 rows in live_events currently).
CREATE OR REPLACE FUNCTION public.submit_live_event_answers(p_event_id uuid, p_answers jsonb, p_time_secs integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT question_ids INTO v_event_question_ids
  FROM public.live_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    v_question_id := (v_answer->>'question_id')::UUID;
    v_chosen_idx  := (v_answer->>'chosen_idx')::INTEGER;

    IF v_question_id = ANY(v_event_question_ids) THEN
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

  INSERT INTO public.live_event_participants (event_id, user_id, score, time_secs, completed_at)
  VALUES (p_event_id, auth.uid(), v_score, p_time_secs, now())
  ON CONFLICT (event_id, user_id) DO UPDATE SET
    score        = EXCLUDED.score,
    time_secs    = EXCLUDED.time_secs,
    completed_at = now();

  RETURN jsonb_build_object('score', v_score, 'max_score', v_max_score);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_live_event_answers(uuid, jsonb, integer) FROM anon;
