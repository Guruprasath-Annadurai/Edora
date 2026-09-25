# EDORA V5 — DAY 7 BACKEND EVIDENCE REPORT: TODAY'S PLAN DETERMINISTIC ENGINE

**Date:** 2026-09-26  
**Author:** Antigravity Backend Agent  
**Product Branch Baseline:** `release/5.0.0-landmark`  
**Authoritative Starting SHA:** `8c28a4a6b2680773d96e9a7441b37ecab32be4ff`  
**Feature Branch:** `v5/day7-plan-backend`  
**Worktree:** `/Users/ag/edora-day7-backend`  

---

## 1. Executive Summary

In accordance with Edora V5 architecture directives and the Day 7 pre-integration corrections, the deterministic **Today's Plan** backend engine has been finalized in PostgreSQL stored procedure [`public.get_today_plan()`](file:///Users/ag/edora-day7-backend/supabase/migrations/20260930000000_v5_get_today_plan.sql).

Key architectural characteristics:
- **Zero AI / Zero LLM Overhead:** Plan generation is 100% deterministic, immediate, and free from external API latency, token costs, or hallucinations.
- **Strictly User-Scoped:** Derives identity exclusively from `auth.uid()`. Unauthenticated callers are rejected immediately with SQLSTATE `42501` (`insufficient_privilege`).
- **Defensive Privilege Model:** Function is declared `SECURITY DEFINER` with `SET search_path = ''`. Execution privilege is granted **exclusively** to `authenticated` and revoked from `public`, `anon`, and `service_role`.
- **Bounded Output Contract:** Returns at most 3 items sorted by canonical priority (1 to 5).
- **Core Route Allowlist Enforced:** Every item returned is strictly routed to the V5 core route allowlist:
  - `review_due`  $\rightarrow$ `/spaced-review`
  - `fix_weak`    $\rightarrow$ `/practice`
  - `diagnostic`  $\rightarrow$ `/practice`
  - `learn_next`  $\rightarrow$ `/practice`
  - `exam_push`   $\rightarrow$ `/pyq-bank`
- **Zero Invented Curriculum Heuristics:** `learn_next` strictly follows a 3-tier hierarchy based on real learner data. If class or subject cannot be defensibly established from chapter progress or explicit `study_preferences`, `learn_next` is omitted.
- **Tight CBSE Board Class Relevance:** For `CBSE 10` and `CBSE 12`, `exam_push` strictly requires exact matching `class_level = '10'` and `'12'` respectively. Questions with `class_level IS NULL` or cross-class levels are strictly rejected.

---

## 2. Migration Details

