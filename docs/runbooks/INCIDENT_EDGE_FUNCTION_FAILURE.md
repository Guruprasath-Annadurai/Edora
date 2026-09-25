# Incident Runbook: Edge Function Deployment / Runtime Failure

**Classification:** Operational Incident Response  
**Applies to:** Supabase Edge Functions (`supabase/functions/*`)  

---

## 1. Detection
* **Symptom:** Edge Function invocation returns `500 Internal Server Error`, `BOOT_ERROR`, or `WORKER_TIMEOUT`.
* **Telemetry:** Supabase Dashboard > Edge Functions > Logs shows unhandled exceptions or import map errors.

## 2. User Impact
* Specific Edge Function capabilities (e.g. AI Gateway, webhook ingestion, push notifications) fail.

## 3. What Should Fail Gracefully
* Client displays clear retryable banner or deterministic local learning content.

## 4. What Feature Flag Can Be Used
* Client feature gate to bypass broken edge routine or use local mock mode.

## 5. What Must NOT Be Changed
* **DO NOT** remove CORS headers (`Access-Control-Allow-Origin: *`).
* **DO NOT** embed service-role keys directly in function source code.

## 6. Recovery Procedure
1. Check function logs in Supabase Dashboard.
2. If due to a broken external Deno import or bad code deploy:
   - Roll back to previous functioning Git commit.
   - Re-deploy the specific function:
     ```bash
     npx supabase functions deploy <function-name> --no-verify-jwt
     ```
3. If due to a missing environment secret:
   - Set secret via Supabase CLI:
     ```bash
     npx supabase secrets set SECRET_NAME="value"
     ```

## 7. Evidence Proving Recovery
* Invocations of `/functions/v1/<function-name>` return 200 OK.
* Supabase Edge Function log shows zero boot errors.
