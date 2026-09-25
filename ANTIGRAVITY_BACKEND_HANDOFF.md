# ANTIGRAVITY BACKEND LANE — HANDOFF DOCUMENTATION
**Phase:** Edora V5 Product Readiness & Backend Lane — FINAL PYQ TRUST CLOSURE CLEARED  
**Author:** Antigravity Backend Engineering  
**Branch:** `v5/antigravity-backend`  
**Base Product Commit:** `65f76e65e952bd447e149b755c6fd20b65ddf6a1`  
**Status:** **BACKEND BLOCK READY FOR CONTROLLED INTEGRATION**

---

## 1. Executive Summary

The Antigravity Backend Lane has resolved all security remediations, Edge Function type-checking repairs, model migrations, schema canonicalization, SyncQueue V2 offline durability redesign, exam target normalization, remote feature flags foundation, PYQ strict trust enforcement across all layers, and completed the final PYQ trust closure:

1. **`search_corpus_unified` Security-Definer RAG Bypass Hardened:** Secured the PostgreSQL RPC used by `gemini-chat` with triple-layer defense-in-depth:
   - `pyq_vec` vector search CTE restricts candidates to active, unflagged, reviewed ok/human verified questions.
   - `pyq_fts` full-text search CTE restricts candidates to active, unflagged, reviewed ok/human verified questions.
   - Final `JOIN pyq_content p` enforces the strict trust predicate defensively even if an untrusted row ID entered the CTE.
   - Fixed PL/pgSQL `#variable_conflict use_column` ambiguity and ensured exact `final_score::float8` cast matching the public signature. Preserved `REVOKE FROM public, anon, authenticated` and `GRANT TO service_role`.
2. **`pyq_topic_frequency` View Hardened:** Rewrote view to filter `is_active = true AND flagged_for_review = false AND is_reviewed = true AND validation_state IN ('ai_reviewed_ok', 'human_verified')`, ensuring PYQ bank statistics truthfully reflect student-accessible content.
3. **Mock-Paper Cache Trust Versioning:** Added `PYQ_TRUST_VERSION = 'v5-reviewed-only-1'` into `buildConfigKey()` in `supabase/functions/mock-paper-composer/index.ts`. Any pre-trust cache entries generated prior to strict trust enforcement are invalidated and cannot be served to students. Added 3 comprehensive Deno tests (9/9 passing).
4. **Security-Definer PYQ Function Audit Completed:** Audited all functions accessing `pyq_content`:
   - `search_corpus_unified`: STUDENT-FACING RAG -> Hardened in `20260929000000`.
   - `corpus_coverage_stats`: ADMIN-ONLY -> Returns aggregate chunk counts only.
   - `submit_live_event_answers`: STUDENT-FACING -> Answer evaluation against live events; derives option index, returns no PYQ content to students.
   - `pyq_topic_frequency`: STUDENT-FACING View -> Hardened in `20260929000000`.
   - `hybrid_search_corpus`: NON-EXISTENT / UNUSED -> Verified absent from migrations and codebase.
5. **Real PostgreSQL Migration & RAG Trust Test Executed:** `scripts/test_actual_migration_files.sql` was executed via `\i` against a real PostgreSQL 17 test database. Verified all 5 actual migrations, real-role RLS checks (`anon`, `authenticated`, `service_role`), and executed `search_corpus_unified` under `service_role` authority to confirm that only trusted PYQs are ever returned.

All work was completed inside `/Users/ag/edora-backend` without mutating Claude's product worktree (`/Users/ag/edora`) or the frozen infrastructure branch (`infra/v5-foundation`).

---

## 2. Complete Commit Ancestry

All commits are on `v5/antigravity-backend` relative to product baseline `65f76e6`:

