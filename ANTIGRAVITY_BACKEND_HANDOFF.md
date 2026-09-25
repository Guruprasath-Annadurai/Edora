# ANTIGRAVITY BACKEND LANE — HANDOFF DOCUMENTATION
**Phase:** Edora V5 Product Readiness & Backend Lane  
**Author:** Antigravity Backend Engineering  
**Branch:** `v5/antigravity-backend`  
**Base Product Commit:** `65f76e65e952bd447e149b755c6fd20b65ddf6a1`  
**Final Backend HEAD:** `049c0c1b752dfa7c73ec5c545367b7eb731f8664`  
**Status:** **ANTIGRAVITY BACKEND BLOCK READY FOR INTEGRATION**

---

## 1. Executive Summary

The Antigravity Backend Lane has executed all mandated security remediations, Edge Function type-checking repairs, model migrations, schema canonicalization, SyncQueue V2 offline durability redesign, exam target normalization, and remote feature flags foundation.

All work was completed inside the dedicated worktree `/Users/ag/edora-backend` without mutating Claude's product worktree (`/Users/ag/edora`) or the frozen infrastructure branch (`infra/v5-foundation`).

### Key Accomplishments
1. **P0 Security Remediated (`nova-insights`):** Eliminated arbitrary bearer token acceptance and cross-user data manipulation. Added fail-closed JWT validation and 11 adversarial security tests.
2. **Day 2 Backend Restored:** Resolved all 25 Deno type errors in `gemini-chat`; verified all 6 previously orphaned edge functions with 0 errors; migrated decommissioned `gemini-1.5-flash` model references to `gemini-flash-latest`; hardened `novo-morning-brief` with Groq primary (`openai/gpt-oss-20b`), safe fallbacks, and a kill-switch to eliminate the 882 error/week loop.
3. **Day 3 Backend Memory & PYQ Truth:** Canonicalized `novo_memories` `memory_type` vocabulary across all writers (`adaptive-curriculum`, `lesson-planner`, `novo-certifications`, `tutoring-engine`, `novo-memory`) to match live PostgreSQL constraints. Corrected pgvector write format from JSON string to native vector syntax. Gated `mock-paper-composer` with `is_active = true`, `flagged_for_review = false`, and `validation_state != 'rejected'` to protect students from bad questions.
4. **Day 4 SyncQueue V2:** Redesigned `SyncQueue` with Supabase `{ error }` response inspection, permanent vs. retryable error classification, Dead-Letter Queue (DLQ), durable single-item persistence transitions, and automatic canonical transformation of legacy `quiz_session` entries to `complete_quiz_session` RPC while pruning paired `xp_grant` / `topic_perf` to prevent double XP. Held `score_pct` migration untouched.
5. **Exam Target Contract:** Implemented non-null `exam_name` with fallback `'GENERAL'` via transparent trigger migration that guarantees 100% backward-compatibility for legacy 4.0.0 clients while enforcing the contract on the backend.
6. **Day 5 App Flags Backend:** Built generic remote feature flags table (`app_flags`), compact aggregation RPC (`get_app_flags()`), edge function with CDN caching headers (`app-flags`), client SDK with caching and safe defaults (`src/lib/appFlags.ts`), and unit tests.
7. **Infra Integration Checkpoint Verified:** Disposable branch schema-guard validation passed with **0 errors**. Legacy `score_pct` failure is completely resolved.

---

## 2. Commit Ancestry & Details

The backend block comprises 6 clean, atomic commits on `v5/antigravity-backend` relative to product baseline `65f76e6`:

```
049c0c1 feat(flags): implement Day 5 remote feature flags backend, edge function, client SDK, and unit tests
ba02595 feat(backend): implement exam target normalization contract with GENERAL fallback and 4.0.0 compatibility
0c1476e fix(sync-queue): implement SyncQueue V2 with DLQ, error classification, durable transitions, and canonical legacy quiz migration
2abdea1 fix(backend): canonicalize novo_memories memory_type across all writers, fix embedding vector write format, enforce pyq student protection
5f93da4 fix(backend): resolve gemini-chat 25 deno errors, verify 6 recovered functions, migrate decommissioned models, harden novo-morning-brief
e4ba84f fix(security): patch nova-insights arbitrary bearer acceptance and cross-user vulnerability
```

### Commit Details:

