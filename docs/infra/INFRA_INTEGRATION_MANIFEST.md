# Edora V5 Infrastructure Integration Manifest

**Branch:** `infra/v5-foundation`  
**Base Commit:** `f04f09cd73dc1f2120c715f7bf6e864d569c240f`  
**Target Integration Branch:** `release/5.0.0-landmark` (Claude product branch)  
**Cost Impact:** ₹0 / $0 Additional Monthly Cost  
**Policy:** Do NOT merge automatically. Cherry-pick or merge upon review according to the sequences and classifications below.

---

## 1. Commit Classification Table

| Order | Commit SHA | Domain & Summary | Classification | Migration? | Dependencies / Notes |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **1** | `154b207` | `infra: add encrypted database backup workflow and restore runbook` | **SAFE TO INTEGRATE NOW** | None | Requires GitHub secrets `SUPABASE_DB_SESSION_URL` and `BACKUP_ENCRYPTION_KEY` before scheduled execution |
| **2** | `4c74703` | `infra: add environment and secret validation CI guard` | **SAFE TO INTEGRATE NOW** | None | Adds new standalone workflow `.github/workflows/infra-guards.yml` |
| **3** | `014ba25` | `infra: add schema reference CI guard and generator` | **SAFE TO INTEGRATE NOW** | None | Generates and checks `schema-manifest.json` against client code |
| **4** | `c895e6a` | `test: add k6 capacity load testing harness and safety guards` | **SAFE TO INTEGRATE NOW (STAGING ONLY)** | None | Hard safety guard blocks execution against production URLs |
| **5** | `67cea19` | `test: add chaos and failure injection testing harness and runbook` | **SAFE TO INTEGRATE NOW** | None | Isolated Node.js mock server; zero impact on live cloud providers |
| **6** | `c81e17d` | `ops: add zero-cost observability views and runbook` | **DEFERRED MIGRATION (STAGING FIRST)** | **Yes** | 4 read-only views; deploy to staging first, review before prod |
| **7** | `1667e77` | `ops: add bundle and performance measurement tooling` | **SAFE TO INTEGRATE NOW** | None | Tooling in `scripts/perf/` |
| **8** | `dffb11f` | `ops: add support diagnostic foundation and opaque identifier utility` | **SAFE TO INTEGRATE NOW (RPC V5.1)** | None | Opaque ID utility ready; stored procedure `get_support_diagnostics()` is **V5.1** |
| **9** | `0dedebe` | `ops: add infrastructure operational incident runbooks and rollback procedures` | **SAFE TO INTEGRATE NOW** | None | Markdown documentation only |
| **10**| `23ddf3f` | `docs: add vendor dependency boundaries and infrastructure integration manifest` | **SAFE TO INTEGRATE NOW** | None | Vendor boundaries architecture and integration contract |
| **11**| `7fdbcec` | `infra: harden backup secret handling and secondary durability status` | **SAFE TO INTEGRATE NOW** | None | Uses `passphrase-fd 3` (no ps aux exposure) and durability check |
| **12**| `68c511e` | `infra: harden secret scanner with global pattern checks and no-echo policy` | **SAFE TO INTEGRATE NOW** | None | Scans all files (docs/tests included); never echoes matched secrets |
| **13**| `5bba12b` | `infra: harden schema guard to use manifest source of truth for score_pct` | **SAFE TO INTEGRATE NOW / CLAUDE DAY 1** | None | Manifest is source of truth; permits score_pct when migration adds it |
| **14**| `9620ba1` | `ops: harden observability views access with explicit role revocations` | **DEFERRED MIGRATION (STAGING FIRST)** | **Yes** | Explicitly REVOKES view access from `anon`, `authenticated`, `PUBLIC` |
| **15**| `27f126d` | `docs: finalize infrastructure integration manifest and hardening pass` | **SAFE TO INTEGRATE NOW** | None | Hardening pass documentation and verification |
| **16**| *(Current HEAD)* | `infra: fix schema guard multiline parsing, separate migration sequence, and update backup durability status` | **SAFE TO INTEGRATE NOW** | None | Multiline AST-lite mutation validation, backup wording freeze, clean integration sequences |

---

## 2. Commit Details & Integration Contracts

### Group 1: Backup & Disaster Recovery Foundation
* **Commits:** `154b207`, `7fdbcec`
* **Status:** `BACKUP FOUNDATION: READY; DURABLE OFFSITE COPY: MANUAL / NOT YET AUTOMATED`
* **Files:**
  - `.github/workflows/db-backup.yml`
  - `docs/runbooks/DATABASE_BACKUP_RESTORE.md`
  - `scripts/infra/verify_backup_restore.sh`
* **Operational Note:**
  - The workflow creates an encrypted AES-256 archive stored as a 7-day GitHub artifact.
  - To establish durable DR without paid vendors, the founder must execute the manual cold-storage download routine detailed in `docs/runbooks/DATABASE_BACKUP_RESTORE.md`.

### Group 2: Secret & Environment Guards
* **Commits:** `4c74703`, `68c511e`
* **Files:**
  - `.github/workflows/infra-guards.yml`
  - `docs/runbooks/ENVIRONMENT_MANIFEST.md`
  - `scripts/infra/check_secrets_and_env.sh`
  - `scripts/infra/check_secrets_and_env.test.sh`
* **Operational Note:**
  - High-confidence patterns (`gsk_`, `sk-ant-`, `AIzaSy`, `sk_live_`, credential-bearing Postgres URIs) are scanned across ALL repository files including docs and tests.
  - CI logs report file and secret type only; secret values are never printed.

