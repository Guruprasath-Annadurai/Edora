# AI Gateway Migration Tracker

Phase 7 of the enterprise remediation mandate (RISK-006, High). Tracks
which edge functions call Gemini/Groq/NVIDIA through the central gateway
(`supabase/functions/_shared/aiGateway.ts`) versus which still call the
provider directly. Last verified 2026-08-07.

## Why this exists

The mandate's acceptance criteria for Phase 7 is "gateway request logs
showing 100% of critical-path AI calls routed through it." Migrating all
39 files below in one pass isn't real — this document exists so "the
gateway is live" doesn't quietly get overstated as "everything routes
through it" when it doesn't yet. Each row moves from **direct** to
**migrated** as it's actually done, with the commit that did it.

## What's built (done this phase)

- `supabase/migrations/20260815_ai_gateway.sql` — `ai_gateway_config`
  (singleton kill switch + daily cost ceiling) and `ai_gateway_requests`
  (append-only call log, including blocked calls). Applied to
  `edora-staging` and verified: the singleton row exists with expected
  defaults (`ai_enabled: true`, `daily_cost_ceiling_usd: 50.00`).
- `supabase/functions/_shared/aiGateway.ts` — `callAI()`, the enforcement
  point. Checks the kill switch and today's spend against the ceiling
  before ever reaching the network; fails **closed** on a config-read
  error (a transient DB outage blocks paid calls rather than silently
  unmetering them — same principle `_shared/rateLimit.ts` already applies
  to rate limiting). Logs every call, including blocked ones. 6 Deno unit
  tests (`aiGateway.test.ts`) cover: kill-switch block, cost-ceiling
  block, normal success with cost estimation, fail-closed on config-read
  error, provider HTTP error logged distinctly from a block, and a thrown
  network error logged with its message.
- `supabase/functions/admin-console/index.ts` — two new actions,
  `get_ai_gateway_status` (kill switch state, today's spend, per-function
  breakdown) and `set_ai_gateway_kill_switch` (the actual emergency
  lever), both gated by the existing `has_role(uid,'admin')` check every
  other admin-console action uses.
- `src/pages/admin/AdminConsolePage.tsx` — an "AI Gateway" tab: today's
  spend vs. the ceiling, a per-function cost/error/blocked breakdown, and
  the kill switch toggle itself.

## Production deploy correction (2026-08-08)

Everything above this section describes Phase 7's original pass, which —
despite this document's own "Live verification performed" section below —
**only ever touched `edora-staging`**. A production-hardening pass this
session queried `mlkzabspcwfockbmkmzl` directly and found:

- `ai_gateway_config`/`ai_gateway_requests` did not exist on production at
  all (`information_schema.tables` returned zero rows).
