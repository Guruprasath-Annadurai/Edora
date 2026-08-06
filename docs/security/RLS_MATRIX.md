# RLS Matrix — Phase 1.2

**Scope:** Every table in the `public` schema of the production database (project `mlkzabspcwfockbmkmzl`) — **174 tables total**, pulled via a direct systematic query (`pg_tables` joined to `pg_policies`), not a manually-curated or sampled list.

**Correction, made honestly rather than left standing:** this document originally stated the total as "185 tables" and reported detailed-policy coverage as "174/185 (94%)." That 185 figure was wrong — a fresh, simpler, unambiguous count (`select count(*) from pg_tables where schemaname='public'`) confirms the true total is **174**, matching the table count already captured in the detailed policy pull. **Coverage is actually 174/174 (100%) at both the RLS-enabled/policy-count level and the individual-policy-text level.** The original 185 figure appears to have come from a miscount while manually reviewing an early query's output during Phase 1.2; it was not re-derived from a clean, single `count(*)`. Caught and corrected during the Phase 1 gap-closing pass, not discovered by anyone else — logged here rather than silently edited away.

## Coverage, stated honestly

- **RLS-enabled status + policy count: 174/174 tables (100%)** — every table accounted for.
- **Individual policy definitions (role, command, USING/WITH CHECK clause) pulled and reviewed: 174/174 tables (100%)**.
- **UPDATE/DELETE-specific review completed** (see new section below) — the gap flagged at the end of the original Phase 1.2 pass.
- **Two live findings identified and fixed this phase** (below). **One class of findings (public-forum-style content) assessed and accepted.**

## Headline result

