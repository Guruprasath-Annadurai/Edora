-- ─────────────────────────────────────────────────────────────────────────────
-- pgTAP tests for submit_live_event_answers() — the server-side grading RPC
-- that replaced client-trusted scores (CSO-003 fix).
--
-- Run with: supabase test db
--
-- IMPORTANT: this suite was originally written against a table
-- (public.pyq_questions with a correct_idx smallint column) that never
-- existed in this schema. The real question bank is public.pyq_content,
-- with `options` as a jsonb array of {text,label,correct} objects and no
-- correct_idx column. The function AND this test file were both fixed once
-- this was caught via live execution — see 20260702 migration.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;
SELECT plan(6);

-- ── Fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'grading-test@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'grading-test@example.com', 'Grading Test');

-- correct_answer index: 0=A, 1=B, 2=C, 3=D (position in the options array)
INSERT INTO public.pyq_content (id, exam, subject, question_text, options, correct_option) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'JEE', 'Physics', 'Q1?',
    '[{"text":"a","label":"A","correct":true},{"text":"b","label":"B","correct":false},{"text":"c","label":"C","correct":false},{"text":"d","label":"D","correct":false}]'::jsonb, 'A'),
  ('00000000-0000-0000-0000-0000000000a2', 'JEE', 'Physics', 'Q2?',
    '[{"text":"a","label":"A","correct":false},{"text":"b","label":"B","correct":false},{"text":"c","label":"C","correct":true},{"text":"d","label":"D","correct":false}]'::jsonb, 'C'),
  ('00000000-0000-0000-0000-0000000000a3', 'JEE', 'Physics', 'Q3?',
    '[{"text":"a","label":"A","correct":false},{"text":"b","label":"B","correct":true},{"text":"c","label":"C","correct":false},{"text":"d","label":"D","correct":false}]'::jsonb, 'B');

INSERT INTO public.live_events (id, title, subject, scheduled_at, duration_mins, question_ids, status, reward_badge)
VALUES (
  '00000000-0000-0000-0000-000000000e01', 'Test Event', 'Physics', now(), 15,
  ARRAY['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3']::uuid[],
  'live', 'Test Badge'
);

SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- ── Test 1: all correct answers score full marks ───────────────────────────
SELECT is(
  (public.submit_live_event_answers(
    '00000000-0000-0000-0000-000000000e01',
    '[{"question_id":"00000000-0000-0000-0000-0000000000a1","chosen_idx":0},
      {"question_id":"00000000-0000-0000-0000-0000000000a2","chosen_idx":2},
      {"question_id":"00000000-0000-0000-0000-0000000000a3","chosen_idx":1}]'::jsonb,
    60
  )->>'score')::int,
  3,
  'all-correct answers score 3/3'
);

-- ── Test 2: partial credit for partially correct answers ───────────────────
SELECT is(
  (public.submit_live_event_answers(
    '00000000-0000-0000-0000-000000000e01',
    '[{"question_id":"00000000-0000-0000-0000-0000000000a1","chosen_idx":0},
      {"question_id":"00000000-0000-0000-0000-0000000000a2","chosen_idx":3}]'::jsonb,
    45
  )->>'score')::int,
  1,
  'partial answers only credit the correct ones'
);

-- ── Test 3: security — question_id from another event is silently rejected ─
INSERT INTO public.pyq_content (id, exam, subject, question_text, options, correct_option) VALUES
  ('00000000-0000-0000-0000-0000000000fa', 'JEE', 'Chemistry', 'Foreign Q?',
    '[{"text":"a","label":"A","correct":true},{"text":"b","label":"B","correct":false},{"text":"c","label":"C","correct":false},{"text":"d","label":"D","correct":false}]'::jsonb, 'A');

SELECT is(
  (public.submit_live_event_answers(
    '00000000-0000-0000-0000-000000000e01',
    '[{"question_id":"00000000-0000-0000-0000-0000000000fa","chosen_idx":0}]'::jsonb,
    30
  )->>'score')::int,
  0,
  'a question_id not belonging to the event is never credited (prevents cross-event answer injection)'
);

-- ── Test 4: max_score reflects only recognized questions ───────────────────
SELECT is(
  (public.submit_live_event_answers(
    '00000000-0000-0000-0000-000000000e01',
    '[{"question_id":"00000000-0000-0000-0000-0000000000a1","chosen_idx":0},
      {"question_id":"00000000-0000-0000-0000-0000000000fa","chosen_idx":0}]'::jsonb,
    30
  )->>'max_score')::int,
  1,
  'max_score only counts questions that belong to the event'
);

-- ── Test 5: unknown event_id returns an error, not a crash ──────────────────
SELECT ok(
  (public.submit_live_event_answers(
    '00000000-0000-0000-0000-000000000e99',
    '[]'::jsonb,
    0
  ) ? 'error'),
  'unknown event_id returns a structured error instead of throwing'
);

-- ── Test 6: score is persisted to live_event_participants ──────────────────
SELECT public.submit_live_event_answers(
  '00000000-0000-0000-0000-000000000e01',
  '[{"question_id":"00000000-0000-0000-0000-0000000000a1","chosen_idx":0}]'::jsonb,
  20
);
SELECT is(
  (SELECT score FROM public.live_event_participants
   WHERE event_id = '00000000-0000-0000-0000-000000000e01'
     AND user_id  = '00000000-0000-0000-0000-000000000001'),
  1,
  'grading result is upserted into live_event_participants'
);

SELECT * FROM finish();
ROLLBACK;
