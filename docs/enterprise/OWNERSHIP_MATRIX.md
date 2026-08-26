# Edora — Ownership Matrix

**Status:** Phase 0 draft. **Requires confirmation by the accountable individual before it is treated as binding.**

## A note on "ownership" at this company's actual size

This is a single-founder-operated product (Guruprasath Annadurai, founder — named here because he is the only real, identified accountable individual associated with this codebase; not assumed, not fabricated). Assigning 15 different "owners" to 15 different named people would be fiction. The honest structure for a company this size is:

- **One accountable individual (Guruprasath Annadurai) is Accountable (A) for every row below**, because there is currently no one else.
- Where an AI engineering assistant (this Claude Code session/workflow) performs the Responsible (R) work under his direction, that is noted explicitly — **an AI assistant cannot be an Accountable party**; accountability always resolves to the founder.
- This concentration is itself a first-class risk and is recorded as such in `RISK_REGISTER.md` (RISK-001) — a bus-factor of one across every critical system is not an acceptable long-term enterprise state, but it is the true current state, and the mandate's own rule is to record actual accountable roles rather than write "unassigned."
- As real hires or contractors join (a security reviewer, a second engineer, a support contact, an academic content reviewer), this document must be updated with their actual names — not roles held open indefinitely.

## RACI legend

R = Responsible (does the work) · A = Accountable (answerable for the outcome, signs off) · C = Consulted · I = Informed

## Ownership table

| Area | Accountable (A) | Responsible (R) | Consulted (C) | Informed (I) | Notes |
|---|---|---|---|---|---|
| Release management | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No named release manager distinct from the founder exists yet (Phase 3 gap). |
| Mobile app (Android) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No iOS release owner — iOS project is scaffolded (`ios/App`) but not built/tested in CI. |
| Mobile app (iOS) | Guruprasath Annadurai | **Unstaffed** | — | — | iOS has no active build pipeline, no CI job, no verified release path. Flagged as a real gap, not assigned fictitiously. |
| Backend (Supabase Postgres + Auth + Storage + Realtime) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | |
| Database security / RLS | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | Phase 1 will produce the full per-function audit; ~39 of 41 flagged functions are still unreviewed individually as of Phase 0. |
| AI (Novo, Gemini/Groq/NVIDIA integration) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No AI gateway, no prompt versioning, no golden eval sets — see Phase 7/8. |
| Security (app + infra) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No independent/external security reviewer exists. Self-review only — recorded as a limitation, not hidden. |
| Privacy / DPDP compliance | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No named Data Protection Officer or equivalent. |
| Subscriptions (RevenueCat, Razorpay, Play Billing) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No entitlement-reconciliation job, no billing audit trail yet (Phase 10). |
| Academic content (question banks, syllabus accuracy) | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | No independent academic reviewer distinct from the founder. 185 CAT questions were inserted directly to production with zero PR/review trail (Phase 12 gap). |
| Support (user-facing) | Guruprasath Annadurai | Guruprasath Annadurai | — | — | Only channel is a general `support@edora.app` mailbox. No categories, SLAs, or escalation path exist (Phase 14). |
| Institution accounts | Guruprasath Annadurai | Guruprasath Annadurai | — | — | One live institution customer exists. No documented onboarding/offboarding process. |
| Incident command | Guruprasath Annadurai | Guruprasath Annadurai | — | — | No on-call rotation, no paging, no incident-commander role distinct from the founder — see `docs/incident-response.md`, which states this plainly. |
| Backup and recovery | Guruprasath Annadurai | Guruprasath Annadurai + AI engineering assistant | — | — | Daily snapshot exists (stopgap). No restore drill has been performed as of Phase 0. Supabase org is on the Free tier — no vendor PITR. |
| Observability | Guruprasath Annadurai | **Unstaffed** | — | — | No dashboards, no alert routing to a person exist yet (Phase 9). |
| Compliance communication (regulators, Play Console policy, users) | Guruprasath Annadurai | Guruprasath Annadurai | — | — | No legal/PR escalation contact exists — the incident runbook flags this explicitly rather than fabricating a contact. |

## What this document does NOT claim

- It does not claim a security team, an SRE team, a support team, or a content review board exist. They do not.
- It does not claim the founder has capacity to genuinely execute all 16 rows to enterprise standard simultaneously — that capacity gap is itself the top entry in the risk register.
- It will be treated as stale and re-verified, not assumed correct, at the start of every future phase.

**Last updated:** Phase 0 baseline. **Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
