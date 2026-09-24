#!/usr/bin/env bash
# Gate 2 (4.1.0 staging environment): one-time bootstrap of the staging
# Supabase project's schema from this repo's local migration files.
#
# WHY THIS IS A SCRIPT, NOT SOMETHING THE ASSISTANT RAN DIRECTLY: applying
# ~176 local migration files (~1MB of SQL) individually through the
# Supabase MCP's apply_migration tool would mean piping that entire volume
# through the assistant's conversation context just to move bytes from disk
# to the database -- a real cost with no benefit. The CLI's `db push` does
# the same job directly, file-to-database, with no intermediate context
# cost. It needs the staging project's database password, which the
# assistant deliberately did not try to obtain (Supabase's Management API
# does not expose it, by design -- the only real way to get it is the
# dashboard, a human action).
#
# Run this once against a fresh staging project. Safe to re-run: `supabase
# db push` only applies migrations not already recorded in the target
# database's migration history table.
set -euo pipefail

STAGING_PROJECT_REF="uldgosisjidydqstabvl"   # edora-staging, ap-northeast-2, free tier

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "SUPABASE_DB_PASSWORD is not set." >&2
  echo "Get the staging project's database password from:" >&2
  echo "  https://supabase.com/dashboard/project/${STAGING_PROJECT_REF}/settings/database" >&2
  echo "(Settings -> Database -> Reset database password if you don't have it saved.)" >&2
  echo "Then re-run: SUPABASE_DB_PASSWORD='...' ./scripts/bootstrap-staging-db.sh" >&2
  exit 1
fi

echo "Linking to staging project ${STAGING_PROJECT_REF}..."
supabase link --project-ref "$STAGING_PROJECT_REF"

echo "Pushing local migrations (supabase/migrations/*.sql) to staging..."
supabase db push

echo "Done. Re-link to production before running any other supabase CLI commands:"
echo "  supabase link --project-ref mlkzabspcwfockbmkmzl"
