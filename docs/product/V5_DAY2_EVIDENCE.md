# V5 Day 2 — AI reliability, memory persistence, source recovery

Branch `release/5.0.0-landmark`. Starting SHA `4853cfb7099d31f6d38fc645d979e916d3a61f12` (Day 1 closeout). Ending SHA: `git log -1` of the commit that adds this file.
**Status: CODE-COMPLETE AND TESTED LOCALLY. NOT DEPLOYED. No production write of any kind was made in Day 2** (read-only queries only).

## Root cause of empty `novo_memories` (F6) — found by reading production, not by `waitUntil`
Production `novo_memories` has `CHECK memory_type IN (learning_pattern, academic_goal, personal_fact, emotion, achievement, fact)`
and `CHECK source IN (chat, sprint, quiz, tutoring, debate, system)`; 0 rows.
gemini-chat asked the model for `struggle|strength|preference|milestone|exam_context` (and its tools wrote `struggle`,
`schedule_request`, `note`, source `novo_auto`). Nearly every insert violated the CHECK; the error was never inspected and a
blanket `catch {}` hid it. `waitUntil` was still added (plan §8.4) but was **not** the cause.
Fix: extractor prompt + normaliser now use the DB vocabulary (legacy words are mapped), `extractMemories()` reports a named stage
for every failure, tool handlers write valid values and tell the model the truth when a write fails, and both extraction paths are
registered with `EdgeRuntime.waitUntil` (`runInBackground`). Also raised extractor `max_tokens` 512 -> 1500 (gpt-oss reasoning
tokens can starve a 512 budget — a plausible second cause, **unproven**).
Other functions (tutoring-engine, adaptive-curriculum, novo-memory, lesson-planner) still use the old vocabulary and `novo-memory`
inserts an `embedding` column that does not exist in production -> Day 3 schema-truth.

## What changed (files)
- `_shared/retryPolicy.ts` (+test): status matrix (400/401/403/404 permanent, never retried; 408/425/429/5xx retryable), `Retry-After`, capped backoff, `withRetry`, `PermanentProviderError`/`providerHttpError`.
- Applied to all 8 gateway-migrated functions (ai-question-gen, gemini-vision, lesson-planner, novo-cron-proactive, novo-morning-brief, roadmap-generator, study-pack-generator, revision-planner): a permanent 4xx is attempted once and logged `[retry][permanent]`; outer loops no longer multiply it (was up to 3x3 = 9 calls). `_shared/retryWiring.test.ts` guards it.
- `gemini-chat/providerChain.ts` (+test, 20 tests) + `claudeAdapter.ts` (extracted verbatim from index.ts): Groq primary -> Groq small -> Claude text fallback -> friendly message. 429/500/502/503/timeout/fetch-exception/gateway-block all advance the tier; per-tier timeouts; failed bodies cancelled; Gemini removed from the chat chain (only via `AI_CHAT_GEMINI_FALLBACK=1`). All-fail: 503 `novo_busy` "Novo is busy right now — your practice and review still work" (or 429 `rate_limit` if only rate limits); client `GeminiBusyError` does not retry (`src/lib/gemini.ts`, test).
- `gemini-chat/index.ts`: chain wiring; memory fix; `waitUntil`; **fixed a latent crash**: `serviceDb.rpc('expand_weak_concepts',…).catch(...)` (query builders have no `.catch` -> TypeError before send, would 500 chat for any learner with weak topics); fixed an undefined `apiKey` reference in `get_prereq_chain`.
- `_shared/aiGateway.ts`: `observedFetch` log-only helper (env `AI_LOG_HELPERS=1`, no gating) wired into gemini-chat's embedding/HyDE/rerank/extraction calls.
- `supabase/migrations/20260927000000_v5_ai_health_view.sql` (additive, NOT applied): `ai_success_rate_by_function_provider` (24h/7d, permanent-4xx counts; service_role only).
- `_shared/aiHealth.ts` (+test) + `monitoring-check`: alert on 0 successes/24h (critical) or <98% with >=20 attempts (warning) per required function; provider with 0 successes (warning).
- `novo-subscription`: `memory_type 'milestone'` -> `'achievement'` (violated the same CHECK; Day-1 code).
- Six recovered sources: `docs/product/evidence/day2/RECOVERED_FUNCTIONS.md`.

## Evidence
- Baseline (production, read-only, 2026-09-25): `ai_gateway_requests` last 7 days = 882 rows, **all** `novo-morning-brief`/gemini/`error` (last 2026-09-25 01:30) — the permanent-403 retry burn (F14); **zero** gemini-chat rows in 7 days (no chat traffic logged, so live behaviour is unobserved).
- typecheck 0 errors; lint 0 errors (3 old warnings); Vitest 20 files / 135 tests; Deno 348/348 (was 287); `deno check` novo-subscription 0, monitoring-check 0, gemini-chat 25 (baseline 27, none new; all pre-existing SupabaseClient generics/UserProfile typing); production build OK.
- Static guards fail on baseline source and pass now (`gemini-chat/wiring.test.ts`, `_shared/retryWiring.test.ts`).

## NOT DONE / NOT VERIFIED (blockers for the plan's Day-2 acceptance)
1. **Nothing deployed.** gemini-chat (v81), the 8 retry-policy functions, monitoring-check, and the view migration are all unapplied. Rolling out requires uploading ~2.5k-line gemini-chat via the deploy tool (the Supabase CLI cannot run in this sandbox) — needs your explicit go-ahead. Rollback = redeploy recorded v81 (gemini-chat), and drop the view.
2. **Live smokes (Groq, Claude, Gemini) NOT RUN.** They need a valid user JWT (no test account; I must not create accounts) or provider keys (I must not handle keys). Anthropic balance / Claude live behaviour remains `[U]`. The chain's Claude path is verified only against fake providers.
3. **A written `novo_memories` row has NOT been observed** — needs a real chat on the deployed function. The CHECK-constraint cause is proven from production DDL; the row observation is the acceptance test and is still open.
4. Six recovered sources are transcribed, not hash-verified; `deno check` on them was not completed (see RECOVERED_FUNCTIONS.md).
5. Gemini status unchanged (key 429->403; not part of the chat chain any more). `novo-morning-brief` keeps failing daily until the Gemini key is fixed or it is moved to Groq — it now costs 1 call/user/day instead of 3-9.
6. New findings (out of Day-2 scope): `nova-insights` has no real auth (any `Bearer x` passes; service-role reads all users); 4 recovered functions call decommissioned `gemini-1.5-flash`; other functions use the old memory vocabulary (Day 3); ai-question-gen etc. still have semantic retry loops (bounded, not classified).

## GO / NO-GO
Day 2 **code gate: PASS**. Day 2 **production acceptance: NOT MET** (items 1-3). Recommend: authorise deploy of gemini-chat + the view migration, provide a test learner session (or run one chat yourself) so the memory row and live smokes can be recorded, before Day 3 relies on the chain.
