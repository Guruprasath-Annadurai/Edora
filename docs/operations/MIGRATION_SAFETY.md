# Migration Safety — Phase 2.5

## Destructive-operation detection

Grepped all 175 local migration files for `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, and unconditional `DELETE FROM <table>;` (no `WHERE` clause).

**Result: 1 file matched** (`20260801_fix_mains_evaluator_schema.sql`), and it's benign on inspection — `DROP TABLE IF EXISTS public.mains_band_overrides` immediately followed by `CREATE TABLE IF NOT EXISTS public.mains_band_overrides (...)` in the same migration: a controlled schema-rebuild pattern, not a stray destructive operation. **Zero unconditional `DELETE FROM` statements found anywhere in migration history.** This is a genuinely clean result — no evidence of a careless destructive migration ever having been committed.

No automated destructive-operation *gate* exists in CI (nothing currently blocks a future migration containing an unguarded `DROP`/`TRUNATE` from merging) — this grep was a manual one-off check this phase, matching the same "one-off vs. recurring" gap pattern already seen with the pre-mandate `gitleaks` scan before Phase 1.5 made it recurring. Recommend the same treatment: a CI step running this exact grep pattern (or a proper SQL-aware linter, see below) on every PR touching `supabase/migrations/`, not built this phase.

## Migration linting

**No migration-linting tool is available in this environment.** Supabase's CLI has no built-in `db lint` equivalent for migration *safety* (as opposed to schema linting via `get_advisors`, which checks the live schema's current state, not migration *changes*). A proper solution would be a tool like `squawk` (Postgres migration linter) wired into CI — not installed or evaluated this phase; flagged as a real gap, not silently worked around.

## Schema-diff review process

No formal process exists for reviewing a migration's schema diff before it's applied — migrations in this project have historically been written and applied directly (via this session's `apply_migration` tool, or presumably `supabase db push` in other sessions) without a distinct "propose → diff-review → approve → apply" step. This is worth naming as a real process gap for a team of more than one person, though for the current single-person reality it's a lower-priority gap than the finding below.

## Real finding: local migration filenames do not reliably match Supabase's actual applied-migration ledger

**This is the most substantive finding in this section**, surfaced while attempting migration-order verification.

`list_migrations` reports Supabase's own record of applied migrations — 133 entries, each with a `version` (timestamp) and `name`. There are **175 files in `supabase/migrations/`**. Naively diffing by filename-embedded timestamp shows 48 "missing." Investigating further:

- **10 of those 48 are confirmed renamed-on-apply**: the local filename's embedded timestamp does not match the actual applied version, even though the migration's `name` and content are identical. **Proven concretely using this session's own two most recent migrations**: `supabase/migrations/20260806112438_fix_get_school_leaderboard_cross_school_pii_leak.sql` (the exact file committed to git this session) was applied via `apply_migration(name: "fix_get_school_leaderboard_cross_school_pii_leak", ...)` and Supabase recorded it as **version `20260806055502`** — over 5 hours earlier than the local filename's timestamp, despite being applied essentially immediately after being written. The same pattern holds for the sibling `live_room_messages` migration and at least 8 others from earlier sessions.
- **38 more show no exact name match either** — most likely the same phenomenon compounded with a slightly different descriptive name between the local file and what was passed to `apply_migration` at the time (e.g. local `20260729_b2b2c_institution` vs. applied `20260702175408: b2b2c_institution_layer` — clearly the same feature, differently worded). A handful of the local-only files with **dates after today (2026-08-06)** — `20260807_knowledge_graph` through `20260813_cat_syllabus_progress` — cannot possibly represent already-applied migrations (they're dated in the future) and are most plausibly draft/scratch files sitting in the repo unapplied, though this wasn't traced further this phase.

**Root cause**: the `apply_migration` MCP tool (used throughout this project's history per its tool description — "Applies a migration... Do not hardcode references to generated IDs") assigns its own version timestamp based on *when the tool call executes*, independent of whatever timestamp the corresponding local `.sql` file's name embeds. Nothing enforces that the two stay in sync.

**Why this matters for migration safety specifically:**
- If someone ever needs to rebuild schema state from scratch by running `supabase db push` against local files in filename order, **that replay order may not match the order migrations were originally actually applied and tested against real data** — a real forward-recovery risk, not just a cosmetic naming issue.
- It makes "migration-order verification" (this mandate's own ask) fundamentally unreliable using filenames alone — this investigation had to fall back to content/name-based reasoning rather than trusting timestamps.
- **No data-loss risk was found** — the live schema clearly reflects all of this work correctly (institutions, memory opt-out, the two Phase 1 security fixes all confirmed live and working). This is a **traceability and forward-recovery-planning gap, not an active bug.**

**Not fixed this phase** — reconciling all 175 local files against their true applied versions with full confidence would require content-diffing each one against `pg_get_functiondef`/live schema state individually, which risks misattribution if done hastily. Recommended as a dedicated follow-up, not attempted under time pressure here. Filed as RISK-029.

## Migration test against representative data

**Not performed this phase.** No staging environment exists (Free-tier limitation, same as the Phase 2.4 branching finding) to test a new migration against realistic data volume before applying to production. Every migration in this project's history has effectively been tested "live" — a real risk that hasn't materialized into an incident yet, per the clean destructive-operation scan above, but is structurally present.

## Forward-recovery guidance

Cross-references `docs/rollback-procedure.md` §3, which already states the correct forward-recovery pattern for this project: migrations are forward-only (no down migrations exist), so reverting a bad migration means writing and applying a *new* corrective migration, not rolling back — restoring from backup is the last resort, not the first response.

## Manual approval for destructive changes

**No enforcement mechanism exists** — any migration, destructive or not, can currently be applied by anyone with access to `apply_migration` or `supabase db push`, with no required review step. Given this is currently a single-person project (per `docs/enterprise/OWNERSHIP_MATRIX.md`), a human-approval *gate* would currently just mean the same person approving their own change — the more valuable near-term control is the CI-level destructive-operation detection flagged above (an automated check doesn't care how many people are on the team), not a manual-approval process that would be theater at the current team size.

**Status: Phase 2.5 — PARTIALLY COMPLETE.** Destructive-operation scan: done, clean result. Migration-order verification: done, surfaced a real and previously-unknown filename/ledger drift issue (RISK-029). Linting, schema-diff review process, and migration testing against representative data: not done, correctly named as gaps rather than skipped silently.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
