# Controlled Release and 10,000-User Rollout Plan

Phase 15 of the enterprise remediation mandate (Critical). Last verified
2026-08-07.

## What this document is, and isn't

This is the actual staged-rollout runbook — Play Console percentages,
dwell times, gating metrics, and halt triggers — that
`docs/rollback-procedure.md` already flagged as missing ("No documented
staged-rollout percentage policy for Android releases"). Writing it is
real Phase 15 work regardless of whether the app is ready to execute it
today.

**It is not a record of a rollout that happened, and it is not
authorization to start one.** Nothing in this pass changed any Play
Console rollout percentage, and nothing here should be read as "ready to
ship." The gate-status table below is the honest answer to "are we ready"
— as of this writing, no.

## Gate status: every dependency phase, checked against its own tracker row

Phase 15's own tracker row lists its dependency as "Phases 1–14." Copying
each dependency phase's actual current status from
`ENTERPRISE_REMEDIATION_TRACKER.md` rather than re-summarizing from
memory:

| Phase | Status | Blocks go-live because |
|---|---|---|
| 1 (Security) | PARTIALLY COMPLETE | RISK-025 (parent-relationship modeling) and RISK-034 (function/view privilege hardening) still open |
| 2 (Backup/recovery) | PARTIALLY COMPLETE | Full-scale write-path restore drill (RISK-003) still untested — only a dry-run reconciliation was done |
| 3 (CI/CD, release governance) | PARTIALLY COMPLETE | No automated deploy pipeline exists for web or Android; live-CI verification of toolchain pinning not yet observed |
| 4 (Authenticated E2E) | PARTIALLY COMPLETE | 5 flows covered, not the full authenticated surface; CI job for the staging suite not yet observed green in a real run |
| 5 (Mock exam integrity) | PARTIALLY COMPLETE | No dedicated E2E interruption-recovery test automated yet (verified manually this pass) |
| 6 (Offline sync) | PARTIALLY COMPLETE | `topic_perf`/`flashcard_review` idempotency not independently audited; no live interrupted-flush E2E test |
| 7 (AI gateway) | PARTIALLY COMPLETE | Only 1 of ~39 direct-provider-call functions migrated — the other 38, including the highest-traffic `gemini-chat`, have no kill switch or cost ceiling |
| 8 (AI academic quality) | PARTIALLY COMPLETE | (pre-existing status, not re-audited this pass) |
| 9 (Observability) | PARTIALLY COMPLETE | (pre-existing status, not re-audited this pass) |
| 10 (Payments/entitlement) | PARTIALLY COMPLETE | No automated reconciliation cron; the mandate's specified duplicate-webhook automated test doesn't exist |
| 11 (Load/scale testing) | PARTIALLY COMPLETE | Only a 20-VU smoke test has been run — **the actual safe concurrent-user ceiling for 10,000 users is unknown** |
| 12 (Content governance) | PARTIALLY COMPLETE | (pre-existing status, not re-audited this pass) |
| 13 (Mobile UI/IA) | PARTIALLY COMPLETE | (pre-existing status, not re-audited this pass) |
| 14 (Governance/support) | PARTIALLY COMPLETE | (pre-existing status, not re-audited this pass) |

**Every single dependency phase is PARTIALLY COMPLETE. None is VERIFIED
COMPLETE.** Phase 15 cannot honestly claim readiness to begin an actual
rollout today. That is the primary finding of this pass, not a gap to
paper over with a plan that implies otherwise.

Two gaps carry disproportionate weight for a 10,000-user rollout
specifically:
- **Phase 11**: there is no evidence-based answer to "what concurrent
  load can this system actually sustain." Rolling out to any meaningful
  percentage of a 10,000-user base without that answer means the first
  real signal of a capacity problem would be the rollout itself.
- **Phase 7**: 38 of 39 AI-calling functions have no kill switch. If one
  of those runs away under real growth (a viral moment, a school
  onboarding all at once), there is no coordinated way to stop the spend
  or degrade gracefully — the exact RISK-006 scenario the gateway exists
  to prevent, on paths it doesn't cover yet.

## The rollout plan itself (ready to execute once gates clear)

### Stages

Named A→E to match the tracker's own "4.1.0 stages A→E" language.

| Stage | Play Console rollout % | Minimum dwell time | Approximate reach (at 10,000 total users) |
|---|---|---|---|
| A | 5% | 48h | ~500 users |
| B | 10% | 48h | ~1,000 users |
| C | 25% | 72h | ~2,500 users |
| D | 50% | 72h | ~5,000 users |
| E | 100% | — | 10,000 users |

Rationale for the percentages and dwell times: `rollback-procedure.md`
already establishes that Play Store has no downgrade path — halting a
rollout stops it from reaching *more* devices but does not revert
devices that already updated. That makes the **percentage at each
stage**, not "rollback," the real safety control, so stages start small
(5%) and dwell long enough (48–72h) to surface delayed-onset issues
(a bug that only manifests after a day of real usage, a billing-cycle
edge case, a cron job that only runs once a day) before exposing more
users. Stage C/D get longer dwell time specifically because they're where
a real capacity problem (Phase 11's open question) would first become
visible at meaningful concurrent load.

### Gating metrics — checked before advancing to the next stage

Every metric below already has a real data source in this app today; none
of this requires new instrumentation.

| Metric | Threshold to advance | Data source |
|---|---|---|
| Crash-free session rate | ≥ 99.5% | Sentry / Crashlytics (native SDK — see completed task "Add native crash reporting") |
| ANR rate (Android) | < 0.5% | Play Console vitals (native, no app-side wiring needed) |
| Edge function error rate | < 1% per function, 24h window | `admin-console`'s `get_observability` action → `edge_function_errors` table (built Phase 9-adjacent work) |
| AI gateway blocked/error rate | 0 unexpected `blocked_cost_ceiling` events; error rate < 2% | `admin-console`'s `get_ai_gateway_status` action → `ai_gateway_requests` table (Phase 7) — **only covers `ai-question-gen` until more functions are migrated; this metric is incomplete by construction until Phase 7's migration tracker shows more coverage** |
| Payment success rate | ≥ 98% of `create_order` → `verify_payment`/webhook completions | `subscriptions` table status distribution (Phase 10) |
| DB connection headroom | Peak concurrent connections < 70% of `max_connections` | `get_connection_stats()` RPC (used in Phase 11's smoke test and the observability tab) |
| Support ticket volume | No unexplained spike vs. the pre-rollout baseline | Whatever support channel Phase 14 established |

**Any threshold breach halts the rollout at the current stage** (Play
Console → Release → Production → active release → "Halt rollout", per
`rollback-procedure.md`) and triggers root-cause investigation before
either resuming at the same percentage or shipping a fix forward. Do not
advance to the next stage on a breach, and do not treat "halt" as
equivalent to "safe" — devices that already updated keep the bad build
until a forward-fix ships.

### Pre-flight checklist (before Stage A can start)

- [ ] All PARTIALLY COMPLETE dependency phases above have a documented,
      accepted reason for shipping anyway (an explicit founder risk
      acceptance, not silence) — or are moved to VERIFIED COMPLETE first.
- [ ] Phase 11's actual mandate-scale load test (100/500/1,000/3,000
      staged) has been run against a suitable environment — not the
      20-VU smoke test this pass produced — and the results support the
      target user count.
- [ ] Phase 7's AI gateway kill switch covers at least the highest-
      traffic AI surfaces (`gemini-chat` at minimum), not just
      `ai-question-gen`.
- [ ] A real dry run of `firebase hosting:rollback` (web) has been
      performed at least once, per `rollback-procedure.md`'s own open
      item.
- [ ] Someone is explicitly on call and watching the gating metrics
      dashboard live during Stage A and B's dwell windows — staged
      rollout without active monitoring is just a slower uncontrolled
      rollout.
- [ ] Founder has explicitly authorized starting Stage A. This plan
      existing is not that authorization.

## What this pass did not do, and will not do without being asked

- Did not change any Play Console rollout percentage.
- Did not query production for the real current registered/active user
  count (the tracker's own P15-0 row flags this as deferred to avoid
  scope creep in what was meant to stay a docs-only phase — a database
  query against production user data is a reasonable next step, but a
  separate, explicit one).
- Did not attempt to resolve any of the 12 PARTIALLY COMPLETE dependency
  phases further as part of this pass — each already has its own
  phase-specific report documenting exactly what's open.
