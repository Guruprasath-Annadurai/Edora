# Backup & Recovery

Status: **stopgap in place, verified working**. Last verified 2026-08-04.

## Current truth

This project's Supabase organization (`bzckylamvakrvatmupby`) is on the
**Free plan**. Per Supabase's own documentation (`Database Backups`,
supabase.com/docs/guides/platform/backups, fetched live during this work —
not recalled from memory):

> We automatically back up all Pro, Team, and Enterprise Plan projects on a
> daily basis... We recommend that free tier plan projects regularly export
> their data using the Supabase CLI `db dump` command and maintain off-site
> backups.

**Free plan projects get no managed backups of any kind — no daily backups,
no Point-in-Time Recovery.** Before this work, this project had *zero*
backup mechanism: no cron dump, no manual export process, nothing. Confirmed
by searching the repo for any backup-related script or migration before
building the one described below — there was none.

This matters because the project has real user data: 37 profiles, 84 tutor
chat sessions, and several hundred other rows across ~180 tables as of
2026-08-04 (confirmed via `list_tables`). A bad migration, an accidental
bulk `DELETE`, or a bug in the account-deletion edge function had no
recovery path whatsoever.

## What was built

`supabase/functions/db-backup-export` — a cron-triggered edge function that:

1. Enumerates every table in the `public` schema via `get_public_table_names()`
   (a `SECURITY DEFINER` SQL function, so the list can't silently go stale as
   tables are added).
2. Dumps every row of every table to JSON.
3. Gzips the payload and uploads it to a private Storage bucket (`db-backups`,
   RLS-restricted to `service_role` only).
4. Prunes backups older than 30 days.

Scheduled via `pg_cron` at 03:00 UTC daily (`db-backup-export-daily`).

### Verified, not assumed

This was tested live against the production database on 2026-08-04, not
just deployed and trusted:

- First attempt used the same `current_setting('app.supabase_url')` auth
  pattern as an older migration in this repo. **It failed on every run** —
  those settings are not actually configured at the database level here
  (confirmed via `pg_db_role_setting`). Found by testing, not by reading the
  migration file and assuming it worked — see
  `20260804162711_fix_db_backup_export_cron_broken_current_setting.sql`.
- Second issue: `net.http_post`'s default 5-second timeout was too short —
  dumping ~180 tables via sequential PostgREST calls took longer than that
  to *respond*, even though the backup itself completed successfully. The
  cron log said "Timeout of 5000 ms reached" while a real backup file was
  sitting in storage. Fixed by raising `timeout_milliseconds` to 30000 — see
  `20260804163106_fix_db_backup_export_cron_timeout.sql`.
- Final confirmed run: HTTP 200, `{"ok":true,"tables_backed_up":174,"total_rows":3521,"compressed_bytes":408876,"failures":[]}`,
  and a corresponding `backup-2026-08-04.json.gz` object verified present in
  `storage.objects`.

## Recovery Point / Recovery Time Objective — stated honestly

- **RPO: up to 24 hours.** The backup runs once daily. Worst case, a
  disaster right before the next scheduled run loses up to a day of writes.
  This is categorically worse than Supabase Pro's Point-in-Time Recovery
  (down to ~2 minutes RPO) or even Pro's own daily backups (same RPO ceiling,
  but with a tested one-click restore UI behind it).
- **RTO: untested and manual.** There is no automated restore path. Recovery
  means downloading the `.json.gz` object from the `db-backups` bucket,
  decompressing it, and writing a script to re-insert rows per table — this
  has not been built or rehearsed. Assume this takes hours of engineering
  time under pressure, not minutes.
- **Does not cover:** Storage bucket objects (file uploads — only DB rows are
  captured), Auth users (`auth.users` is a separate schema not included in
  the public-table dump), or any schema/DDL state (a restore would need the
  target database to already have the correct schema from migrations).

## The real fix

**Upgrading the Supabase org to the Pro plan** ($25/mo base) gets:
daily backups with 7-day retention out of the box, and PITR available as a
paid add-on (~$100/mo for 7-day retention) with ~2-minute RPO and a real,
Supabase-tested restore flow. This is a billing decision for the account
owner, not something achievable through engineering work alone — the
function above is a bootstrap safety net to have *something* in place until
that decision is made, not a substitute for it.

## What's still missing

- No restore script or rehearsal — the backup exists, restoring from it does not.
- No coverage of Storage bucket files or `auth.users`.
- No alerting if a nightly backup run fails (it would currently fail silently
  unless someone checks `cron.job_run_details` or the `db-backups` bucket).
