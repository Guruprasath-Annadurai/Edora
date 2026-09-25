# EDORA V5 — DAY 7 BACKEND EVIDENCE REPORT: TODAY'S PLAN DETERMINISTIC ENGINE

**Date:** 2026-09-26  
**Author:** Antigravity Backend Agent  
**Product Branch Baseline:** `release/5.0.0-landmark`  
**Authoritative Starting SHA:** `8c28a4a6b2680773d96e9a7441b37ecab32be4ff`  
**Feature Branch:** `v5/day7-plan-backend`  
**Worktree:** `/Users/ag/edora-day7-backend`  

---

## 1. Executive Summary

In accordance with Edora V5 architecture directives, the deterministic **Today's Plan** backend engine has been implemented as a PostgreSQL stored procedure (`public.get_today_plan()`). 

Key architectural characteristics:
- **Zero AI / Zero LLM Overhead:** The plan generation is 100% deterministic, immediate, and free from runtime API costs or hallucinations.
- **Strictly User-Scoped:** Authenticates callers exclusively via `auth.uid()`. Unauthenticated execution is immediately rejected with SQLSTATE `42501` (`insufficient_privilege`).
- **Defensive Database Security:** Declared `SECURITY DEFINER` with `SET search_path = ''` to eliminate search path hijacking attacks. All table and type references are explicitly fully qualified as `public.*`.
- **Enforced Bounded Output:** Returns at most 3 items sorted by canonical priority (1 to 5), ensuring students receive an actionable, cognitive-load-balanced daily roadmap.
- **V5 Strict PYQ Trust Policy Enforced:** The `exam_push` candidate strictly requires `is_active = true AND flagged_for_review = false AND is_reviewed = true AND validation_state IN ('ai_reviewed_ok', 'human_verified')`. Unreviewed PYQs are never surfaced.

---

## 2. Migration Details

