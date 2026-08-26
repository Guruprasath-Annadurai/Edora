# Account Deletion & Data Rights — Re-Test Report (Phase 2.6)

## Method — improved over the pre-mandate test

The pre-mandate §14 test (`docs/enterprise-remediation-tracker.md`) used real commits + manual cleanup, and that process is exactly what caused the disclosed institution-admin data-loss incident (an unguarded `institutions limit 1` query overwrote the one real institution's `admin_user_id`, later recovered from backup). **This re-test uses a `BEGIN`/`ROLLBACK`-wrapped transaction instead** — every trigger, cascade, and FK action fires for real within the transaction (this is not a simulation), but nothing persists afterward. This is strictly safer than the pre-mandate method and was deliberately chosen to make the exact same class of mistake structurally impossible: a fresh, entirely synthetic institution row was used, and the one real institution was never queried, read, or touched at any point.

## Test scenario

Created 2 synthetic users, then populated:
- **CASCADE-expected tables**: `novo_memories`, `sprint_sessions`, `flashcards` (all owned by the user being deleted)
- **SET NULL-expected tables** (the pre-mandate §14 fix's targets): a `battles` row (test user as **both `player1_id` and `winner_id`**), a `live_events` row (test user as `winner_id` only), a synthetic `institutions` row (test user as `admin_user_id`)

Ran `delete from auth.users where id = <test_user>`, then verified every table's post-delete state, then `ROLLBACK`.

## Results

| Table | Expected | Actual | Verdict |
|---|---|---|---|
| `novo_memories` | 0 rows remain (CASCADE) | 0 | ✅ Correct |
| `sprint_sessions` | 0 rows remain (CASCADE) | 0 | ✅ Correct |
| `flashcards` | 0 rows remain (CASCADE) | 0 | ✅ Correct |
| `profiles` | 0 rows remain (CASCADE) | 0 | ✅ Correct |
| `live_events` | row survives, `winner_id` nulled | row survives, `winner_id` nulled | ✅ Correct |
| `institutions` | row survives, `admin_user_id` nulled | row survives, `admin_user_id` nulled | ✅ Correct |
| `battles` | **row survives, `winner_id` nulled (per the pre-mandate §14 write-up's claim)** | **row does NOT survive — cascade-deleted entirely** | ⚠️ **Finding below** |

**No SQL errors at any point** — the original P0 bug (`NO ACTION`/`RESTRICT` FKs raising a constraint violation and blocking the entire account deletion) remains genuinely fixed. Deletion completed cleanly in every scenario tested.

## Finding: the `battles.winner_id` fix's "historical record preserved" claim does not hold in practice

Investigated why `battles` behaved differently from `live_events`/`institutions`. Queried the actual FK actions on `public.battles`:

| Column | On delete |
|---|---|
| `player1_id` | **CASCADE** |
| `player2_id` | **CASCADE** |
| `winner_id` | SET NULL (the pre-mandate fix) |

**The winner of a battle is always one of `player1_id`/`player2_id`** — there's no schema path for a third party to be `winner_id`. Both player columns are `CASCADE`, meaning **any time the winning user is deleted, the entire `battles` row is destroyed via the player-column cascade, regardless of what `winner_id`'s own FK policy says.** `winner_id`'s `SET NULL` policy is real and correctly configured, but structurally **unreachable** in the one scenario it was meant to protect (a winner deleting their account) — it can only ever fire if `winner_id` pointed to someone who is neither `player1_id` nor `player2_id`, which cannot happen under this schema's own constraints.

**This is not a new bug and does not need to be fixed** — a battle record disappearing when either participant deletes their account is a defensible design choice (the record isn't very meaningful without both real participants), and this is exactly what already happens for `player1_id`/`player2_id` regardless of the `winner_id` column. **What's actually wrong is the pre-mandate documentation's claim** that this fix achieved "historical record preserved (correct)" for `battles` specifically, alongside `live_events` and `institutions` — that framing was inaccurate for this one table. The FK-violation-blocking-deletion bug (the actual P0) was correctly fixed for all three tables; the *secondary* "and history survives" framing only actually holds for 2 of the 3.

**Corrected here rather than left standing.** No code or migration change needed — this is a documentation-accuracy correction, not a functional regression.

## Data rights — export, consent, memory (lighter-touch re-verification)

- **`export-user-data` Edge Function exists and is wired** from both `AccountSettingsPage.tsx` and `DataRightsPage.tsx` (confirmed via direct grep of call sites, both using `supabase.functions.invoke('export-user-data', ...)`). Not re-executed end-to-end this phase (would require a real authenticated session) — existence and wiring confirmed, not full behavioral re-verification.
- **Novo memory controls** (view/edit/disable/erase) — verified live in an earlier phase this session (Phase 13, pre-mandate numbering) via the `memory_opt_out` DB-level trigger; not re-tested this phase since nothing touching that code path changed since.
- **Consent withdrawal** — not independently re-tested this phase; no code changes since the pre-mandate DPDP work would have affected it.

## What Phase 2.6 does NOT cover

- Third-party processor cleanup (Google Classroom/Gmail/Calendar/Drive tokens, RevenueCat, Razorpay) on account deletion — same gap already disclosed pre-mandate (`delete-account` only touches this Supabase project's own tables), not re-investigated this phase.
- Queued offline-client data after deletion (what happens to a mobile client's local cache after its account is deleted server-side) — not testable from this session (no device/client available).
- A full re-execution of `export-user-data` against a real session.

**Status: Phase 2.6 — PARTIALLY COMPLETE.** Core deletion mechanics re-verified safely (transaction-rollback method, zero risk to real data) and found genuinely correct for the P0 bug (no FK violations block deletion). One documentation-accuracy correction made (battles' historical-preservation claim). Export/consent/third-party-cleanup were confirmed to exist and be wired, but not fully re-executed end-to-end this phase.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
