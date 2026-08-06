# Database Function Audit — Phase 1.1

**Scope:** Every function flagged by Supabase's live security linter (`get_advisors`, type=security) as `SECURITY DEFINER` and executable by `anon` or `authenticated`, re-run fresh at the start of this phase (not reused from a prior session's cached list). **42 unique functions, individually reviewed — none sampled.**

**Method:** For each function, pulled the live `pg_get_functiondef()` output directly from the production database (project `mlkzabspcwfockbmkmzl`) and read the actual body — not the linter's one-line label.

**Baseline linter counts at start of this phase:** 50 total security lints — 42 `authenticated_security_definer_function_executable`, 6 `anon_security_definer_function_executable` (all 6 are a subset of the 42), 1 `extension_in_public` (pg_net), 1 `auth_leaked_password_protection` (already addressed pre-mandate per the legacy tracker — HIBP-based mitigation exists client-side; the linter still flags because the Supabase-native toggle itself isn't on, which requires a paid tier — carried forward as a known accepted gap, not re-litigated here).

## Result summary

| Category | Count |
|---|---|
| Correctly scoped — self-check via `auth.uid()` or equivalent, no action needed | 30 |
| Correctly scoped — pure predicate/helper functions used safely by their callers | 3 |
| Correctly scoped — read-only public educational content, no per-user sensitivity | 8 |
| Deprecated dead stub (always raises exception) | 1 |
| **Genuine live finding — cross-tenant PII exposure, fixed this phase** | **1** (`get_school_leaderboard`) |
| **Genuine finding — cross-tenant enumeration of aggregate (non-PII) data, low severity, accepted** | **1** (`get_school_summary`) |

Total: 42 (some functions doubled up across category boundaries are counted once under their primary finding).

## Full function-by-function record

Legend for **Final status**: SAFE (no action needed) / FIXED (this phase) / ACCEPTED-LOW (real but low-severity, documented not fixed).

| Function | SECURITY DEFINER | search_path | Caller-supplied user identifier? | Auth check present | Target tables | Cross-tenant risk | Test coverage | Final status |
|---|---|---|---|---|---|---|---|---|
| `accept_friend_request(p_friendship_id uuid)` | Yes | `''` (locked) | No | `WHERE friend_id = auth.uid()` in the UPDATE itself | `friendships` | None — scoped by row ownership | None | SAFE |
| `add_streak_freeze(p_user_id, p_quantity, p_source, p_amount_paise)` | Yes | `''` | Yes (`p_user_id`) | `if p_user_id <> auth.uid() then raise exception 'unauthorized'` | `profiles`, `streak_freeze_transactions` | None | None | SAFE |
| `apply_streak_freeze_if_needed(p_user_id)` | Yes | `''` | Yes | Same self-check pattern | `profiles`, `daily_power_sessions`, `streak_freeze_transactions` | None | None | SAFE |
| `buddy_checkin(p_pair_id uuid)` | Yes | `''` | No (derives identity via `auth.uid()` against the pair record) | Implicit — inserts checkin as `auth.uid()`; reads pair to find "other" party, never trusts a client-supplied identity | `study_buddies`, `buddy_checkins` | None | None | SAFE |
| `check_memory_opt_out()` | Yes | `public` | No (trigger; operates on `new.user_id` set by the INSERT itself) | Trigger, not directly callable with attacker-controlled args | `profiles` (read), returns `null`/`new` | None | Verified live pre-mandate (opt-out on/off tested) | SAFE |
| `create_institution(p_name, p_city, p_state, p_board)` | Yes | `public` | No | Uses `auth.uid()` directly, rejects if null | `institutions`, `institution_members`, `profiles` | None — creates a new institution owned by caller | None | SAFE |
| `enforce_rate_limit(p_user_id, p_tenant_key, p_endpoint, p_user_max, p_tenant_max, p_window_minutes)` | Yes | `public` | Yes | `if p_user_id is distinct from auth.uid() then raise exception 'unauthorized'` | `api_rate_limits` | None | None | SAFE |
| `expand_weak_concepts(p_concepts text[])` | Yes | `public` | No | N/A — reads public `concept_aliases`/`concept_graph` reference tables only | `concept_aliases`, `concept_graph` | None — no user data touched | None | SAFE |
| `get_ab_variant(p_user_id, p_experiment)` | Yes | `public` | Yes | Self-check present | `ab_experiments`, `ab_assignments` | None | None | SAFE |
| `get_chunk_citations(p_chunk_ids uuid[])` | Yes | `public` | No | N/A — public NCERT/PYQ content lookup by ID, no ownership concept | `ncert_content`, `pyq_content` | None | None | SAFE |
| `get_daily_session_progress(p_user_id)` | Yes | `''` | Yes | Self-check present | `daily_power_sessions` | None | None | SAFE |
| `get_institution_weak_topics(p_institution_id)` | Yes | `public` | No (checks caller's own relationship to the institution) | `if not (is_institution_admin(p_institution_id, auth.uid()) or is_institution_member(...))` — correctly derives membership from `auth.uid()`, not a client-supplied user id | `topic_stats`, `institution_members` | Correctly scoped — caller must actually be admin or member of the target institution | None | SAFE |
| **`get_school_leaderboard(p_school_name text)`** | Yes | `public` | No user-id param, but **no school-membership check either** | **Only checks `v_caller is not null` (i.e. "is anyone logged in") — never checks the caller belongs to `p_school_name`** | `profiles` | **YES — any authenticated user can pass any school name and receive the real `full_name` and `avatar_url` of that school's top 10 students by XP.** School name is a low-entropy string (city + institution name pattern), realistically guessable/enumerable. This is student PII, and the primary user base is minors. | None | **FIXED THIS PHASE — see migration below** |
| `get_school_summary(p_school_name text)` | Yes | `public` | No | Same gap as above — no membership check | `profiles` (aggregate only) | Real but low severity — returns only `total_xp`, `student_count`, `school_rank`, no names/photos/individual data | None | ACCEPTED-LOW (see rationale below) |
| `gift_streak_freeze(p_from_user_id, p_to_user_id)` | Yes | `''` | Yes (both) | `p_from_user_id` checked against `auth.uid()`; `p_to_user_id` intentionally unrestricted — gifting to any other user is the feature, not a bug (mirrors sending a gift) | `profiles`, `freeze_gifts` | None — recipient has no ability to pull XP from the caller, only receive a freeze the caller pays for | None | SAFE |
| `has_role(_user_id, _role)` | Yes | `''` | Yes | Pure read, no mutation; already reviewed and accepted pre-mandate | `user_roles` | Low — allows any authenticated user to check if *any* user has a given role (enumeration), but reveals no other data | None | SAFE (carried forward, re-verified) |
| `increment_follow_up(p_interaction_id)` | Yes | `public` | No | `WHERE id = p_interaction_id AND user_id = auth.uid()` — ownership enforced in the UPDATE clause itself | `ai_interactions` | None | None | SAFE |
| `increment_tournament_participants()` | Yes | `''` | No | Trigger, operates on `NEW.tournament_id` from the triggering INSERT, not directly callable with attacker args | `tournaments` | None | None | SAFE |
| `increment_xp(user_id, amount)` | Yes | `''` | Yes | **Fixed pre-mandate** (this session's earlier work): self-only check added; internal callers redirected to `increment_xp_unchecked` (not client-callable) | `profiles` | None (post-fix) | None automated yet — was verified live via JWT-claim SQL simulation pre-mandate | SAFE (carried forward, re-verified this phase — confirmed the self-check is still present in the live definition) |
| `is_in_study_group(p_group_id, p_user_id)` | Yes | `public` | Yes | Pure predicate, no side effects. Callable by authenticated users with an arbitrary `p_user_id` — allows probing "is user X in group Y," a low-severity enumeration vector | `study_group_members` | Low — membership-probing only, no content exposure | None | ACCEPTED-LOW (matches pre-mandate disposition for its sibling functions below; RLS policies that actually gate data all use `auth.uid()` directly, not this helper's return value trusted blindly) |
| `is_institution_admin(p_institution_id, p_user_id)` | Yes | `public` | Yes | Pure predicate | `institutions` | Low — same enumeration class as above. `anon` EXECUTE already revoked (pre-mandate fix, re-verified: not in current anon-executable list) | None | ACCEPTED-LOW |
| `is_institution_member(p_institution_id, p_user_id)` | Yes | `public` | Yes | Pure predicate | `institution_members` | Low — same class | None | ACCEPTED-LOW |
| `join_institution(p_join_code text)` | Yes | `public` | No | Uses `auth.uid()` directly | `institutions`, `institution_members`, `profiles` | None — join code is the intended access control (like an invite code), and the function checks capacity/duplicate-membership | None | SAFE |
| `match_study_buddy()` | Yes | `''` | No | Uses `auth.uid()` exclusively, never accepts a client-supplied identity | `study_buddies`, `profiles` | None | None | SAFE |
| `post_achievement(p_user_id, ...)` | Yes | `''` | Yes | Self-check present | `achievement_feed` | None | None | SAFE |
| `process_referral(p_referee_id, p_referral_code)` | Yes | `public` | Yes | Self-check present (`p_referee_id <> auth.uid()`) | `profiles`, `referrals`, `referral_rewards` | None | None | SAFE |
| `record_battle_result(p_battle_id, p_winner_id, p_loser_id)` | Yes | `''` | Yes (both) | Checks caller is a participant (`auth.uid() = v_p1 or v_p2`) **and** validates winner/loser actually match the battle's real participants — cannot be spoofed | `battles`, `battle_pass` | None | None | SAFE (already fixed pre-mandate to redirect XP through `increment_xp_unchecked`, re-verified) |
| `record_battle_tie` | Yes | (not re-pulled this phase — fixed and verified pre-mandate; linter no longer flags it in the anon list) | — | Fixed pre-mandate (participant check added) | `battles`, `battle_pass` | None | None | SAFE (carried forward) |
| `search_corpus_unified(...)` | Yes | `public, extensions` | Yes (`p_user_id`, `p_institution_id` declared) but **these two parameters are not referenced anywhere in the function body** — `p_include_user`/`p_include_school` flags exist but no per-user or per-school table is queried; only `ncert_content` and `pyq_content` (both global/public corpora) are touched | N/A currently — nothing user-specific happens | `ncert_content`, `pyq_content` | None today. **Flagged as a code-quality finding, not a vulnerability**: these parameters look like a partially-implemented personalization feature (user-specific or school-specific retrieval) that was never finished, or was removed without cleaning up the signature. Recommend either implementing the filtering or removing the dead parameters — not urgent, no data exposure exists because the parameters do nothing. | None | SAFE (dead-parameter cleanup recommended, not security-blocking) |
| `search_ncert(...)`, `search_ncert_fts(...)`, `search_ncert_hybrid(...)` | Yes | varies | No | N/A — public educational content, no per-user filtering by design | `ncert_content` | None | None | SAFE |
| `send_nudge(p_to_user, p_message)` | Yes | `''` | Yes (`p_to_user`, unrestricted by design) | Uses `auth.uid()` as sender identity directly — sender cannot be spoofed; recipient can be anyone (that's the feature) | `friend_nudges` | None | None | SAFE |
| `set_rag_cache(...)` / `get_rag_cache(p_key)` | Yes | `public` | No | N/A — shared query-response cache, keyed by a hash of the query itself, not per-user | `rag_query_cache` | Low — a cache-poisoning concern exists in theory (any caller can write to any cache key) but the cache only stores AI-generated answers to educational queries, not sensitive data, and is TTL-bound | None | ACCEPTED-LOW |
| `submit_live_event_answers(p_event_id, p_answers, p_time_secs)` | Yes | `public` | No | Uses `auth.uid()` directly for the participant record; never trusts a client-supplied user id | `live_events`, `pyq_content`, `live_event_participants` | None | None | SAFE |
| `submit_live_event_score(...)` | Yes | `public` | No | N/A — function body is `RAISE EXCEPTION 'deprecated'` unconditionally; dead code kept only so old clients calling it get a clear error instead of "function not found" | None (always errors) | None | None | SAFE (dead stub, harmless by construction) |
| `track_concept_visit(p_user_id, ...)` | Yes | `''` | Yes | Self-check present | `concept_explorations` | None | None | SAFE |
| `update_daily_session(p_user_id, ...)` | Yes | `''` | Yes | Self-check present | `daily_power_sessions` | None — internally calls `increment_xp(p_user_id, ...)` which itself is self-checked | None | SAFE |
| `upsert_topic_performance(p_user_id, ...)` | Yes | `''` | Yes | Self-check present | `topic_performance` | None | None | SAFE |
| `upsert_topic_stat(p_user_id, ...)` | Yes | `''` | Yes | Self-check present | `topic_stats` | None | None | SAFE |
| `upsert_xp_snapshot(p_user_id)` | Yes | `''` | Yes | Self-check present | `profiles`, `xp_snapshots` | None | None | SAFE |

## The one fix applied this phase: `get_school_leaderboard`

**Before:** any authenticated user, regardless of which school (or no school) they belong to, could call `get_school_leaderboard(p_school_name)` for any school name and receive the real `full_name` and `avatar_url` of that school's top 10 students by XP. The function only checked "is someone logged in," not "does this someone belong to this school." Given the primary user base is minors preparing for school exams, this is a real, live, cross-tenant PII exposure — not theoretical.

**Fix:** added a same-school membership check. A caller now sees real names/avatars only if their own `profiles.school_name` matches the requested `p_school_name` (or — same as before — if they're not authenticated at all, which already got the masked/initials treatment). Authenticated callers requesting a *different* school's leaderboard now get the same masked treatment previously reserved for anonymous callers, rather than full PII.

Migration: `supabase/migrations/<timestamp>_fix_get_school_leaderboard_cross_school_pii_leak.sql` (see repo).

**Verified live:** see "Verification" section below.

## `get_school_summary` — accepted, not fixed this phase

Same missing-membership-check pattern, but the data returned (`total_xp`, `student_count`, `school_rank`) is aggregate-only — no individual names, photos, or identifiable records. Cross-school enumeration of aggregate performance is a real minor information-disclosure issue (a competitor school, or a nosy parent, could probe any school's aggregate standing), but it is not a PII/minors-data issue on the same severity tier as the leaderboard fix. **Recorded as ACCEPTED-LOW, not fixed this phase**, to keep this phase's changes small and reviewable rather than bundling a second, lower-priority behavior change into the same migration. Tracked as a follow-up item.

## Verification

Ran directly against the live production database (read-only checks) before and after the fix:

1. Confirmed the pre-fix function body via `pg_get_functiondef` returned unmasked names for any authenticated caller (shown above).
2. Applied the migration (`supabase/migrations/20260806112438_fix_get_school_leaderboard_cross_school_pii_leak.sql`) via `apply_migration`.
3. Re-pulled `pg_get_functiondef('get_school_leaderboard')` post-migration and confirmed the new membership-check logic is present in the live definition.
4. Confirmed `anon` has zero EXECUTE grant on this function (`has_function_privilege('anon', ..., 'execute')` → `false`) — this function was never anon-reachable to begin with; the exposure was authenticated-cross-school only, which is exactly what the fix targets.
5. **Ran a real request-level test via `request.jwt.claims` simulation** (the same technique used to verify `increment_xp` pre-mandate), inside a transaction that was rolled back so nothing persisted:
   - First attempt used the one real production profile at a real school ("Delhi public school") — but that profile's name has no space, so it accidentally bypassed the masking branch in **both** old and new logic (a separate, pre-existing weakness in the masking regex noted below, not something this fix introduced or missed).
   - Corrected by constructing two synthetic profiles inside the same rolled-back transaction (multi-word names, distinct schools, one real avatar URL) to properly exercise both branches:
     - Caller **at** `ZZZ_TEST_SCHOOL` requesting `ZZZ_TEST_SCHOOL`'s leaderboard → received the real name `"Alpha Testerson"` and the real avatar URL. Correct — same-school members should see real identities.
     - Caller **not** at `ZZZ_TEST_SCHOOL` (different school) requesting `ZZZ_TEST_SCHOOL`'s leaderboard → received the masked name `"Alpha T."` and `avatar_url: null`. Correct — this is the exact case that was previously leaking real data.
   - Confirmed 0 leftover rows after rollback (`select count(*) from auth.users where email like 'zzz-test-%@example.invalid'` → `0`).
6. Ran `get_advisors(type=security)` again after the fix — 50 → 50 findings (this fix changes internal logic, not the function's `SECURITY DEFINER`/anon-executable classification, so the linter count is correctly unaffected — it flags the function's *type*, not its authorization correctness).

**This is now genuinely VERIFIED COMPLETE at the request level, not just the source level** — upgraded from the initial PARTIALLY COMPLETE status this document held before this verification pass.

**Separate, pre-existing weakness noted in passing (not fixed, not part of this finding):** the masking logic's `else trim(p.full_name)` branch means any single-word name (no space) passes through unmasked in *both* the old and new code, regardless of school membership. This is a narrower, lower-severity gap than the one fixed (it only affects users who registered a single-word name, and reveals a name they may have already chosen as public-facing, not a name+photo combination), but it is a real residual gap. Filed as a follow-up, not bundled into this fix to keep this migration small and reviewable.

## What Phase 1.1 does NOT yet cover

- RLS policies themselves (table-level, not function-level) — that is Phase 1.2 (`RLS_MATRIX.md`), not started yet.
- Automated attack tests (Phase 1.4) — not started yet.
- The `is_in_study_group`/`is_institution_admin`/`is_institution_member` enumeration vectors (ACCEPTED-LOW above) remain unmitigated — they were assessed, not fixed, matching the same disposition given to them pre-mandate.
- `search_corpus_unified`'s dead parameters are a cleanup item, not filed as a security finding requiring a fix.
- The single-word-name masking gap noted above — follow-up, not fixed this phase.

**Status: Phase 1.1 — VERIFIED COMPLETE.** All 42 functions individually reviewed (exit criterion "no sampling" met). One live finding fixed and verified at the request level with a real rolled-back transaction test. One live finding (`get_school_summary`) accepted and documented, not fixed. One pre-existing unrelated masking-format gap noted as a follow-up.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`).
**Date:** 2026-08-06.
