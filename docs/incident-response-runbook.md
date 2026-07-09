# Edora — Backup, Disaster Recovery & Incident Response Runbook

> Technical procedures below are accurate as of this writing. Fields marked
> **[DECISION NEEDED]** are business/organizational choices only the team can
> make — an AI session can't set an RTO/RPO target or name an on-call person.

## 1. Backup & Restore

**What backs up automatically:**
- Supabase Postgres: Point-in-Time Recovery (PITR) if enabled on the project plan, otherwise daily automated snapshots (check Dashboard → Database → Backups for current retention window).
- Edge function source: version-controlled in this git repo — redeploy from any commit via `supabase functions deploy <name>`.
- Secrets (`supabase secrets list`): **not** version-controlled by design (they're credentials). **[DECISION NEEDED]**: maintain an encrypted secrets vault (1Password, Doppler, etc.) as the source of truth so a full project loss doesn't mean re-requesting every third-party key from scratch.

**Restore procedure (data loss / corruption):**
1. Supabase Dashboard → Database → Backups → pick a restore point.
2. Restoring creates a new project or overwrites the branch — **never restore directly onto `main`/production without a fresh backup of current state first** (restore is destructive).
3. After restore, redeploy all edge functions (`supabase functions deploy` per function, or loop over `supabase/functions/*`) since function code isn't part of the DB backup.
4. Re-run `supabase db push` if any migrations post-date the restore point were only applied and not yet in a snapshot.

**What is NOT currently backed up:**
- GCS buckets used by `vertex-export`/`vertex-jobs` (Vertex AI training data) — these rely on GCS's own durability, not an Edora-controlled backup.
- BigQuery analytics tables (`novo-events`) — same, GCP-native durability only.

## 2. Failover / Redundancy

**Current state: single-region, no failover.** The Supabase project runs in one AWS/Fly region. If that region has an outage, the app is down until Supabase resolves it — Edora has no automated failover to a secondary region.

**[DECISION NEEDED]**: is multi-region worth the cost for current scale? Supabase's read-replica/multi-region features are a paid-tier upgrade decision, not a code change.

## 3. Incident Response

**Step 1 — Detect.** Sentry (already wired via `withSentry` on edge functions) is the primary signal. Check Sentry dashboard first for any incident.

**Step 2 — Triage severity:**
- **SEV1** (data loss, payment double-charge, auth bypass, mass outage): all-hands, see Step 3.
- **SEV2** (single feature broken, elevated error rate): fix on normal priority, no rollback needed.
- **SEV3** (cosmetic, isolated): backlog.

**Step 3 — Contain.**
- If a bad edge function deploy is the cause: `supabase functions deploy <name>` with the previous git commit's version — functions aren't versioned server-side, so **the previous commit in this repo is the only rollback path**. Tag releases going forward so "previous known-good" is unambiguous.
- If a bad migration is the cause: migrations are forward-only by design here (no down-migrations exist in `supabase/migrations/`). Writing a compensating migration is safer than attempting to reverse-apply.
- If a leaked secret/credential is the cause: rotate immediately via `supabase secrets set <NAME>=<new value>` — this session already established that pattern (INGEST_API_KEY, GEMINI_API_KEY, YOUTUBE_API_KEY were all rotated this way).

**Step 4 — Communicate.** **[DECISION NEEDED]**: who gets notified, and how (status page? user-facing banner? email?). No such channel exists today.

**Step 5 — Post-incident.** Write a short postmortem: what happened, root cause, what code/process change prevents recurrence. **[DECISION NEEDED]**: where postmortems live (this repo's `docs/`, Notion, etc.).

## 4. On-Call

**[DECISION NEEDED — currently undefined]:**
- Who is on-call, and on what rotation?
- What's the escalation path if the on-call person doesn't respond?
- Is there a paging tool (PagerDuty, Opsgenie) or is it just a phone call?

## 5. What this document does NOT cover

- SOC2/ISO 27001-style control attestation — that requires a paid third-party auditor over months, not a document.
- Formal RTO/RPO commitments to enterprise customers — these are contractual promises that follow from the infra decisions above, not the other way around.
