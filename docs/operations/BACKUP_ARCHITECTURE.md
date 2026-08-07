# Backup Architecture — Phase 2.1

**Covers every category the mandate names.** Built from direct inspection this phase, not assumption — cross-references existing docs (`docs/backup-recovery.md`, `docs/rollback-procedure.md`, `docs/security/SECRET_INVENTORY.md`) rather than duplicating them, and adds the categories those docs don't cover.

## 1. Database backup

Covered in full by `docs/backup-recovery.md` (pre-mandate, re-verified this phase — see `DISASTER_RECOVERY_TEST_REPORT.md`). Summary: `db-backup-export` runs daily at 03:00 UTC, dumps every `public`-schema table to gzipped JSON in a private `db-backups` Storage bucket, prunes after 30 days. **Confirmed still running successfully as of this phase** — real backup files exist for 2026-08-04, 08-05, and 08-06 (today), ~408KB each, growing in step with real data.

## 2. Storage backup

**Not covered — a real, confirmed gap.** `db-backup-export` dumps only `public`-schema table rows. It does not touch Supabase Storage objects (files in the `avatars`, `study-pdfs`, `public-media`, or `db-backups` buckets themselves). If a user's uploaded PDF or avatar is deleted or corrupted, there is no backup to restore it from. Confirmed by reading the function's source — it only calls `get_public_table_names()` and iterates Postgres tables, never `storage.objects`.

## 3. Configuration backup

- **Environment variables / secrets**: see `docs/security/SECRET_INVENTORY.md` (Phase 1.5) — every server-side secret and client-side public var is inventoried, but **the actual secret values have no backup of any kind**. If a secret is lost (e.g. `GCP_SERVICE_ACCOUNT_JSON` deleted from the Supabase dashboard by mistake), the only recovery is regenerating it at the provider (which may not always be possible for the exact same credential — e.g. a service account key can be regenerated but with a new key ID).
- **CI/CD configuration**: `.github/workflows/*.yml` is in version control — recoverable via git history, no separate backup needed.
- **Database schema/DDL**: covered by "Migration history" below, not by the row-data backup.

## 4. Migration history

`supabase/migrations/*.sql` — **173 files, fully version-controlled in git.** This is the actual backup of schema/DDL state; `db-backup-export` explicitly does not cover this (row data only). Recovery of schema state means replaying migrations against a fresh database, in order — this has never been tested end-to-end in this project (a fresh `supabase db push` against an empty database has not been attempted this session; flagged as a gap, not silently assumed to work).

## 5. Edge Function source

**Git is the actual backup**, not a Supabase-native feature — confirmed and already documented in `docs/rollback-procedure.md` §4: each `deploy_edge_function` call creates a new numbered version, but there's no "restore previous version" tooling exposed here. Recovery means redeploying from `git show <sha>:supabase/functions/<name>/index.ts`. This depends entirely on functions always being deployed from committed source, never uncommitted local edits — worth stating as a hard rule, not just an observation.

## 6. Secrets recovery

Cross-references `docs/security/SECRET_ROTATION_POLICY.md` and `SECRET_INCIDENT_RUNBOOK.md` (Phase 1.5). Recovery of a lost (not compromised, just accidentally deleted) secret follows the same path as rotation — regenerate at the provider, `supabase secrets set`. The one secret in this inventory that is **not recoverable this way** is `OAUTH_TOKEN_ENCRYPTION_KEY` — if lost, every currently-encrypted stored OAuth token becomes permanently undecryptable (there's no "regenerate the same key" option for a symmetric encryption key; a new key doesn't unlock old ciphertext). This should have its own secure backup (e.g. a password manager entry), and confirming whether one exists requires a human with access — not verifiable from this session.

## 7. Android signing recovery — **the most severe finding in this document**

**`android/edora-release.jks` exists as a single file on one local machine, correctly gitignored (confirmed via `.gitignore`: `android/keystore.properties`, `android/*.jks`, `android/*.keystore`), with zero backup anywhere.**

This is not a hypothetical risk — the file was confirmed present at `android/edora-release.jks` (2,726 bytes, dated 2026-06-05) during this phase's inspection. Google Play **requires the same signing key for every update** to an existing app listing. If this file (and its store/key passwords, currently only in the also-gitignored `android/keystore.properties`) is lost — disk failure, accidental deletion, machine replacement without migrating the file — **the consequence is permanent and unrecoverable through any support channel**: this exact app listing (`com.edora.app`, whatever real reviews/installs/ranking it has accumulated) can never receive another update. The only fallback would be publishing an entirely new app under a new package name, losing all of that history.

**This is not something I can fix from here** — it requires a human to actually create a secure, redundant backup of the `.jks` file and its passwords (e.g., an encrypted archive in a password manager, plus ideally enrolling in **Google Play App Signing**, which has Google hold the true signing key and lets the developer's local key be a rotatable "upload key" instead — this is the actual structural fix, not just a backup, and is a one-time Play Console setting). Flagged here as the top action item for this document, not buried.

## 8. Google Play access recovery

Not verified this phase — would require confirming who has Play Console access to the `com.edora.app` listing and whether that access is itself backed by a recoverable method (e.g. a Google Workspace admin account with 2FA backup codes stored somewhere, vs. a single personal Google account with no recovery path documented). Flagged as unverified, not assumed fine.

## 9. Vercel and DNS recovery

The `edora-website` marketing site (separate repo, git-connected to Vercel) auto-deploys from GitHub — Vercel's own git integration is the de facto backup (any commit can be redeployed). DNS for `edora.study` was registered via GoDaddy per this session's earlier work — recovery of DNS records themselves would depend on GoDaddy account access, not verified this phase. The main app's web deployment (Firebase Hosting, `edora-bb02e`) is covered by `docs/rollback-procedure.md` §1 — release history exists natively, no separate backup needed.

## Summary table

| Category | Backed up? | Mechanism | Severity if lost |
|---|---|---|---|
| Database rows | Yes | `db-backup-export`, daily, 30-day retention | Up to 24h data loss (RPO) |
| Database schema/DDL | Yes (indirectly) | Git history of `supabase/migrations/` | Recoverable but replay untested |
| Storage objects (files) | **No** | None | User-uploaded files (PDFs, avatars) permanently lost if deleted/corrupted |
| Secrets (values) | **No** | Regenerate-at-provider only | Varies; `OAUTH_TOKEN_ENCRYPTION_KEY` loss is unrecoverable for existing data |
| Edge Function source | Yes | Git | Fully recoverable if always deployed from committed state |
| CI/CD config | Yes | Git | Fully recoverable |
| **Android signing keystore** | **No — single point of failure** | **None** | **Permanent, unrecoverable — cannot update the existing app listing ever again** |
| Web app deploys (Firebase) | Yes | Firebase Hosting release history | Fully recoverable, native feature |
| Marketing site deploys (Vercel) | Yes | Vercel git integration | Fully recoverable |

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