```
827c0f8  fix(pyq-trust): harden search_corpus_unified security-definer RPC, version mock-paper cache, add RAG trust test
8699d0f  fix(pyq+migrations): close service-role PYQ bypass in mock-paper-composer, fix duplicate migration version prefix, add actual migration file test suite
9e2b849  docs(handoff): update ANTIGRAVITY_BACKEND_HANDOFF.md for final pre-integration freeze
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
| `9e2b849` | Handoff | Final pre-integration freeze handoff update |
| `8699d0f` | Blocker Pass | Close service-role PYQ bypass in `mock-paper-composer`, rename duplicate migration `20260927100000`, test actual migration files via `\i` |
| `827c0f8` | PYQ Trust Closure | Harden `search_corpus_unified` security-definer RPC (triple-layer defense), mock-paper cache trust versioning, `pyq_topic_frequency` hardening, real RAG trust test |

---

## 3. Database Migrations Added

| File | Purpose | Verification Status |
| :--- | :--- | :--- |
| `20260927100000_v5_exam_target_normalization.sql` | `exam_name` default `'GENERAL'`, backfill NULLs, BEFORE INSERT/UPDATE trigger | Tested & Verified in PostgreSQL 17 (Unique Timestamp) |
| `20260928000000_v5_app_flags.sql` | `app_flags` table + `get_app_flags()` RPC + grants (fail-closed seed: `battle=false`, `new_home=false`) | Tested & Verified in PostgreSQL 17 |
| `20260929000000_v5_pyq_student_access_enforcement.sql` | Drops `pyq_public_read`; creates `pyq_student_reviewed_read` (strict review gate) + `service_role` admin policy + hardens `search_corpus_unified` RPC + hardens `pyq_topic_frequency` view | Tested & Verified in PostgreSQL 17 (Triple-Layer Defense) |

---

## 4. Verification Results

### 4.1 Deno Tests
```
ok | 373 passed | 0 failed (3s)
```
Includes:
- `mock-paper-composer/mock-paper-composer.test.ts` — 9 tests (candidate selection: unreviewed, flagged, rejected, ai_reviewed_ok, human_verified, query chain; cache trust versioning: invalidates old keys, deterministic new keys, unreviewed never enter cached paper)
- `nova-insights/auth.test.ts` — 12 tests (cron secret, service role, user JWT 403, invalid headers)
- `app-flags/app-flags.test.ts` — 4 tests (canonical defaults, OPTIONS CORS, 405 method, unconfigured fallback)

### 4.2 Vitest Tests
```
Test Files  16 passed (16)
Tests       128 passed (128)
```
Includes:
- `src/lib/syncQueue.test.ts` — 17 tests (DLQ, retry classification, temporal-window pruning isolation)
- `src/lib/appFlags.test.ts` — 12 tests (fail-closed defaults, remote overrides, network failure preservation)
- All scoring, repetition, adaptive difficulty, and experiment tests

### 4.3 TypeScript Type Check
```
tsc -b --noEmit → exit 0 (0 errors)
```

### 4.4 Deno Type Check
```
deno check supabase/functions/mock-paper-composer/index.ts
deno check supabase/functions/mock-paper-composer/mock-paper-composer.test.ts
deno check supabase/functions/app-flags/index.ts
deno check supabase/functions/nova-insights/index.ts
deno check supabase/functions/nova-insights/auth.ts
deno check supabase/functions/nova-insights/auth.test.ts
deno check supabase/functions/novo-memory/index.ts
deno check supabase/functions/gemini-chat/index.ts
→ All exit 0 (0 errors)
```

### 4.5 Execution of Actual Repository Migration Files (`\i`)
Executed via `scripts/test_actual_migration_files.sql` against a clean PostgreSQL 17 database:
```
\i supabase/migrations/20260926000000_v5_complete_quiz_session.sql     -> SUCCESS
\i supabase/migrations/20260927000000_v5_ai_health_view.sql            -> SUCCESS
\i supabase/migrations/20260927100000_v5_exam_target_normalization.sql -> SUCCESS
\i supabase/migrations/20260928000000_v5_app_flags.sql                 -> SUCCESS
\i supabase/migrations/20260929000000_v5_pyq_student_access_enforcement.sql -> SUCCESS

