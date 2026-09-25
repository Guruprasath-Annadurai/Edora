# Incident Runbook: Mass Sync & Reconnection Storm

**Classification:** Operational Incident Response  
**Applies to:** Offline Queue Synchronization (`syncQueue.ts`) and High-Concurrency Bursts  

---

## 1. Detection
* **Symptom:** Sudden spike in PostgREST write requests and database CPU following a widespread network restoration event or exam release.
* **Telemetry:** Sudden jump in active connections and PostgREST request rates $> 150\text{ req/sec}$.

## 2. User Impact
* Sync queue flushes may encounter intermittent 429 or 503 HTTP status codes.

## 3. What Should Fail Gracefully
* The client `syncQueue` implementation must apply randomized exponential backoff:
  $$t_{\text{wait}} = \min(60000,\; 2^{\text{retry}} \times 1000 + \text{random}(0, 1000))$$
* Payloads remain safe in local IndexedDB / persistent sandbox. No user progress or quiz answer is dropped.

## 4. What Feature Flag Can Be Used
* Jitter and batch size limits can be tuned in sync queue configuration.

## 5. What Must NOT Be Changed
* **DO NOT** flush or purge the client's pending offline sync queue.
* **DO NOT** disable request authentication.

## 6. Recovery Procedure
1. Monitor PostgreSQL pooler queues.
2. If connection starvation occurs, temporarily throttle non-critical read analytics endpoints.
3. Allow the client-side jittered backoff to naturally disperse the queue over 3–5 minutes.

## 7. Evidence Proving Recovery
* In-flight connection count settles back into single digits.
* Client `syncQueue` length across active devices drops to 0.