- **Migration File:** [`supabase/migrations/20260930000000_v5_get_today_plan.sql`](file:///Users/ag/edora-day7-backend/supabase/migrations/20260930000000_v5_get_today_plan.sql)
- **Migration Prefix Uniqueness:** Verified unique prefix across all 196 migration files in `supabase/migrations/`.
- **Supporting Indexes:**
  - `idx_subtopic_mastery_plan_weak` on `public.subtopic_mastery (user_id, mastery_score ASC, attempts DESC, last_attempted_at ASC)` with partial predicate `WHERE attempts >= 3 AND mastery_score < 0.5`.
  - Leverages existing index `sr_cards_user_review_idx` on `public.sr_cards (user_id, next_review_date)`.
- **Permissions:**
  - `REVOKE ALL ON FUNCTION public.get_today_plan() FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION public.get_today_plan() TO authenticated, service_role;`

---

## 3. RPC Signature & Output Contract

```sql
CREATE OR REPLACE FUNCTION public.get_today_plan()
RETURNS TABLE (
    kind TEXT,
    priority INTEGER,
    title TEXT,
    duration_minutes INTEGER,
    target_path TEXT,
    target_params JSONB,
    subject TEXT,
    chapter TEXT,
    topic TEXT,
    reason JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
```

### Output Column Schema:
| Column | Type | Nullable | Description |
|---|---|---|---|
| `kind` | `TEXT` | No | Identifier of the activity: `'review_due'`, `'fix_weak'`, `'diagnostic'`, `'learn_next'`, or `'exam_push'` |
| `priority` | `INTEGER` | No | Canonical priority rank (1 through 5) |
| `title` | `TEXT` | No | Human-readable action title for student display |
| `duration_minutes` | `INTEGER` | No | Estimated commitment in minutes (e.g. 10, 15, 20) |
| `target_path` | `TEXT` | No | Client application routing path (e.g. `'/sr'`, `'/practice'`, `'/diagnostic'`, `'/curriculum'`) |
| `target_params` | `JSONB` | No | Navigation parameters, filters, or query keys |
| `subject` | `TEXT` | Yes | Subject identifier (e.g. `'Physics'`, `'Mathematics'`, `'Biology'`) |
| `chapter` | `TEXT` | Yes | NCERT / Curriculum chapter title |
| `topic` | `TEXT` | Yes | Specific subtopic or module |
| `reason` | `JSONB` | No | Structured telemetry / explanation payload for UI display |

---

## 4. Priority Hierarchy & Business Logic

The engine evaluates 5 distinct candidate types and returns `ORDER BY priority ASC, tie_break ASC LIMIT 3`.

### 1. `review_due` (Priority 1)
- **Source:** `public.sr_cards`
- **Condition:** `user_id = v_uid AND next_review_date <= CURRENT_DATE`
- **Candidate Generated:** Aggregates total due cards.
  - Title: `"Review <N> due flashcards"`
  - Target Path: `"/sr"`
  - Duration: `10` minutes
  - Reason: `{"due_count": N}`

### 2. `fix_weak` (Priority 2)
- **Source:** `public.subtopic_mastery`
- **Condition:** `user_id = v_uid AND attempts >= 3 AND mastery_score < 0.5`
- **Deterministic Selection (Single Weakest):**
  `ORDER BY mastery_score ASC, attempts DESC, last_attempted_at ASC NULLS FIRST, subtopic ASC, id ASC LIMIT 1`
- **Candidate Generated:**
  - Title: `"Fix weak area: <subtopic>"`
  - Target Path: `"/practice"`
  - Target Params: `{"subject": subject, "subtopic": subtopic, "mode": "remedial"}`
  - Duration: `15` minutes
  - Reason: `{"mastery_score": round(mastery_score, 2), "attempts": attempts}`

### 3. `diagnostic` (Priority 3)
- **Source:** `public.quiz_sessions`, `public.subtopic_mastery`, `public.topic_performance`, `public.ncert_chapter_progress`
- **No-History Definition:**
  Evaluated if `COUNT(*) = 0` across **all four** tables for the user:
  - `quiz_sessions` where `user_id = v_uid`
  - `subtopic_mastery` where `user_id = v_uid`
  - `topic_performance` where `user_id = v_uid`
  - `ncert_chapter_progress` where `user_id = v_uid`
- **Candidate Generated:**
  - Title: `"Take your diagnostic quiz"`
  - Target Path: `"/diagnostic"`
  - Duration: `15` minutes
  - Reason: `{"no_history": true}`

### 4. `learn_next` (Priority 4)
- **Source:** `public.ncert_chapter_progress` inner joined with `public.ncert_chapters` (falling back to earliest syllabus chapter for user's profile stream/grade)
- **Selection Logic:**
  1. Finds in-progress chapters (`status != 'completed'`) ordered by `last_accessed_at DESC NULLS LAST, chapter_number ASC`.
  2. If none in progress, selects the first unstarted chapter in standard NCERT sequence (`chapter_number ASC`).
  3. If no progress records exist, looks up `public.profiles` for `target_exam` / `grade` and picks the first chapter in `ncert_chapters`.
- **Candidate Generated:**
  - Title: `"Continue <chapter_name>"` (or `"Start <chapter_name>"`)
  - Target Path: `"/curriculum"`
  - Target Params: `{"subject": subject, "chapter_id": chapter_id}`
  - Duration: `20` minutes
  - Reason: `{"chapter_id": chapter_id, "status": status, "progress_pct": progress_pct}`

### 5. `exam_push` (Priority 5)
- **Source:** `public.profiles`, `public.exam_profiles`, `public.pyq_content`
- **Eligibility:**
  - Profile must specify an exam other than `'GENERAL'` / `NULL`.
  - Target exam date must be between `CURRENT_DATE` and `CURRENT_DATE + 14` days (`days_left <= 14`).
  - **V5 Strict PYQ Trust Filter:** Must have at least one question in `public.pyq_content` matching `exam` with:
    - `is_active = true`
    - `flagged_for_review = false`
    - `is_reviewed = true`
    - `validation_state IN ('ai_reviewed_ok', 'human_verified')`
- **Candidate Generated:**
  - Title: `"Exam countdown: <days_left> days to <exam> PYQs"`
  - Target Path: `"/practice"`
  - Target Params: `{"exam": exam, "mode": "pyq_sprint"}`
  - Duration: `20` minutes
  - Reason: `{"exam": exam, "days_left": days_left}`

---

## 5. SQL Verification & Persona Test Suite

All tests were executed against a live PostgreSQL 17 test cluster using [`scripts/test_day7_plan_engine.sql`](file:///Users/ag/edora-day7-backend/scripts/test_day7_plan_engine.sql).

### Test Coverage Results:

```
=== STEP 2: VERIFY AUTHENTICATION SECURITY (UNAUTHENTICATED) ===
OK: Expected 42501 error received for unauthenticated user:
[42501] get_today_plan: Authentication required

=== STEP 4: VERIFY V5 PYQ STRICT TRUST BEHAVIOR ===
Scenario 1 (Unreviewed/Flagged PYQ only):
Rows returned: 0 (OK - unreviewed PYQ did not trigger exam_push)
Scenario 2 (Trusted PYQ present):
Rows returned: 1 (OK - exam_push triggered with trusted PYQ)

=== STEP 5: VERIFY PERSONA A (NEW USER - NO HISTORY) ===
Rows returned: 2
- priority 3: diagnostic ("Take your diagnostic quiz") -> /diagnostic
- priority 4: learn_next ("Start Kinematics") -> /curriculum

=== STEP 6: VERIFY PERSONA B (WEAK TOPIC USER) ===
Rows returned: 2
- priority 2: fix_weak ("Fix weak area: Center of Mass") [mastery: 0.20, attempts: 4]
- priority 4: learn_next ("Continue Kinematics")

=== STEP 7: VERIFY PERSONA C (SPACED REPETITION USER) ===
Rows returned: 2
- priority 1: review_due ("Review 2 due flashcards") -> /sr
- priority 4: learn_next ("Continue Thermodynamics")

=== STEP 8: VERIFY PERSONA D (EXAM IMMINENT USER) ===
Rows returned: 2
- priority 4: learn_next ("Continue Organic Chemistry")
- priority 5: exam_push ("Exam countdown: 7 days to JEE PYQs") -> /practice

=== STEP 9: VERIFY PERSONA E (GENERAL USER - EXAM IN 5 DAYS) ===
Rows returned: 2
- priority 3: diagnostic ("Take your diagnostic quiz")
- priority 4: learn_next ("Start Kinematics")
(No exam_push generated for GENERAL stream - OK)

=== STEP 10: VERIFY MIXED CANDIDATES (BOUNDED TO <= 3) ===
Candidates present in user history: 4 (review_due, fix_weak, learn_next, exam_push)
Rows returned: 3
1. [priority 1] review_due ("Review 5 due flashcards")
2. [priority 2] fix_weak ("Fix weak area: Rotational Dynamics") [mastery: 0.15]
3. [priority 4] learn_next ("Continue Waves")
(Exam push priority 5 dropped as bounded to 3 - OK)

=== STEP 11: VERIFY CROSS-USER ISOLATION ===
Persona A seeing cards from Persona C or B: 0 rows (OK - 0 cross-user leak)
```

---

## 6. Query Plan & Performance Analysis

Query execution plans were generated using `EXPLAIN (ANALYZE, BUFFERS)` under session-level simulated authentication:

### 1. `fix_weak` Partial Index Scan
```
Index Scan using idx_subtopic_mastery_plan_weak on subtopic_mastery (cost=8.17..8.19 rows=1 width=136) (actual time=0.034..0.035 rows=1 loops=1)
  Index Cond: (user_id = '...'::uuid)
  Buffers: shared hit=4
Planning Time: 0.089 ms
Execution Time: 0.052 ms
```

### 2. `review_due` Index-Only Scan
```
Aggregate (cost=8.17..8.18 rows=1 width=8) (actual time=0.076..0.076 rows=1 loops=1)
  ->  Index Only Scan using sr_cards_user_review_idx on sr_cards (cost=0.15..8.17 rows=1 width=0) (actual time=0.069..0.070 rows=2 loops=1)
        Index Cond: ((user_id = '...'::uuid) AND (next_review_date <= CURRENT_DATE))
        Heap Fetches: 0
Planning Time: 0.134 ms
Execution Time: 0.101 ms
```

### 3. RPC Stored Procedure End-to-End
```
Function Scan on get_today_plan (cost=0.25..10.25 rows=1000 width=164) (actual time=6.082..6.084 rows=3 loops=1)
  Buffers: shared hit=17
Planning Time: 0.024 ms
Execution Time: 6.108 ms
```

**Conclusion:** Total execution time is ~6.1 ms with only 17 buffer hits. All critical candidate evaluations leverage direct partial indexes and index-only scans.

---

## 7. Quality Gate Audit Summary

| Check | Tool / Script | Status | Result Details |
|---|---|---|---|
| Migration Versioning | `ls supabase/migrations` | **PASSED** | 196 migrations, zero duplicate version prefixes |
| Schema Manifest | `generate_schema_manifest.js --check-stale` | **PASSED** | Fresh, includes `get_today_plan` |
| Schema Reference Linter | `check_schema_references.js` | **PASSED** | 0 violations across codebase |
| Schema Tool Regression Tests | `check_schema_references.test.js` | **PASSED** | 5 tests + 1 bonus test passing |
| Edge Function Unit Tests | `deno test -A supabase/functions/` | **PASSED** | 373 passed, 0 failed |
| Frontend Unit Tests | `vitest run` | **PASSED** | 307 passed, 41 test files, 0 failed |
| TypeScript Type Check | `npm run type-check` | **PASSED** | 0 type errors |
| ESLint Check | `npm run lint` | **PASSED** | 0 errors, 7 warnings (pre-existing) |
| SQL Persona Suite | `psql -f scripts/test_day7_plan_engine.sql` | **PASSED** | 10/10 scenarios passed |

---

## 8. Known Limitations & Production Impact

- **Production Deployments:** NONE. No code has been deployed to production.
- **Claude Working Tree:** Untouched (`/Users/ag/edora` was never modified).
- **Home UI / React Hooks:** Excluded. Day 8 Home UI and React query hooks remain parked for the Day 8 integration phase.
- **AI Plan Generation:** Excluded. The engine is entirely deterministic and requires no external API keys or background jobs.

---

**Final Status:** `DAY 7 BACKEND READY FOR CONTROLLED INTEGRATION`
