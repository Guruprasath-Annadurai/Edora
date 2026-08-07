# Payments and Entitlement Hardening Audit

Phase 10 of the enterprise remediation mandate (RISK-012, High — direct
revenue risk). Last verified 2026-08-07.

## Scope

`supabase/functions/novo-subscription/index.ts` (703 lines) — the single
edge function handling both payment providers:
- **Razorpay** (web checkout): `create_order`, `verify_payment` (client-driven,
  HMAC-signature-verified), plus a `payment.captured`/`payment.failed`
  webhook handler embedded in the same function (dispatched on the
  `x-razorpay-signature` header, checked before the JWT auth gate since
  Razorpay's servers don't send one).
- **RevenueCat** (native iOS/Android IAP via StoreKit/Play Billing):
  `verify_revenuecat`, `restore_purchases`, plus a webhook handler for
  `INITIAL_PURCHASE`/`RENEWAL`/`CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE`/
  `PRODUCT_CHANGE`/`TRANSFER` events (dispatched on a bearer-token
  `Authorization` header check).

This was not a from-scratch build — this existing implementation already
has real, deliberate hardening: webhook signatures are verified before
any event is trusted, `notes.user_id` from the Razorpay payload is never
trusted (the webhook looks up the real `user_id` from `subscriptions` by
`order_id` instead — the correct defense against a forged webhook body),
`verify_payment` has an idempotency pre-check, and `get_status` already
self-heals a `profiles.is_pro` mismatch against an active `subscriptions`
row. The audit's job was to find what's still real risk on top of that,
not to assume nothing had been done.

## Findings and fixes

### 1. RLS on `subscriptions` allowed `FOR ALL` to the row's own user (fixed, defense-in-depth)