| Commit SHA | Component | Description | Key Files Modified |
| :--- | :--- | :--- | :--- |
| `e4ba84f` | Security P0 | Hardened `nova-insights` bearer token auth and user isolation | `supabase/functions/nova-insights/auth.ts`, `auth.test.ts`, `index.ts` |
| `5f93da4` | Functions / Models | Fixed 25 `gemini-chat` Deno errors, updated models to `gemini-flash-latest`, hardened `novo-morning-brief` | `gemini-chat/index.ts`, `novo-morning-brief/index.ts`, `mistake-clustering/index.ts`, `mock-paper-composer/index.ts`, `question-explain/index.ts` |
| `2abdea1` | Memory / PYQ | Canonicalized `novo_memories` types, fixed pgvector formatting, gated question composer | `adaptive-curriculum/index.ts`, `lesson-planner/index.ts`, `novo-certifications/index.ts`, `tutoring-engine/index.ts`, `novo-memory/index.ts`, `novo-memory/validate.ts`, `mock-paper-composer/index.ts` |
| `0c1476e` | SyncQueue V2 | Implemented DLQ, error classification, durable transitions, legacy `quiz_session` RPC migration | `src/lib/syncQueue.ts`, `src/lib/syncQueue.test.ts` |
| `ba02595` | Exam Target | Added normalization trigger for `exam_name != NULL` with fallback `'GENERAL'` | `supabase/migrations/20260927000000_v5_exam_target_normalization.sql`, `gemini-chat/index.ts` |
| `049c0c1` | App Flags | Added `app_flags` table, RPC, Edge Function, and client SDK with caching and unit tests | `supabase/migrations/20260928000000_v5_app_flags.sql`, `supabase/functions/app-flags/*`, `src/lib/appFlags.ts`, `src/lib/appFlags.test.ts` |

---

## 3. Database Migrations Added

Two additive, backward-compatible migrations were added in this block:

1. **`supabase/migrations/20260927000000_v5_exam_target_normalization.sql`**:
   - Sets column default on `public.profiles.exam_name` to `'GENERAL'`.
   - Backfills existing NULL or whitespace-only rows to `'GENERAL'`.
   - Adds trigger `trg_normalize_profile_exam_name` (`BEFORE INSERT OR UPDATE OF exam_name ON public.profiles`) that coerces NULL or empty strings to `'GENERAL'`.
   - **4.0.0 Compatibility:** Legacy clients writing NULL or omitting `exam_name` succeed without error.
2. **`supabase/migrations/20260928000000_v5_app_flags.sql`**:
   - Creates `public.app_flags (flag_name TEXT PRIMARY KEY, enabled BOOLEAN, description TEXT, metadata JSONB, updated_at TIMESTAMPTZ)`.
   - RLS enabled: `SELECT` granted to `anon` and `authenticated`. Write operations restricted to `service_role`.
   - Seeds initial V5 flags: `novo_enabled`, `ai_generation_enabled`, `pyq_enabled`, `battle_enabled`, `new_home_enabled`, `pro_enabled`.
   - Stored function `public.get_app_flags()`: Returns compact JSON key-value object (`{ [flag_name]: boolean }`).

*Note on Held Migration:* `supabase/held/20260926_quiz_sessions_score_pct.HELD.sql` remains intentionally HELD. No `score_pct` column was added to `public.quiz_sessions`.

---

## 4. Test & Verification Evidence

All verification suites pass cleanly across web, edge, and schema tooling:

### 1. Deno Test Suite (`supabase/functions/`)
- Command: `deno test -A supabase/functions/`
- Result: **363 passed, 0 failed**.
- Includes:
  - 11 adversarial unit tests in `nova-insights/auth.test.ts`
  - 4 integration/unit tests in `app-flags/app-flags.test.ts`
  - All existing edge function validation tests (tutoring-engine, tournament, teacher-export, etc.)

### 2. Deno Check
- Verified all recovered functions and modified edge functions:
  - `gemini-chat/index.ts` (0 errors, down from 25)
  - `nova-insights/index.ts` (0 errors)
  - `mock-paper-composer/index.ts` (0 errors)
  - `mistake-clustering/index.ts` (0 errors)
  - `pyq-bulk-ingest/index.ts` (0 errors)
  - `pyq-embed-ingest/index.ts` (0 errors)
  - `question-explain/index.ts` (0 errors)
  - `novo-morning-brief/index.ts` (0 errors)
  - `app-flags/index.ts` (0 errors)

### 3. Frontend Vitest Suites
- `src/lib/syncQueue.test.ts`: **10 passed, 0 failed**
  - Instant per-item queue persistence
  - DLQ routing on unrecoverable errors (RLS / bad schema)
  - DLQ routing after 5 exhausted retries
  - Offline retry preservation (batch pause on network drop)
  - Legacy `quiz_session` transformation to `complete_quiz_session` RPC
  - Paired `xp_grant` / `topic_perf` pruning to prevent double XP
- `src/lib/quizPersistence.test.ts`: **8 passed, 0 failed**
- `src/lib/appFlags.test.ts`: **5 passed, 0 failed**
- TypeScript type-check: `npm run type-check` (`tsc -b --noEmit`): **0 errors**.

### 4. Infrastructure Schema Guard Checkpoint
- Tested on disposable verification branch bringing in `scripts/schema/` from frozen `infra/v5-foundation`:
  - `node scripts/schema/generate_schema_manifest.js`: **220 tables, 84 functions discovered**.
  - `node scripts/schema/generate_schema_manifest.js --check-stale`: **PASSED (up-to-date)**.
  - `node scripts/schema/check_schema_references.js`: **PASSED (0 errors, 20 documented warnings)**.
  - `node scripts/schema/check_schema_references.test.js`: **ALL 5 REGRESSION CASES PASSED**.

---

## 5. Security & Reliability Findings

