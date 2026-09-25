# Incident Runbook: Supabase Platform Outage

**Classification:** Operational Incident Response  
**Applies to:** Supabase PostgREST Gateway, Auth GoTrue, and Managed PostgreSQL  

---

## 1. Detection
* **Symptom:** Client HTTP requests to `https://<project-ref>.supabase.co/*` return `502 Bad Gateway`, `503 Service Unavailable`, or connection timeouts.
* **Telemetry:** Sentry alerts reporting network timeout exceptions across all tables.
* **Vendor Status:** Check `status.supabase.com`.

## 2. User Impact
* Cloud authentication, real-time sync, and online question fetches are unavailable.
* App displays "Offline Mode Active" banner.

## 3. What Should Fail Gracefully
* The mobile client switches to local offline cache (`IndexedDB` / SQLite sandbox).
* Cached curriculum, flashcards, and notes remain accessible for reading.
* Learner answers are persisted to `syncQueue` locally to prevent study progress loss.

## 4. What Feature Flag Can Be Used
* The client detects network unavailability automatically. No manual server flag required.

## 5. What Must NOT Be Changed
* **DO NOT** clear learner local storage or force user logout.
* **DO NOT** point client `VITE_SUPABASE_URL` to local or invalid IPs in production.
* **DO NOT** attempt manual PostgreSQL schema commands while Supabase management plane is degraded.

## 6. Recovery Procedure
1. Monitor `status.supabase.com` until database and API gateway are operational.
2. Verify direct connection via:
   ```bash
   curl -I "https://<project-ref>.supabase.co/auth/v1/health"
   ```
3. Mobile clients will automatically drain the offline sync queue once online connectivity resumes.

## 7. Evidence Proving Recovery
* Status code 200 returned on `/auth/v1/health`.
* Client telemetry resumes flowing into PostHog/Sentry.
* `syncQueue` successfully drains with 0 persistent 500 error drops.
