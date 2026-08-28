# Edora — Ordered Sequence to Close 10,000-User Readiness Gaps

Written 2026-08-28, in direct response to the founder's question: "what is
pending for honestly calling it an enterprise-level production-ready app to
onboard 10k+ users." Synthesized from this mandate's own live documents
(`RISK_REGISTER.md`, `LOAD_TESTING_REPORT.md`, `CONTROLLED_ROLLOUT_PLAN.md`,
`ENTERPRISE_REMEDIATION_TRACKER.md`, `EDORA_4_1_0_FULL_APP_READINESS_AUDIT.md`)
rather than re-assessed from scratch — those documents remain the source of
truth for underlying evidence; this document only orders the remaining work.

**This is a sequence, not a schedule.** No dates are estimated because no
prior phase in this mandate has reliably predicted its own duration. Each
stage names what blocks it and who acts.

## Stage 0 — Founder-only decisions (nothing structural proceeds without these)

These require money, hiring, or a risk-acceptance call only the founder can
make. Engineering work in later stages is either blocked by these or
produces work that gets thrown away if these land differently than assumed.

| # | Decision | Why it blocks everything | Reference |
|---|---|---|---|
| 0.1 | **Upgrade Supabase to a paid plan (Pro or higher)** | Production's 60-connection ceiling is a hard platform limit, not a code problem. No amount of application-level work makes 10,000 concurrent users fit in 60 connections. This is the single highest-leverage decision in this entire document — everything in Stage 2 depends on it. | RISK-002, RISK-011, `LOAD_TESTING_REPORT.md` |
| 0.2 | **Decide on a second technical reviewer/hire** | RISK-001 (bus factor) is rated Critical and has no engineering fix — it's a staffing decision. An "enterprise-level" claim is hard to sustain with a single point of failure across security, backend, AI, mobile, support, and incident response. | RISK-001, `OWNERSHIP_MATRIX.md` |
| 0.3 | **Decide the path for 233/555 unreviewed PYQ content rows** (CAT/BOARDS/UPSC) | Three options are already laid out: commission a real review pass, bulk-accept as reviewed, or knowingly accept the risk. Whichever is chosen determines whether Stage 3 needs a content-review workflow built at all. | RISK-032, `RISK032_CONTENT_REVIEW_WORKFLOW.md` |

**Nothing below this line should be treated as "next" until at least 0.1 is
decided** — everything downstream either depends on it directly or risks
being rebuilt once the real connection ceiling is known.

## Stage 1 — Infrastructure validation (gated on 0.1)

| # | Task | Depends on |
|---|---|---|
| 1.1 | Re-run load testing at real concurrency once the Pro-tier connection ceiling is known — get an actual safe concurrent-user number, not a guess | 0.1 |
| 1.2 | Set up and test point-in-time recovery (unlocked by Pro tier) — run a full write-path restore drill, not just the dry-run reconciliation done so far | 0.1 |
| 1.3 | Re-measure per-request connection overhead app-wide (each edge function holds its own `serviceDb` connection) — identify pooling opportunities now that the ceiling is real, not theoretical | 0.1 |

## Stage 2 — AI cost exposure (I execute directly, no founder input needed beyond ongoing awareness)

Ordered by the same priority `AI_GATEWAY_MIGRATION.md` already recommends —
cron-triggered functions first (no human in the loop to catch runaway
spend), then content-generation functions, then everything else:

| # | Task | Status |
|---|---|---|
| 2.1 | Migrate cron-triggered functions (`novo-cron-proactive`, `novo-morning-brief`) to the gateway | Not started |
| 2.2 | Migrate remaining content-generation functions feeding the review queue (`roadmap-generator`, `study-pack-generator`, `revision-planner`, `lesson-planner`) | Not started |
| 2.3 | Migrate the remaining ~30 direct-call functions | Not started |
| 2.4 | Decide (with founder) whether to activate `AI_CHAT_PROVIDER=claude` on `gemini-chat` after real-traffic verification | Built, dormant, awaiting first real test |

Current state: 2 of ~39 functions fully migrated, 1 partial (`gemini-chat`,
this session's work).

## Stage 3 — Content and quality debt (partially gated on 0.3)

| # | Task | Depends on |
|---|---|---|
| 3.1 | Execute whichever path Stage 0.3 chose for the 233 unreviewed PYQ rows | 0.3 |
| 3.2 | Extend automated test coverage to the ~49 of ~70 edge functions with zero coverage, prioritized: auth-adjacent → payment-adjacent → AI-content-adjacent → the rest | None |
| 3.3 | Build an authenticated E2E test suite (login, chat, mock-exam flows) — currently zero coverage exists for any authenticated flow | None |

## Stage 4 — Operational readiness

| # | Task | Depends on |
|---|---|---|
| 4.1 | Fire every configured alert once, live, and confirm it reaches a human — no alert in the current setup has ever actually been tested end-to-end | None |
| 4.2 | Name an on-call owner beyond the founder for at least the highest-severity alert classes | 0.2 (needs a second person to exist) |
| 4.3 | Automate payment/webhook-duplicate reconciliation (currently manual/reactive only) | None |

## Stage 5 — Release process maturity

| # | Task | Depends on |
|---|---|---|
| 5.1 | Build an automated deploy pipeline for web and Android (none exists today) | None |
| 5.2 | Run one real staged rollout as a dry run (Play Console percentage ramp, per `CONTROLLED_ROLLOUT_PLAN.md`) before committing to full traffic — validates the runbook itself works, not just that it's written | 1.1, 5.1 |

## Stage 6 — Final gate

| # | Task | Depends on |
|---|---|---|
| 6.1 | Re-run a full readiness audit with live credentials and device access (the 2026-08-06 audit's own P0-1 blocker — no test credentials existed at the time) | Stages 0–5 |
| 6.2 | Confirm every phase in `ENTERPRISE_REMEDIATION_TRACKER.md` moves from PARTIALLY COMPLETE to VERIFIED COMPLETE | 6.1 |
| 6.3 | Green-light Stage A of the rollout per `CONTROLLED_ROLLOUT_PLAN.md` | 6.2 |

## What genuinely does NOT need to wait

Stage 2 (AI gateway migration) and parts of Stage 3 (test coverage) have no
dependency on Stage 0's decisions — I can keep executing those now, in the
background of whatever the founder decides on infrastructure/staffing/content
review. That's the honest "what's actually unblocked today" answer.
