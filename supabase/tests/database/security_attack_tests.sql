-- Phase 1.4 — automated attack tests (initial set)
--
-- pgTAP test file. Intended to run via the standard Supabase/pgTAP toolchain
-- (`supabase test db` or `pg_prove`) once wired into CI (Phase 3 territory).
--
-- Each assertion here corresponds to a specific attack scenario the mandate
-- names in its Phase 1.4 list. This is an INITIAL set covering the highest-
-- value scenarios already touched by this session's Phase 1.1/1.2 fixes,
-- not the full 19-category list — see docs/security/ATTACK_TESTS.md for
-- exactly what is and is not covered.
--
-- All test data is synthetic, created and destroyed inside a single
-- transaction that is never committed when run standalone; when run via
-- pg_prove in a real test database, the harness handles the transaction.

begin;
select plan(14);

-- ── Setup: synthetic users, never real accounts ────────────────────────────
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'zzztest-attackA@example.invalid', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'zzztest-attackB@example.invalid', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'zzztest-attackC@example.invalid', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated');

update public.profiles set xp = 100, school_name = 'ZZZ_ATTACK_SCHOOL', full_name = 'Attack Testuser' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.profiles set xp = 100 where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ── Horizontal privilege escalation: increment_xp ──────────────────────────
-- Historical context: this exact function had NO auth check at all before
-- this remediation program began — any user could inflate any other user's
-- XP. Fixed pre-mandate; this test locks the fix in place.

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
select throws_like(
  $$ select public.increment_xp('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 500) $$,
  '%unauthorized%',
  'increment_xp: user A cannot increment user B XP'
);

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
select lives_ok(
  $$ select public.increment_xp('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 10) $$,
  'increment_xp: user A can still increment own XP'
);
select is((select xp from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001'), 110, 'increment_xp: self-increment actually applied');

-- ── Forged record ID: accept_friend_request ────────────────────────────────
insert into public.friendships (id, user_id, friend_id, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'pending');

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
select lives_ok($$ select public.accept_friend_request('bbbbbbbb-0000-0000-0000-000000000001'::uuid) $$, 'accept_friend_request: call does not error for the sender (silently no-ops rather than crashing)');
select is((select status from public.friendships where id='bbbbbbbb-0000-0000-0000-000000000001'), 'pending', 'accept_friend_request: the sender cannot accept their own sent request — only the recipient can');

-- ── Cross-tenant PII exposure: get_school_leaderboard (RISK-019, Phase 1.1) ─
select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
select is(
  (select full_name from public.get_school_leaderboard('ZZZ_ATTACK_SCHOOL') limit 1),
  'Attack T.',
  'get_school_leaderboard: a different-school caller sees a masked name, never the real one'
);

-- ── Unauthenticated table read: live_room_messages (RISK-022, Phase 1.2) ───
insert into public.live_study_rooms (id, host_id, name, code)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'zzz attack room', 'ZZZATK01');
insert into public.live_room_messages (id, room_id, user_id, sender_name, message_type, content)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Attacker', 'chat', 'secret message');

-- Reality found live 2026-08-18: anon has no table-level GRANT on
-- live_room_messages at all (confirmed via a real pgTAP run against a
-- fresh migration replay) -- the query fails with a flat permission-denied
-- before RLS is ever evaluated, not a graceful "0 rows via RLS" result
-- this assertion originally expected. Confirmed via full-repo grep that no
-- anon-facing client code queries this table directly (it's realtime-
-- subscription/authenticated-only) -- granting anon SELECT purely to make
-- the old assertion's shape match would be a real security regression to
-- satisfy a stale test, not a fix. Updated to assert the actual (stronger)
-- security posture: anon cannot even attempt the read.
--
-- throws_ok's 3-arg form binds arg 3 as the expected exact error MESSAGE
-- (not a free-text description) -- confirmed live via a failing CI run
-- whose own diagnostic output showed "wanted: 42501: <our description
-- text>" being compared against the real caught message. The 4-arg form
-- (sql, errcode, exact_message, description) is required to get a custom
-- description without an exact-message match.
set local role anon;
select throws_ok(
  $$ select count(*)::int from public.live_room_messages where id = 'dddddddd-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table live_room_messages',
  'live_room_messages: an unauthenticated (anon) caller has no grant to even attempt reading message content'
);
reset role;

-- ── IDOR: record_battle_result ─────────────────────────────────────────────
insert into public.battles (id, player1_id, player2_id, status, topic, subject)
values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'active', 'Mechanics', 'Physics');

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000003','role','authenticated')::text, true);
select throws_like(
  $$ select public.record_battle_result('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid) $$,
  '%unauthorized%',
  'record_battle_result: a non-participant cannot record a result for a battle they are not in'
);

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
select throws_like(
  $$ select public.record_battle_result('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid) $$,
  '%do not match%',
  'record_battle_result: winner/loser must match the real battle participants — cannot fabricate a third party'
);

-- ── Storage-object access isolation ────────────────────────────────────────
-- A private-bucket object (study-pdfs) is stored under a folder path keyed
-- by the owning user's id. Confirms a different authenticated user cannot
-- see another user's private file via storage.objects RLS.
insert into storage.objects (bucket_id, name, owner)
values ('study-pdfs', 'aaaaaaaa-0000-0000-0000-000000000001/mynotes.pdf', 'aaaaaaaa-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id='study-pdfs' and name = 'aaaaaaaa-0000-0000-0000-000000000001/mynotes.pdf'),
  0,
  'storage.objects: a different user cannot see another user''s private study-pdfs file'
);
reset role;

-- ── Role escalation attempt ────────────────────────────────────────────────
-- A plain 'user'-role account (no admin/moderator app_role) attempts to
-- insert directly into verified_question_bank, which is admin/moderator-gated.
-- Same throws_ok 4-arg fix as the live_room_messages test above (arg 3 is
-- the exact expected message, not a description) -- found live 2026-08-18
-- via the same failing CI run; this assertion predates this session but
-- was never actually exercised end to end until the migration chain
-- finally applied cleanly in CI, so it never surfaced.
select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
select throws_ok(
  $$ set local role authenticated; insert into public.verified_question_bank (question_text, subject) values ('forged question', 'Physics') $$,
  '42501',
  'permission denied for table verified_question_bank',
  'verified_question_bank: a plain user (no admin/moderator role) cannot insert directly into the moderated question bank'
);

-- ── Role self-escalation: institution_members (found live 2026-08-08) ─────
-- Real, directly-exploitable vulnerability found while extending this file:
-- the inst_mem_insert policy's with_check was (auth.uid() = user_id) OR
-- is_institution_admin(...) — it never checked the VALUE of the `role`
-- column being inserted. The app's own join_institution() RPC always
-- hardcodes role='student' for self-joins, so the UI never exercised this,
-- but the underlying table grant + RLS let any authenticated client bypass
-- the app entirely and POST directly to /rest/v1/institution_members with
-- {"role":"admin"} to instantly become an institution admin. Confirmed live
-- against production via a rolled-back transaction before fixing (see
-- supabase/migrations/20260808010001_fix_institution_members_role_self_escalation.sql),
-- then confirmed the fix blocks it with no regression on the legitimate
-- student self-join path. This is that fix, locked in as a regression test.
insert into public.institutions (id, name, city, state, board, join_code, join_link_token, admin_user_id)
values ('ffffffff-0000-0000-0000-000000000001', 'ZZZ Attack Institution', 'Test City', 'TS', 'CBSE', 'ZZZATKPG', 'zzzatkpgtoken', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Same throws_ok 4-arg fix. Also: this assertion genuinely failed live in
-- CI (not just the arg-shape bug) -- traced to a stray, never-applied-to-
-- production migration file (supabase/migrations/20260729_b2b2c_institution.sql,
-- a duplicate of 20260702175408_b2b2c_institution_layer.sql) that recreated
-- the original, pre-fix "inst_mem_self_join" policy (WITH CHECK (auth.uid()
-- = user_id), no role check) alongside this fix's "inst_mem_insert" policy.
-- RLS policies are OR'd, so the vulnerable policy silently re-opened the
-- exact self-escalation hole 20260808010001/20260814131551 closed, but only
-- in a fresh replay (CI/staging) -- confirmed via a live pg_policy query
-- that production itself only ever had the correct 4 policies and never
-- applied that stray file. Deleted the stray file rather than patching
-- around it, since its content was pure duplicate cruft never used in
-- production.
select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
select throws_ok(
  $$ insert into public.institution_members (institution_id, user_id, role) values ('ffffffff-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'admin') $$,
  '42501',
  'new row violates row-level security policy for table "institution_members"',
  'institution_members: a non-admin self-insert claiming role=admin is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000002','role','authenticated')::text, true);
select lives_ok(
  $$ insert into public.institution_members (institution_id, user_id, role) values ('ffffffff-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'student') $$,
  'institution_members: no regression -- a self-insert with role=student (the real join_institution() path) still succeeds'
);
select is(
  (select role from public.institution_members where institution_id = 'ffffffff-0000-0000-0000-000000000001'::uuid and user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  'student',
  'institution_members: the row that landed is role=student, not admin'
);

select * from finish();
rollback;