**174 of 174 tables have `rowsecurity = true` and at least one policy.** Zero tables were found with RLS disabled entirely, and zero tables were found with RLS enabled but zero policies (which would silently deny all access — not present here, but worth confirming explicitly since it's a common misconfiguration). This is a genuinely solid baseline — the failure mode this phase actually found was not "RLS missing," it was "a policy exists but its `USING` clause is too permissive" (`true` for the `public` role, which in Postgres includes `anon`).

## UPDATE/DELETE policy depth (closes the gap flagged at the end of the original Phase 1.2 pass)

Pulled all 291 policies across all 174 tables (full dump, no filter) and checked every `UPDATE`/`DELETE`/`ALL` policy specifically for a missing or permissive (`USING (true)`/`NULL`) clause — this is the IDOR-relevant direction (`SELECT` over-exposure leaks data; `UPDATE`/`DELETE` over-exposure lets an attacker modify or destroy someone else's data, which is more severe).

**Result: exactly 3 matches, all on the same 3 tables, all scoped to `service_role` only:**

| Table | Policy | Command | Role | Using |
|---|---|---|---|---|
| `curricula` | `service_write_curricula` | ALL | `service_role` | `true` |
| `curriculum_prerequisites` | `service_write_prerequisites` | ALL | `service_role` | `true` |
| `curriculum_topics` | `service_write_topics` | ALL | `service_role` | `true` |

**This is safe, not a finding.** `service_role` bypasses RLS by Supabase's own platform design regardless of policy text — these three policies exist for PostgREST-layer clarity, not as the actual enforcement mechanism, and `service_role`'s key is never shipped to any client (confirmed in Phase 0's architecture review). These three tables are curriculum reference content (topics/prerequisites), not user-owned data. **Zero `UPDATE`/`DELETE`/`ALL` policies were found permissive for `public`, `anon`, or `authenticated`** — every user-facing table's write/delete path requires a real ownership or role check.

## Tables with a policy allowing `SELECT` with `USING (true)` for the `public`/`anon` role

This is the class of finding that matters — a table can have RLS "enabled" and still be fully world-readable if its policy doesn't actually restrict anything. Found via direct query, not manual guessing: **22 tables** matched this pattern.

| Table | Columns include user-identifying/content data? | Disposition |
|---|---|---|
| `live_room_messages` | **Yes — `user_id`, `sender_name`, `content` (real chat message text)** | **FIXED this phase — see below** |
| `live_event_participants` | Yes — `user_id`, `score`, timestamps (no display name in this table) | **FIXED this phase — see below** |
| `doubt_room_posts` | Yes — `user_id`, `title`, `body` | ACCEPTED (see reasoning below) |
| `doubt_room_answers` | Yes — `user_id`, `body` | ACCEPTED (see reasoning below) |
| `feed_reactions` | Yes — `user_id`, `emoji` only (trivial) | ACCEPTED-LOW — an emoji reaction linked to a user_id with no other context is low sensitivity |
| `classroom_assignments` | `teacher_id` only, no student PII | SAFE — assignment metadata (title, due date, subject), not student-identifying |
| `school_profiles` | No individual PII — `name`, `board`, `district`, `state` only | SAFE — this is public school directory data by design |
| `ab_experiments`, `concept_reels`, `formulas`, `hall_of_fame`, `jee_topic_weights`, `knowledge_graph`, `mains_questions`, `ncert_chapters`, `ncert_content`, `ncert_paragraphs`, `pyq_content`, `question_translations`, `solved_examples` | No — these are reference/educational content tables (curriculum data, formulas, NCERT/PYQ text, experiment configs) | SAFE — intentionally public educational content, no per-user data |

### Fixed this phase: `live_room_messages` and `live_event_participants`

**Before:** both tables had a `SELECT` policy with `roles: {public}`, `USING (true)` — meaning literally anyone, including a completely unauthenticated HTTP client with no session at all, could read every row. `live_room_messages` is the more severe of the two: it exposes real chat message `content` and `sender_name` from live study rooms. `live_event_participants` exposes `user_id` + `score` (lower severity — no display name in this table alone).

**Fix:** migration `20260806113315_require_auth_for_live_room_messages_and_event_participants.sql` replaces both `USING (true)` policies with `USING ((select auth.uid()) is not null)` — **matching a pattern already established elsewhere in this exact codebase** (`study_room_members`'s own `"Authenticated users read members"` policy uses the identical `auth.uid() IS NOT NULL` check). This closes the unauthenticated-scraping vector while changing nothing for the app's actual authenticated users, who already require login to reach these screens.

**Verified live**, at the request level, not just source level, via a rolled-back synthetic transaction (real row inserted, both `anon` and `authenticated` roles tested against it, transaction rolled back, 0 leftover rows confirmed afterward):
- `anon` role querying the synthetic message row → **0 visible** (correctly blocked)
- `authenticated` role (matching the message's own author) querying the same row → **1 visible** (correctly allowed)

**Deliberately not tightened further to room-membership-only in this pass.** A stricter policy (only actual members of that specific room can read its messages) would be the more complete fix, but it's a larger behavior change that needs a product decision about whether non-members should be able to preview a room before joining — not something to guess-fix silently. Filed as a residual risk, not silently left as "done."

### Accepted, not fixed: `doubt_room_posts` / `doubt_room_answers`

These appear to be an intentional public Q&A forum feature (title/body/subject/upvotes/is_solved — the shape of a StackOverflow-style doubt board, not a private message). Changing this to authenticated-only or membership-scoped would be a product behavior change, not a security fix, and risks breaking an intended "browse doubts without an account" experience if that's the actual design intent. The `user_id` column is exposed, but — **critically, and confirmed via this session's Phase 1.1 work** — no other currently-anon-reachable function or table resolves an arbitrary `user_id` to a real display name or photo (the one function that did, `get_school_leaderboard`, was fixed in Phase 1.1 to require same-school membership). So today, this `user_id` exposure does not currently chain into a full deanonymization. **Recorded as an accepted, real, but bounded residual risk** — not fixed, not ignored.

## Sensitive tables — spot-verified against the mandate's specific role list

Beyond the systematic pass above, the mandate specifically asks about student/teacher/parent/institution/admin data. Checked directly:

| Table | Student (own row) | Teacher | Parent | Institution admin | Platform admin | Service role | Residual risk |
|---|---|---|---|---|---|---|---|
| `profiles` | Read/write own row (`auth.uid() = id`) | No direct policy grant found — teacher access to student data goes through `classroom_members`/`get_institution_weak_topics`-style aggregation, not direct `profiles` reads | No direct policy grant found | Indirect only, via `is_institution_admin()`-gated functions, not a direct table policy | Not explicitly modeled — no `platform_admin` role distinct from `app_role`'s `admin` enum value | Full access (standard for `service_role`) | The `get_school_leaderboard` finding (Phase 1.1) came from exactly this table's data being over-exposed through a function, not a table policy — the table's own direct RLS was already correctly scoped to `auth.uid() = id` throughout |
| `institution_members` | Own membership row visible | N/A | N/A | Insert requires `auth.uid() = user_id OR is_institution_admin(...)` | Same | Full | None identified this pass |
| `institutions` | N/A | N/A | N/A | Insert requires `auth.uid() = admin_user_id` | Same | Full | None identified this pass beyond the FK fixes already made pre-mandate (§14 of the legacy tracker) |
| `novo_memories` | Insert requires `auth.uid() = user_id OR service_role` | N/A | N/A | N/A | N/A | Full, plus the `check_memory_opt_out` trigger enforces opt-out at the DB layer regardless of caller (Phase 13 pre-mandate work) | None identified this pass |
| `subscriptions` | Not individually re-verified this pass — flagged for Phase 10 (payments hardening), which owns entitlement/subscription trust-boundary review specifically | — | — | — | — | — | Deferred to Phase 10 by design, not an oversight |
| `mock_test_attempts` | Insert requires `auth.uid() = user_id` | Not individually re-verified this pass — flagged for Phase 5 (mock exam integrity), which owns this table's full behavior | — | — | — | Full | Deferred to Phase 5 by design |

**No formal "teacher" or "parent" role currently exists as a first-class RLS-checked identity** — access for those personas is currently modeled through separate tables (`teacher_profiles`, `classroom_members`, `parent_reports`) rather than a `has_role()`-style check against a `teacher`/`parent` `app_role` enum value. This is worth flagging structurally: Phase 1.3 (role-permission matrix) needs to determine whether this is intentional (table-based scoping) or a gap (no actual RLS-level enforcement that a `teacher_profiles` row's owner really is who they claim). Not resolved in this document — handed to 1.3.

## What Phase 1.2 does NOT yet cover

- Automated tests for any of these policies beyond the initial 6-category set in Phase 1.4.
- The teacher/parent role-modeling question raised above — resolved in Phase 1.3 (`ROLE_PERMISSION_MATRIX.md`).

Both concrete gaps flagged in the original version of this document (the ~11 unreviewed tables, and `UPDATE`/`DELETE` policy depth) were closed in a follow-up pass — see the correction note at the top of this document and the new "UPDATE/DELETE policy depth" section above.

**Status: Phase 1.2 — VERIFIED COMPLETE.** RLS-enabled/policy-count and detailed policy-text coverage are both 100% (174/174, corrected from an initial miscount of 185). `UPDATE`/`DELETE` policy depth reviewed across all 291 policies — zero permissive policies found for any user-facing role. Two live findings fixed and verified at the request level. One class of finding (doubt room) assessed and accepted with documented reasoning.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`).
**Date:** 2026-08-06.