ALL 5 ACTUAL MIGRATIONS APPLIED SUCCESSFULLY
VERIFICATION 1 PASS: complete_quiz_session RPC created and verified idempotent
VERIFICATION 2 PASS: ai_health_view permissions restricted to service_role
VERIFICATION 3 PASS: exam_target_normalization trigger guarantees GENERAL fallback
VERIFICATION 4 PASS: app_flags created with fail-closed defaults and strict RLS/grants
REAL-ROLE anon PASS: Strictly restricted to active, reviewed questions (2/5)
REAL-ROLE authenticated PASS: Strictly restricted to active, reviewed questions (2/5)
REAL-ROLE service_role PASS: Full administrative visibility retained (5/5)
GEMINI-CHAT RAG TRUST TEST PASS: search_corpus_unified returned exactly 2/2 trusted PYQs (0 untrusted)
VERIFICATION 6 PASS: pyq_topic_frequency view counts strictly reviewed questions (2)
ALL VERIFICATIONS PASSED CLEANLY
```

### 4.6 Migration Version Uniqueness Check
Scanned all 195 migrations in `supabase/migrations/`:
```
Total migrations: 195
Duplicates found: 0
SUCCESS: All migration versions are uniquely named.
```

### 4.7 Schema Static CI Guard
```
Checking codebase against 223 tables and 89 RPC functions...
✓ PASSED: All table and critical schema references are valid (0 violations, 20 non-blocking warnings).
ALL 5 REGRESSION CASES (PLUS RPC WARNING CHECK) PASSED.
```

---

## 5. Security-Definer & Service-Role PYQ Audit Disposition

RLS protects all client queries made with `anon` or `authenticated` roles (`LiveEventPage.tsx`, `MockTestPage.tsx`, `RegionalLanguagePage.tsx`, `PYQBankPage.tsx`). Edge Functions and SECURITY DEFINER RPCs bypass standard table RLS. All functions touching `pyq_content` have been thoroughly audited and classified:

| Component / Function | Type / Role | Student-Facing? | Audit Classification & Disposition |
| :--- | :--- | :--- | :--- |
| `mock-paper-composer` | Edge Function (`service_role`) | **YES** | **FIXED:** Candidate query explicitly requires `.eq('is_active', true).eq('flagged_for_review', false).eq('is_reviewed', true).in('validation_state', ['ai_reviewed_ok', 'human_verified'])`. Cache key versioned with `PYQ_TRUST_VERSION = 'v5-reviewed-only-1'` to invalidate pre-trust caches. Tested via 9 unit tests. |
| `search_corpus_unified` | RPC (`SECURITY DEFINER`, called by `gemini-chat`) | **YES** | **FIXED:** Hardened in migration `20260929000000` with triple-layer defense-in-depth (`pyq_vec` CTE, `pyq_fts` CTE, final `JOIN pyq_content p`). Only returns active, unflagged, reviewed ok/human verified questions to Novo RAG context. Tested via PostgreSQL test suite. |
| `submit_live_event_answers` | RPC (`SECURITY DEFINER`) | **YES** | **SAFE:** Internal answer evaluation against live event questions. Computes user score by verifying selected option index; returns no PYQ question content or solutions to learners. |
| `pyq_topic_frequency` | View (`anon`, `auth`, `service_role`) | **YES** | **FIXED:** Hardened in migration `20260929000000` to filter strictly for active, unflagged, reviewed content so heatmap frequencies match visible content. |
| `corpus_coverage_stats` | RPC (`SECURITY DEFINER`) | NO | **ADMIN-ONLY:** Returns aggregate chunk counts per corpus source for administrative monitoring. Does not return question content or student data. |
| `pyq-bulk-ingest` | Edge Function (`service_role`) | NO | Administrative ingestion tool for staff/moderators. Does not serve learners. |
| `pyq-embed-ingest` | Edge Function (`service_role`) | NO | Administrative embedding generation tool. Does not serve learners. |
| `backfill-corpus-embeddings` | Edge Function (`service_role`) | NO | Background maintenance worker. Does not serve learners. |
| `admin-console` | Edge Function (`service_role`) | NO | Internal administrative console. Does not serve learners. |
| `pyq-ingest` | Edge Function (`service_role`) | NO | Single-file content ingestion. Does not serve learners. |
| `pyq-content-audit` | Edge Function (`service_role`) | NO | Internal moderation tool that intentionally inspects unreviewed rows for human/AI review. Does not serve learners. |
| `hybrid_search_corpus` | RPC Reference | NO | **NON-EXISTENT / UNUSED:** Confirmed non-existent in any migration or codebase file (was only a speculative mention in older comment). |

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
  d2d5a6a \
  8699d0f \
  827c0f8
```

---

## 7. Constraints Honored

- ❌ No cherry-picks into `release/5.0.0-landmark` (Claude's branch)
- ❌ No production deployment (`supabase db push`, function deploys)
- ❌ No mutations to `/Users/ag/edora` (Claude's worktree)
- ❌ No mutations to `/Users/ag/edora-infra` (frozen infra)
- ❌ `score_pct` column NOT added to `quiz_sessions` (held per audit)
- ❌ AI-audited content NOT labeled "Human verified"
- ✅ All work on dedicated `v5/antigravity-backend` worktree
