# Incident Runbook: Failed Database Migration

**Classification:** Operational Incident Response  
**Applies to:** Supabase Database Migrations (`supabase/migrations/`)  

---

## 1. Detection
* **Symptom:** Migration deployment step in CI/CD fails with SQL error, or post-deploy client calls fail with `relation does not exist` or `column does not exist`.
* **Telemetry:** CI pipeline failure log; schema guard failure; spike in Sentry errors with code `42P01` (undefined table) or `42703` (undefined column).

## 2. User Impact
* Specific app flows relying on the new schema fail to load or error out on submit.

## 3. What Should Fail Gracefully
* Older client versions continue reading backward-compatible fields.

## 4. What Feature Flag Can Be Used
* Revert the feature gate in client configuration that activates the new UI feature.

## 5. What Must NOT Be Changed
* **DO NOT** delete the failed migration file from git history on already-deployed branches without creating a compensating forward migration.
* **DO NOT** execute unreviewed destructive DDL (`DROP TABLE`, `DROP COLUMN`) directly in production SQL editor without a verified snapshot.

## 6. Recovery Procedure
1. Verify database state using `supabase db status` or SQL editor.
2. If migration failed halfway and was NOT wrapped in a transaction:
   - Identify the exact SQL statement that failed.
   - If clean rollback is feasible, run the explicit compensating down-migration script (e.g. `DROP TABLE IF EXISTS ...`, `ALTER TABLE ... DROP COLUMN IF EXISTS ...`).
   - If data corruption or partial state exists: restore the latest verified pre-migration snapshot created before the deployment.
3. Fix the syntax/constraint error in the migration file.
4. Run `node scripts/schema/generate_schema_manifest.js` and `node scripts/schema/check_schema_references.js` to re-verify schema references.

## 7. Evidence Proving Recovery
* `check_schema_references.js` passes with 0 errors.
* Client queries to the affected table return 200 without PostgreSQL schema exceptions.
