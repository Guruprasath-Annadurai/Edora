# Environment & Configuration Manifest

**Classification:** Infrastructure Security & Configuration Reference  
**Scope:** Client (Web & Capacitor Android), Edge Functions, CI/CD  
**Zero-Secret Invariant:** This document records variable metadata ONLY. Actual values, production keys, and service tokens must NEVER be committed to this or any repository file.

---

## 1. Client-Side Variables (`VITE_*`)

Client-side environment variables are baked into the static bundle at build time. They are completely visible to any user inspecting web source or decompiling the Android APK.
**Rule:** NEVER place private API keys, database passwords, or service-role keys in `VITE_*` variables.

| Variable Name | Classification | Environment | Required? | Fallback / Default Behavior | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Public / Client-Safe | Local / Staging / Prod | **Required** | Throws critical startup error if empty | Supabase project HTTPS REST gateway (`https://<id>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Public / Client-Safe | Local / Staging / Prod | **Required** | Throws critical startup error if empty | Supabase anonymous JWT key (governed by Row Level Security) |
| `VITE_POSTHOG_KEY` | Public / Client-Safe | Staging / Prod | Optional | Analytics disabled gracefully in development | PostHog product telemetry project token |
| `VITE_POSTHOG_HOST` | Public / Client-Safe | Staging / Prod | Optional | Defaults to `https://app.posthog.com` | PostHog ingestion hostname |
| `VITE_SENTRY_DSN` | Public / Client-Safe | Staging / Prod | Optional | Exception logging disabled gracefully | Sentry error reporting endpoint |
| `VITE_APP_ENV` | Public / Client-Safe | Local / Staging / Prod | Optional | Defaults to `development` | Environment tier badge ('production', 'staging', 'development') |
| `VITE_REVENUECAT_ANDROID_KEY` | Public / Client-Safe | Staging / Prod | Optional | In-app purchases fall back to web/mock state | RevenueCat Android public SDK key (`goog_...`) |

---

## 2. Server & Edge Function Secrets (`Deno.env`)

Secrets used exclusively by Supabase Edge Functions or backend processes. They are never exposed to browser or mobile runtimes.

| Variable Name | Classification | Environment | Required? | Fallback / Default Behavior | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | **Confidential / Server-Only** | Staging / Prod | **Required** | Edge Function halts with 500 | Administrative database bypass token for privileged operations |
| `GROQ_API_KEY` | **Confidential / Server-Only** | Staging / Prod | **Required** | AI Gateway falls back to fast/small or Claude tier | Primary AI text generation token |
| `ANTHROPIC_API_KEY` | **Confidential / Server-Only** | Staging / Prod | Optional | Falls back to Gemini / Graceful offline response | Claude text fallback model token |
| `GEMINI_API_KEY` | **Confidential / Server-Only** | Staging / Prod | Optional | Vision/Embeddings disabled gracefully | Gemini multimodal, embeddings, and text fallback token |
| `REVENUECAT_SECRET_API_KEY`| **Confidential / Server-Only** | Staging / Prod | Optional | Webhook verification disabled | RevenueCat V2 server-to-server webhook validation |
| `SUPPORT_HMAC_KEY` | **Confidential / Server-Only** | Staging / Prod | **Required** | Halts opaque support identifier generation | Secret key for opaque HMAC-SHA256 support tickets |

---

## 3. CI/CD & Operational Secrets (GitHub Actions)

Configured only in repository settings (`Settings > Secrets and variables > Actions`).

| Variable Name | Classification | Environment | Required? | Fallback / Default Behavior | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_DB_SESSION_URL` | **Confidential / Direct DB** | Staging / Prod | **Required** | Backup workflow fails immediately | Port 5432 direct connection string for automated `pg_dump` |
| `BACKUP_ENCRYPTION_KEY` | **Confidential / Symmetric** | Staging / Prod | **Required** | Backup workflow fails immediately | AES-256 symmetric passphrase for database archive encryption |
| `SUPABASE_ACCESS_TOKEN` | **Confidential / Deploy** | Staging / Prod | Optional | Edge Function CI deployment blocked | Supabase CLI deploy token |

---

## 4. Android Native Package Integrity

| Config Attribute | File Location | Expected Value | Check Type |
| :--- | :--- | :--- | :--- |
| `appId` | `capacitor.config.ts` | `com.edora.app` | Exact match |
| `applicationId` | `android/app/build.gradle` | `com.edora.app` | Exact match |
