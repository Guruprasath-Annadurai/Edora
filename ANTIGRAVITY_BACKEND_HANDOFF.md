# ANTIGRAVITY BACKEND LANE — HANDOFF DOCUMENTATION
**Phase:** Edora V5 Product Readiness & Backend Lane — FINAL PRE-INTEGRATION FREEZE  
**Author:** Antigravity Backend Engineering  
**Branch:** `v5/antigravity-backend`  
**Base Product Commit:** `65f76e65e952bd447e149b755c6fd20b65ddf6a1`  
**Status:** **BACKEND BLOCK READY FOR CONTROLLED INTEGRATION**

---

## 1. Executive Summary

The Antigravity Backend Lane has executed all mandated security remediations, Edge Function type-checking repairs, model migrations, schema canonicalization, SyncQueue V2 offline durability redesign, exam target normalization, remote feature flags foundation, PYQ strict trust enforcement, and the full pre-integration verification suite.

All work was completed inside `/Users/ag/edora-backend` without mutating Claude's product worktree (`/Users/ag/edora`) or the frozen infrastructure branch (`infra/v5-foundation`).

### Key Accomplishments (All Phases)

1. **P0 Security Remediated (`nova-insights`):** Eliminated arbitrary bearer token acceptance. Standard student JWTs strictly rejected with 403 Forbidden. Invocation authority restricted to `CRON_SECRET` (scheduled batch job) or `service_role` Bearer authorization (administrative refresh). 12 adversarial unit tests pass.
2. **Day 2 Backend Restored:** Resolved 25 Deno type errors in `gemini-chat`; verified 6 orphaned edge functions; migrated decommissioned `gemini-1.5-flash` → `gemini-flash-latest`; hardened `novo-morning-brief` with Groq primary and circuit breakers.
3. **Day 3 Memory & PYQ Truth:** Canonicalized `novo_memories` `memory_type` vocabulary across all writers. Gated `mock-paper-composer` with `is_active = true`, `flagged_for_review = false`, `validation_state != 'rejected'`. Fixed `chatHelpers.ts` memory inserts.
4. **Day 4 SyncQueue V2:** Redesigned SyncQueue with Supabase `{ error }` inspection, permanent vs retryable classification, Dead-Letter Queue (DLQ), durable single-item persistence transitions, and automatic canonical transformation of legacy `quiz_session` entries to `complete_quiz_session` RPC while pruning paired `xp_grant` / `topic_perf` via temporal correlation window (±2000ms). 17 unit tests pass.
5. **Exam Target Contract:** Implemented non-null `exam_name` with fallback `'GENERAL'` via transparent trigger migration that guarantees 100% backward-compatibility for legacy 4.0.0 clients while enforcing the contract on the backend.
6. **Day 5 App Flags Backend (Fail-Closed):** Built remote feature flags table (`app_flags`), compact aggregation RPC (`get_app_flags()`), edge function with CDN caching headers (`app-flags`), client SDK with caching and fail-closed defaults (`battle_enabled = false`, `new_home_enabled = false`, unknown flag = `false`). 16 unit tests pass across client SDK and Deno.
7. **PYQ Strict Trust Enforcement (Approved by Founder):** Replaced permissive RLS policy with strict student read policy requiring `is_active = true AND flagged_for_review = false AND is_reviewed = true AND validation_state IN ('ai_reviewed_ok', 'human_verified')`. Unreviewed PYQ content is completely unreachable from student-facing access. All 233 unreviewed CAT/BOARDS/UPSC questions remain hidden until verified.
8. **Real Migration Execution Test:** Validated all 3 backend migrations (`20260927000000_v5_exam_target_normalization.sql`, `20260928000000_v5_app_flags.sql`, `20260929000000_v5_pyq_student_access_enforcement.sql`) against a local PostgreSQL 17 engine inside a rollback transaction. All 24 assertions passed.
9. **Schema Reference Static Guard:** Validated zero schema reference violations across the backend codebase.

---

## 2. Complete Commit Ancestry

All commits are on `v5/antigravity-backend` relative to product baseline `65f76e6`:

```
d2d5a6a  fix(backend): fail-closed app flag defaults, restrict nova-insights to cron/service_role, add real migration execution suite
1563585  docs(handoff): update ANTIGRAVITY_BACKEND_HANDOFF.md with final audit results
5441729  fix(sync-queue): safe legacy pruning with temporal correlation window + comprehensive safety tests
f879452  fix(pyq+memory): enforce RLS student review gate, fix memory_type constraints, defer embedding writes
1eed7b7  docs(handoff): ANTIGRAVITY_BACKEND_HANDOFF.md
049c0c1  feat(flags): Day 5 remote feature flags backend + edge function + client SDK
ba02595  feat(backend): exam target normalization contract with GENERAL fallback
0c1476e  fix(sync-queue): SyncQueue V2 with DLQ, error classification, legacy quiz migration
2abdea1  fix(backend): canonicalize novo_memories memory_type, fix embedding write format, PYQ protection
5f93da4  fix(backend): gemini-chat 25 deno errors, models, novo-morning-brief harden
e4ba84f  fix(security): patch nova-insights arbitrary bearer acceptance
```

### Commit Details

| SHA | Component | Description |
| :--- | :--- | :--- |
| `e4ba84f` | Security P0 | `nova-insights` bearer auth hardened; fail-closed JWT; 11 adversarial tests |
| `5f93da4` | Functions/Models | 25 `gemini-chat` Deno errors fixed; `gemini-flash-latest`; `novo-morning-brief` hardened |
| `2abdea1` | Memory/PYQ | `novo_memories` types canonicalized; pgvector format fixed; `mock-paper-composer` gated |
| `0c1476e` | SyncQueue V2 | DLQ, error classification, durable transitions, legacy `quiz_session` RPC migration |
| `ba02595` | Exam Target | `exam_name != NULL` trigger with `'GENERAL'` fallback; 4.0.0 backward-compatible |
| `049c0c1` | App Flags | `app_flags` table + RPC + edge function + client SDK + unit tests |
| `1eed7b7` | Handoff | Initial backend handoff doc |
| `f879452` | PYQ + Memory | Strict student RLS policy; `memory_type` fixes in `chatHelpers.ts`; embedding writes deferred |
| `5441729` | SyncQueue Safety | Temporal-window pruning fix + 7 pruning safety tests; `afterEach` import fix |
| `1563585` | Handoff | Audit results documentation |
| `d2d5a6a` | Pre-Integration | Fail-closed app flag defaults (`battle=false`, `new_home=false`, unknown=`false`), restrict `nova-insights` to cron/service_role (403 for user JWT), real migration SQL test suite |

---

## 3. Database Migrations Added

| File | Purpose | Verification Status |
| :--- | :--- | :--- |
| `20260927000000_v5_exam_target_normalization.sql` | `exam_name` default `'GENERAL'`, backfill NULLs, BEFORE INSERT/UPDATE trigger | Tested & Verified in PostgreSQL 17 |
| `20260928000000_v5_app_flags.sql` | `app_flags` table + `get_app_flags()` RPC + grants (fail-closed seed: `battle=false`, `new_home=false`) | Tested & Verified in PostgreSQL 17 |
| `20260929000000_v5_pyq_student_access_enforcement.sql` | Drops `pyq_public_read`; creates `pyq_student_reviewed_read` (strict review gate) + `service_role` admin policy | Tested & Verified in PostgreSQL 17 (Approved by Founder) |

---

## 4. Verification Results

### 4.1 Deno Tests
```
ok | 364 passed | 0 failed (2s)
```
All edge function tests pass cleanly, including:
- `nova-insights/auth.test.ts` — 12 tests (cron secret, service role, user JWT 403, invalid headers)
- `app-flags/app-flags.test.ts` — 4 tests (canonical defaults, OPTIONS CORS, 405 method, unconfigured fallback)

### 4.2 Vitest Tests
```
Test Files  16 passed (16)
Tests       128 passed (128)
```
Including:
- `src/lib/syncQueue.test.ts` — 17 tests (DLQ, retry classification, temporal-window pruning isolation)
- `src/lib/appFlags.test.ts` — 12 tests (fail-closed defaults, remote overrides, network failure preservation)
- All scoring, repetition, adaptive difficulty, and experiment tests

### 4.3 TypeScript Type Check
```
tsc -b --noEmit → exit 0 (0 errors)
```

### 4.4 Deno Type Check
```
deno check supabase/functions/app-flags/index.ts
deno check supabase/functions/nova-insights/index.ts
deno check supabase/functions/nova-insights/auth.ts
deno check supabase/functions/nova-insights/auth.test.ts
deno check supabase/functions/novo-memory/index.ts
deno check supabase/functions/gemini-chat/index.ts
→ All exit 0 (0 errors)
```

