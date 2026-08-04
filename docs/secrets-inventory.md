# Secrets Inventory

Status: **first real inventory, git-history leak scan run**. Last verified 2026-08-05.

## How this was built

Not from memory or prior documentation — grepped every actual reference:
`Deno.env.get('...')` across `supabase/functions/**/*.ts` for server-side
secrets, `import.meta.env.VITE_*` across `src/**` for client-side ones, and
ran a real git-history secret scanner (`gitleaks`, installed via Homebrew —
none was available before this pass) across the full commit history (`--log-opts=--all`,
263 commits, ~8.6MB scanned).

This documents what secrets **exist and are referenced in code**. It does
**not** confirm what's actually configured in the live Supabase project —
no MCP tool here can list configured edge-function secret names (a Supabase
"list secrets" capability isn't exposed to this tooling), so an entry below
being in this inventory is not proof it's actually set live. That's a real
gap, noted at the end.

## Server-side secrets (Supabase Edge Function environment)

Set via `supabase secrets set KEY=value` or the Supabase Dashboard →
Edge Functions → Secrets. Never appear in any client bundle.

| Secret | Purpose | Used by |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini — primary AI tutoring/chat | `gemini-chat` and most AI-facing functions |
| `GROQ_API_KEY` | Groq — fast inference for chat/eval judging | `gemini-chat`, `novo-eval-run` |
| `NVIDIA_API_KEY` | NVIDIA NIM — narrative summaries (weekly parent reports etc.) | a small set of non-latency-critical functions |
| `ELEVENLABS_API_KEY` | Text-to-speech for Novo's voice | `elevenlabs-tts` |
| `CLOUD_VISION_API_KEY` | Google Cloud Vision — Photo Solver OCR | vision-related functions |
| `GOOGLE_CLOUD_API_KEY` | Google Cloud (Speech-to-Text / Translation) | voice/language functions |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Classroom/Calendar/Gmail/Drive OAuth | `classroom-auth`, `google-*` functions |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP service account credentials | server-side Google API calls |
| `GCS_TRAINING_BUCKET` | Not a secret value per se (a bucket name), but env-scoped | training data pipeline |
| `FIREBASE_SERVER_KEY` / `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT_JSON` | Push notifications (FCM) | push-related functions |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments | payment/subscription functions |
| `REVENUECAT_SECRET_KEY` / `REVENUECAT_WEBHOOK_SECRET` | Subscription entitlement sync | RevenueCat webhook handler |
| `SENTRY_DSN` | Server-side error reporting | `_shared/sentry.ts`, most functions |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key encrypting OAuth tokens at rest | `_shared/token-crypto.ts` (tested this pass — see `docs/enterprise-remediation-tracker.md` §6) |
| `CRON_SECRET` | Shared secret for `x-internal-secret` header on every cron-invoked function | ~15+ scheduled functions (backup, monitoring, novo-eval-run, etc.) |
| `MONITORING_SLACK_WEBHOOK` | Slack alerting | `monitoring-check` |
| `INGEST_API_KEY` | Content ingestion pipeline auth | `pyq-ingest`, `ncert-ingest` |
| `YOUTUBE_API_KEY` | YouTube data (Concept Videos feature) | video-related functions |
| `EVAL_SECRET` | Internal eval-mode flag between `novo-eval-run` and `gemini-chat` (server-to-server only as of this pass — see finding below) | `novo-eval-run`, `gemini-chat` |
| `GROQ_GLOBAL_RPM_BUDGET` | Not a secret, a tunable number (cross-user LLM admission control) | `_shared/rateLimit.ts` |

Auto-injected by the Supabase edge runtime, never manually set:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Client-side (Vite `VITE_*`, bundled into the shipped app — treat as public)

| Var | Meant to be public? |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes — the anon key is RLS-protected by design |
| `VITE_GOOGLE_CLIENT_ID` | Yes — OAuth client IDs are public by design |
| `VITE_REVENUECAT_ANDROID_KEY` / `VITE_REVENUECAT_IOS_KEY` | Yes — RevenueCat's own public API keys, distinct from `REVENUECAT_SECRET_KEY` |
| `VITE_SENTRY_DSN` | Yes — Sentry DSNs are meant to be public (write-only ingest) |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | Yes — PostHog project keys are meant to be public |
| `VITE_APP_VERSION` | Dead/unused — see `.env.example` fix in this pass |
| `VITE_BUILD_SHA` / `VITE_BUILD_TIME` | Not real env vars — injected by `vite.config.ts`'s `define` block, not settable |

**None of these should ever include a real API secret.** `.env.example`
already carried this warning from a prior incident (a leaked RevenueCat
*secret* key, fixed earlier this session per the tracker) — verified this
pass that the warning is still accurate for every current `VITE_*` var.

## GitHub Actions secrets

Confirmed via `gh secret list`: **exactly 2** — `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`. Both are the public anon key/URL (safe). Set this
pass after discovering the repo had *zero* secrets configured at all — see
`docs/e2e-testing.md` for that finding's full writeup.

## Git-history leak scan — real findings

Ran `gitleaks git --log-opts="--all"` across the full 263-commit history.
**5 findings, all checked individually — 4 non-issues, 1 real problem, fixed.**

1. **Non-issue**: `token-crypto.test.ts` — a deliberately fake, clearly-labeled test fixture key generated this session, never used against real data.
2. **Non-issue**: a JWT hardcoded in `20260609_nova_insights.sql`. Decoded the payload directly rather than assuming: `{"role":"anon", ...}` — confirmed it's the public anon key (matches the same value fetched live via Supabase's own `get_publishable_keys` API this session), not a `service_role` key. Committing the anon key isn't a security issue (it's RLS-protected, meant to be public) but it's unusual style — better practice is referencing it via `vault.decrypted_secrets` like newer cron migrations in this repo do, so a future rotation doesn't require a code change. Not fixed this pass (cosmetic, not urgent).
3. **Real problem, fixed**: the literal string `'novo-eval-secret-2026'`, hardcoded in **3 places** — `supabase/functions/novo-eval-run/index.ts` (2 server-to-server calls) and, critically, `src/pages/EvalDashboardPage.tsx` (client-side React code that ships in the public JS bundle). `novo-eval-run`'s own authorization check accepted this exact string via an `x-eval-secret` header as one of its valid auth paths. **A secret hardcoded in shipped client code is not a secret** — if the real `EVAL_SECRET` Supabase secret was ever configured to match this literal (plausible, given the consistency across all 3 hardcoded copies), any visitor could read it out of the JS bundle and trigger AI evaluation runs (real Groq/Gemini API cost) without being staff, since the `/eval` route (`EvalDashboardPage.tsx`) has **no role gating at all**, client or server.

   **Fixed**: added a real admin-role check to `novo-eval-run` (`has_role(auth.uid(), 'admin')` against the caller's own session JWT, which the dashboard already sends), removed the `x-eval-secret`/`EVAL_SECRET` branch from the client-facing authorization path entirely, and parameterized the 2 remaining server-to-server calls (`novo-eval-run` → `gemini-chat`) to read `Deno.env.get('EVAL_SECRET')` instead of the hardcoded literal, so a future rotation just works without a code deploy. **Verified live**: confirmed via SQL that `has_role` returns `true` for the one real admin user and `false` for an arbitrary UUID, then invoked the deployed function directly with a valid-but-non-admin JWT and got back the exact `401 Unauthorized` my new code path returns (not the platform's generic JWT-format error) — proving the fix is live and the old bypass no longer functions.

