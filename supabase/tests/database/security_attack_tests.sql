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
select plan(9);

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

set local role anon;
select is(
  (select count(*)::int from public.live_room_messages where id = 'dddddddd-0000-0000-0000-000000000001'),
  0,
  'live_room_messages: an unauthenticated (anon) caller cannot read message content'
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

select * from finish();
rollback;
