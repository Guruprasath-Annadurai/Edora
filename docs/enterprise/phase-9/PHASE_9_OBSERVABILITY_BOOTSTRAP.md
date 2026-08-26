# Phase 9 — Observability Bootstrap

**Scope note (same caveat as Phase 3.3):** this phase was self-scoped from a summary table I produced earlier in this session ("phases that can move fast"), not from the mandate's own literal Phase 9 text, which was never pasted into this conversation. The specific claim I made was: "Sentry mobile crash reporting exists; adding backend alerting for mock save failures, payment webhook failures, and backup job failures is mostly wiring." Investigating that claim honestly changed its shape — see below.

## What I found before building anything

Before writing new code, I read the existing `monitoring-check` Edge Function (Phase 2.2 work) and the two systems the mandate specifically named: mock exam saves and payment webhooks.

**Existing infrastructure was more complete than I'd assumed.** `monitoring-check` already runs 5 checks on a cron schedule and posts to a real Slack webhook (`MONITORING_SLACK_WEBHOOK`): rate-limit hammering, admin-audit silence, edge-function error-rate spikes, DB connection pressure, and backup job health. This is not a "bootstrap from nothing" — it's a real, working alerting pipeline.

**Payment webhooks: found a genuine, previously-undocumented gap.** `novo-subscription`'s Razorpay webhook handler has two failure points — a subscription-row insert and a profile update, both happening *after* Razorpay has already confirmed a successful payment — that only logged via `console.error('CRITICAL: ...')`. This is not a thrown exception, so it never reached `edge_function_errors`, and `monitoring-check`'s existing error-rate check never saw it. **A student could pay real money and have their entitlement silently fail to activate, with zero alert firing anywhere.** The code author clearly recognized the severity (labeling it "CRITICAL" in the log line) but the signal had nowhere to go.

**Mock exam saves: found something more fundamental than a missing alert.** `mock_test_attempts` only gets a row inserted at the very end of an exam, on success (`MockTestPage.tsx` line 189, `completed_at` set at insert time). There is no "started" row. This means a crash, connectivity drop, or app kill mid-exam leaves **zero trace anywhere** — not a failed row, no row at all. I could not build honest monitoring for this, because the schema provides no signal to observe. Building a fake check that queries for something that structurally cannot indicate the failure it claims to catch would violate the mandate's own honesty rules. **This is correctly a Phase 5 (exam integrity) prerequisite** — an idempotent submission flow with a "started" row is what would make this observable at all — not something Phase 9 can wire around.

## What was changed

### 1. `supabase/functions/novo-subscription/index.ts` — payment webhook alerting