### Group 3: Database Schema Reference Guard (F17 Defense)
* **Commits:** `014ba25`, `5bba12b`, *(Current HEAD)*
* **Files:**
  - `scripts/schema/check_schema_references.js`
  - `scripts/schema/check_schema_references.test.js`
  - `scripts/schema/generate_schema_manifest.js`
  - `scripts/schema/schema-exceptions.json`
  - `scripts/schema/schema-manifest.json`
  - `docs/runbooks/SCHEMA_REFERENCE_GUARD.md`
* **Operational Note:**
  - `schema-manifest.json` is the sole source of truth.
  - In CI, `generate_schema_manifest.js --check-stale` ensures the manifest never drifts silently from migrations.
  - Multiline chained mutations (`.from('table').insert({...})`, `.update({...})`, `.upsert({...})`) are parsed with top-level key balancing so nested JSONB structures are not misidentified as table columns.
  - The guard follows migrations dynamically; Claude's held migration `20260926_quiz_sessions_score_pct.HELD.sql` correctly causes `score_pct` references to fail until formally migrated.

### Group 4: Capacity & Chaos Test Harnesses
* **Commits:** `c895e6a`, `67cea19`
* **Files:**
  - `load-tests/` (8 k6 scenarios + runner + safety guards)
  - `tests/chaos/` (mock server + 7 failure scenarios + runner)
  - `docs/runbooks/LOAD_TESTING.md`
  - `docs/runbooks/CHAOS_TESTING.md`
* **Operational Note:**
  - Load testing production is strictly prohibited by default. Tests must run against staging or local instances only.

### Group 5: Zero-Cost Observability Views (Deferred Migration)
* **Commits:** `c81e17d`, `9620ba1`
* **Classification:** **DEFERRED MIGRATION (STAGING FIRST)**
* **Files:**
  - `supabase/migrations/20260925150000_infra_observability_views.sql`
  - `scripts/infra/verify_observability_permissions.sql`
  - `scripts/infra/verify_observability_permissions.test.js`
  - `docs/runbooks/OBSERVABILITY_FOUNDATION.md`
* **Operational Note:**
  - All 4 views are explicitly sealed: `REVOKE ALL ON ... FROM PUBLIC, anon, authenticated;`.
  - Accessible only to administrative operator roles (`service_role`, `postgres`).
  - Do NOT deploy to production without first validating in staging using `scripts/infra/verify_observability_permissions.sql`.
  - Held out of initial product cherry-pick to prevent unintended `supabase db push` execution alongside Day-1 product migrations.

### Group 6: Performance Measurement & Support Diagnostics
* **Commits:** `1667e77`, `dffb11f`, `0dedebe`, `23ddf3f`, `27f126d`
* **Files:**
  - `docs/infra/VENDOR_BOUNDARIES.md`
  - `docs/infra/INFRA_INTEGRATION_MANIFEST.md`
  - `scripts/perf/measure_bundle.js`
  - `scripts/perf/measure_android.sh`
  - `scripts/infra/support_identifier.js`
  - `scripts/infra/support_identifier.test.js`
  - `docs/runbooks/PERFORMANCE_MEASUREMENT.md`
  - `docs/runbooks/SUPPORT_DIAGNOSTICS.md`
  - `docs/runbooks/INCIDENT_*.md` (7 runbooks)
  - `docs/runbooks/ROLLBACK_PROCEDURES.md`
* **Operational Note:**
  - The stored procedure `get_support_diagnostics()` remains classified as **V5.1** until staff role RBAC hardening is completed.

---

## 3. Integration Sequences

### Sequence A: SAFE NON-MIGRATION INTEGRATION NOW (Recommended)
This sequence contains **ZERO database migrations**. It safely delivers all CI guards, test harnesses, runbooks, performance tools, and vendor boundary documentation to Claude's product branch without risking any unintended database changes during `supabase db push`.

```bash
# In the product repository (/Users/ag/edora on release/5.0.0-landmark):
git fetch origin infra/v5-foundation

# Cherry-pick all non-migration infrastructure commits in chronological order:
git cherry-pick 154b207 4c74703 014ba25 c895e6a 67cea19 1667e77 dffb11f 0dedebe 23ddf3f 7fdbcec 68c511e 5bba12b 27f126d origin/infra/v5-foundation
```

### Sequence B: DEFERRED MIGRATION INTEGRATION (Staging First)
Integrate ONLY when a Supabase staging project is available, or when the founder explicitly approves direct reviewed production deployment.

```bash
# In the product repository (/Users/ag/edora on release/5.0.0-landmark):
git fetch origin infra/v5-foundation

# Cherry-pick observability views migration and access control hardening:
git cherry-pick c81e17d 9620ba1
```

### Sequence C: FULL INTEGRATION SEQUENCE (For Later / Complete Integration)
Contains every commit in chronological order from `f04f09c..infra/v5-foundation`:

```bash
# In the product repository (/Users/ag/edora on release/5.0.0-landmark):
git fetch origin infra/v5-foundation

# Cherry-pick complete infrastructure sequence:
git cherry-pick 154b207 4c74703 014ba25 c895e6a 67cea19 c81e17d 1667e77 dffb11f 0dedebe 23ddf3f 7fdbcec 68c511e 5bba12b 9620ba1 27f126d origin/infra/v5-foundation
```
