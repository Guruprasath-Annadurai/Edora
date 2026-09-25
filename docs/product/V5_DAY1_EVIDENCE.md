# V5 Day 1 — Evidence & Completion Report

Branch `release/5.0.0-landmark`. Starting SHA `f04f09cd73dc1f2120c715f7bf6e864d569c240f`. Ending SHA: see the commit that adds this file (`git log -1`).
No changes to `main` or `release/4.1.0-integration`. Day 2 not started.

## Duplicate quiz persistence / double XP (D-7 order followed)
1. Reproduced (local production-faithful mirror, real PostgREST): `evidence/day1/01_old_flow_reproduction.txt`
   - prod-today schema (no `score_pct`): old flow -> 0 quiz rows, XP granted once (30).
   - with `score_pct` added: old flow -> 2 rows, XP doubled (60). This is why the `score_pct` migration is HELD (`supabase/held/`), never auto-applied.
2. Fix: ONE persistence authority, server RPC `complete_quiz_session` (idempotent on client-minted session UUID; XP + topic stats granted only on first insert). QuizPage calls `persistCompletedQuiz` only; no direct `quiz_sessions` insert / `increment_xp`.
3. Regression tests: `quizPersistence.test.ts`, `QuizPage.persistence.test.tsx` (static guards proven to fail on baseline: `02_static_guards_fail_on_baseline.txt`), mirror suite `newflow.mirror.test.ts`.
4. Mirror (staging unavailable: Supabase free-project limit; no other project was paused): exactly 1 quiz row and exactly 1 XP grant under retry, reconnect, response-lost replay, concurrency, stale replay; with and without `score_pct`. 18/18 mirror tests: `05_mirror_suite.txt`, `03_new_flow_mirror_run.txt`.
5. Production compatibility (rolled-back single-transaction probe, nothing persisted, verified after): first call `duplicate:false, xp_awarded:30` (XP 0->30); second call same session id `duplicate:true, xp_awarded:0` (XP stays 30); quiz rows 1->1; topic delta 5; old client `score_pct` insert -> 42703; old on-conflict upserts -> 42P10. Post-check: function absent, quiz_sessions 0, subscriptions 0, no probe rows, no `score_pct`, total_xp 560 unchanged.

Quiz rows before/after (production): 0 -> 0 (probe rolled back). XP before/after (production): 560 -> 560. In-transaction probe: XP 0 -> 30 -> 30.

## Not yet done to production
- `complete_quiz_session` migration (`20260926000000`) is NOT applied to production. Must be applied (additive) BEFORE the V5 client ships.
- `score_pct` held. Legacy 4.0.0 clients are unchanged (still lose quiz rows; XP once via queue). If an immediate client repair is needed: coordinated 4.0.1 hotfix.

## /pro
`/pro` previously redirected to `/profile`; now mounts `ProSubscriptionPage` (`proRoute.test.ts`, 3 tests). Only known gate files reference `/pro`.

## Purchase / restore / backend entitlement
- Root cause chain fixed in `novo-subscription`: builder `.catch` TypeError (16 sites; guard test `noBuilderCatch.test.ts`), `amount_paise` NOT NULL, partial-unique-index upsert 42P10. Shared `_shared/entitlement.ts` (grant/revoke; 8 Deno tests; mirror `entitlement.mirror.test.ts`).
- Restore now calls the backend `restore_purchases` and returns true only if server `pro_active === true`.
- Status: code + mirror + Deno verified. **NOT verified** on a real device / Play / RevenueCat. RevenueCat REST path not exercised.

## Razorpay / native isolation
`assertWebCheckoutAllowed()` throws on native; `loadRazorpayScript` rejects on native; tests prove native never loads Razorpay or calls `create_order` (`ProSubscriptionPage.test.tsx`, `iap.test.ts`).

## Gates (final tree)
- typecheck (`tsc -b`): pass (a type error in my new test was found and fixed during wrap-up)
- lint: 0 errors, 3 pre-existing warnings
- Vitest: 19 files / 127 tests pass (baseline 104). One unreproduced failure in 1 of 8 full runs (occurred while tsc/build ran concurrently); 7 clean runs, test not identified.
- Deno: 287/287 (baseline 278). deno check novo-subscription: 2 pre-existing errors (34 at baseline).
- Build: OK.

## Unresolved / blockers
- Purchase/restore device verification (Play + RevenueCat) not done.
- `complete_quiz_session` not in production; release ordering needs founder go-ahead.
- SyncQueue global defects (5-attempt silent drop, non-atomic writes, no dead-letter) deferred to Day 4.
- Profile page has no upgrade path to `/pro`.
- Web Razorpay `create_order` writes `pending_payment`, which violates the subscriptions status CHECK (out of scope, logged).
- Repo-wide builder-`.catch` class: ~23 candidate sites in 13 other functions (heuristic, unverified).
- No UI e2e against a real backend (no test accounts).

## GO / NO-GO for Day 2
CONDITIONAL GO: code-level Day-1 gates pass. Not a production-ready claim: device purchase verification and production RPC application remain open.

---
## Day 1 closeout (founder items A–E)
- **A. Native purchase semantics:** `IAP.purchase` now returns `{success, state}` with `state` = `confirmed | pending_activation | cancelled`. `success` is true only when the backend `verify_revenuecat` returns `pro_active === true`. After the store purchase it verifies, then polls a bounded 3 more times (3 s / 4 s / 5 s). If the backend is still unconfirmed it returns `pending_activation`; the UI shows "Purchase received. We're activating Pro now." with a "Check status" action, does not navigate away, and the main button re-checks status instead of starting a second store purchase. `confirmProActivation()` re-checks the backend only (no store call, no repurchase). Tests: `iap.test.ts` (confirmed / pending / late-reconcile / cancelled / no-store-call), `ProSubscriptionPage.test.tsx` (pending copy, no "activated" claim, one purchase call only).
- **B. Deno check:** `deno check supabase/functions/novo-subscription/index.ts` -> 0 errors (was 2). Fixes: type cast at `pickActiveEntitlement` return; `select('id, expires_at')` in the webhook retry path. No behaviour change.
- **C. XP trust debt:** registered as TD-1 in `V5_TRUST_DEBT.md` and noted in the RPC source. XP is not tamper-proof today.
- **D. Sequential final checks:** tsc 0; lint 0 errors (3 pre-existing warnings); Vitest 19 files / 133 tests, 3 consecutive runs all green; Deno 287/287; `deno check` 0 errors; build OK (initial JS ~257.6 KB gzip for the index chunk). The earlier Vitest failure did not reappear: recorded as one unreproduced historical flake (it happened while tsc and build ran concurrently).
- **E. Production:** no writes. `score_pct`, `complete_quiz_session` and the `novo-subscription` changes are NOT deployed.
