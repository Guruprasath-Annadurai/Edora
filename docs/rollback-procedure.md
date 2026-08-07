# Rollback Procedure

Status: **new, unrehearsed**. This documents the actual tooling available in this
project as of 2026-08-04 — it has not yet been dry-run end-to-end. Treat the steps
as the best current plan, not a proven-safe drill.

There is currently **no automated deploy pipeline** for the web app or Android app
in this repo (`.github/workflows/` has `ci.yml` — build verification only — and
`deploy-privacy-policy.yml`, which deploys nothing but the standalone privacy
policy page). Both the main web app and the Android app are deployed **manually**.
That is itself a gap (mandate §16, CI/CD governance) — this doc describes rollback
under that reality, not under a pipeline that doesn't exist yet.

## 1. Web app (Firebase Hosting, site `edora-bb02e`)

Firebase Hosting keeps a history of every release and supports rolling back
without a rebuild:

```bash
firebase hosting:releases:list --site edora-bb02e
firebase hosting:rollback --site edora-bb02e
```

`hosting:rollback` re-points the live channel at the immediately prior release.
To go back further than one step, use `hosting:clone` to explicitly promote an
older release hash to the live channel (get the hash from `releases:list`).

This is real Firebase behavior (release history + rollback are core Hosting
features), not something built for this project — but it has not been exercised
against this specific site, so the first real use of it should be treated as a
verification step, not an assumed-safe operation.

## 2. Android app (Play Store)

**Play Store does not support downgrading a release.** Google Play rejects any
upload with a `versionCode` lower than or equal to what's already live — there is
no "restore the previous APK" button. The two real levers are:

- **Halt a staged rollout in progress**: Play Console → Release → Production →
  the active release → "Halt rollout". This stops the bad build from reaching
  more devices but does **not** revert devices that already updated.
- **Ship a fix forward**: bump `versionCode` in `android/app/build.gradle`
  (currently `52`, `versionName "4.0.0"`), fix the issue, and release a new
  build. This is the only way to actually get a fix onto already-updated devices.

Given this constraint, **staged rollout percentage is the real safety control**,
not rollback — a bad Android release should always start at a low rollout
percentage (e.g. 10-20%) specifically so "halt" is still meaningful when a
problem is caught early. There is no evidence in this repo that staged rollout
percentages are currently being used deliberately; this should be confirmed with
whoever runs the actual Play Console release.

## 3. Database (Supabase migrations)

Migrations in `supabase/migrations/` are forward-only — there are no paired
`down` migrations in this project. Reverting a bad migration means either:

- Writing and applying a new migration that undoes the specific change (safest —
  preserves history, works even if data was written under the new schema since), or
- Restoring from a backup (see [`docs/backup-recovery.md`](./backup-recovery.md))
  if the migration caused data loss that a corrective migration can't undo — this
  loses everything written since the backup was taken, so it's a last resort, not
  a first response.

For RLS policy or function changes specifically, the safest rollback is almost
always a new migration that `DROP`s/`CREATE OR REPLACE`s back to the prior
definition — check `supabase/migrations/` git history for the prior version's
exact SQL rather than guessing at it.

## 4. Edge functions

Each `deploy_edge_function` call creates a new numbered version
(`db-backup-export` is currently at `version: 1`, for example) — Supabase does
not currently expose a one-command "redeploy previous version" through the
tooling used in this repo. Rollback means re-deploying the last-known-good
source, which requires that source to still be available — i.e. **the actual
safety net here is git history of `supabase/functions/`, not a Supabase-native
rollback feature.** Always deploy edge function changes from a committed state,
never from uncommitted local edits, so `git show <sha>:path/to/function` can
always recover a prior version.

## What's still missing

- No dry run of `firebase hosting:rollback` has been performed against this project.
- ~~No documented staged-rollout percentage policy for Android releases.~~
  **Addressed**: `docs/enterprise/CONTROLLED_ROLLOUT_PLAN.md` (Phase 15 of the
  enterprise remediation mandate) defines the actual stages, dwell times, and
  gating metrics. It has not been executed — every phase it depends on is
  still only partially complete, per that document's own gate-status table.
- No automated deploy pipeline, so "rollback" for both platforms is a manual,
  human-triggered action with no CI guardrail preventing a bad release from going
  out at 100% in the first place.