1. **`nova-insights` Bearer Authentication & Cross-User Hardening:**
   - Previous vulnerability allowed unauthenticated requests or arbitrary user ID query manipulation.
   - Now enforces JWT verification via Supabase Auth API (`auth.getUser()`), matches authenticated user against payload `user_id`, targets `novo_insights` table, and throws `401 Unauthorized` / `403 Forbidden` fail-closed.
2. **`novo-morning-brief` Runaway Incident Prevention:**
   - Prior to this lane, `novo-morning-brief` experienced 882 errors/week due to missing model routing.
   - Added primary generation via Groq `openai/gpt-oss-20b`, fallback to `gemini-flash-latest`, a deterministic fallback brief for total offline/API failure, and emergency kill-switches (`NOVO_MORNING_BRIEF_ENABLED` / `MORNING_BRIEF_ENABLED`).
3. **Database Constraint Integrity on `novo_memories`:**
   - Functions were writing non-existent memory types (`struggle`, `milestone`, `strength`), causing silent PostgreSQL CHECK constraint rejections.
   - All callers now use canonical vocabulary: `learning_pattern`, `academic_goal`, `personal_fact`, `emotion`, `achievement`, `fact`.
4. **pgvector Literal Formatting:**
   - Vector columns were previously sent as stringified JSON `"[0.1, 0.2, ...]"` which failed Postgres vector parser.
   - Normalized to native PostgreSQL array syntax `"[0.1,0.2,...]"`.

---

## 6. Integration Contracts for Claude (UI / Product Lane)

### Contract 1: SyncQueue V2 & Quiz Persistence
- **No Direct Table Inserts:** Never call `supabase.from('quiz_sessions').insert()` or `supabase.rpc('increment_xp')` directly from quiz UI.
- **Single Persistence Authority:** Always use `persistCompletedQuiz(input)` from `@/lib/quizPersistence`. It mints a run-specific `sessionId` and delegates to the server RPC `complete_quiz_session`.
- **Dead-Letter Queue Inspection:** If building an administrative diagnostic screen, call `SyncQueue.getDeadLetterQueue()` to view failed items.

### Contract 2: Exam Target Contract
- **Backend Guarantees Non-Null:** `profile.exam_name` is guaranteed to be a string (coerced to `'GENERAL'` if unset or empty).
- **UI Contract:** Claude can safely bind to `profile.exam_name`. If `profile.exam_name === 'GENERAL'`, the learner has not targeted a specific competitive exam.

### Contract 3: Remote Feature Flags (`@/lib/appFlags`)
- **Synchronous Check:** `getCachedAppFlag('flag_name')` returns `boolean` immediately from memory (defaults to `true`).
- **Asynchronous Check:** `await isFeatureEnabled('flag_name')` checks cache or refreshes from server.
- **Available Flags:**
  - `novo_enabled`: Master switch for Novo AI features.
  - `ai_generation_enabled`: Real-time quiz/lesson LLM calls.
  - `pyq_enabled`: Previous Year Questions explorer.
  - `battle_enabled`: Multiplayer quiz battles.
  - `new_home_enabled`: Modular V5 home dashboard.
  - `pro_enabled`: Pro subscription checks.

---

## 7. Deployment Ordering & Rollback Plan

### Deployment Ordering
1. **Step 1 (Database Migrations):**
   Apply in order via `supabase db push` or migration pipeline:
   - `20260927000000_v5_exam_target_normalization.sql`
   - `20260928000000_v5_app_flags.sql`
2. **Step 2 (Edge Functions):**
   Deploy hardened and verified edge functions:
   - `supabase functions deploy nova-insights`
   - `supabase functions deploy gemini-chat`
   - `supabase functions deploy novo-morning-brief`
   - `supabase functions deploy mock-paper-composer`
   - `supabase functions deploy mistake-clustering`
   - `supabase functions deploy question-explain`
   - `supabase functions deploy novo-memory`
   - `supabase functions deploy app-flags`
3. **Step 3 (Client Application Integration):**
   Integrate `v5/antigravity-backend` commit sequence into `release/5.0.0-landmark`.
4. **Step 4 (Infrastructure Sequence Cherry-Pick):**
   Execute Sequence A (Safe Non-Migration) from `docs/infra/INFRA_INTEGRATION_MANIFEST.md`.

### Rollback Plan
- **Database Migrations:**
  - `trg_normalize_profile_exam_name`: `DROP TRIGGER IF EXISTS trg_normalize_profile_exam_name ON public.profiles;`
  - `app_flags`: `DROP TABLE IF EXISTS public.app_flags CASCADE; DROP FUNCTION IF EXISTS public.get_app_flags();`
- **SyncQueue:** Revert `src/lib/syncQueue.ts` to `65f76e6` (no breaking storage schema changes).
- **Edge Functions:** Re-deploy previous revision via Supabase CLI.

---

## 8. Open Blockers & Final Verdict

- **Open Blockers:** **NONE.** All tests pass, type checks pass, security tests pass, and schema reference guards pass with 0 errors.

### Final Verdict:
**ANTIGRAVITY BACKEND BLOCK READY FOR INTEGRATION**
