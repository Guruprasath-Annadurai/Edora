# Rollback Procedures Runbook

**Classification:** Standard Operating Procedure  
**Applies to:** Web Frontend, Android Mobile Releases, Edge Functions, and Database  

---

## 1. Web Frontend Rollback
* **Platform:** Vercel / Cloudflare Pages / Static Hosting.
* **Mechanism:** Instant deployment rollback via hosting dashboard or CLI:
  ```bash
  # Example Vercel instant rollback
  vercel rollback [DEPLOYMENT_ID]
  ```
* **RTO:** $< 1$ minute. Zero build step required.

---

## 2. Supabase Edge Functions Rollback
* **Mechanism:** Re-deploy the previously tagged stable commit from Git:
  ```bash
  git checkout <LAST_KNOWN_STABLE_TAG_OR_SHA>
  npx supabase functions deploy <function-name> --no-verify-jwt
  ```
* **RTO:** $< 2$ minutes.

---

## 3. Database Schema & Data Rollback
* **Pre-Deployment Invariant:** Every non-trivial migration must have an associated encrypted backup taken via `.github/workflows/db-backup.yml` before execution.
* **Small Backward-Compatible DDL:** Run compensating down-migration script.
* **Corrupt State / Destructive Failure:** Follow `docs/runbooks/DATABASE_BACKUP_RESTORE.md` to restore verified pre-incident logical snapshot.

---

## 4. Android Native APK / Google Play Rollback
* **Constraint:** Google Play Console does not support instant binary rollbacks once an update is released to production tracks.
* **Procedure:**
  1. Halt staged rollout immediately in Google Play Console (`Release > Halt Rollout`).
  2. If 100% rolled out: create emergency hotfix commit with incremented `versionCode` (e.g. versionCode 54), build release AAB, and promote to Production track with high priority.
  3. Feature flags / remote configuration can immediately disable the broken feature without waiting for Google Play review.
