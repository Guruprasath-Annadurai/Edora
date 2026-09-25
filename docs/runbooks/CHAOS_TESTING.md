# Chaos & Failure Testing Runbook

**Classification:** Operational Resilience Runbook  
**Purpose:** Non-destructive failure injection and graceful degradation verification  
**Budget Cost:** ₹0 / $0 (Local Node.js Mock Server & Synthetic Headers)  

---

## 1. Principles of Non-Destructive Failure Testing

1. **Zero Impact on Real Cloud Providers:** Tests must never purposefully spam live third-party APIs (Groq, Anthropic, Google) with bad tokens or artificial high-frequency loops.
2. **Mock Server Simulation:** The local test harness runs an isolated HTTP server (`tests/chaos/chaos-server.js`) that mimics upstream failure modes via the `x-chaos-mode` header.
3. **Product Isolation:** Client-side product code is untouched by this infrastructure harness; client integration contracts are documented below.

---

## 2. Injected Failure Modes

| Chaos Mode | Simulated Upstream Failure | Expected Application Behavior |
| :--- | :--- | :--- |
| `groq-500` | Groq internal server error | Edge Gateway / Client falls back to Groq fast/small or Claude tier. |
| `groq-timeout` | Request hangs ($>3000\text{ms}$) | Client `AbortController` triggers, aborting request and retrying fallback. |
| `claude-fail` | Claude HTTP 529 (Overloaded) | Cascade advances to Gemini or offline fallback. |
| `gemini-fail` | Gemini HTTP 429 (Resource Exhausted) | Circuit breaker opens; request falls back to deterministic local card. |
| `all-fail` | Complete network / provider partition | Returns structured offline learning card with zero unhandled crash. |
| `db-timeout` | Postgres statement cancellation (`57014`) | UI displays retry toast; payload persists in local offline queue. |
| `duplicate-idempotency` | Duplicate answer / payment POST | Request recognized via `Idempotency-Key` and returns existing result. |

---

## 3. Product Integration Contracts (For Claude V5 Implementation)

When Claude repairs or implements client-side networking in `src/` and Edge Functions in `supabase/functions/`:

1. **AI Gateway Header Contract:**
   - In development / test mode, the Edge Function or client may forward `x-chaos-mode` to simulate downstream failures without editing provider keys.
2. **Timeout Enforcement:**
   - All external fetch calls must include an `AbortSignal.timeout(4000)` or equivalent `AbortController` to guarantee no pending request hangs the mobile UI.
3. **Idempotency Headers:**
   - All mutation endpoints (`quiz_sessions`, `sync-queue`, payment validations) must honor an `Idempotency-Key: <UUID>` header to guard against double-submits on weak cellular connections.

---

## 4. Running the Chaos Test Suite

```bash
chmod +x tests/chaos/run-chaos-tests.sh
./tests/chaos/run-chaos-tests.sh
```
