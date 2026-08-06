# Edora — Current-State Architecture

**Status:** Phase 0 baseline, built from direct repository inspection (package.json, Capacitor config, Supabase functions directory, CI workflows, docs) on commit `d4bc558`, 2026-08-06. Not aspirational — this reflects what exists today, including known gaps.

## 1. Mobile client

```mermaid
graph TD
    A[React + TypeScript + Vite SPA] --> B[Capacitor 8.4.0 runtime]
    B --> C[Android native shell]
    B --> D["iOS native shell (scaffolded, unbuilt)"]
    C --> E[Google Play — versionCode 52, versionName 4.0.0]
    D -.->|No CI job, no release path| F[App Store — NOT SHIPPED]
    C --> G[Sentry Capacitor SDK — crash reporting]
    C --> H[FCM push notifications]
```

**Known gap:** iOS project directory (`ios/App`) exists but has zero CI coverage and no verified build. It must not be described as "existing iOS support" without a passing CI job and a real build artifact — currently neither exists.

## 2. Frontend application layer

```mermaid
graph TD
    A[Vite build] --> B[React Router — 6.30.4, held deliberately below 7.x]
    B --> C[~83 page components]
    B --> D[TanStack Query — hot-path data hooks]
    B --> E[Framer Motion — motion layer, reduced-motion aware]
    C --> F[ThemeContext — 8 runtime themes incl. light/dark/oled]
    C --> G[offlineCache — IndexedDB-backed offline store]
    A --> H[PostHog — src/lib/analytics.ts, src/lib/experiments.ts]
    A --> I[Sentry browser SDK]
```

## 3. Backend — Supabase

```mermaid
graph TD
    A[Supabase Project — Free tier] --> B[Postgres]
    B --> C["~173 migrations (forward-only, no down migrations)"]
    B --> D["~95 tables referencing profiles(id) via FK"]
    A --> E[Supabase Auth]
    A --> F[Supabase Storage]
    A --> G[Supabase Realtime]
    A --> H["70 Deno Edge Functions"]
    A --> I["pg_cron + pg_net — scheduled jobs (backup export, novo-insights, etc.)"]
    H --> J["21 of 70 functions have automated tests (~30%)"]
```

**Known gap:** Free tier means no point-in-time recovery from the vendor — only the daily `db-backup-export` snapshot built this session (RPO ~24h, restore unproven as a full drill — see `RISK_REGISTER.md` RISK-002/003).

## 4. AI provider layer (no gateway — direct calls today)

```mermaid
graph TD
    A[Frontend / Edge Functions] -->|direct call, no gateway| B[Gemini 1.5 Flash]
    A -->|direct call, no gateway| C[Groq — llama-3.1-8b-instant]
    A -->|direct call, no gateway| D[NVIDIA — nemotron]
    B --> E[Novo tutor, quizzes, flashcards, roadmaps, video companion, story mode]
    C --> E
    D --> E
    E -.->|No prompt versioning, no cost ceiling, no kill switch| F["Phase 7/8 — NOT STARTED"]
```

**Known gap:** ~42 confirmed direct AI-provider call sites across Edge Functions. No central gateway, no token/cost tracking, no per-user quota, no graceful degradation on provider outage.

## 5. Payments and entitlements

```mermaid
graph TD
    A[Client — RevenueCat SDK] --> B[RevenueCat]
    A --> C[Razorpay — India payment rails]
    B --> D["Entitlement check — server trust boundary UNVERIFIED"]
    C --> D
    D --> E[Play Billing]
```

**Known gap:** Server-side verification, webhook idempotency, and entitlement reconciliation have not been audited (Phase 10, not started).

## 6. Analytics, crash reporting, and OAuth

```mermaid
graph TD
    A[Client] --> B[Sentry — crash reporting, native Capacitor SDK]
    A --> C[PostHog — product analytics + experiments]
    A --> D[Google OAuth]
    A --> E["Microsoft/Azure AD OAuth — added, promoted as primary alongside Google"]
```

## 7. Push notifications

```mermaid
graph TD
    A[FCM] --> B[Capacitor push plugin]
    B --> C[Client notification handling]
```

**Known gap:** No push delivery-rate or failure observability exists yet (Phase 9).

## 8. Content pipeline (current — informal)

```mermaid
graph TD
    A["Content author (founder, via ad hoc SQL through Supabase MCP tools)"] -->|"no PR, no review, no version control"| B[(Production Postgres)]
    B --> C[Served directly to students]
    C -.->|reactive only| D[report-wrong-answer feature]
```

**This is the honest current state, not the target.** Phase 12 replaces this with Draft → Validation → Review → Approved → Published → Reported → Corrected → Retired.

## 9. Institution access (current)

```mermaid
graph TD
    A[institutions table] --> B[institution admin — admin_user_id FK]
    B --> C[Teacher accounts]
    C --> D[Student rosters]
    B --> E["School leaderboard, school-scoped views"]
    A -.->|RLS reviewed for severe findings only, not exhaustively| F["Phase 1 — full RLS matrix NOT YET COMPLETE"]
```

**Known state:** one real, live institution customer exists. `institutions.admin_user_id` was `RESTRICT` + `NOT NULL` until this session's fix (now `SET NULL` + nullable) — that specific bug is resolved and live-tested. Broader cross-tenant isolation guarantees beyond that fix have not been exhaustively verified.

## 10. Deployment surfaces (from `docs/rollback-procedure.md`, verified referenced, not re-verified live in Phase 0)

| Surface | Host | Rollback mechanism |
|---|---|---|
| Web app | Firebase Hosting (`edora-bb02e`) | Release history + `firebase hosting:rollback` |
| Android | Google Play Console | No downgrade support — staged rollout percentage is the real control |
| Database | Supabase Postgres | Forward-only migrations; corrective migration or backup restore only |
| Edge Functions | Supabase | Git history is the safety net, not a platform feature |
| Marketing site | Vercel (`edora-website` repo, separate) | Git-connected auto-deploy |

## What this document does not yet cover

- No sequence diagrams for individual user flows (mock exam submission, account deletion, etc.) — those belong to their respective phases (5, 2).
- No network/infra diagram for Supabase's own internal topology — not accessible from this repository.
- No cost model overlay — that is Phase 7/11 work.

**Last updated:** Phase 0 baseline, commit `d4bc558`.
