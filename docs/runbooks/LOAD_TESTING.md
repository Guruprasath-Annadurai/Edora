# Load Testing & Capacity Benchmark Runbook

**Classification:** Operational Runbook & Capacity Verification Guide  
**Applies to:** Edora Staging & Pre-Release Environments  
**Tooling:** k6 (Zero-Cost / Open Source)  
**Safety Policy:** Staging only. Production load testing is strictly prohibited by default.

---

## 1. Safety Principles & Target Verification

> [!CAUTION]
> **DO NOT LOAD TEST PRODUCTION.**  
> Edora runs on strict zero-budget database and serverless tiers. Firing high-concurrency synthetic load tests against production can exhaust Supabase connection quotas, consume API rate limits, or degrade service for active students.

### Hard Safety Guard
Both the shell runner `load-tests/run.sh` and the JS configuration `load-tests/common/config.js` inspect target URLs. If a production hostname (`app.edora`, `edora.app`, or unflagged Supabase domains) is detected, the test refuses to execute unless explicitly overridden with `ALLOW_PRODUCTION_LOAD_TEST=true`.

---

## 2. Test Scenarios Directory

| Script | Domain | Target Endpoints / Tables | Profile Focus |
| :--- | :--- | :--- | :--- |
| `01-auth-smoke.js` | Auth & Gateway | `/auth/v1/health` | Gateway responsiveness |
| `02-home-plan.js` | Home Screen | `/rest/v1/subjects_master`, `revision_plans` | Read throughput |
| `03-practice-read.js` | Practice / Flashcards | `/rest/v1/formulas`, `flashcards` | Static curriculum reads |
| `04-record-answer.js` | Quiz / Assessment | `POST /rest/v1/quiz_sessions` | Write TPS & transaction locks |
| `05-review-read.js` | Review / Notes | `/rest/v1/mistake_journal`, `study_notes` | User-scoped read queries |
| `06-progress-read.js` | Progress & Streaks | `/rest/v1/profiles`, `streak_rewards` | Aggregated user metrics |
| `07-novo-request.js` | AI Tutor Gateway | `POST /functions/v1/ai-gateway` | Edge function latency & timeouts |
| `08-offline-reconnect-storm.js`| Offline Queue Sync | `POST /functions/v1/sync-queue` | Spike buffer resilience (500 VU) |

---

## 3. Concurrency Profiles

* **`p50` (Smoke / Low):** 50 Virtual Users over 1.5 minutes.
* **`p100` (Baseline):** 100 Virtual Users over 3 minutes.
* **`p500` (Stress Boundary):** 500 Virtual Users over 5 minutes.
* **`p1000` (Architectural Ceiling):** 1,000 Virtual Users over 7 minutes.

---

## 4. Execution Instructions

### Local Execution (via native k6 or Docker)
```bash
# 1. Run auth smoke test on local Supabase
TARGET_URL="http://localhost:54321" ./load-tests/run.sh 01-auth-smoke.js p50

# 2. Run read throughput test on staging
TARGET_URL="https://staging-project.supabase.co" \
TARGET_ANON_KEY="staging-anon-key" \
./load-tests/run.sh 02-home-plan.js p100

# 3. Simulate offline reconnection storm
TARGET_URL="https://staging-project.supabase.co" \
./load-tests/run.sh 08-offline-reconnect-storm.js
```

---

## 5. Capacity Verification Rule

Capacity figures cannot be declared based solely on architectural calculations.
* **Current Verified Capacity:** 42 users (verified development baseline).
* **Target Capacity:** 100,000 registered learners (1,800 peak concurrent).
* **Unverified Capacity:** Any concurrency between 1,000 and 10,000 virtual users remains explicitly **UNVERIFIED** until executed and recorded via this test suite against an isolated staging environment.
