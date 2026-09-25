# Edora V5 Infrastructure Integration Manifest

**Branch:** `infra/v5-foundation`  
**Base Commit:** `f04f09cd73dc1f2120c715f7bf6e864d569c240f`  
**Target Integration Branch:** `release/5.0.0-landmark` (Claude product branch)  
**Cost Impact:** ₹0 / $0 Additional Monthly Cost  
**Policy:** Do NOT merge automatically. Cherry-pick or merge upon review according to the sequence below.

---

## 1. Commit Integration Table

| Order | Commit SHA | Domain & Summary | Migrations Included? | Potential Conflict with Claude | Recommended Timing |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **1** | `154b207` | `infra: add encrypted database backup workflow and restore runbook` | None | None (isolated workflow + docs + script) | Immediate |
| **2** | `4c74703` | `infra: add environment and secret validation CI guard` | None | None (new `infra-guards.yml` workflow) | Immediate |
| **3** | `014ba25` | `infra: add schema reference CI guard and generator` | None | Low (schema guard flags unmigrated tables) | Immediate |
| **4** | `c895e6a` | `test: add k6 capacity load testing harness and safety guards` | None | None (isolated in `load-tests/`) | Immediate |
| **5** | `67cea19` | `test: add chaos and failure injection testing harness and runbook` | None | None (isolated in `tests/chaos/`) | Immediate |
| **6** | `c81e17d` | `ops: add zero-cost observability views and runbook` | **Yes (1 View Migration)** | None (safe `CREATE OR REPLACE VIEW`) | Review before DB push |
| **7** | `1667e77` | `ops: add bundle and performance measurement tooling` | None | None (isolated in `scripts/perf/`) | Immediate |
| **8** | `dffb11f` | `ops: add support diagnostic foundation and opaque identifier utility` | None | None (isolated utility script) | Immediate |
| **9** | `0dedebe` | `ops: add infrastructure operational incident runbooks and rollback procedures` | None | None (markdown runbooks only) | Immediate |
| **10**| `5e7fc2f` | `docs: add vendor dependency boundaries and infrastructure integration manifest` | None | None (documentation only) | Immediate |

---

## 2. Commit Details & Verification Instructions

### Commit 1: `154b207`
* **Files:**
  - `.github/workflows/db-backup.yml`
  - `docs/runbooks/DATABASE_BACKUP_RESTORE.md`
  - `scripts/infra/verify_backup_restore.sh`
* **Required Secrets:**
  - `SUPABASE_DB_SESSION_URL` (Direct port 5432 connection URI)
  - `BACKUP_ENCRYPTION_KEY` (AES-256 symmetric passphrase)
* **Verification:**
  - Run `./scripts/infra/verify_backup_restore.sh <sample.sql.gz.gpg>`.

### Commit 2: `4c74703`
* **Files:**
  - `.github/workflows/infra-guards.yml`
  - `docs/runbooks/ENVIRONMENT_MANIFEST.md`
  - `scripts/infra/check_secrets_and_env.sh`
  - `scripts/infra/check_secrets_and_env.test.sh`
* **Verification:**
  - Run `./scripts/infra/check_secrets_and_env.test.sh`.

### Commit 3: `014ba25`
* **Files:**
  - `scripts/schema/check_schema_references.js`
  - `scripts/schema/check_schema_references.test.js`
  - `scripts/schema/generate_schema_manifest.js`
  - `scripts/schema/schema-exceptions.json`
  - `scripts/schema/schema-manifest.json`
  - `.github/workflows/infra-guards.yml`
* **Verification:**
  - Run `node scripts/schema/check_schema_references.test.js`.

### Commit 4: `c895e6a`
* **Files:**
  - `docs/runbooks/LOAD_TESTING.md`
  - `load-tests/common/config.js`
  - `load-tests/run.sh`
  - `load-tests/01-auth-smoke.js` through `08-offline-reconnect-storm.js`
* **Verification:**
  - Execute `./load-tests/run.sh 01-auth-smoke.js p50`. Verify safety abort on production URLs.

### Commit 5: `67cea19`
* **Files:**
  - `docs/runbooks/CHAOS_TESTING.md`
  - `tests/chaos/chaos-server.js`
  - `tests/chaos/failure-scenarios.test.js`
  - `tests/chaos/run-chaos-tests.sh`
* **Verification:**
  - Run `./tests/chaos/run-chaos-tests.sh`.

### Commit 6: `c81e17d`
* **Files:**
  - `docs/runbooks/OBSERVABILITY_FOUNDATION.md`
  - `supabase/migrations/20260925150000_infra_observability_views.sql`
* **Migration Rule:**
  - Adds 4 read-only views (`v_ai_gateway_hourly_metrics`, `v_ai_provider_fallback_summary`, `v_quiz_session_health`, `v_database_table_sizes`).
  - Deploy to staging first via `supabase db push`. Do NOT deploy directly to production without prior review.

### Commit 7: `1667e77`
* **Files:**
  - `docs/runbooks/PERFORMANCE_MEASUREMENT.md`
  - `scripts/perf/measure_android.sh`
  - `scripts/perf/measure_bundle.js`
* **Verification:**
  - Run `npm run build && node scripts/perf/measure_bundle.js`.

### Commit 8: `dffb11f`
* **Files:**
  - `docs/runbooks/SUPPORT_DIAGNOSTICS.md`
  - `scripts/infra/support_identifier.js`
  - `scripts/infra/support_identifier.test.js`
* **Required Secrets:**
  - `SUPPORT_HMAC_KEY` (Server-side HMAC secret key)
* **Verification:**
  - Run `node scripts/infra/support_identifier.test.js`.

### Commit 9: `0dedebe`
* **Files:**
  - `docs/runbooks/INCIDENT_*.md` (7 runbooks)
  - `docs/runbooks/ROLLBACK_PROCEDURES.md`

---

## 3. Cherry-Pick Command Line Sequence (For Founder / Claude Integration)

```bash
# In the product working directory (on release/5.0.0-landmark):
git fetch origin infra/v5-foundation

# Clean cherry-pick of all infrastructure foundation commits:
git cherry-pick 154b207 4c74703 014ba25 c895e6a 67cea19 c81e17d 1667e77 dffb11f 0dedebe 5e7fc2f
```
