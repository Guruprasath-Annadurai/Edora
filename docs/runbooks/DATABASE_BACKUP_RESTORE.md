# Database Backup & Restore Runbook

**Classification:** Operational Runbook  
**Applies to:** Edora PostgreSQL Database (Supabase Managed Engine)  
**Budget Cost:** ₹0 / $0 (Uses GitHub Actions Compute, GPG AES-256, Artifact Archival)  
**Last Updated:** V5 Infrastructure Baseline (`f04f09c`)

---

## 1. Objectives & Metrics

* **RPO (Recovery Point Objective):** $\le 24$ hours (daily automated logical snapshot at 03:00 UTC).
* **RTO (Recovery Time Objective):** $\le 30$ minutes (decryption, schema rebuild, and restore into staging/recovery database).
* **Encryption Standard:** AES-256 symmetric cipher via GnuPG.
* **Storage Invariant:** Plaintext database dumps must **never** touch persistent unencrypted storage or Git history.

---

## 2. Backup Architecture & Flow

```
[Supabase PostgreSQL] (Port 5432 Direct / Session Mode)
          │
          │ (pg_dump stream over TLS)
          ▼
 [GitHub Actions Runner]
          │
          ├──> gzip -9
          │
          └──> gpg --symmetric --cipher-algo AES256 (BACKUP_ENCRYPTION_KEY)
                    │
                    ▼
          [Encrypted Artifact: edora_backup_YYYYMMDD.sql.gz.gpg]
                    │
                    ▼
          [GitHub Artifact Store (7-day retention)]
                    │
                    ▼ (Optional Founder Mirror)
          [Offline / Cold Storage Sync]
```

### Secrets Configuration (GitHub Actions)
* `SUPABASE_DB_SESSION_URL`: Direct connection URI (e.g., `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?sslmode=require`).
  * **CRITICAL:** Port MUST be `5432` (Direct/Session). **NEVER** use port `6543` (Supavisor Transaction Pooler). Transaction pooling forbids session-level locks and transaction-spanning cursors required by `pg_dump`.
* `BACKUP_ENCRYPTION_KEY`: High-entropy symmetric passphrase ($\ge 64$ characters).

---

## 3. Automated Backup Procedure

The workflow `.github/workflows/db-backup.yml` executes:
1. Daily at `03:00 UTC` automatically.
2. Manually on-demand via GitHub Actions `workflow_dispatch` before major migrations or deployments.

---

## 4. Disaster Recovery & Restore Procedure

> [!CAUTION]
> **NEVER RESTORE DIRECTLY OVER A FUNCTIONING PRODUCTION DATABASE.**  
> Always restore to an isolated target instance (local Docker PostgreSQL or a dedicated staging database) first to verify schema and data integrity.

### Step 4.1: Download and Decrypt
1. Download the encrypted artifact `edora_backup_<TIMESTAMP>.sql.gz.gpg` from GitHub Actions artifacts.
2. Obtain the `BACKUP_ENCRYPTION_KEY` from secure vault.
3. Decrypt and decompress into a local pipe or test database:

```bash
# Decrypt and decompress to local verification database
gpg --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" edora_backup_20260925_030000Z.sql.gz.gpg \
  | gzip -d \
  | psql "postgresql://postgres:password@localhost:5432/edora_recovery"
```

### Step 4.2: Automated Non-Destructive Integrity Drill
Use the verification utility:
```bash
./scripts/infra/verify_backup_restore.sh ./edora_backup_20260925_030000Z.sql.gz.gpg
```

This utility decrypts in-memory / FIFO and validates SQL syntax without loading into production.

---

## 5. Monthly Recovery Drill Schedule

On the **first calendar day of each month**:
1. Download the latest automated backup artifact from GitHub.
2. Execute the verification drill against a fresh local Docker container:
   ```bash
   docker run --name edora-restore-test -e POSTGRES_PASSWORD=test -p 54329:5432 -d postgres:15
   ./scripts/infra/verify_backup_restore.sh --target "postgresql://postgres:test@localhost:54329/postgres" edora_backup_*.sql.gz.gpg
   docker rm -f edora-restore-test
   ```
3. Record test success, record count in `profiles` and `user_courses`, and restore duration in the operations log.

---

## 6. Backup Durability Status & Secondary Cold Storage

```
CURRENT STATUS:
  BACKUP FOUNDATION ACTIVE
  DURABLE SECONDARY COPY NOT YET CONFIGURED
```

### Durability Analysis:
The primary workflow `.github/workflows/db-backup.yml` archives encrypted dumps in GitHub Actions storage.
* GitHub Actions artifacts have an enforced **7-day retention limit**.
* By itself, a 7-day GitHub artifact is **NOT** a durable disaster-recovery archive.
* Do NOT treat the backup system as fully durable until a secondary offline or external copy is established.

### Provider-Neutral Secondary Hook (`BACKUP_SECONDARY_DESTINATION`):
* An optional GitHub Actions secret `BACKUP_SECONDARY_DESTINATION` can be configured with an external Webhook, private rsync/SSH target, or S3-compatible cold bucket.
* If configured, the workflow dispatches the encrypted archive immediately upon creation.

### Exact Manual Zero-Cost Fallback (Weekly / Monthly):
Until an automated external target is configured, the founder or operations lead must execute the following zero-cost routine:
1. List recent backup runs via GitHub CLI:
   ```bash
   gh run list --workflow=db-backup.yml --limit 3
   ```
2. Download the latest encrypted artifact:
   ```bash
   gh run download <RUN_ID> -n edora-encrypted-backup-<RUN_ID> -D ~/edora_cold_backups/
   ```
3. Archive to founder-controlled encrypted offline storage (e.g., encrypted flash drive or secure local disk).
4. Verify non-destructive recovery using:
   ```bash
   ./scripts/infra/verify_backup_restore.sh ~/edora_cold_backups/edora_backup_*.sql.gz.gpg
   ```
* **Security Reminder:** Backup dumps must NEVER be committed to Git or pushed into repository history.
