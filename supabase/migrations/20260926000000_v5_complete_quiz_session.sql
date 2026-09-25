-- V5 Day 1 — ONE persistence authority for a completed quiz.
--
-- Why: QuizPage wrote a completed quiz through two independent paths (a live
-- insert AND a queued replay of the same data) plus two XP grants. That was
-- masked in production because the live insert always failed on a nonexistent
-- `score_pct` column. Fixing only the column would have made every quiz save
-- twice and award double XP (reproduced against a production-faithful mirror:
-- docs/product/evidence/day1/01_old_flow_reproduction.txt).
--
-- This function makes the SERVER the single authority and makes it idempotent:
-- the client supplies the session id once; a repeat call (retry, replay,
-- reconnect, concurrent flush) is a no-op that awards nothing.
--
-- Additive: creates one function; changes no table, column or policy.
-- Deliberately does NOT use quiz_sessions.score_pct (not needed; the column is
-- held back on purpose — see supabase/held/README.md).
-- XP is computed here (score * 10, same formula as the legacy client) instead of
-- trusting a client-supplied amount.

create or replace function public.complete_quiz_session(
  p_session_id      uuid,
  p_subject         text,
  p_topic           text,
  p_questions       jsonb,
  p_user_answers    jsonb,
  p_score           integer,
  p_questions_count integer,
  p_completed_at    timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_rows    integer;
  v_xp      integer;
  v_subject text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_session_id is null then
    raise exception 'session id required' using errcode = '22023';
  end if;
  if p_topic is null or length(btrim(p_topic)) = 0 then
    raise exception 'topic required' using errcode = '22023';
  end if;
  if p_questions_count is null or p_questions_count < 1 or p_questions_count > 100 then
    raise exception 'invalid question count' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > p_questions_count then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if octet_length(coalesce(p_questions, '[]'::jsonb)::text) > 262144
     or octet_length(coalesce(p_user_answers, '[]'::jsonb)::text) > 65536 then
    raise exception 'payload too large' using errcode = '54000';
  end if;

  v_subject := coalesce(nullif(btrim(p_subject), ''), p_topic);

  insert into public.quiz_sessions
    (id, user_id, subject, topic, questions, user_answers, score, questions_count, completed_at)
  values
    (p_session_id, v_uid, v_subject, p_topic,
     coalesce(p_questions, '[]'::jsonb), coalesce(p_user_answers, '[]'::jsonb),
     p_score, p_questions_count, coalesce(p_completed_at, now()))
  on conflict (id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Already recorded. Make sure it is THIS user's row, never someone else's id.
    if not exists (select 1 from public.quiz_sessions where id = p_session_id and user_id = v_uid) then
      raise exception 'session id belongs to another user' using errcode = '42501';
    end if;
    return jsonb_build_object('duplicate', true, 'xp_awarded', 0);
  end if;

  -- First (and only) time this session is recorded: grant XP + topic stats, once.
  v_xp := p_score * 10;                                   -- <= 1000, within increment_xp_unchecked's range check
  perform public.increment_xp_unchecked(v_uid, v_xp);
  perform public.upsert_topic_performance(v_uid, v_subject, p_topic, p_score, p_questions_count);

  return jsonb_build_object('duplicate', false, 'xp_awarded', v_xp);
end;
$$;

revoke all on function public.complete_quiz_session(uuid, text, text, jsonb, jsonb, integer, integer, timestamptz) from public, anon;
grant execute on function public.complete_quiz_session(uuid, text, text, jsonb, jsonb, integer, integer, timestamptz) to authenticated, service_role;

comment on function public.complete_quiz_session(uuid, text, text, jsonb, jsonb, integer, integer, timestamptz) is
  'V5 Day 1: idempotent, single-authority persistence for a completed quiz (row + XP + topic stats exactly once per p_session_id).';
