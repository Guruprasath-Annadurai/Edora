# Phase 12 — Content Governance

**Scope note (same caveat as Phases 3.3/9/14):** self-scoped from RISK-013's original finding ("185 CAT exam questions inserted directly into production via ad hoc SQL with zero PR, code review, or version-control trail"), not from the mandate's literal Phase 12 text, which was never pasted into this conversation.

## What I found before building anything

RISK-013 named the CAT-questions incident specifically. Before designing a "draft → review → approve → publish" workflow from scratch, I checked whether the schema already had governance infrastructure — and it did, partially, in a way that turned out to be broken.

**`pyq_content` (the live table backing every mock test, PYQ bank, and live-event question for CAT/BOARDS/UPSC/JEE_MAIN/JEE_ADV/NEET) already has `is_reviewed`, `flagged_for_review`, and `is_active` columns.** These look exactly like the review-workflow columns Phase 12 would otherwise need to add. But:

1. **No application query anywhere filters on any of them.** Checked every `.from('pyq_content')` call site in the codebase (`MockTestPage.tsx`, `PYQBankPage.tsx`, `LiveEventPage.tsx`, `RegionalLanguagePage.tsx`, plus the Edge Functions that write to it). None select with `.eq('is_active', true)` or filter on `is_reviewed`/`flagged_for_review` in any read path.
2. **RLS didn't enforce them either**, until this phase. The only policy on the table was `pyq_public_read FOR SELECT USING (true)` — unconditionally readable by anyone, regardless of any flag's value.
3. **Real, current data confirms this isn't theoretical.** Queried the live table: 233 of 555 rows (42%) have `is_reviewed = false`. Broken down by exam, this isn't scattered noise — it's **100% of CAT, BOARDS, and UPSC content**, while JEE_MAIN, JEE_ADV, and NEET are 100% reviewed. Three entire exam categories have been served to students with a review flag set to "not reviewed" that nothing has ever checked.

This is filed as **RISK-030** — genuinely the most consequential finding of this phase, and more significant than the original ad-hoc-SQL-insertion framing RISK-013 used, since it's not just "no PR trail," it's "the review flag that should exist as a safety net has been silently non-functional."

## What was fixed this phase (safe, verified, applied)

**`is_active` enforcement.** Changed the RLS policy from `USING (true)` to `USING (is_active = true)`.

- Verified safe *before* applying: queried live data first — **0 of 555 rows are currently `is_active = false`**, so this is a zero-behavior-change-today fix. It closes the enforcement gap for any future deactivation without affecting anything currently being served.
- Verified correctness via two rolled-back transactions (the established pattern this session): inserted a synthetic `is_active=false` row inside a `BEGIN...ROLLBACK` block, confirmed it returned 0 visible rows to an `authenticated`-role reader under the new policy; then inserted a synthetic `is_active=true` row, confirmed it returned 1 visible row. Both positive and negative cases checked, not just one.
- Applied via `apply_migration` (recorded as a real migration, `enforce_pyq_content_is_active_in_rls`) and confirmed live: `pg_policies` shows the new `qual` in production, and a real (non-transactional) count query confirms **555/555 rows still visible** — exactly the zero-impact result predicted.

## What was deliberately NOT fixed this phase (and why)

**`is_reviewed` enforcement.** This is the more consequential half of RISK-030, and I did not touch it. Flipping RLS to also require `is_reviewed = true` would immediately drop CAT, BOARDS, and UPSC to **zero visible questions** — breaking mock tests, PYQ bank practice, and live events for any student using those exams right now, with no warning. This is exactly the kind of unilateral, high-blast-radius change the mandate's database safety rules exist to prevent ("never run destructive migrations without backup confirmation, review, rollback strategy" — this isn't destructive to data, but it's destructive to a live user-facing feature at a scale I have no authority to decide alone).

This needs an explicit founder decision among real options, not a default I pick:
1. Commission an actual review pass on the 233 rows (verify correctness, then flip `is_reviewed=true` per-row as reviewed) — the "do it properly" option, real effort.
2. Bulk-mark the existing 233 rows as reviewed without individual re-verification (accepting that they were authored carefully even if never formally reviewed) and enforce the flag only for *future* insertions going forward.
3. Leave the flag unenforced for now and accept RISK-030 as a documented, known gap — valid if there's reason to trust the existing content's accuracy despite the missing formal review step.

No option is silently chosen here.

## Content governance workflow — design, not yet built

The mandate's actual ask (draft → validation → review → approved → published) is a bigger lift than what this phase's remaining time allowed to build and verify properly. What exists now as real, usable governance infrastructure, versus what's still a gap:

| Workflow stage | Real infrastructure today |
|---|---|
| Draft | None — content is authored outside the table entirely (a migration file, an ingestion pipeline) and appears fully-formed |
| Validation | `pyq-content-audit` Edge Function exists and can set `reviewed`/flag rows — but per RISK-030, its output was never actually gating visibility until this phase's `is_active` fix (and `is_reviewed` still isn't gated) |
| Review | `reviewed_by` and `review_notes` columns exist on the table, but **no admin UI writes to them** — checked `AdminConsolePage`/`admin-console` Edge Function, found no code path that sets these fields. They are schema with no interface. |
| Approved/Published | `is_active`/`is_reviewed` conflated as the closest proxy — no distinct "approved but not yet published" intermediate state exists |

**Recommendation, not built this phase:** the columns to support a real workflow already mostly exist (`is_reviewed`, `flagged_for_review`, `review_notes`, `reviewed_by`). What's missing is (a) an admin UI screen that actually writes to `review_notes`/`reviewed_by` when a moderator reviews a flagged question, and (b) the founder decision on `is_reviewed` enforcement above, which determines whether this UI needs to be built before or after the CAT/BOARDS/UPSC backlog is cleared. Building the admin UI without first resolving the enforcement decision risks building the wrong shape of tool.

## Validation performed

- Full grep audit of every `.from('pyq_content')` call site across `src/` and `supabase/functions/` — not sampled.
- Live data queries confirming exact counts (0 inactive, 233 unreviewed, full exam-level breakdown) before deciding what was safe to change.
- Two rolled-back transactions verifying the RLS fix's correctness (negative and positive case) before applying for real.
- Post-apply live verification: `pg_policies` shows the new policy text; a real query confirms 555/555 rows still visible (matches the pre-computed zero-impact prediction exactly).

## Residual risks

- RISK-030 (`is_reviewed` non-enforcement for CAT/BOARDS/UPSC) remains open, correctly deferred to a founder decision rather than resolved unilaterally.
- No admin UI exists to actually use the `reviewed_by`/`review_notes` columns even once a decision is made — a real remaining build item.
- `flagged_for_review` remains unenforced by RLS (deliberately — it's designed as an investigatory "look at this" signal, not necessarily a content-hiding signal, and currently has 0 rows set to `true` so there's no live impact either way to weigh).

**Status: Phase 12 — PARTIALLY COMPLETE.** One real, verified, zero-risk fix applied to production (`is_active` enforcement). One significantly more consequential finding (RISK-030) surfaced with real numbers and correctly escalated to a founder decision rather than resolved by picking an option unilaterally at 3 exams' expense. Full draft→review→approve→publish workflow UI remains unbuilt, honestly scoped as future work rather than claimed done.

**Branch:** `enterprise/phase-12-content-governance`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
