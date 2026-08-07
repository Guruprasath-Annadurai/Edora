# Recovery Objectives (RPO/RTO) — Phase 2.3

**Stated honestly per data category, not as one blanket number.** Built on top of the existing honest RPO/RTO section in `docs/backup-recovery.md`, broken out by the mandate's specific categories.

## What limits every number below

This Supabase org is on the **Free plan** — confirmed multiple times this session (Phase 0 architecture review, and again this phase when branch creation for the restore drill failed with `"Branching is supported only on the Pro plan or above"`). Free plan has **no vendor-managed backups, no Point-in-Time Recovery (PITR)**. Every RPO/RTO figure below is bounded by the one daily `db-backup-export` snapshot — there is no better floor available without a billing decision to upgrade.

## Per-category objectives

| Data category | RPO | RTO | Notes |
|---|---|---|---|
| **User progress** (quiz sessions, mock attempts, flashcards, roadmap progress) | Up to 24h | Mechanically proven this phase (full-scale dry-run, see `DISASTER_RECOVERY_TEST_REPORT.md`), but never rehearsed as a real write under incident pressure, and restore time at full scale has not been timed | Same daily snapshot as everything else — no category gets better treatment |
| **Mock exam attempts/answers** | Up to 24h | Same as above | This is the single most user-damaging category to lose (a real exam attempt), and it has no better protection than trivial data — worth flagging as a mismatch between actual risk and actual protection level, relevant to Phase 5's mock-integrity work |
| **Subscriptions/entitlements** | Up to 24h for the row data itself, but **RevenueCat/Razorpay are the actual source of truth**, not this project's database — a lost local row can likely be reconciled from the payment provider's own records, which this project doesn't currently have an automated reconciliation job for (Phase 10 territory) | Same mechanical RTO as above, plus manual reconciliation time against the provider, untested | The real recovery path for this category isn't "restore from `db-backup-export`," it's "reconcile against RevenueCat/Razorpay" — not yet built |
| **Institution/school data** | Up to 24h | Same | Only one real institution exists currently — low current blast radius, but the mechanism doesn't scale specially for this category |
| **Novo memories** | Up to 24h | Same | The `memory_opt_out` trigger (Phase 13, pre-mandate) means an opted-out user's memories shouldn't exist to lose in the first place — a smaller relevant surface than the raw table size suggests |
| **Storage objects** (uploaded PDFs, avatars) | **No backup — RPO is effectively infinite (permanent loss) for anything deleted or corrupted between now and whenever a storage-backup mechanism is built** | N/A — nothing to restore from | See RISK-027. This is a real, uncomfortable honest number, not softened |
| **`auth.users`** (accounts, credentials, sessions) | **No backup — same as storage, effectively infinite RPO** | N/A | `db-backup-export` explicitly only covers the `public` schema; `auth` is a separate schema Supabase manages, not included. If Supabase's own infrastructure lost this (extremely unlikely, but worth stating precisely) there is no independent copy anywhere in this project's control |
| **Database schema/DDL** | N/A (schema isn't "lost" the way rows are — it's declared in git) | Untested — replaying 173 migrations against a fresh database has never been attempted end-to-end this session | Git is the real backup; the RTO risk is entirely "does replay actually work," not data loss |
| **Android signing keystore** | **No backup — effectively infinite, and unlike every other category, this loss would be immediately catastrophic and permanent (not degraded service, total loss of the ability to update the app)** | N/A | See RISK-026. This is categorically different from every data-loss scenario above — it's not data at all, it's a credential with no regeneration path |

## Critical vs. non-critical services — RTO framing the mandate asks for

- **Critical services** (auth, core app functionality, payments): currently have **no distinct RTO** from the general database RPO/RTO above — there's no faster recovery path reserved for "the important stuff." A full database incident degrades everything equally, which is itself worth naming as a gap: a mature setup would prioritize restoring auth/payments-critical tables first in a multi-hour incident, and this project's restore tooling has no such prioritization built in (`db-backup-restore` restores whatever table list you give it, but no pre-defined "critical path" ordering exists).
- **Non-critical services** (leaderboards, social features, analytics): same mechanism, same timeline, no explicit deprioritization — again, not a gap in coverage, but a gap in *not having thought about ordering* under real incident time pressure.

## The honest bottom line

Every RPO in this document is **"up to 24 hours, or infinite for two categories that have no backup mechanism at all."** Every RTO is **"mechanically proven to work this phase, but never timed at full scale and never rehearsed under real incident pressure."** This is a real, if unglamorous, improvement over the "zero backup mechanism at all" state that existed before this session's earlier work — but it is not enterprise-grade recovery, and the two zero-backup categories (storage objects, Android signing key) are real, live, unresolved risks, not theoretical gaps.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
