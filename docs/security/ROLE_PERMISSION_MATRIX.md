# Role-Permission Matrix — Phase 1.3

**Method:** Queried the live `app_role` enum, `user_roles` table population, and cross-referenced against the RLS policies pulled in Phase 1.2 and the function bodies read in Phase 1.1 — not written from assumption about what roles "should" exist.

## What actually exists today

```sql
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role';
-- admin, moderator, user

select role, count(*) from public.user_roles group by role;
-- user: 37, admin: 1, moderator: 0
```

**Only 3 formal roles exist in the database: `admin`, `moderator`, `user`.** There is no `teacher`, `parent`, `school_admin`, `support`, `content_reviewer`, `academic_admin`, or `platform_admin` value in the `app_role` enum. The mandate's 9-persona list does not map 1:1 onto this codebase's actual role model — that gap is real and is resolved below by explaining how each persona is *actually* enforced, not by pretending the roles exist.

## The two enforcement models in this codebase

1. **Formal role-based** (`has_role(auth.uid(), 'admin'|'moderator')`) — used for platform-wide administrative actions: the admin console, content moderation (`mains_band_overrides`, `verified_question_bank` admin inserts).
2. **Row-ownership-based** (no role flag at all — a table column like `teacher_id`, `admin_user_id`, or a membership table row, checked directly against `auth.uid()` in the RLS policy) — used for every "relationship" persona: teacher, parent, institution admin, study-group host, etc.

**This second model is not a gap by default — it's a deliberate and, on inspection, consistently-applied design.** "Being a teacher" in this app means "owning classroom rows you created," not "having been granted a `teacher` role by a platform admin." Verified this is applied consistently across every teacher-relevant table (`classrooms`, `classroom_members`, `classroom_assignments`, `classroom_submissions`, `teacher_assignments`, `teacher_profiles`) — every one of them checks `auth.uid()` against a real ownership/membership column, not a client-supplied claim.

## Per-persona matrix