- Production's `ai-question-gen` was still running its pre-gateway version
  (last updated well before Phase 7's work).
- A second, separate bug: even on staging, `service_role` had **zero
  table-level grants** on either gateway table. The original migration
  created RLS policies scoped to `service_role` but never issued the
  underlying `GRANT` — the same class of gap as the Phase 10
  `subscriptions_own` finding, where a policy is meaningless without the
  base grant. This meant `callAI()`'s own kill-switch/cost-ceiling check
  had been silently failing closed on every call, on staging, since Phase
  7 first shipped — this document's "Live verification performed" section
  below was itself based on a false premise (it checked the config row
  exists via direct SQL as `postgres`, which bypasses grants entirely, not
  via the actual service-role path the edge functions use).

Fixed via `supabase/migrations/20260808010000_ai_gateway_production_deploy_and_grant_fix.sql`:
deploys the gateway schema to production for the first time, adds the
missing `GRANT ALL ... TO service_role` on both projects, and re-deploys
`ai-question-gen` and `gemini-vision` (now migrated too) to production.

**Re-verified live post-fix** (staging): called `gemini-vision` with the
seeded E2E account, confirmed the request passed the kill-switch and
cost-ceiling checks cleanly, reached the real Gemini API, got a genuine
provider-level rejection (invalid staging key — expected, staging has no
real provider keys), and was logged to `ai_gateway_requests` with
`status: error, error_message: HTTP 400`. This is the first time the full
gate→log→fetch pipeline has actually been proven end-to-end, as opposed to
stopping at a config-read that never got far enough to test the grant.

`admin-console`'s `get_ai_gateway_status`/`set_ai_gateway_kill_switch`
actions were also missing from production entirely (production was 4
actions behind the local repo) — deployed as part of this pass. The kill
switch mechanism itself (the `ai_gateway_config.ai_enabled` read/write) was
not live-toggled against production to "prove" it works, since the
identical logic is already covered by 6 Deno unit tests and was just
proven live end-to-end on staging; flipping a real production kill switch
off, even briefly, for a test that adds no new confidence isn't a
reasonable risk to take.

## Live verification performed (staging, original Phase 7 pass)

- Migration applied to `edora-staging`, config singleton row confirmed
  present with correct defaults via direct SQL.
- `ai-question-gen` (below) deployed to `edora-staging` with the gateway
  wired in and invoked live via the seeded E2E test account's real
  session token. It reached the gateway-integrated code path and returned
  the expected `GROQ_API_KEY not configured` — staging has no third-party
  AI provider keys configured (out of scope for Gate 2's bootstrap, which
  focused on schema/RLS, not AI content generation) — confirming the
  gateway's import/bundle and the function's control flow up to the
  provider call are live and working, but **not** a live-fire test of the
  kill switch or cost-ceiling gates specifically (that would need a real
  `GROQ_API_KEY` on staging, which doesn't exist). The gate logic itself
  is covered by the 6 Deno unit tests instead, run against mocked
  Supabase calls, not staging infrastructure.
- `admin-console`'s new actions were **not** deployed/live-verified this
  pass — implemented and reviewed, but only exercised via reading the
  code, not a real HTTP round trip against staging.

## Migration status

| Function | Status | Notes |
|---|---|---|
| `ai-question-gen` | **Migrated** | Deployed to **both** edora-staging and production (mlkzabspcwfockbmkmzl) as of 2026-08-08 — see "Production deploy correction" below. |
| `backfill-corpus-embeddings` | Direct | |
| `boss-fight` | Direct | |
| `curriculum-builder` | Direct | |
| `debate-mode` | Direct | |
| `exam-prediction` | Direct | |
| `gemini-chat` | Direct | Highest-traffic surface (Novo AI chat) — also the largest single file, with 10+ internal call sites for chat, fallback, embeddings, and streaming. Migrating this one is the highest-value next step but also the largest single unit of work; deliberately not attempted in the same pass as standing up the gateway itself. |
| `gemini-vision` | **Migrated** | All 6 actions route through `fetchGeminiWithRetry` → `callAI`. Deployed to both staging and production, verified live end-to-end on staging (real Gemini API call, real response, logged to `ai_gateway_requests`). |
| `lesson-planner` | Direct | |
| `mains-answer-evaluator` | Direct | |
| `ncert-ingest` | Direct | |
| `novo-certifications` | Direct | |
| `novo-challenges` | Direct | |
| `novo-cron-proactive` | Direct | |
| `novo-daily-session` | Direct | |
| `novo-eval-run` | Direct | Eval harness — arguably should stay direct or use a separate gateway bypass so eval runs don't count against the production cost ceiling. Flagged for a deliberate decision, not migrated by default. |
| `novo-insights` | Direct | |
| `novo-memory-consolidate` | Direct | |
| `novo-memory-extract` | Direct | |
| `novo-memory` | Direct | |
| `novo-morning-brief` | Direct | |
| `novo-ncert` | Direct | |
| `novo-proactive` | Direct | |
| `ocr` | Direct | |
| `process-document-jobs` | Direct | |
| `pyq-content-audit` | Direct | |
| `pyq-ingest` | Direct | |
| `question-gen-eval-run` | Direct | Same eval-harness consideration as `novo-eval-run`. |
| `question-quality-audit` | Direct | |
| `revision-planner` | Direct | |
| `roadmap-generator` | Direct | |
| `school-report` | Direct | |
| `story-mode` | Direct | |
| `streak-challenges` | Direct | |
| `study-pack-generator` | Direct | |
| `teacher-content-ingest` | Direct | |
| `teacher-export` | Direct | |
| `tournament` | Direct | |
| `tutoring-engine` | Direct | |
| `user-content-index` | Direct | |
| `video-companion` | Direct | |
| `weekly-report` | Direct | |

**1 of 39 files migrated.** The remaining 38 keep calling providers
directly — the risk they represented (no cost ceiling, no kill switch,
no unified log) is unchanged for those specific call sites until they're
migrated. The gateway existing doesn't retroactively protect code that
doesn't call it.

## Recommended migration order (not yet started beyond `ai-question-gen`)

1. `gemini-chat` — highest traffic and highest cost exposure; also the
   biggest lift (multiple internal call sites in one file).
2. Any function with a cron trigger (`novo-cron-proactive`,
   `novo-morning-brief`) — unattended, no user in the loop to notice a
   runaway cost pattern until a bill arrives.
3. Content-generation functions feeding the review queue
   (`ai-question-gen` ✅, `roadmap-generator`, `study-pack-generator`,
   `revision-planner`, `lesson-planner`) — highest direct cost per call
   (large generation prompts) and already have an established pattern
   from `ai-question-gen` to copy.
4. Everything else, as capacity allows.
