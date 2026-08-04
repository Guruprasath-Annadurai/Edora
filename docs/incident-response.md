# Incident Response Runbook

Status: **first version, unrehearsed**. Last verified 2026-08-05.

This did not exist before this pass. It references the actual tooling built
this remediation session — not a fictional on-call system, paging service,
or incident-commander rotation. Where no real capability exists, that's
stated explicitly rather than described as if it did.

## What actually exists today

- **Detection**: `monitoring-check` (Supabase edge function, hourly cron)
  posts to `MONITORING_SLACK_WEBHOOK` on rate-limit hammering, admin-audit
  silence, edge-function error spikes, and DB connection pressure. Sentry
  (`@sentry/capacitor` + `@sentry/react`) captures crashes client- and
  server-side. PostHog captures product analytics, not incidents.
- **No on-call rotation, no paging (PagerDuty/Opsgenie), no status page.**
  The single Slack channel `monitoring-check` posts to is the entire
  alerting surface. If nobody is watching that channel, nobody gets paged.
- **No incident-commander role or defined escalation chain.** Whoever sees
  the alert (or a user report) is the de facto responder.

## Severity levels

Kept simple — three levels, not a 5-tier matrix nobody will remember mid-incident:

- **SEV1 — data loss, security breach, or the app is down for all users.**
  Real user data at risk, or nobody can use the app at all.
- **SEV2 — a feature is broken or degraded for a meaningful subset of users**, but the app is otherwise usable and no data is at risk.
- **SEV3 — cosmetic, low-impact, or affects a tiny number of users.** Fix on the normal work queue.

## Playbooks by incident type

### 1. Data loss or corruption (bad migration, accidental DELETE, buggy edge function)

1. **Stop the bleeding first** — if a specific function/migration is actively
   causing damage, that's a rollback situation (§2 below), do it first.
2. Assess scope: which tables, how many rows, since when.
3. Recovery options, in order of preference:
   - **Corrective migration** — if the bad state can be fixed forward (e.g.
     `UPDATE` back to a known-good value), write and apply one. Preserves
     everything written since, safest option.
   - **Restore from backup** — `docs/backup-recovery.md` /
     `db-backup-restore` edge function. **Read that doc's RPO/RTO section
     first**: backups run once daily (RPO up to 24h), and restoring is
     merge-only (upsert on primary key, never deletes) — it will not undo
     rows that were correctly inserted after the backup was taken, only
     bring back rows that are missing or were overwritten incorrectly.
     Always `dry_run: true` first.
4. If the loss involved real user data (not just test/seed content), this
   is a DPDP-relevant event — see `docs/backup-recovery.md` and the privacy
   policy's data-handling commitments for what's owed to affected users.
   No template exists yet for actually notifying them; that's a gap.

### 2. Bad deploy (web, Android, or an edge function)

Follow `docs/rollback-procedure.md` directly — it covers Firebase Hosting
rollback, why Android can't be rolled back (only halted + fixed forward),
forward-only DB migrations, and why edge-function rollback means
redeploying from git history, not a Supabase-native feature.

### 3. Leaked or compromised secret

1. Confirm what leaked and where — `docs/secrets-inventory.md` has the
   full list of what each secret gates.
2. If it's a genuinely sensitive server-side secret (an AI provider key, the
   Razorpay/RevenueCat keys, `OAUTH_TOKEN_ENCRYPTION_KEY`, `EVAL_SECRET`,
   `CRON_SECRET`): rotate it at the provider/`supabase secrets set`
   immediately. Any edge function reading it via `Deno.env.get()` picks up
   the new value on its next cold start — no redeploy needed.
2a. If it's `OAUTH_TOKEN_ENCRYPTION_KEY` specifically: rotating it means
   every already-encrypted token in `classroom_connections` becomes
   undecryptable (the key changed). `token-crypto.ts`'s plaintext-fallback
   design means old rows won't crash reads, but affected users will need to
   reconnect Google Classroom. Not a reason to avoid rotating a truly
   compromised key — just know the blast radius before you do it.
3. If it's a `VITE_*` client-side var: these are meant to be public (see
   `docs/secrets-inventory.md`) — this scenario shouldn't apply unless a
   real secret was mistakenly given a `VITE_` prefix. If that happens,
   rotating the underlying credential is still required even after the
   code is fixed, since the old value already shipped to every user who
   loaded the app.
4. Check git history for the exposure (`gitleaks git --log-opts="--all"`,
   installed via `brew install gitleaks` this session, not a standing CI
   check yet — see `docs/secrets-inventory.md`'s "what's not done" section).

### 4. Third-party provider outage (Gemini, Groq, Supabase itself, Razorpay)

- **Gemini/Groq**: `gemini-chat` already has provider fallback logic (per
  the app's own architecture — Groq is used for fast inference, Gemini for
  primary reasoning); a single provider outage is a degraded-service
  scenario (SEV2), not full downtime, if the fallback path is healthy. Not
  verified working end-to-end this pass — flagged, not tested.
- **Supabase outage**: no fallback exists. The entire app depends on one
  Supabase project with no read-replica or secondary region configured.
  This is a real single point of failure, not something fixable by a
  runbook — it's an infrastructure gap (see the mandate's broader §16-45
  items, e.g. read replicas, which remain NOT STARTED).
- **Razorpay/RevenueCat outage**: payments/subscription checks fail; no
  documented fallback behavior (e.g. does the app fail open or closed on a
  subscription check timeout?) — not verified this pass, flagged as an
  open question.

### 5. Unauthorized access / privilege escalation discovered

This pass's own RBAC audit (`docs/enterprise-remediation-tracker.md` §9)
found and fixed two real examples of this exact category — worth reading
as reference for what "found and fixed" looks like here:

1. Confirm the actual exposure — read the function/policy, don't trust a
   linter label alone (the security advisor flags 41+ functions as
   "authenticated-executable"; most are fine, two were not).
2. Check `admin_action_audit` and `edge_function_errors` for evidence of
   whether the hole was actually exploited, not just theoretically exploitable.
3. Fix the authorization gap (see the `increment_xp` and `record_battle_tie`
   fixes this pass for the pattern: add the missing check, verify live with
   a real auth simulation before considering it done — never claim a fix
   works from code review alone).
4. If real exploitation is confirmed (not just theoretical exposure), this
   becomes a data-integrity incident too — see §1 above for whether
   affected records need correcting.

## Communication

**No status page, no user-facing incident communication channel exists.**
For a SEV1 affecting real users, the honest current answer is: there is no
built mechanism to tell them anything is wrong beyond what they experience
directly in the app. This is a real gap for the mandate's broader
"enterprise readiness" bar, not something this runbook can paper over.

## Postmortem

No template or enforced process exists. Recommended minimum for a SEV1/SEV2
until a real one is built: what happened, when it was detected vs. when it
started (the gap is often the real finding), root cause, what fixed it,
and one concrete follow-up action with an owner — not a generic "we'll be
more careful" line.

## What's explicitly NOT in this runbook

- On-call rotation / paging service
- Incident commander role definition
- Status page or user notification mechanism
- Legal/PR escalation contacts (would require naming real people — not
  something to fabricate)
- A tested, rehearsed drill of any playbook above — everything here is the
  best current plan based on what was built and verified this session, not
  proven under real incident conditions
