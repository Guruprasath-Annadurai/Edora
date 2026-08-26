# Phase 14 — Support Operations, Institution Lifecycle & Review Cadence

**Scope note (same caveat as Phases 3.3/9):** self-scoped from an earlier summary in this session ("pure documentation — you decide the SLA numbers, I write the doc"), not from the mandate's literal Phase 14 text, which was never pasted into this conversation.

**A structural honesty note before the content below:** per `docs/incident-response-runbook.md`'s own established pattern in this repo, SLA numbers, escalation ownership, and business commitments are marked **[PROPOSED — needs founder sign-off]** rather than asserted as settled policy. An AI session can draft realistic defaults grounded in the actual constraints (single founder, no support team, no on-call rotation — see `OWNERSHIP_MATRIX.md`), but it cannot make a business commitment on your behalf. Treat everything below as a draft to approve, adjust, or reject — not as something already in force.

---

## 1. Support categories

Today, per `docs/security/ROLE_PERMISSION_MATRIX.md`'s own finding: there is exactly one support channel, `support@edora.app` (plus `dpo@edora.app` for DPDP grievances specifically), referenced in the Privacy Policy and Terms of Service. No categories, no triage, no SLA, no escalation path, and no support-staff role exists anywhere in the schema — confirmed by that same document ("no support-staff account type, no 'support can view user X's data' access path in the database at all").

Proposed categories, derived from the actual features and failure modes this codebase has (not invented generically):

