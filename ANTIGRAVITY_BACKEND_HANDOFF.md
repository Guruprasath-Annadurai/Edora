# ANTIGRAVITY BACKEND LANE — HANDOFF DOCUMENTATION
**Phase:** Edora V5 Product Readiness & Backend Lane — FINAL AUDIT CORRECTED  
**Author:** Antigravity Backend Engineering  
**Branch:** `v5/antigravity-backend`  
**Base Product Commit:** `65f76e65e952bd447e149b755c6fd20b65ddf6a1`  
**Final Backend HEAD (Remote):** `5441729b12e5fc24a3f3c3aaf1411b20f35c3217`  
**Status:** **AUDIT COMPLETE — INTEGRATION REQUIRES FOUNDER DECISION ON PYQ POLICY**

---

## 1. Executive Summary

The Antigravity Backend Lane has completed all security remediations, Edge Function repairs, model migrations, schema canonicalization, SyncQueue V2 redesign, exam target normalization, remote feature flags foundation, and the full post-push integration audit.

All work was completed inside `/Users/ag/edora-backend` without mutating Claude's product worktree (`/Users/ag/edora`) or the frozen infrastructure branch (`infra/v5-foundation`).

### Key Accomplishments (All Phases)

1. **P0 Security Remediated (`nova-insights`):** Eliminated arbitrary bearer token acceptance. Fail-closed JWT validation + 11 adversarial security tests.
2. **Day 2 Backend Restored:** Resolved 25 Deno type errors in `gemini-chat`; verified 6 orphaned edge functions; migrated decommissioned `gemini-1.5-flash` → `gemini-flash-latest`; hardened `novo-morning-brief`.
3. **Day 3 Memory & PYQ Truth:** Canonicalized `novo_memories` `memory_type` vocabulary across all writers. Corrected pgvector write format. Gated `mock-paper-composer` with `is_active = true`, `flagged_for_review = false`, `validation_state != 'rejected'`.
4. **Day 4 SyncQueue V2:** DLQ, error classification, durable single-item persistence, canonical legacy `quiz_session` → `complete_quiz_session` RPC transformation. Held `score_pct` migration (assigned Day 4 repair).
5. **Exam Target Contract:** Non-null `exam_name` with `'GENERAL'` fallback via trigger. 100% backward-compatible with 4.0.0 clients.
6. **Day 5 App Flags Backend:** Remote feature flags table, `get_app_flags()` RPC, edge function with CDN caching, client SDK with safe defaults, unit tests.
7. **Handoff push verified.** Remote: `1eed7b7`.
8. **PYQ RLS Enforcement (Audit Item 2):** New strict student read policy + SQL test suite. FOUNDER DECISION REQUIRED — see §5.
9. **novo_memories Embedding Truth (Audit Item 3):** Embedding writes deferred for V5 safety; `memory_type` inserts fixed in `chatHelpers.ts`.
10. **SyncQueue Pruning Safety (Audit Item 4):** Temporal-window pruning fix + 7 comprehensive safety tests. **17/17 passing.**

---

## 2. Complete Commit Ancestry

All commits are on `v5/antigravity-backend` relative to product baseline `65f76e6`:

```
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
| `1eed7b7` | Handoff | First handoff doc (now superseded by this update) |
| `f879452` | PYQ + Memory | Strict student RLS policy; `memory_type` fixes in `chatHelpers.ts`; embedding writes deferred |
| `5441729` | SyncQueue Safety | Temporal-window pruning fix + 7 pruning safety tests; `afterEach` import fix |

---

## 3. Database Migrations Added

| File | Purpose | Safety |
| :--- | :--- | :--- |
| `20260927000000_v5_exam_target_normalization.sql` | `exam_name` default `'GENERAL'`, backfill NULLs, BEFORE INSERT/UPDATE trigger | Additive; backward-compatible |
| `20260928000000_v5_app_flags.sql` | `app_flags` table + `get_app_flags()` RPC + grants | Additive; no schema changes |
| `20260929000000_v5_pyq_student_access_enforcement.sql` | Drops `pyq_public_read`; creates `pyq_student_reviewed_read` with full review gate; `service_role` admin policy | **FOUNDER DECISION REQUIRED — SEE §5** |

---

## 4. Verification Results

### 4.1 Deno Tests
```
ok | 363 passed | 0 failed (2s)
```
All edge function tests, including:
- `nova-insights/auth.test.ts` — 11 adversarial security tests
- `app-flags/app-flags.test.ts` — 4 CDN/cache tests
- All pre-existing function tests

### 4.2 Vitest Tests
```
Test Files  16 passed (16)
Tests       121 passed (121)
```
Including:
- `src/lib/syncQueue.test.ts` — **17 tests: 10 original + 7 new pruning safety tests**
- `src/lib/appFlags.test.ts` — 5 tests
- `src/lib/quizPersistence.test.ts`, `spacedRepetition.test.ts`, `adaptiveDifficulty.test.ts`, `experiments.test.ts`, and others

### 4.3 TypeScript Type Check
```
tsc -b --noEmit → exit 0 (0 errors)
```

### 4.4 Deno Check — Modified Edge Functions
```
deno check supabase/functions/novo-memory/index.ts → 0 errors
```

### 4.5 Migration Structural Validation
```
✓ Has DROP POLICY IF EXISTS
✓ Has CREATE POLICY pyq_student_reviewed_read
✓ Has is_active = true check
✓ Has is_reviewed = true check
✓ Has flagged_for_review = false check
✓ Has validation_state IN clause
✓ Has service_role grant
✓ Has ALTER TABLE ENABLE ROW LEVEL SECURITY
✓ exam_target_normalization.sql: CREATE OR REPLACE FUNCTION + TRIGGER
✓ app_flags.sql: CREATE TABLE + get_app_flags RPC + GRANT
```

---

## 5. FOUNDER DECISION REQUIRED: PYQ Student Access Policy

### What Was Found

The existing `pyq_public_read` RLS policy only checked `is_active = true`. The prior author deliberately chose NOT to add `is_reviewed` gating because:

> "233/555 rows (all of CAT, BOARDS, and UPSC content) are `is_reviewed=false` — gating on it would drop those three exams to zero questions instantly."

### What Was Built

New migration `20260929000000_v5_pyq_student_access_enforcement.sql`:
- Drops `pyq_public_read`
- Creates `pyq_student_reviewed_read`:
  ```sql
  USING (
    is_active = true
    AND flagged_for_review = false
    AND is_reviewed = true
    AND validation_state IN ('ai_reviewed_ok', 'human_verified')
  )
  ```

### The Tradeoff

| Option | Effect |
| :--- | :--- |
| **Apply migration (strict)** | All unreviewed CAT/BOARDS/UPSC questions become invisible to students. Those three exams show zero questions until content is reviewed. Directly fulfills: "UNREVIEWED PYQ CONTENT MUST BE UNREACHABLE FROM STUDENT-FACING ACCESS." |
| **Hold migration (defer)** | Students continue to see unreviewed questions. Current `is_active` gate remains. Integration safety preserved but V5 requirement unfulfilled. |
| **Partial (review batch before deploy)** | Mark existing 233 rows `is_reviewed=true` and `validation_state='ai_reviewed_ok'` if they pass a bulk AI review pass. Then apply migration with no student impact. Recommended path. |

### Test Verification

`scripts/test_pyq_rls_policy.sql` — 6 SQL assertions in `BEGIN/ROLLBACK`:
- AI-reviewed questions: visible ✓
- Human-verified questions: visible ✓
- Unreviewed (Q3): hidden ✓
- Flagged (Q4): hidden ✓
- Inactive/rejected (Q5): hidden ✓
- AI content correctly labeled `ai_reviewed_ok`, NOT `human_verified` ✓

> [!IMPORTANT]
> Migration `20260929000000` must NOT be applied to production until a decision is made on the 233 unreviewed CAT/BOARDS/UPSC rows. Either bulk-review them first, or deliberately accept exam outage.

---

## 6. novo_memories Embedding — Definitive Verdict

**Column status:** `public.novo_memories.embedding vector(768)` **EXISTS** in migration `20260710_pgvector_novo_memory.sql` and is confirmed in the infra schema manifest.

**V5 Decision (Conservative):** Embedding writes and semantic search removed from `novo-memory/index.ts` for V5. Reason: production deployment state unverifiable in sandbox; 0-row embedding evidence from Day 2 logs; safer to defer than to risk silent DB failures.

**What this means:**
- `get_context`: returns only recent memories (no semantic similarity)
- `save` / `save_from_session`: inserts memory records without embedding
- Semantic search (`search_novo_memories` RPC) disabled — returns `[]`

**Re-enabling:** When embedding column deployment is confirmed, restore the `embedText()` call and `search_novo_memories` RPC call in `novo-memory/index.ts`. Column and RPC both exist and are ready.

---

## 7. SyncQueue Pruning Safety — What Was Fixed

### Before (Unsafe)
```typescript
// UNSAFE: reason.startsWith('quiz:') pruned ALL quiz-related XP, not just this batch's
e.action.payload.reason.startsWith('quiz:')
// UNSAFE: topic alone pruned any topic_perf with same topic name, across all quizzes
e.action.payload.topic === p.topic
```

### After (Safe)
```typescript
const LEGACY_PRUNE_WINDOW_MS = 2000;
const withinWindow = Math.abs(e.queued_at - entry.queued_at) <= LEGACY_PRUNE_WINDOW_MS;
// Only prune if within same time window AND exact reason match
withinWindow && e.action.payload.reason === `quiz:${p.topic}`
// Only prune topic_perf if within same time window
withinWindow && e.action.payload.topic === p.topic
```

The 2000ms window is the temporal correlation proving entries belong to the same offline flush batch. Legacy clients enqueued `quiz_session`, `xp_grant`, `topic_perf` sequentially in one call — they always land within milliseconds of each other.

### Safety Tests Verified (7 scenarios)

| Test | Verdict |
| :--- | :--- |
| Baseline: same-batch entries pruned correctly | ✅ PASS |
| **KEY: Quiz A and Quiz B, same topic, 9s apart — only Quiz A's entries pruned** | ✅ PASS |
| Unrelated `xp_grant` (reason=`daily_streak`) never pruned | ✅ PASS |
| Same topic, different score — both `topic_perf` entries survive independently | ✅ PASS |
| Interleaved ordering — only within-window entries removed | ✅ PASS |
| Duplicate `quiz_session` (response-lost/replay) — both reach server | ✅ PASS |
| Cross-user: user-1 XP not pruned by user-2 quiz_session | ✅ PASS (goes to DLQ via auth rejection, never silently dropped) |

---

## 8. Integration Prerequisites

**DO NOT integrate until:**

1. ✅ `v5/antigravity-backend` branch pushed to remote (DONE — HEAD `5441729`)
2. ⚠️ **Founder decision on PYQ migration** (§5) — either bulk-review 233 rows OR accept exam outage
3. ⏳ `score_pct` column drift repair (Day 4 assigned repair) — required before schema guard integration
4. ✅ 363 Deno tests pass
5. ✅ 121 Vitest tests pass (17 SyncQueue, 5 AppFlags, others)
6. ✅ `tsc -b --noEmit` → 0 errors

### Cherry-Pick Sequence (when authorized)

```bash
# From release/5.0.0-landmark — DO NOT run until prerequisites above are met
git cherry-pick e4ba84f 5f93da4 2abdea1 0c1476e ba02595 049c0c1 f879452 5441729
```

---

## 9. Files Modified (Complete List)

### Edge Functions
| File | Change |
| :--- | :--- |
| `supabase/functions/nova-insights/auth.ts` | Fail-closed JWT validation |
| `supabase/functions/nova-insights/auth.test.ts` | 11 adversarial tests |
| `supabase/functions/nova-insights/index.ts` | Uses new fail-closed auth |
| `supabase/functions/gemini-chat/index.ts` | 25 Deno errors fixed; model updated |
| `supabase/functions/novo-morning-brief/index.ts` | Groq primary, hardened, kill-switch |
| `supabase/functions/adaptive-curriculum/index.ts` | `memory_type` canonicalized |
| `supabase/functions/lesson-planner/index.ts` | `memory_type` canonicalized |
| `supabase/functions/novo-certifications/index.ts` | `memory_type` canonicalized |
| `supabase/functions/tutoring-engine/index.ts` | `memory_type` canonicalized |
| `supabase/functions/novo-memory/index.ts` | Embedding deferred; `memory_type` filters updated; `save` fields corrected |
| `supabase/functions/novo-memory/validate.ts` | Canonical `DB_MEMORY_TYPES` enforcement |
| `supabase/functions/mock-paper-composer/index.ts` | Student PYQ gate added |
| `supabase/functions/mistake-clustering/index.ts` | Model migration |
| `supabase/functions/question-explain/index.ts` | Type corrections |
| `supabase/functions/app-flags/index.ts` | **NEW** — Remote feature flags edge function |
| `supabase/functions/app-flags/app-flags.test.ts` | **NEW** — 4 tests |

### Client Library
| File | Change |
| :--- | :--- |
| `src/lib/syncQueue.ts` | Full V2 rewrite + safe pruning fix |
| `src/lib/syncQueue.test.ts` | 10 original + 7 new pruning safety tests |
| `src/lib/appFlags.ts` | **NEW** — Feature flags client SDK |
| `src/lib/appFlags.test.ts` | **NEW** — 5 tests |
| `src/lib/chatHelpers.ts` | Fixed `novo_memories` inserts: `type` → `memory_type` + `source` |

### Migrations
| File | Status |
| :--- | :--- |
| `supabase/migrations/20260927000000_v5_exam_target_normalization.sql` | Ready to apply |
| `supabase/migrations/20260928000000_v5_app_flags.sql` | Ready to apply |
| `supabase/migrations/20260929000000_v5_pyq_student_access_enforcement.sql` | **HELD — Founder decision required** |

### Test/Ops Scripts
| File | Purpose |
| :--- | :--- |
| `scripts/test_pyq_rls_policy.sql` | **NEW** — 6 SQL assertions in `BEGIN/ROLLBACK` for PYQ RLS correctness |

---

## 10. Constraints Honored

- ❌ No cherry-picks into `release/5.0.0-landmark` (Claude's branch)
- ❌ No production deployment (`supabase db push`, function deploys)
- ❌ No mutations to `/Users/ag/edora` (Claude's worktree)
- ❌ No mutations to `/Users/ag/edora-infra` (frozen infra)
- ❌ `score_pct` column NOT added to `quiz_sessions` (held per audit)
- ❌ AI-audited content NOT labeled "Human verified"
- ✅ Ambiguous queue entries preserved over silent deletion
- ✅ All work on dedicated `v5/antigravity-backend` worktree