### 4.5 Real Migration Execution Suite
`scripts/test_migrations_execution.sql` executed against local PostgreSQL 17 engine inside transaction rollback:
```
✓ EXAM TEST 1: NULL exam_name normalizes to GENERAL via trigger
✓ EXAM TEST 2: empty exam_name normalizes to GENERAL via trigger
✓ EXAM TEST 3: whitespace exam_name normalizes to GENERAL via trigger
✓ EXAM TEST 4: valid exam_name JEE remains unchanged
✓ EXAM TEST 5: UPDATE with NULL exam_name normalizes via trigger
✓ FLAGS TEST 1: app_flags table has 6 rows
✓ FLAGS TEST 2: battle_enabled = false (default)
✓ FLAGS TEST 3: new_home_enabled = false (default)
✓ FLAGS TEST 4: novo_enabled = true (default)
✓ FLAGS TEST 5: get_app_flags() returns correct JSON
✓ FLAGS TEST 6: RLS is enabled on app_flags
✓ FLAGS TEST 7: battle_enabled can be explicitly enabled/disabled by service_role
✓ PYQ TEST 1: RLS enabled on pyq_content
✓ PYQ TEST 2: 5 rows inserted
✓ PYQ TEST 3: AI reviewed question has state ai_reviewed_ok
✓ PYQ TEST 4: human-reviewed question has state human_verified
✓ PYQ TEST 5: unreviewed question has state unreviewed
✓ PYQ TEST 6: flagged question has state ai_flagged
✓ PYQ TEST 7: inactive question has state rejected
✓ PYQ TEST 8: Student policy allows exactly 2 questions (Q1 + Q2)
✓ PYQ TEST 9: Unreviewed Q3 is excluded by student policy
✓ PYQ TEST 10: Flagged Q4 is excluded by student policy
✓ PYQ TEST 11: Inactive Q5 is excluded by student policy
✓ PYQ TEST 12: Service/admin path sees all 5 rows
→ ALL 24 ASSERTIONS PASSED
```

### 4.6 Schema Static CI Guard
```
Checking codebase against 223 tables and 89 RPC functions...
✓ PASSED: All table and critical schema references are valid (0 violations, 20 non-blocking warnings).
```

---

## 5. Architectural Verdicts

### 5.1 PYQ Strict Trust Policy
- **Founder Approved:** Approved without compromise.
- **Rule:** Unreviewed PYQ content (`is_reviewed = false`) is strictly blocked from student access.
- **Impact:** 233 unreviewed rows (all CAT, BOARDS, and UPSC content) are invisible to students until reviewed. The platform truthfully presents zero questions rather than serving unreviewed academic content.
- **Enforcement:** Enforced at PostgreSQL RLS layer (`pyq_student_reviewed_read`) and application layer (`mock-paper-composer`).

### 5.2 App Flag Defaults (Fail-Closed)
- **Rule:** Rollback and containment controls must default to safe states.
- **Initial States:**
  - `novo_enabled = true`
  - `ai_generation_enabled = true`
  - `pyq_enabled = true`
  - `battle_enabled = false` (V5 freeze)
  - `new_home_enabled = false` (V5 freeze)
  - `pro_enabled = true`
- **Unknown Flags:** Evaluates to `false` (no `?? true` fallback).
- **Network / Database Failure:** Preserves safe defaults without crashing.

### 5.3 Nova Insights Invocation Authority
- **Finding:** `nova-insights` is a weekly scheduled job running via `pg_cron`. No student user flow requires on-demand execution.
- **Rule:** Direct invocation by student JWTs is strictly prohibited (returns 403 Forbidden).
- **Accepted Callers:**
  1. `CRON_SECRET` via `x-cron-secret` header (scheduled batch run)
  2. `SUPABASE_SERVICE_ROLE_KEY` via Bearer authorization (administrative targeted refresh)
- **Protection:** Eliminates student-driven Gemini API token exhaustion and spam generation.

---

## 6. Controlled Integration Sequence

When authorized, cherry-pick the backend block into `release/5.0.0-landmark`:

```bash
git cherry-pick \
  e4ba84f \
  5f93da4 \
  2abdea1 \
  0c1476e \
  ba02595 \
  049c0c1 \
  f879452 \
  5441729 \
  d2d5a6a
```

---

## 7. Constraints Honored

- ❌ No cherry-picks into `release/5.0.0-landmark` (Claude's branch)
- ❌ No production deployment (`supabase db push`, function deploys)
- ❌ No mutations to `/Users/ag/edora` (Claude's worktree)
- ❌ No mutations to `/Users/ag/edora-infra` (frozen infra)
- ❌ `score_pct` column NOT added to `quiz_sessions` (held per audit)
- ❌ AI-audited content NOT labeled "Human verified"
- ✅ Ambiguous queue entries preserved over silent deletion
- ✅ All work on dedicated `v5/antigravity-backend` worktree