Added `captureException` calls (imported from the already-existing `_shared/sentry.ts`, previously only ever invoked from inside `withSentry`'s own catch block — this is the first direct call site anywhere in the codebase) at both silent-failure points:
- Subscription-insert failure after `payment.captured`
- Profile-update failure after `payment.captured`

**Deliberately did NOT change the existing behavior of returning HTTP 200 to Razorpay and not throwing.** That design is correct and intentional — a DB constraint error won't be fixed by Razorpay retrying, and retry-storming on a webhook is its own failure mode. `captureException` has its own internal try/catch and is documented to "never throw or block the response," so this is additive-only: the alert now fires, the response behavior is byte-for-byte unchanged.

### 2. Pre-deploy validation (before touching production)

- `deno check supabase/functions/novo-subscription/index.ts` — 34 pre-existing errors (esm.sh/postgrest-js type-resolution noise unrelated to this codebase's own code; confirmed via `git stash`/`git stash pop` that the exact same 34 errors exist on the unmodified file). **Zero new errors from this change.**
- `deno test --allow-env --allow-net "supabase/functions/**/*.test.ts"` — 248 passed, 0 failed, both before and after (no dedicated test file exists for `novo-subscription`, consistent with it not having gone through the validate.ts-extraction pattern used elsewhere in this codebase).

### 3. Deploy — scoped precisely, not "whatever's in git"

Before deploying, I pulled the currently-deployed function's file contents via `get_edge_function` and diffed them against local git. Found that `_shared/rateLimit.ts` has **genuinely diverged**: the currently-deployed copy for this function fails *open* on a rate-limit DB error, while local git has since been updated (by earlier, unrelated work) to fail *closed* and adds a `checkGlobalLLMBudget` function. **Deliberately deployed using the exact currently-live content for every file except `source/index.ts`**, rather than local git's newer `rateLimit.ts` — bundling an unrelated, unreviewed rate-limiting behavior change into a payment-webhook deploy would violate "smallest safe change." This drift is real and worth a dedicated follow-up (redeploying `novo-subscription` on its own to pick up the newer shared file), but it's out of scope here and is named rather than silently carried along.

Deployed as version 29 (`novo-subscription`, project `mlkzabspcwfockbmkmzl`).

### 4. Live verification (not just "the deploy call succeeded")

Two live requests via `net.http_post` from SQL (the established pattern this session):
1. No auth headers at all → `401 UNAUTHORIZED_NO_AUTH_HEADER` — Supabase's platform JWT gateway, confirms the function is reachable but not proof my code ran.
2. Anon key as both `apikey` and `Authorization: Bearer` → `401 {"error":"Unauthorized"}` — **this is my own application code's response** (`if (authErr || !user) return json({ error: 'Unauthorized' }, 401)`), proving the request passed the platform gateway, passed the webhook-signature branch (skipped, no signature header), passed the RevenueCat-webhook branch (skipped, no matching secret), and reached my code's own auth gate with zero regression to the existing 401 behavior.

**What was NOT verified live, and why:** the actual `captureException` calls I added only execute inside the specific branch where a real Razorpay `payment.captured` webhook arrives AND a real Supabase DB write then fails. I did not attempt to force this in production — deliberately forging a fake payment-captured webhook against the live payment system to test an alerting path is not a safe or proportionate way to verify this, and doing so would risk corrupting real subscription state. This is a residual, disclosed verification gap: the fix is code-reviewed, type-checked, unit-test-suite-clean, and deployed with confirmed-unchanged surrounding behavior, but the exact new lines have not been observed firing for real. The next actual occurrence of this failure mode (rare, but the reason it needed fixing) will be the first live confirmation.

## What this phase does NOT do

- Does not add backend/business-metric **dashboards** — this is alerting only (Slack), not a queryable metrics surface. A real observability platform (Grafana/Datadog-style) is a larger undertaking than "bootstrap."
- Does not add alert-to-owner **paging** (PagerDuty/Opsgenie) — `monitoring-check`'s own header comment already discloses this honestly ("NOT a substitute for real on-call paging... those need a separate account/service Claude cannot provision").
- Does not solve mock-exam-save observability — correctly identified as a Phase 5 prerequisite, not faked around.
- Does not address the `_shared/rateLimit.ts` drift found along the way — named as a follow-up, not fixed here.

## Residual risks

- The new `captureException` calls have not been observed firing on a real production failure (see verification section above) — code-level confidence is high, live-fire confidence is not yet established.
- `_shared/rateLimit.ts` drift across functions (some redeployed with the newer fail-closed version, `novo-subscription` still on the older fail-open version) is a real, disclosed inconsistency worth a dedicated cleanup pass.
- Mock-exam-save observability remains fully unaddressed, correctly deferred to Phase 5.

**Status: Phase 9 — PARTIALLY COMPLETE.** One real, previously-undocumented alerting gap found and fixed with genuine evidence (not assumed) at every step. One planned item (mock-save alerting) correctly identified as un-buildable given current schema, documented rather than faked. Existing observability infrastructure (5-check `monitoring-check`, Slack alerting, mobile crash reporting) was more complete going in than the summary table that prompted this phase assumed — corrected here rather than left standing.

**Branch:** `enterprise/phase-9-observability-bootstrap`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
