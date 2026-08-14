# Automated Attack Tests — Phase 1.4 (Initial Set)

## Scope

The mandate lists 19 attack categories. This pass covers **7 of the 19**, chosen because they map directly to live findings already fixed this session, or were identified as newly feasible to test with the current SQL-only tooling during the Phase 1 depth-closing pass.

**Covered:**
1. Horizontal privilege escalation (`increment_xp` — user A cannot modify user B's XP)
2. Forged record IDs (`accept_friend_request` — a friendship's sender cannot accept their own request)
3. IDOR (`record_battle_result` — a non-participant cannot record a result; winner/loser cannot be fabricated against real participants)
4. Cross-tenant data exposure (`get_school_leaderboard` — different-school caller sees masked data, RISK-019)
5. Unauthenticated table access (`live_room_messages` — anon cannot read, RISK-022)
6. Storage-object access isolation (`storage.objects` on the private `study-pdfs` bucket — a different user cannot see another user's file; also confirmed the `avatars`/`public-media` buckets are intentionally `public: true` at the bucket level, which is by design, not a gap)
7. Role escalation attempt (a plain `user`-role account cannot insert directly into `verified_question_bank`, which requires `admin`/`moderator`)

**NOT covered** (explicitly, not silently): tampered JWT claims beyond `sub` substitution (e.g. a forged `role` or custom claim), expired token, revoked token, deleted-user edge cases, removed teacher/parent membership revocation, institution transfer, stale session, account switching, realtime channel access, data export isolation. These require either more test infrastructure (a way to mint genuinely expired/revoked tokens, not just `set_config` substitution) or features that don't exist yet to test against (e.g. there's no institution-transfer flow to test). Filed as follow-up work, not claimed as done.

## Test file

`supabase/tests/database/security_attack_tests.sql` — a pgTAP file with 11 individual assertions across the 7 scenarios above. Written to be run via the standard `supabase test db` / `pg_prove` toolchain.

## Verification method — stated precisely, not overclaimed

**Every one of the 11 assertions' underlying security property was individually verified against the live production database** via direct, isolated, rolled-back SQL queries during authoring — this is the same technique used to verify the Phase 1.1/1.2 fixes, and every individual check passed cleanly, multiple times, including via completely raw SQL with no pgTAP wrapper at all. The 2 newest assertions (storage isolation, role escalation) were verified the same way: storage isolation confirmed a different user sees 0 rows for another user's private file; role escalation confirmed the direct INSERT attempt raises a real `insufficient_privilege` (`42501`) error, not a silent no-op.

**However**, running the composite pgTAP file as a single batch through this session's available SQL-execution interface (the Supabase MCP `execute_sql` tool) produced inconsistent results — sometimes reporting 1 test failed out of 9, but the *specific* failing test differed between runs, and every test that pgTAP flagged as failing was then re-confirmed to pass when re-isolated and re-run individually via plain SQL outside the pgTAP wrapper. This points to an interaction between this specific tool's query-batching/session-handling and pgTAP's `is()`/`throws_like()` functions (possibly related to how `set_config()`'s transaction-local GUC state or role-switching is preserved across the tool's internal statement dispatch) — **not a confirmed defect in the application code being tested**, since the same underlying checks passed reliably outside pgTAP.

**This is being reported honestly as an unresolved verification-tooling gap, not glossed over or hidden by only showing the runs that happened to pass.** The correct authoritative verification is running this file through the real `supabase test db` / `pg_prove` pipeline once wired into CI (Phase 3), which uses a real Postgres connection and a real pgTAP harness rather than this session's SQL-execution tool. Until that CI wiring exists, this file's status should be read as: **written, syntactically valid, individually verified assertion-by-assertion via raw SQL, but not yet cleanly proven as a single automated pgTAP run.**

## What Phase 1.4 does NOT yet cover

- The 12 attack categories listed as not-covered above.
- CI wiring to actually run this file automatically (Phase 3, native bundle/CI integrity work).
- `UPDATE`/`DELETE`-specific IDOR tests beyond the role-escalation/storage cases added this pass — Phase 1.2's systematic sweep of all 291 policies found zero permissive `UPDATE`/`DELETE` policies for any user-facing role (see `RLS_MATRIX.md`), which substantially de-risks this category even without a dedicated per-table test for each one.
- Frontend/Edge-Function-level negative tests (this file is database-layer only — an Edge Function could theoretically have its own bug even with correct RLS/function-level checks underneath, e.g. if it uses the service-role key to bypass RLS incorrectly. Not tested here.)

## Extended pass (2026-08-08, RISK-005)

**New real, directly-exploitable vulnerability found and fixed**: while extending this file, found that `institution_members`'s `inst_mem_insert` RLS policy checked only `auth.uid() = user_id`, never the `role` value being inserted. The app's own `join_institution()` RPC always hardcodes `role='student'` for self-joins, so the UI never exercised this — but any authenticated client could bypass the app entirely and `POST /rest/v1/institution_members` directly with `{"role":"admin"}` to instantly become an institution admin. Confirmed live against production via a rolled-back transaction *before* fixing (self-insert with `role='admin'` was accepted), then confirmed the fix (`supabase/migrations/20260808_fix_institution_members_role_self_escalation.sql`) blocks it with zero regression on the legitimate `role='student'` self-join path — verified against the actually-applied production policy, not just the hypothetical fix. Applied to production; **staging sync is currently blocked** — `edora-staging` has been auto-paused by Supabase (free-tier inactivity) and `restore_project` failed with `ForbiddenException: ... 2 project limit` (the org's free-tier active-project cap), which needs the founder to resolve via the Supabase dashboard directly, not something restorable via this session's tooling. Locked in as a new regression test (3 new assertions: negative case rejected, positive case still works, and the landed row's role is verified `student`).

**A methodology correction, documented rather than silently dropped**: also attempted to test "JWT role-claim tampering" (a forged `role: service_role` claim) using the same `set_config('request.jwt.claims', ...)` technique used throughout this file. It appeared to succeed (a forged claim granted access to a service-role-only table) — but this is a **false positive of the test technique, not a real vulnerability**. `set_config` bypasses PostgREST's JWT signature verification entirely, which is the actual layer that prevents a real attacker from presenting a forged claim (they cannot produce a validly-signed JWT without the project's JWT secret). This technique can verify RLS *policy logic* against a legitimately-authenticated session, but it structurally **cannot** be used to test JWT signature/claims-forgery resistance — that requires a real HTTP-level test against the live REST API with a genuinely tampered token, which is out of scope for a database-layer pgTAP file. Not added as a test; noted here so a future pass doesn't repeat the same invalid technique and draw a wrong conclusion.

**CI wiring added** (the other half of what Phase 1.4 originally flagged as missing): a new `security-attack-tests` job in `.github/workflows/ci.yml` using Supabase's own documented CI pattern (`supabase/setup-cli` → `supabase start` → `supabase test db`) — the full local stack (Postgres + auth/storage schemas + pgTAP), not this session's SQL-execution tool that showed unreliable composite-run results. **Stated honestly**: this could not be dry-run in this session — local Docker was unresponsive (`docker info` timed out, matching the Docker Desktop issue already noted in RISK-033) — so the job is written correctly against the real, installed Supabase CLI's verified command syntax (`supabase test db` confirmed via `--help`), but has not been observed passing in an actual CI run yet. That first real green run remains open.

**Status: PARTIALLY COMPLETE, deepened.** 8 of 19 attack categories now covered (was 7) — the institution self-escalation fix is a new category, and it's a confirmed-real, confirmed-fixed vulnerability, not a hypothetical. CI wiring is written but not yet observed passing. Staging sync of the production fix is blocked on a platform-level free-tier constraint outside this session's authority to resolve.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`).
**Date:** 2026-08-06, extended 2026-08-08.
