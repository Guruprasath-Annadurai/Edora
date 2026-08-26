# Secret Inventory — Phase 1.5

**This document adds the mandate's required governance columns (owner, storage location, environment, scope, creation date, rotation period, last rotation, emergency revocation) on top of the existing code-reference inventory at `docs/secrets-inventory.md`, which remains the authoritative source for *what secrets exist and where they're used*.** Not duplicated wholesale here — cross-referenced.

**Stated honestly: creation date and last-rotation date are unknown for nearly every secret below.** This codebase has never tracked secret lifecycle metadata before this document. Filling these in with guesses would violate the mandate's own honesty rules. Where a real date is known (from an incident writeup), it's included; everywhere else says `Unknown — no rotation history tracked before this document`.

## Server-side secrets (Supabase Edge Function environment)

| Secret | Purpose | Owner | Storage location | Environment | Scope | Creation date | Rotation period | Last rotation | Emergency revocation |
|---|---|---|---|---|---|---|---|---|---|
| `GEMINI_API_KEY` | Primary AI tutoring/chat | Guruprasath Annadurai | Supabase Edge Function secrets | Production only (no staging environment exists) | Server-side only, never client-shippable | Unknown | None set | Unknown | Rotate via Google AI Studio console + `supabase secrets set` |
| `GROQ_API_KEY` | Fast inference (chat, eval judging) | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via Groq console + `supabase secrets set` |
| `NVIDIA_API_KEY` | Narrative summaries | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via NVIDIA NIM console |
| `ELEVENLABS_API_KEY` | Novo TTS | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via ElevenLabs console |
| `CLOUD_VISION_API_KEY`, `GOOGLE_CLOUD_API_KEY` | Photo Solver OCR, speech/translation | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via GCP console |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Classroom/Calendar/Gmail/Drive OAuth | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only (client ID's public counterpart is `VITE_GOOGLE_CLIENT_ID`, intentionally public) | Unknown | None set | Unknown | Rotate via Google Cloud Console → Credentials |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP service account | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only, highest-blast-radius secret in this inventory (full service-account credential) | Unknown | None set | Unknown | Revoke the service account key in GCP IAM immediately, then issue a new one |
| `FIREBASE_SERVER_KEY` / `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT_JSON` | Push notifications | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via Firebase Console |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only — **financial**, highest business-impact secret | Unknown | None set | Unknown | Rotate via Razorpay Dashboard immediately if compromised; revoke webhook endpoint first |
| `REVENUECAT_SECRET_KEY` / `REVENUECAT_WEBHOOK_SECRET` | Subscription entitlement sync | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only — **financial** | Unknown | None set | **A separate `VITE_`-prefixed RevenueCat key was found leaked client-side and fixed pre-mandate** (`docs/enterprise-remediation-tracker.md`) — that specific incident's fix date is documented there | Rotate via RevenueCat Dashboard |
| `SENTRY_DSN` | Server-side error reporting | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side (a separate `VITE_SENTRY_DSN` is intentionally public — DSNs are write-only ingest by design) | Unknown | None set | Unknown | Rotate via Sentry project settings |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key encrypting stored OAuth tokens | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only — **rotating this without a migration plan will make all existing encrypted tokens unreadable**; not a drop-in rotation | Unknown | None set — **should have one; flagged as a gap** | Unknown | Do not rotate in an emergency without first planning a re-encryption migration for existing stored tokens |
| `CRON_SECRET` | Shared secret gating ~15+ scheduled functions | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via `supabase secrets set`; update pg_cron job definitions that reference it via `vault.decrypted_secrets` |
| `MONITORING_SLACK_WEBHOOK` | Slack alerting | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Regenerate webhook URL in Slack app settings |
| `INGEST_API_KEY` | Content ingestion pipeline auth | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via `supabase secrets set` |
| `YOUTUBE_API_KEY` | Concept Videos feature | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only | Unknown | None set | Unknown | Rotate via Google Cloud Console |
| `EVAL_SECRET` | Server-to-server eval-mode auth between `novo-eval-run` and `gemini-chat` | Guruprasath Annadurai | Supabase Edge Function secrets | Production | Server-side only as of the pre-mandate fix (was previously reachable via a client-shippable hardcoded literal — see the Phase 1.5 incident note below) | Unknown (predates this session) | None set | **Fixed pre-mandate, but the literal value itself was never rotated — this is a known, documented, still-open residual risk** (see below) | Rotate via `supabase secrets set` — **should be done regardless of the auth-bypass code fix, since the literal string leaked into git history and the client bundle** |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Core platform auth | Supabase (auto-injected) | Supabase-managed, auto-injected into every Edge Function's environment | Production | `SUPABASE_SERVICE_ROLE_KEY` is the single highest-blast-radius credential in this entire system — full database bypass of RLS | N/A (platform-managed) | N/A | N/A | Rotate via Supabase Dashboard → Project Settings → API — **this immediately breaks every deployed Edge Function until redeployed**, so this is the single most disruptive rotation possible and should only be done under a real active-compromise scenario |

## Known open incident: `EVAL_SECRET`

**This is the one item in this inventory with a documented, real incident history, and it has an unresolved action item — repeated here from `docs/secrets-inventory.md` so it isn't buried:**

The literal string `'novo-eval-secret-2026'` was hardcoded in 3 places, one of which was client-shippable JS. The authorization-bypass *code path* was fixed pre-mandate (verified live). **The `EVAL_SECRET` value itself was never rotated** — if the live secret was ever actually set to that leaked literal, it remains permanently in git history and the historical client bundle, and rotating it requires human access to `supabase secrets set` that this session does not have. **This is the single highest-priority action item in this entire secrets inventory.**

## Client-side (public by design — `VITE_*`)

See `docs/secrets-inventory.md` for the full list; none of these carry rotation risk in the same sense since they're meant to be public (anon key is RLS-protected, OAuth client IDs are public by design, Sentry/PostHog keys are write-only ingest).

## What this document does NOT cover

- **No confirmation of what's actually configured live** — same limitation as the underlying `docs/secrets-inventory.md`: no tool available in this environment can enumerate Supabase's actually-configured secret names, only what's referenced in code.
- Creation dates and rotation history for the ~20 secrets with "Unknown" — this is a real gap in this project's history, not something this document can retroactively invent.
- A rotation *schedule* (cadence) — see `SECRET_ROTATION_POLICY.md` for the policy this inventory now needs to be checked against going forward.

**Status: Phase 1.5 (inventory portion) — PARTIALLY COMPLETE.** Every secret from the pre-mandate code-reference inventory now has an owner and a stated (even if "unknown") rotation status, closing the "Owner: unassigned" gap the mandate specifically forbids past Phase 0. Historical dates remain genuinely unknown, not fabricated.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