**Residual action needed, cannot be done from here**: if `EVAL_SECRET` was ever actually set to `'novo-eval-secret-2026'` in the live Supabase project, that value is now permanently in git history and should be rotated (`supabase secrets set EVAL_SECRET=<new-random-value>`) — this fix removes it as an *authorization bypass*, but the value itself can't be un-published from git history. No tool available here can set Supabase secrets; this needs a human with dashboard/CLI access.

## What's NOT done

- **No confirmation of what's actually configured live** — this inventory is built from code references, not a live secrets list (no tool available to enumerate Supabase's configured secret names).
- **No formal rotation policy or schedule** — nothing here has a documented rotation cadence or an assigned owner.
- **No secret-scanning gate in CI** — the gitleaks scan that found the real issue above was a one-off manual run, not a recurring check. Adding it to CI (a `gitleaks-action` step) would need budget/time beyond this pass; flagged, not built.
- The `VITE_GEMINI_API_KEY` fallback in `pyq-ingest/index.ts` (`Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('VITE_GEMINI_API_KEY')`) is confusing legacy naming — Supabase secrets are unrelated to Vite's client-bundling `VITE_` convention, so this isn't a real leak (the fallback name never reaches the browser), but it directly contradicts this repo's own `.env.example` warning about `VITE_`-prefixed AI keys. Worth a cleanup pass; not fixed this pass (not a security issue, just confusing).