The only RLS policy on `public.subscriptions` was:
```sql
CREATE POLICY sub_own ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
`FOR ALL` covers INSERT — meaning, on paper, any authenticated user could
insert a row for their own `user_id` with `status: 'active'` and an
`expires_at` far in the future, no payment involved, and `get_status`'s
existing self-healing logic would then flip `profiles.is_pro` to `true`
on that same user's own next ordinary status check.

**Verified live against `edora-staging` before concluding this was
actually exploitable, not just theoretical**: attempted exactly that
insert as the seeded E2E test user via a direct REST call. It failed with
`42501 permission denied for table subscriptions` — not an RLS
rejection, a **table-level GRANT** rejection. `information_schema.
role_table_grants` confirms `authenticated`/`anon` have zero grants on
this table at all (only the `postgres` role does); Postgres checks
grants before RLS is ever evaluated, so this specific policy was
currently inert for those roles, not a live hole.

**Fixed anyway** (`20260816_subscriptions_rls_hardening.sql`): replaced
`sub_own` with a SELECT-only policy for the row's owner, with no INSERT/
UPDATE/DELETE policy for anon/authenticated at all. Relying on "the
grants happen to also block it" as the only thing standing between a
student and free Pro access is fragile — a future, unrelated
`GRANT INSERT/UPDATE ON subscriptions TO authenticated` (e.g. to let a
user edit some display field added to this table later) would silently
reactivate the bypass with no RLS-side warning. Re-verified live after
the fix: the same insert attempt still fails (grants unchanged, as
expected), and a SELECT attempt also correctly returns 403 (no grant for
SELECT either — nothing in the app does direct client reads of this
table today; all reads go through the edge function's service-role
client). All real mutations happen exclusively through
`novo-subscription`'s service-role client, unaffected by this policy
change.

### 2. Client/webhook race on the same payment produced a false "CRITICAL" alert and a raw 500 to the paying user (fixed)

Every successful Razorpay checkout triggers **two** independent attempts
to record the same payment: the client calls `verify_payment` right after
its own checkout callback resolves, and Razorpay's servers fire the
`payment.captured` webhook almost immediately, independently. Both paths
insert into `subscriptions` keyed on the same `razorpay_payment_id`
(correctly UNIQUE-constrained at the DB level — verified via
`pg_constraint`). Whichever loses the race hits that unique constraint
(Postgres error `23505`) — which is not a failure, it's confirmation the
*other* path already recorded the exact same payment.

Before this fix, both sides mishandled that expected case as a genuine
error:
- **`verify_payment`** returned a raw `subErr.message` (a Postgres
  constraint-violation string) as a 500 to the paying client, even though
  their payment had actually succeeded via the webhook moments earlier —
  a real, confusing "did I get charged?" moment for a paying student.
- **The webhook's `payment.captured` handler** logged it as `CRITICAL`
  and called `captureException`, sending a false-positive alert to
  Sentry/Slack on completely ordinary, expected traffic — exactly the
  kind of noise that trains a team to ignore payment alerts, undermining
  the real alerting Phase 9 built.

**Fixed**: both paths now check for Postgres code `23505` specifically.
On that code, they re-fetch the row the other path already committed and
return/continue with the same success shape as the existing
already-processed case, instead of treating it as an error. Genuinely
unexpected DB errors (any other code) still alert and still return an
error — only the specific, expected, benign race is now handled as
success.

### 3. No automated reconciliation exists (not done — real gap, stated honestly)

`get_status`'s self-heal only runs when a specific user happens to open
the app and call it — it can't catch drift for a user who churned and
never returns, or a webhook that silently failed for a user who also
never manually re-checks their status. Searched for any cron/monitoring
job touching `subscriptions` or `profiles.is_pro`: **none exists.** A
periodic job cross-checking RevenueCat's/Razorpay's own subscriber lists
against this app's `is_pro` state — the actual "reconciliation" the
mandate's Phase 10 acceptance criteria calls for — was not built this
pass. This is the single largest remaining gap.

### 4. Webhook signature comparisons are not constant-time (not fixed — noted, low severity)

Both the Razorpay webhook (`expectedSig !== webhookSignature`) and the
RevenueCat webhook (`rcAuthHeader === \`Bearer ${rcSecret}\``) use plain
string equality rather than a constant-time comparison. In principle this
leaks timing information about how many leading characters of the secret
match, but exploiting a timing side-channel over the network against a
Supabase edge function (with its own scheduling/network jitter) to
recover a 32+ character HMAC secret is a very high-effort, low-probability
attack path. Noted rather than fixed this pass — a real hardening
opportunity, not a live risk on par with findings 1–2.

## What was NOT re-verified this phase

- **RevenueCat webhook event handling** (`INITIAL_PURCHASE`, `RENEWAL`,
  `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`,
  `TRANSFER`) — read and reasoned about, not independently re-tested this
  pass. The `INITIAL_PURCHASE`/`RENEWAL` path's `upsert(...,
  { onConflict: 'user_id,store' })` is naturally idempotent against
  RevenueCat's own redelivery, which is the property that matters most
  for RISK-012's "webhook idempotency" concern.
- **A live-fire test of an actual Razorpay/RevenueCat webhook call** —
  would require real payment provider credentials configured on a
  non-production project, which doesn't exist (`edora-staging` has no
  Razorpay/RevenueCat keys — this project's staging bootstrap focused on
  schema/RLS, not payment provider integration). The RLS fix was verified
  live against staging directly (finding 1); the race-condition fix
  (finding 2) was verified by code review and reasoning about the two
  code paths, not a live-fired concurrent-webhook test.

## Verdict

RISK-012 is **partially resolved**: the two concrete bugs found this
pass are fixed and one was live-verified. The mandate's actual
verification method — "automated test forcing a duplicate webhook and
confirming no double-grant" — was not built as an automated test; it was
verified by code review of the idempotency guard (the `existing` /
`existingSub` pre-checks plus the UNIQUE constraint) rather than a
running test that forces the race and asserts the outcome. Reconciliation
(finding 3) remains genuinely open.