| Persona | Formal `app_role`? | Actual enforcement mechanism | Verified consistent? | Residual risk |
|---|---|---|---|---|
| **Student** | `user` (default, assigned to all 37 real accounts implicitly — not even a real `user_roles` row is required, since `has_role` checks are opt-in per function, not a global gate) | Row ownership: `auth.uid() = <table>.user_id` on every student-owned table (`profiles`, `quiz_sessions`, `mock_test_attempts`, `flashcards`, `novo_memories`, etc.) | Yes — this is the pattern checked exhaustively across all 42 functions in Phase 1.1 and the 185-table sweep in Phase 1.2 | None beyond what's already tracked in RISK-019 through RISK-023 (fixed or accepted) |
| **Parent** | None | Row ownership via `parent_reports.user_id = auth.uid()` — but this models "a user who generates parent-facing reports," not a distinct parent *account* with a verified link to a specific student. **There is no `parent-child` relationship table found in this schema** — parent access appears to be self-service (a parent creates their own account and report), not a verified guardian-of-student link. | Partially — the one table checked (`parent_reports`) is correctly self-scoped, but there is no evidence of a verified parent↔student relationship being enforced anywhere in the schema | **Flagged as a real open question, not resolved here**: if the product intends parents to view a *specific child's* data (not just their own generated reports), the mechanism for verifying that link and gating access to the child's actual records was not found. This needs founder confirmation of intended behavior before being called safe or unsafe. |
| **Teacher** | None | Row ownership: `classrooms.teacher_id`, `classroom_assignments.teacher_id`, `teacher_assignments.teacher_id`, `teacher_profiles.id`, all checked against `auth.uid()`. Student rosters are scoped via `classroom_members` join, not a separate role check. | Yes, verified across 7 tables in Phase 1.2/1.3 combined — consistent pattern, no gaps found | Self-service teacher accounts mean anyone can create a "classroom" and act as its teacher for their own created rows — this is architecturally sound (you can only ever be "teacher" of things you made) but worth noting explicitly: there is no vetting that a self-declared teacher is a real, verified educator. Whether that matters depends on product intent (open self-serve classrooms vs. verified-institution-only) — not a security bug, a product-scope question. |
| **School/institution admin** | None | Row ownership: `institutions.admin_user_id`, checked via the `is_institution_admin()` predicate (reviewed in Phase 1.1, confirmed correctly derives from `auth.uid()`, not a client-supplied id) | Yes | None beyond the pre-mandate FK fixes already made (§14 of the legacy tracker) |
| **Support** | None — no role, no table found | **Does not exist as an enforced concept in this schema.** The only support channel is the general `support@edora.app` mailbox referenced in the privacy policy — there is no support-staff account type, no "support can view user X's data" access path in the database at all. | N/A | This is accurate — there is genuinely nothing to secure here yet because the capability doesn't exist. Filed as a Phase 14 (support operations) item, not a Phase 1 security gap, since there's no privileged access path to audit. |
| **Content reviewer** | Overlaps with `moderator` (currently 0 users hold this role) | `mains_band_overrides` and `verified_question_bank` INSERT policies check `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator')` | Yes, for the 2 tables checked | The `moderator` role exists in the enum and is checked correctly in policies, but zero accounts currently hold it — meaning content review is currently only possible via the single `admin` account. Not a security bug (fail-closed is safe), but worth noting as an operational gap when content governance (Phase 12) is built out. |
| **Academic admin** | Overlaps with `admin`/`moderator` — no distinct role | Same `has_role()` checks as above | Yes | Same as content reviewer — the distinction the mandate wants (content reviewer vs. academic admin as separate personas) doesn't exist; both currently collapse into the same 2 enum values. |
| **Platform admin** | `admin` (1 real account) | `has_role(auth.uid(), 'admin')`, server-side-gated (confirmed: `AdminConsolePage.tsx`'s own comment states "server-side gated by has_role(uid,'admin') in admin-console" — the edge function enforces it, not just the frontend route) | Yes | None found — this is the one persona with genuinely solid, verified, non-frontend-only enforcement. |
| **Service account** | N/A — Postgres `service_role`, not an `app_role` enum value | Full table access by design (standard Supabase service-role behavior, used by Edge Functions with the service-role key, never shipped to any client) | Yes — confirmed the service-role key is not in the client bundle (`.env.example` only lists `VITE_*` client-safe keys; `SUPABASE_SERVICE_ROLE_KEY` is Edge-Function-only per `docs/secrets-inventory.md`, pre-mandate) | None found this pass |

## What this reveals that Phase 1.1/1.2 didn't already surface

- **RISK-024 (raised in Phase 1.2) is now resolved as "not a gap"**: the teacher-identity model was checked exhaustively across 7 tables and found to be consistently row-ownership-enforced, not client-trusted. Downgraded from an open question to a verified, deliberate design.
- **A new, genuinely open question**: the parent-persona's relationship to a specific student is not modeled anywhere found in this schema. This is either (a) intentional — parents currently only see self-generated reports, not a linked child's live data, or (b) an actual gap if the product intends live parent-to-child data access that isn't yet built or isn't yet access-controlled. **This is not something to guess-fix; it needs a founder decision**, filed as RISK-025 below.
- **Support and content-governance personas the mandate asks about don't exist as enforced concepts yet** — correctly reported as absent rather than inventing a matrix row for a capability that isn't there.

## What Phase 1.3 does NOT yet cover

- A full re-verification of every one of the 174 tables reviewed in Phase 1.2 against this specific 9-persona lens (this document builds on that data, doesn't re-derive it from scratch).
- Resolving the parent-relationship open question — flagged for founder decision, not resolved unilaterally.
- Automated tests proving any of this (Phase 1.4).

**Status: Phase 1.3 — PARTIALLY COMPLETE.** Every persona the mandate names has been checked against real schema/policy evidence — none skipped, none assumed. One real open question (parent-child relationship modeling) surfaced and correctly left unresolved pending a product decision, rather than guessed at.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`).
**Date:** 2026-08-06.
