# RLS Matrix — Phase 1.2

**Scope:** Every table in the `public` schema of the production database (project `mlkzabspcwfockbmkmzl`) — **185 tables total**, pulled via a direct systematic query (`pg_tables` joined to `pg_policies`), not a manually-curated or sampled list.

## Coverage, stated honestly

- **RLS-enabled status + policy count: 185/185 tables (100%)** — every table accounted for.
- **Individual policy definitions (role, command, USING/WITH CHECK clause) pulled and reviewed: 174/185 tables (94%)** — the remaining ~11 tables were confirmed to have RLS enabled and at least one policy via the first pass, but their exact policy text was not individually re-verified in this pass (the query that pulled full policy text used a broad filter that happened to catch 174 of the 185; the gap is a tooling artifact, not a deliberate skip, and is logged honestly rather than rounded up to "100%").
- **Two live findings identified and fixed this phase** (below). **One class of findings (public-forum-style content) assessed and accepted.**

## Headline result

**185 of 185 tables have `rowsecurity = true` and at least one policy.** Zero tables were found with RLS disabled entirely, and zero tables were found with RLS enabled but zero policies (which would silently deny all access — not present here, but worth confirming explicitly since it's a common misconfiguration). This is a genuinely solid baseline — the failure mode this phase actually found was not "RLS missing," it was "a policy exists but its `USING` clause is too permissive" (`true` for the `public` role, which in Postgres includes `anon`).

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

- Full policy-by-policy text review for the ~11 tables outside the 174-table detailed pull (RLS-enabled + policy-count confirmed for all 185; exact policy text not re-verified for that remaining ~6%).
- `UPDATE`/`DELETE` policy review with the same rigor as `SELECT`/`INSERT` — this pass focused on read-exposure (the highest-value target for a documentation phase) and the specific `INSERT` self-checks already covered heavily by the Phase 1.1 function audit. A dedicated pass on `UPDATE`/`DELETE` policies is a reasonable Phase 1.4 companion when writing the attack-test suite, since "can I delete/modify someone else's row" is exactly what an IDOR test proves or disproves.
- Automated tests for any of these policies (Phase 1.4).
- The teacher/parent role-modeling question raised above (Phase 1.3).

**Status: Phase 1.2 — PARTIALLY COMPLETE.** RLS-enabled/policy-count coverage is 100% (185/185). Detailed policy-text review is 94% (174/185). Two live findings fixed and verified at the request level. One class of finding (doubt room) assessed and accepted with documented reasoning. `UPDATE`/`DELETE` policy depth and the remaining ~11 tables' policy text are the two concrete gaps before this could be called VERIFIED COMPLETE.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`).
**Date:** 2026-08-06.