| Category | Examples | Where it currently surfaces in-app |
|---|---|---|
| **Account & billing** | Payment failed but not activated, subscription cancellation, refund request | `NovoSubscriptionPage` / Razorpay checkout flow |
| **Data rights (DPDP)** | Export request, deletion request, parental consent question | `DataRightsPage`, already has a dedicated `dpo@edora.app` path |
| **Academic content accuracy** | Wrong answer, unclear explanation, factually incorrect AI response | `ReportButton` component (already wired to `question_reports` across 9+ AI surfaces per this session's earlier work) — this is the one category with an existing structured intake, not just email |
| **Technical / bug reports** | App crash, feature not working, sync issue | `DiagnosticsPage`'s "Copy for support" button — produces a structured build-info blob, but still has to be manually pasted into an email; no in-app ticket submission exists |
| **Institution/school admin** | Bulk student onboarding issues, join-code problems, principal dashboard access | `SchoolAdminPage`, `AdminConsolePage` |
| **Account security** | Suspected unauthorized access (explicitly named in `TermsOfServicePage.tsx`'s own copy: "Notify us immediately at support@edora.app if you suspect unauthorized access") | No dedicated flow — falls into general email today |

## 2. Proposed SLAs **[PROPOSED — needs founder sign-off]**

Grounded in the real constraint that support is currently one person (the founder) with no dedicated support hours, not a generic "enterprise SaaS" template:

| Category | Proposed first-response target | Reasoning |
|---|---|---|
| Account security (suspected unauthorized access) | Same day (best-effort within business hours, India time) | Highest urgency category; still can't promise 24/7 with a single-person team — stating that honestly rather than a hollow "1 hour" promise |
| Data rights / DPDP grievance | 3 business days | DPDP Act itself sets statutory grievance-redressal expectations; this should be checked against actual legal requirements before finalizing, not just picked arbitrarily |
| Academic content accuracy | 5 business days for acknowledgment; no fix-time SLA (depends entirely on whether it needs a content correction, which varies in effort) | Matches the existing `report-wrong-answer` reactive-only posture already documented honestly in `RISK_REGISTER.md` (RISK-007) |
| Account & billing | 2 business days | Money-related, but rarely time-critical in the way security issues are |
| Technical/bug reports | 5 business days acknowledgment; no fix SLA | Consistent with a single-developer reality — committing to fix timelines for arbitrary bugs isn't realistic to promise |
| Institution/school admin | 2 business days | B2B relationships generally warrant faster response than individual B2C tickets |

**What this deliberately does NOT include:** a 24/7 or sub-hour SLA for any category, an on-call rotation, or a dedicated support ticketing system (Zendesk/Intercom/etc.) — none of that exists today, and promising it in a document doesn't make it real. If any of that is wanted, it's a separate build/subscription decision, not something this documentation pass can manifest.

## 3. Institution (B2B2C) lifecycle

Derived directly from the actual `institutions` table schema (`supabase/migrations/20260729_b2b2c_institution.sql`), not invented:

**States that exist in the schema today:**
- `tier`: `free` (≤50 students) → `starter` (₹999/mo, ≤200 students) → `pro` (₹4999/mo, unlimited) → `enterprise` (pricing not encoded — presumably negotiated)
- `is_verified`: boolean, defaults `false` — a manual verification gate exists in the schema, but **no documented process for who verifies a new institution, on what criteria, or how** was found anywhere in the codebase or docs. This is a real gap, not filled in here with an invented process — flagged as an open question below.
- `join_code` / `join_link_token`: generated at creation, used for bulk student self-enrollment
- `admin_user_id`: the one account with full RLS access to the institution row (`ON DELETE RESTRICT` — deleting that admin's account is blocked at the DB level while they remain the institution's sole admin, which is itself worth knowing operationally: an institution admin cannot currently delete their own account without first transferring or removing the institution)

**Proposed lifecycle stages** (mapping the mandate's ask onto what actually exists, not a generic SaaS lifecycle template):

1. **Signup** — institution admin creates account, `institutions` row created with `tier='free'`, `is_verified=false`
2. **Verification** — **[OPEN QUESTION, not a decision this session can make]**: what makes an institution "verified"? A phone call? A document upload? Nothing in the schema or codebase implements a verification workflow — `is_verified` is a flag with no code path that ever sets it to `true` found in this repo. This needs a founder decision on process before it can be documented as a real lifecycle stage rather than an aspirational one.
3. **Active** — students join via `join_code`/QR link, `student_count` increments via trigger, admin uses `SchoolAdminPage`/principal analytics
4. **Tier change** — upgrade/downgrade between free/starter/pro; no in-app self-service billing flow was found for this specifically (student subscription billing via Razorpay/RevenueCat exists; institution-tier billing does not appear to have an equivalent implemented flow — worth confirming, not asserted definitively here since institution billing wasn't in this session's audit scope)
5. **Offboarding/churn** — no explicit "institution deletion" or "data export for departing institution" flow was found distinct from the general `export-user-data`/`delete-account` functions, which operate per-user, not per-institution. Whether an institution admin leaving means the institution and all its student associations should be handled specially is another open question, not resolved here.

## 4. Recurring review cadence

`RISK_REGISTER.md`'s own existing text already anticipated this: *"No recurring review cadence currently exists (this is itself Phase 14 work)."* Proposed cadence **[PROPOSED — needs founder sign-off]**:

| Review | Frequency | What it covers |
|---|---|---|
| Risk register re-read | Start of every phase (already the working method established this session — not new) | Re-verify open risks haven't silently worsened |
| Dependency security (`npm audit`) | Monthly | `DEPENDENCY_SECURITY.md`'s exceptions table already has per-package review dates; this formalizes checking all of them together |
| Secret rotation check | Per `SECRET_ROTATION_POLICY.md`'s existing tiered cadence (90/180 days) | Already documented in Phase 1.5 — this section just confirms it's the same cadence, not a new one |
| Support ticket volume/category review | Monthly, once categories in §1 are actually in use | Catches a category needing its own dedicated flow (e.g., if academic-content reports spike, that's a signal for Phase 8's golden-eval-set work, not just a support load problem) |
| Full risk register + tracker audit | Quarterly | Catches risks that were "ACCEPTED TEMPORARY" drifting into "actually still a problem 6 months later" |

## What this phase does NOT do

- Does not implement any of the proposed SLAs as enforced code (no ticketing system, no SLA-timer automation) — this is a policy document, not a feature build.
- Does not resolve the institution-verification-process open question — correctly left as a founder decision, not guessed at.
- Does not confirm whether institution-tier billing has a self-service flow — flagged as unconfirmed rather than asserted either way, since it was outside this session's actual audit scope.
- Does not create a support-staff database role — per `ROLE_PERMISSION_MATRIX.md`'s finding, there's currently no one but the founder to assign such a role to anyway.

**Status: Phase 14 — PARTIALLY COMPLETE.** Support categories and a realistic (not aspirational) SLA draft are proposed for sign-off. Institution lifecycle is documented against the actual schema, with two genuine open questions (verification process, tier-billing self-service) surfaced rather than invented. Review cadence proposed, consistent with cadences already established in earlier phases.

**Branch:** `enterprise/phase-14-support-governance`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
