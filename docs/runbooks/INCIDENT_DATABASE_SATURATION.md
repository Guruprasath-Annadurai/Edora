# Incident Runbook: Database Connection & Resource Saturation

**Classification:** Operational Incident Response  
**Applies to:** PostgreSQL Connection Limits, CPU Spikes, and Disk Ceilings  

---

## 1. Detection
* **Symptom:** Client errors reporting `remaining connection slots are reserved for non-replication superuser connections` or statement timeouts (`57014`).
* **Telemetry:** Supabase Dashboard shows Database Connections $> 50$ (on 60-connection tier) or CPU utilization $> 90\%$.

## 2. User Impact
* Intermittent failure saving quiz scores or loading profile data.
* Elevated latency ($> 2000\text{ms}$) on PostgREST queries.

## 3. What Should Fail Gracefully
* Client exponential backoff prevents retry-stampedes.
* Failed write operations fall back to the offline retry queue (`syncQueue`).

## 4. What Feature Flag Can Be Used
* Emergency temporary read-only mode or disable heavy non-critical background jobs.

## 5. What Must NOT Be Changed
* **DO NOT** restart the database repeatedly in a loop (causes pooler chaos).
* **DO NOT** drop tables or truncate active user data.
* **DO NOT** point clients directly to port `5432` to "bypass" the pooler.

## 6. Recovery Procedure
1. Inspect active connections via Supabase SQL Editor:
   ```sql
   SELECT pid, usename, client_addr, state, query_start, query 
   FROM pg_stat_activity 
   WHERE state != 'idle' 
   ORDER BY query_start ASC;
   ```
2. Terminate long-running rogue transactions:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state != 'idle' AND now() - query_start > interval '30 seconds';
   ```
3. Check table sizes to ensure free tier storage is not exceeded:
   ```sql
   SELECT * FROM public.v_database_table_sizes LIMIT 10;
   ```

## 7. Evidence Proving Recovery
* Active connections return to baseline ($< 15$).
* CPU load settles $< 30\%$.
* Statement latency on `v_ai_gateway_hourly_metrics` and standard queries drops $< 300\text{ms}$.