- **Migration File:** [`supabase/migrations/20260930000000_v5_get_today_plan.sql`](file:///Users/ag/edora-day7-backend/supabase/migrations/20260930000000_v5_get_today_plan.sql)
- **Migration Prefix Uniqueness:** Verified unique prefix across all 196 migration files in `supabase/migrations/`.
- **Supporting Indexes:**
  - `idx_subtopic_mastery_plan_weak` on `public.subtopic_mastery (user_id, mastery_score ASC, attempts DESC, last_attempted_at ASC)` with partial filter `WHERE attempts >= 3 AND mastery_score < 0.5`.
  - Leverages existing index `sr_cards_user_review_idx` on `public.sr_cards (user_id, next_review_date)`.
- **Permissions:**
  ```sql
  REVOKE ALL ON FUNCTION public.get_today_plan() FROM public, anon, service_role;
  GRANT EXECUTE ON FUNCTION public.get_today_plan() TO authenticated;
  ```

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

### Output Schema:
| Column | Type | Target Route Contract | Description |
|---|---|---|---|
| `kind` | `TEXT` | N/A | Identifier: `'review_due'`, `'fix_weak'`, `'diagnostic'`, `'learn_next'`, or `'exam_push'` |
| `priority` | `INTEGER` | N/A | Canonical priority rank (1 through 5) |
| `title` | `TEXT` | N/A | Student-facing action headline |
| `duration_minutes` | `INTEGER` | N/A | Bounded estimated duration (e.g. 10, 15, 20, 25) |
| `target_path` | `TEXT` | `IN ('/spaced-review', '/practice', '/pyq-bank')` | Client routing path strictly restricted to V5 core allowlist |
| `target_params` | `JSONB` | JSON object | Structured parameters for navigation without raw URL string formatting |
| `subject` | `TEXT` | Nullable | Subject string |
| `chapter` | `TEXT` | Nullable | Chapter title |
| `topic` | `TEXT` | Nullable | Subtopic title |
| `reason` | `JSONB` | JSON object | Structured telemetry payload |

---

## 4. Priority Hierarchy & Business Logic

### Priority 1: `review_due`
- **Source:** `public.sr_cards`
- **Trigger:** Cards with `user_id = auth.uid()` and `next_review_date <= CURRENT_DATE`.
- **Target Path:** `/spaced-review`
- **Target Params:** `{"due_count": N}`

### Priority 2: `fix_weak`
- **Source:** `public.subtopic_mastery`
- **Trigger:** Subtopic with `attempts >= 3` and `mastery_score < 0.5`.
- **Deterministic Selection:** `ORDER BY mastery_score ASC, attempts DESC, last_attempted_at ASC NULLS FIRST, subtopic ASC, id ASC LIMIT 1`.
- **Target Path:** `/practice`
- **Target Params:** `{"mode": "weak_topic", "subject": subject, "subtopic": subtopic}`

### Priority 3: `diagnostic`
- **Source:** Multi-table learner activity evaluation:
  - `quiz_sessions`
  - `subtopic_mastery`
  - `topic_performance`
  - `ncert_chapter_progress`
- **Trigger:** Evaluated ONLY if the learner has zero prior records across all four activity tables.
- **Target Path:** `/practice`
- **Target Params:** `{"mode": "diagnostic", "questions_count": 5}`

### Priority 4: `learn_next`
- **Source:** `public.ncert_chapter_progress` $\rightarrow$ `public.ncert_chapters` $\rightarrow$ `profiles.study_preferences`.
- **Strict 3-Tier Hierarchy (Zero Heuristics):**
  1. **Hierarchy A (Existing Chapter Progress):**
     - Queries most recent chapter progress row by `updated_at DESC`.
     - If chapter is **incomplete** (`completed_at IS NULL`): recommends **that current chapter** (does NOT jump back to chapter 1).
     - If chapter is **completed** (`completed_at IS NOT NULL`): recommends the **next `chapter_num`** in the same `class_num` and `subject`.
  2. **Hierarchy B (Explicit Profile Preferences):**
     - Evaluated only when no chapter progress exists.
     - Reads explicit `class` / `grade` / `class_level` and `subjects[0]` from `profiles.study_preferences`.
     - Recommends the first deterministic chapter (`chapter_num ASC`) for that class and subject.
  3. **Hierarchy C (Insufficient Data):**
     - If class or subject cannot be reliably determined from real learner data, `learn_next` is **omitted**.
     - No guessing or exam-name defaults (e.g. NO `JEE -> Physics`, NO `NEET -> Biology`, NO `CBSE -> Science/Physics`).
- **Target Path:** `/practice`
- **Target Params:**
  ```json
  {
    "mode": "learn_next",
    "class": 11,
    "subject": "Physics",
    "chapter_id": "...",
    "chapter": "Work Energy and Power"
  }
  ```

### Priority 5: `exam_push`
- **Source:** `public.profiles` $\rightarrow$ `public.pyq_content`.
- **Trigger:** Profile target exam is not `GENERAL`/`NULL`, exam date is within 14 days (`0 <= days_left <= 14`), and trusted PYQ supply exists.
- **Strict Class Relevance & Trust Policy:**
  - `CBSE 10`: requires `exam = 'BOARDS' AND class_level = '10'`. Questions with `class_level IS NULL` or `'12'` are ineligible.
  - `CBSE 12`: requires `exam = 'BOARDS' AND class_level = '12'`. Questions with `class_level IS NULL` or `'10'` are ineligible.
  - `JEE Main` / `JEE Advanced` / `NEET` / `BITSAT` / `CAT` / `UPSC`: matched on normalized exam enum.
  - Strict trust predicate enforced: `is_active = true AND flagged_for_review = false AND is_reviewed = true AND validation_state IN ('ai_reviewed_ok', 'human_verified')`.
- **Target Path:** `/pyq-bank`
- **Target Params:** `{"exam": exam, "days_remaining": days_left}`

---

## 5. Verification Test Suite & Results

The complete verification suite [`scripts/test_day7_plan_engine.sql`](file:///Users/ag/edora-day7-backend/scripts/test_day7_plan_engine.sql) was executed against a disposable PostgreSQL 17 test database.

### Test Log Output:
```
--- Security & Permission Checks ---
NOTICE:  SECURITY PASS: Unauthenticated caller rejected with 42501 (insufficient privilege)
NOTICE:  SECURITY PASS: Role privileges verified (authenticated=true, anon=false, service_role=false).

--- PYQ Trust Policy Checks ---
NOTICE:  PYQ TRUST TEST PASS: Strictly trusted questions activate exam_push; unreviewed/flagged/rejected/inactive blocked.

--- CBSE Strict Class Relevance Checks ---
NOTICE:  CBSE TRUST TEST PASS: Strict class relevance enforced (Class 10 requires trusted class_level=10; null and class 12 blocked).

--- Persona Checks ---
NOTICE:  PERSONA A PASS: No history produced exactly 1 diagnostic item; no invented learn_next emitted.
NOTICE:  PERSONA B PASS: Weakest eligible subtopic deterministically won (Center of Mass, mastery 0.20).
NOTICE:  PERSONA C PASS: Review due is priority 1 with exact due count (2).
NOTICE:  PERSONA D PASS: Exam in 7 days with trusted PYQs activated exam_push at priority 5.
NOTICE:  PERSONA E PASS: GENERAL learner never receives exam_push.
NOTICE:  PERSONA M PASS: 4 candidates strictly cut to top 3 in canonical order (review_due, fix_weak, learn_next). Exam push safely bounded.

--- learn_next Hierarchy Checks ---
NOTICE:  LEARN NEXT TESTS PASS: Active chapter respected, completed advances to next, explicit preferences honored, zero heuristics for insufficient data.

--- Target Path Allowlist Checks ---
NOTICE:  TARGET PATH ALLOWLIST PASS: 100% of items across all test personas adhere strictly to V5 core routes (/spaced-review, /practice, /pyq-bank).

--- Cross-User Isolation ---
NOTICE:  CROSS-USER ISOLATION PASS: Zero cross-user data leakage between callers.
```

---

## 6. Query Plan Observations (Local Disposable Fixture Only)

> [!NOTE]
> The performance metrics below are observations from a **local disposable PostgreSQL 17 test fixture** with synthetic data. They are **not** production capacity measurements and must not be interpreted as benchmark representations for 100k+ concurrent users.

### Partial Index Scan on `fix_weak`
```
Limit  (cost=8.17..8.19 rows=1 width=100) (actual time=0.006..0.006 rows=1 loops=1)
  Buffers: shared hit=2
  ->  Incremental Sort  (cost=8.17..8.21 rows=2 width=100) (actual time=0.005..0.006 rows=1 loops=1)
        Sort Key: mastery_score, attempts DESC, last_attempted_at NULLS FIRST, subtopic, id
        Presorted Key: mastery_score, attempts
        Full-sort Groups: 1  Sort Method: quicksort
        Buffers: shared hit=2
        ->  Index Scan using idx_subtopic_mastery_plan_weak on subtopic_mastery  (cost=0.14..8.16 rows=1 width=100) (actual time=0.002..0.003 rows=2 loops=1)
              Index Cond: (user_id = '...'::uuid)
Planning Time: 0.062 ms
Execution Time: 0.012 ms
```

### Index-Only Scan on `review_due`
```
Aggregate  (cost=8.17..8.18 rows=1 width=4) (actual time=0.032..0.032 rows=1 loops=1)
  Buffers: shared hit=2
  ->  Index Only Scan using sr_cards_user_review_idx on sr_cards  (cost=0.15..8.17 rows=1 width=0) (actual time=0.023..0.025 rows=2 loops=1)
        Index Cond: ((user_id = '...'::uuid) AND (next_review_date <= CURRENT_DATE))
        Heap Fetches: 2
Planning Time: 0.143 ms
Execution Time: 0.055 ms
```

### Full RPC Execution Observation
```
Function Scan on get_today_plan  (cost=0.25..10.25 rows=1000 width=264) (actual time=1.102..1.102 rows=3 loops=1)
  Buffers: shared hit=14
Planning Time: 0.034 ms
Execution Time: 1.163 ms
```

---

## 7. Quality Gate Audit Summary

| Check | Tool / Command | Result |
|---|---|---|
| Migration Uniqueness | `ls supabase/migrations/*.sql` check | **PASSED** (0 duplicate prefixes across 196 migrations) |
| Schema Manifest Freshness | `node scripts/schema/generate_schema_manifest.js --check-stale` | **PASSED** (Manifest matches database migrations) |
| Schema Reference Linter | `node scripts/schema/check_schema_references.js` | **PASSED** (0 table/RPC reference violations) |
| Schema Reference Unit Tests | `node scripts/schema/check_schema_references.test.js` | **PASSED** (5 tests + 1 bonus test passing) |
| Edge Function Unit Tests | `deno test -A supabase/functions/` | **PASSED** (373 passed, 0 failed) |
| Frontend Vitest Suite | `npm test` | **PASSED** (307 passed, 41 files, 0 failed) |
| TypeScript Type Check | `npm run type-check` (`tsc -b --noEmit`) | **PASSED** (0 type errors) |
| ESLint Check | `npm run lint` | **PASSED** (0 errors, 7 non-blocking warnings) |
| SQL Verification Suite | `psql -f scripts/test_day7_plan_engine.sql` | **PASSED** (All 15 verification sections clean) |

---

## 8. Commitments & Production Impact

- **Production Deployment:** NONE.
- **Claude Working Tree:** Untouched (`/Users/ag/edora` unmodified).
- **Home UI / React Presentation:** Excluded.
- **Remote Branch:** Strictly `v5/day7-plan-backend`.

---

**Final Status:** `DAY 7 BACKEND READY FOR CONTROLLED INTEGRATION`
