# Edora — Complete Application State Report

**Prepared:** 2026-09-24 · **Repo:** `release/4.1.0-integration` (package version `4.1.0-alpha.1`, 436 commits) · **Production:** Supabase project `mlkzabspcwfockbmkmzl`
**Audience:** Product Manager / App Maintainer (handover) · **Author:** Claude (Sonnet 5), working from the actual codebase and live production database

> **How to read this:** Every number below was measured from the repository or queried from the live production database on 2026-09-24. Nothing is estimated from memory. Section 12 lists what I could **not** verify. Appendix A (every route) and Appendix B (every backend function) are machine-generated so nothing is omitted.

---

## 1. Executive summary (read this first)

Edora is a large, technically competent codebase whose **product surface is far larger than its working, used, or even data-backed surface.** The user complaints about UI, flow, and functionality are corroborated by the evidence — and in several cases the cause is an outright bug, not a matter of taste.

**The five findings that matter most:**

1. **Users cannot buy Pro.** Every paywall/upgrade button navigates to `/pro`, but `/pro` is routed to `<Navigate to="/profile">`. The real purchase screen (`ProSubscriptionPage`, ₹99/month · ₹699/year) is imported but **never mounted**. Signups began 2026-06-19 and the free trial is 30 days, so every existing account's trial has expired — they now hit locks with no way to pay. (Production has 0 Pro users, 0 subscriptions.)
2. **The AI provider key is failing in production.** `novo-morning-brief` has logged **3,375 failed Gemini calls vs 1 success** since 2026-08-29: HTTP 429 (quota) through Sep 12, then **HTTP 403 (key rejected) every day since Sep 13**. Anything that depends on the Gemini key (Novo chat RAG embeddings, vision/photo solver, morning brief, chat fallback) should be assumed degraded until the key/billing is fixed.
3. **No user has ever set an exam target.** 0 of 42 profiles have `exam_name`. Onboarding makes the exam step skippable and never asks again — yet Home's countdown, War Room, Rank Predictor, morning brief, and proactive nudges are all keyed on it. The app's headline personalization is dead for 100% of users.
4. **12 tables the UI queries do not exist in production**, including the offline-sync targets (`quiz_user_answers`, `study_streaks`, `xp_history`), the entire Concept Videos page (`concept_videos`, `video_watches`), Doubt Room (`doubt_threads`), and the AI-answer feedback table (`ai_interactions`). Those features fail silently.
5. **Feature sprawl is the core UX problem.** 98 routes, a Home screen stacking 20+ modules, a 41-item Tools catalog, and 71% of database tables (128 of 179) completely empty — i.e. most features have never been used by anyone. The app's own `DESIGN.md` forbids "feature soup on the home screen"; the shipped Home does exactly that.

**Real usage (production DB):** 42 signups total (19 Jun · 17 Jul · 6 Aug · 0 since), 17 consented (40%), **2 sprints ever**, 21 flashcards, 84 Novo chat messages, 0 quiz sessions, 0 mock-test attempts, 0 Pro. Last recorded Novo chat message: 2026-07-28. The product is effectively pre-traction; "bad remarks" are coming from a very small, mostly early-tester cohort — which is good news, because the fixes below are tractable and there is no large installed base to migrate.

**Engineering health is genuinely good** (type-check 0 errors, lint 0 errors, 104 frontend + 278 backend unit tests passing, CI on every push, clean build). The problem is *product coherence and completion*, not code quality.

**Recommended direction (detail in §11):** stop adding features; fix the 5 blockers above; collapse the app to one core loop (Onboard → set exam → daily plan → Novo → practice → review); hide every feature that has no data or a broken backend behind a flag; then rebuild Home around a single "do this next" action.

---

## 2. What Edora is

An exam-preparation tutoring app for Indian students (JEE, NEET, CBSE/ICSE, UPSC, CAT, boards), built around an AI tutor named **Novo** (two personalities: "Dominie" strict / "Preceptor" guide), with gamification (XP, streaks, battles, tournaments), spaced repetition, mock tests/PYQs, NCERT content, and B2B school/teacher/parent portals.

| Layer | Stack |
|---|---|
| Client | React + TypeScript + Vite + Tailwind, framer-motion, TanStack Query (configured, barely used), Capacitor 6 native shell (Android shipped; iOS project exists but not shipped) |
| Backend | Supabase (Postgres + Auth + Storage) with **76 deployed Deno edge functions** |
| AI | Groq (`openai/gpt-oss-120b` / `-20b`) primary for Novo chat; Gemini (`gemini-flash-latest`) for embeddings, vision, generation, fallback; NVIDIA Nemotron (experimental roadmap recalibration); Claude integration built but **switched off** (`AI_CHAT_PROVIDER` unset, `ANTHROPIC_API_KEY` set) |
| Payments | RevenueCat / IAP (`lib/iap.ts`) — unreachable, see §4.1 |
| Observability | Sentry (client), PostHog, `analytics_events`, AI gateway request log, `monitoring-check` cron |
| Languages | 9 (en + hi, ta, te, kn, mr, bn, gu, pa) — see §6.5 |

**Size:** ~79,900 lines of TS/TSX in `src/` (pages alone: 100 files, 55,800 lines — average 558 lines/page; 8 pages exceed 1,000). 190 SQL migrations. 179 tables (+ views).

---

## 3. Real-world usage evidence (live production database)

| Metric | Value |
|---|---|
| Total profiles | **42** (Jun 19 · Jul 17 · Aug 6 · Sep 0) |
| Passed DPDP consent gate | **17 (40%)** — 25 accounts have no consent timestamp |
| Profiles with `exam_name` | **0 (0%)** |
| Profiles with `study_level` | 42 (100%) |
| Pro users / subscriptions | **0 / 0** |
| Sprint sessions (ever) | **2** (1 user, 2026-07-17) |
| Quiz sessions / mock-test attempts / mistake-journal / notes | **0 / 0 / 0 / 0** |
| Novo chat rows (`tutor_chats`) | 84 · last `chat_message_sent` event 2026-07-28 |
| `novo_memories` (Novo's long-term memory) | **0** |
| Flashcards | 21 |
| Mood check-ins | 82 (`user_moods`) + 18 |
| Tables total / empty / non-empty | 179 / **128 (71%)** / 51 (many of the 51 are reference, log, or eval tables) |
| Analytics events (all-time) | 283 across 26 event types; top: `experiment_exposure` 104, `signup_started` 46, `chat_message_sent` 19, `dpdp_consent_given` 17, `signup_completed` 14 |

**Funnel reading:** 46 `signup_started` → 14 `signup_completed` events (≈30% completion of the recorded starts) → 16 users with consent → 1 user who ever completed a sprint. There is **no measurable activation path past signup.** `novo_memories = 0` means Novo's headline "persistent memory" feature has never functioned for a real user.

**AI gateway log (live):** the only function with traffic since Aug 29 is the daily cron `novo-morning-brief` (126 calls/day = 42 users × 3 retries) — all failing. No user-initiated AI call (`gemini-chat`, vision, quiz-gen, planners) has been logged in 26 days. Real users are not using AI features right now.

---

## 4. Blocking defects (functionality)

Severity: **P0** = feature or revenue path is broken now; **P1** = serious degradation.

### 4.1 P0 — Paywall dead-ends; Pro cannot be purchased
- `ProGate.tsx:69,142`, `ChatPage.tsx:1174,1325`, `AnalyticsDashboardPage.tsx:139` all `navigate('/pro')`.
- `App.tsx:509`: `<Route path="/pro" element={<Navigate to="/profile" replace />} />`; `App.tsx:76`: `const _ProSubscriptionPage = lazy(...)` — underscore-prefixed, never rendered.
- Consequence: locked features (Full Mock Tests, PYQ Bank, UPSC Mains, Analytics, Voice, AI-limit sheet in Chat) send users to Profile with no way to convert. Historical cause: the redirect was added during the "30-day trial" release (v3.2.2) and never reverted.
- **Fix:** route `/pro` to `ProSubscriptionPage`; verify the RevenueCat offering is configured for the Play Store build; add an e2e test that a locked feature reaches a purchasable screen.

### 4.2 P0 — Gemini API key rejected (403) / quota exhausted (429)
- 3,375 errors vs 1 success (`ai_gateway_requests`, `novo-morning-brief`): 1,861×HTTP 429 (Aug 29–Sep 12), 1,512×HTTP 403 (Sep 13–Sep 24, every day), 2×503.
- Not caused by the gateway migration (the gateway only *logs* the failure; `morning_brief_log` has 2 rows in all history, so briefs never worked at scale). But it shows that **the retry logic treats a permanent 403 like a transient error** and re-hammers the API 3× per user per day.
- Blast radius (all use `GEMINI_API_KEY`): Novo chat RAG embeddings (`embedQuery`) and the Gemini fallback path, `gemini-vision` (Photo Solver, Scanner, handwriting, video analysis), `study-pack-generator`, `roadmap-generator`, `lesson-planner`, `revision-planner`, morning brief, proactive nudges.
- **Fix:** check the key in Google AI Studio / billing (likely revoked, restricted, or over free-tier quota); do not retry 4xx-auth errors; alert on "0 successes in 24h" for any AI function.

### 4.3 P0 — Exam target never captured (0 of 42)
- Onboarding (`OnboardingPage.tsx`, 7 steps): welcome → level → language → subjects → **exam (optional, has a Skip)** → mood → referral (optional). `canContinue` returns `true` for the exam step.
- No later prompt exists. Every downstream feature reads `exam_name/exam_date`.
- **Fix:** make the exam target part of the first meaningful moment (not skippable, or re-prompt on Home with a persistent card until set); cut onboarding to ≤3 steps before first value.

### 4.4 P0 — 12 tables/views queried by the UI do not exist in production
| Missing table | Where used | Impact |
|---|---|---|
| `ai_interactions` | `components/ui/AIFeedback.tsx` | Every thumbs-up/down on an AI answer is silently lost (component appears on AI surfaces app-wide) |
| `concept_videos`, `video_watches` | `ConceptVideosPage` | Whole page non-functional |
| `doubt_threads` | `DoubtRoomPage` | Doubt Room non-functional |
| `ai_question_flags` | `AIQuizBankPage` | Question flagging fails |
| `ncert_chapter_progress`, `ncert_chapter_questions` | `NCERTChaptersPage` | Progress + per-chapter questions fail |
| `quiz_questions`, `pyq_questions` | `OfflineModePage`, `lib/offlineStudy.ts` | Offline download of study content fails |
| `quiz_user_answers`, `study_streaks`, `xp_history` | `lib/syncQueue.ts` | **Offline sync queue flushes to tables that don't exist → offline answers/streaks/XP never persist (silent data loss risk)** |

Root cause is a systemic pattern: **migrations that exist in the repo but were never applied to production** (previously found for `question_flags`, `ai_questions`, etc.). No process today compares repo migrations vs production, or UI table references vs schema.
- **Fix:** decide per table (create migration, or remove the feature); add a CI check that fails when the frontend references a table absent from the generated schema types.

### 4.5 P1 — Consent gate blocks 60% of accounts
`AuthGuard` renders `DPDPConsentModal` for any profile without `dpdp_consent_at`, blocking the whole app. 25/42 accounts have none. Some predate the gate; some abandoned at the modal. Needs a product decision: grandfather, re-prompt softly, or measure drop-off (`dpdp_consent_given` fires for only 17 users).

### 4.6 P1 — Source of truth drift in backend
6 edge functions are **deployed but have no source in the repo**: `mistake-clustering`, `mock-paper-composer`, `nova-insights` (near-duplicate of `novo-insights`), `pyq-bulk-ingest`, `pyq-embed-ingest`, `question-explain`. Two of them (`mock-paper-composer`, `question-explain`) are invoked by the UI. They cannot be reviewed, tested, or safely changed. **Fix:** export the deployed source into the repo.

### 4.7 P1 — Security posture: 53 of 76 functions run with platform JWT verification off
This is intentional for many (in-function auth, cron), and prior audits reviewed it, but it means each function's own auth check is the only gate. Recommend a per-function auth checklist (Appendix B lists which have JWT verify off).

### 4.8 P1 — Content that users would see is unreviewed or absent
- `pyq_content`: **232 of 555 rows unreviewed** (CAT/BOARDS/UPSC entirely). Founder decision still pending.
- Empty content tables backing whole pages: `formulas` (0), `solved_examples` (0), `concept_reels` (0), `mnemonics` (0), `curricula`/`curriculum_topics` (0), `verified_question_bank` (0), `study_notes`, `study_packs` (0).
- Present: `ncert_content` 301, `ncert_chapters` 274, `knowledge_graph` 233, `concept_graph` 162.

---

## 5. UI / UX findings

### 5.1 Information architecture — too many features, no hierarchy
- **98 routes.** Bottom tab bar: Home · Learn · **Novo (center)** · Battle · Profile. Everything else hides behind Home cards, the Learn page (13 items), or the **Tools catalog: 41 items in 7 sections** (Analytics, Exam Prep, Competitive, Gamified, Voice, Novo Tutor, Learning Paths). `/tools` is not in the tab bar and I found no in-code link *to* it other than "Back" buttons — verify discovery in-app.
- **Sprint** (the app's core study action) is not in the tab bar either.
- Internal engineering vocabulary leaks into structure: routes were built in "Tier 2–7", "Phase 2–4", "Enterprise Pack", "Content Moat", "Network Effects Pack" batches (see comments in `App.tsx`) — the IA mirrors the build history, not the user's mental model.
- 9 routes have **no reference anywhere in the UI**: `/live-study-rooms`, `/peer-explain`, `/parent-portal`, `/offline-mode`, `/study-group/:id`, `/eval`, `/admin`, `/auth/classroom/callback`, `/school/:name` (some are intentional deep-link/admin targets; `live-study-rooms`, `peer-explain`, `parent-portal`, `offline-mode` are user features nobody can reach). A further 26 routes are reachable from exactly one place.
- **17 pages** depend only on tables that are completely empty: `/boss-fight`, `/cat-syllabus`, `/certifications`, `/concept-map`, `/course`, `/error-patterns`, `/exam-simulator`, `/journal`, `/ncert-deep`, `/notes`, `/novo-insights`, `/novo-reads`, `/peer-explain`, `/photo-solver`, `/study-pack`, `/tutoring`, `/video-companion`. A further **5 pages query a table that does not exist** (`/ai-quiz`, `/concept-videos`, `/doubt-room`, `/ncert-chapters`, `/offline-mode`), and several more have exactly 1 row (`/planner`, `/roadmap`, `/quiz`). Users who open these see an empty state at best. Appendix A flags each.

### 5.2 Home screen = "feature soup"
`HomePage.tsx` is 1,460 lines with 33 `useState`, 12 `useEffect`. It stacks, in order: header/streak/XP strip · urgent-exam banner · War Room · proactive banner · hero "continue" card · primary tools grid · quick stats · exam countdown · course resume · weak topics · A/B-experiment variant cards · today's mission · AI insights · recommended actions · focus mode · study break · concept of the day · Novo CTA · streak-freeze shop · share-milestone card · mood check-in · focus timer overlay · study-break player overlay · onboarding tour · Day-7 modal. That is **20+ modules and 5 overlays** on one scroll.
`DESIGN.md` (the team's own spec) says: *"Every screen answers one question first… if a student opens the app at 11pm the night before the exam they should know exactly what to do in under 2 seconds"* and lists **"feature soup on the home screen"** as an anti-pattern. The shipped Home violates the design goal directly.

### 5.3 Design-system bypass
| Signal | Count |
|---|---|
| Inline `style={{…}}` in pages+components | **4,615** |
| Hard-coded hex colors | **4,185** |
| `linear-gradient` uses | 432 (377 use the same `#5B6AF5/#8B5CF6` purple pair) |
| Arbitrary tiny type `text-[8–10px]` / `fontSize <11` | **59** (DESIGN.md's minimum is 11px) |
| Non-semantic clickable `<div onClick>` | 24 |
| Pages > 150 LOC with zero `aria-*`/`role` | 8 |

`DESIGN.md` lists "purple gradient blobs" as an anti-pattern. The login screen itself uses a purple gradient CTA over a dark card. Worst offenders: `TeacherDashboardPage` (193 inline styles), `HomePage` (128), `BattlePage` (107), `StudyCirclePage` (103). Result: visual inconsistency between screens, and the **Light theme is a global CSS remap** of `.text-white` (1,673 uses) — any inline hex or `color:'#fff'` (4,185 + 76) is not remapped, so Light mode (offered free in Settings) is likely inconsistent/unreadable in places. *(Needs visual verification — see §12.)*

### 5.4 Login & onboarding friction
- Login shows **three stacked choice groups** before any field: Password / Email-OTP toggle, Sign-In / Sign-Up toggle, plus (below the fold) social options. The email/password inputs render with a visible nested border/box (see `e2e/visual.spec.ts-snapshots/login-signin-chromium-linux.png`).
- `LoginPage.tsx`: 801 lines, 23 `useState`.
- Onboarding: **7 steps** (§4.3) before the user sees any product value; the "aha" (a first Novo answer or first sprint) is 8+ taps away.

### 5.5 Loading / empty / error states are inconsistent
Only **17 of 99 pages** use `Skeleton`, **9** use `EmptyState`, **2** use `PageErrorState`. The rest hand-roll spinners or blank areas. Combined with §5.1 (22 pages on empty or non-existent tables), users frequently meet blank or spinner-only screens with no guidance.

### 5.6 Data layer causes perceived slowness/flakiness
- **297** direct `supabase.from()` calls inside pages/components; **116** direct edge-function invokes; TanStack Query is installed and configured (`offlineFirst`, 5-min stale) but `useQuery` is used in **2 places** — 276 `useEffect` fetches reinvent loading/caching/retry per page (no request de-duplication, no shared cache between screens).
- 43 `select('*')` calls (over-fetching), 45 `.limit()` guards.
- Pages are monoliths (`ChatPage` 1,364 lines/31 state vars; `HomePage`; `StudyRoomPage`; `QuizPage`; `AdminConsolePage` 46 state vars).

### 5.7 Performance (fresh production build, gzip)
Initial-load JS ≈ index 257 KB + index-2 100 KB + vendor-react 54 + vendor-supabase 56 + vendor-analytics 75 + motion 38 + icons 15 + capacitor 14 ≈ **~610 KB gzip before any page**. Largest lazy chunks: `exceljs` 270 KB gz (only needed for exports), `ChatPage` 178 KB gz (the core screen — markdown+KaTeX+highlight), `vendor-pdf` 141 KB gz, plus a 521 KB offline-model web worker (`@huggingface/transformers`). On budget Android devices over Indian mobile networks this matters. Analytics stack (PostHog + Sentry) at 75 KB gz is loaded eagerly.

### 5.8 Language promise vs delivery
Onboarding asks users to pick from **9 languages**, including Tamil/Telugu/Kannada/Marathi/Bengali/Gujarati/Punjabi. The static-UI dictionary covers 579 lines (nav, some page titles), Hindi filled first, others explicitly "first draft, not reviewed by a native speaker". **95 of the 98 routed pages have zero `t()` calls** — they're English-only. A student who picks Tamil gets a Tamil tab bar and an English app. AI answers do respect the language instruction. Either scope the promise ("AI answers in your language") or localize the top 10 screens.

### 5.9 Accessibility
247 `aria-`/`role` attributes across 66,500 lines; 27 `alt` for 29 `<img>`; a WCAG AA fix pass exists for the Light theme tokens only. No evidence of screen-reader, touch-target-size (≥44 px), or focus-order testing. Text at 10–11 px with the `--ink-450` grey token on near-black is a likely contrast failure.

### 5.10 Monetization UX
30-day trial → paywalls → dead end (§4.1). Additionally: `ProGate` locks a mix of things (Full Mock Tests, PYQ Bank, UPSC Mains, Analytics, Voice, AI daily-limit) with 6 gate sites and 8 `isPro` conditionals — there is no single, published "what's free / what's Pro" matrix.

---

## 6. Core-loop assessment (the flows users actually judge the app on)

| Flow | State | Notes |
|---|---|---|
| Sign up / Login | Works (auth, OTP, Google deep-link handled incl. cold-start fix) | Too many choices; consent gate blocks 60% |
| Onboarding | Works, but wrong | 7 steps; exam skippable → 0% captured |
| Home | Works, overloaded | §5.2 |
| **Novo chat** (core product) | Works when providers are healthy | Groq primary is fine; RAG embeddings + Gemini fallback depend on the failing key; memory extraction has never produced a row (`novo_memories = 0`); 568 KB chunk |
| Sprint | Works (2 ever) | Not in tab bar |
| Quiz / Mock / PYQ | Quiz has 0 sessions; Mock Test & PYQ are Pro-gated → dead end | §4.1 |
| Flashcards / Spaced repetition | 21 flashcards; SR tables empty (`sr_cards` 0) | |
| Battle / social | `battle_invites` 8, `battles` 0, `friendships` 0 | Multiplayer needs users; with 42 total, matchmaking is bots/empty |
| Photo Solver / Scanner | Depends on Gemini vision (failing key) | |
| Offline mode | Broken tables (§4.4) | Native offline model is a 521 KB worker |
| Payments | **Dead end** | §4.1 |
| Teacher / School / Parent portals | Built, unreachable/unused (0 classrooms, 1 institution) | B2B is a separate product needing its own launch |

---

## 7. AI stack status

- **Central gateway** (`_shared/aiGateway.ts`): kill switch + daily cost ceiling ($50 default) + full request log + prompt-version registry + `anthropic` provider registered. Migration status: **8 of 39 direct-call functions fully migrated** (`ai-question-gen`, `gemini-vision`, `novo-cron-proactive`, `novo-morning-brief`, `roadmap-generator`, `study-pack-generator`, `revision-planner`, `lesson-planner`), **`gemini-chat` partially** (completion + fallback paths; internal RAG helpers deliberately direct). **30 functions still call providers directly** with no cost cap/kill switch.
- **Claude for Novo chat:** `callClaude()` + format translators are deployed; `AI_CHAT_PROVIDER` was set then **unset** by the founder (rolled back). It has **never been verified against a live Anthropic response.** Known gap: derivation-intent queries lose tool-calling under Claude.
- **Model reality:** primary tutor model is an open-weight 120B on Groq free/low tier; quality on JEE/NEET multi-step derivations is the likely source of "wrong answer" complaints once real users return. Golden eval sets exist (`novo_eval_cases` 25, `question_gen_eval_cases` 9) but are not a CI gate.
- **Spend:** effectively $0 measured (all logged calls failed).

---

## 8. Engineering health

| Check | Result (2026-09-24) |
|---|---|
| `tsc -b --noEmit` | **0 errors** |
| ESLint | **0 errors**, 3 warnings |
| Frontend unit tests (Vitest) | **104 / 104 pass** (14 files) |
| Backend unit tests (Deno) | **278 / 278 pass**; only 18 of 76 functions have any test |
| E2E (Playwright) | 5 authenticated specs (nav, route smoke, account settings, sign-out) + login/visual; staging suite wired in CI |
| Security tests | pgTAP attack suite in CI |
| Production build | passes in 8s; APK build jobs in CI |
| CI | type-check, lint, unit, edge tests, pgTAP, E2E (public + staging), build, Android debug + release |
| Prior enterprise audit (Aug) | Every mandate phase still "PARTIALLY COMPLETE"; see `docs/enterprise/` |

Infra limits from prior audits still stand: **Supabase production is on the Free plan (60 DB connections, no PITR)**; bus factor of one; no automated deploy pipeline; no staged-rollout ever executed. See `docs/enterprise/READINESS_CLOSURE_SEQUENCE.md`.

---

## 9. Data & content inventory
See §3 (usage) and §4.8 (content). Key reference data present: NCERT 274 chapters / 301 content rows, PYQs 555, knowledge graph 233 nodes, concept graph 162, exam boards 79, JEE topic weights 17, concept-of-day 40, mains questions 17, 316 concept aliases. Everything user-generated is near zero.

---

## 10. Things that are genuinely good (keep)
- Clean typed codebase; lazy route splitting; per-route error boundaries; DPDP consent architecture; deep-link/OAuth cold-start handling; offline-first query defaults; AI gateway + prompt registry + eval harness; RLS across all 174 audited tables; CI depth; a thoughtful `DESIGN.md` that, if enforced, would fix most of §5.

---

## 11. Recommended plan for the PM (priority order)

**Sprint 0 — Stop the bleeding (days, not weeks)**
1. Route `/pro` → `ProSubscriptionPage`; test purchase on a Play internal-testing track. *(§4.1)*
2. Fix/rotate `GEMINI_API_KEY`, confirm billing; stop retrying 4xx; add "AI function with 0 successes in 24h" alert. *(§4.2)*
3. Reconcile schema: create or drop the 12 missing tables; add a CI guard (UI table refs ⊆ schema). *(§4.4)*
4. Export the 6 source-less deployed functions into the repo. *(§4.6)*
5. Make the exam target unskippable (or persistent Home prompt). *(§4.3)*

**Sprint 1 — Shrink to one loop**
6. Feature-flag OFF every route whose backing data is empty or whose backend is broken (17 empty-data pages + 5 broken-table pages + the unreachable `live-study-rooms`, `peer-explain`, `parent-portal`, `offline-mode`) until they have content; keep them in code.
7. Rebuild Home: header (streak/XP) + **one** "Do this next" card + today's plan (≤3 items). Move everything else to Learn/Tools.
8. Add **Sprint** and **Tools** to the tab bar (or replace Battle, which has no players); rename by user intent, not by build tier.
9. Onboarding → 3 steps (exam+date, level+subjects, language) → land directly in a first Novo question or sprint.
10. Standardize loading/empty/error components on every remaining page.

**Sprint 2 — Quality & trust**
11. Replace hex/inline styles with tokens on the top 10 screens; enforce with a lint rule; visually QA Light theme.
12. Move page-level fetches to TanStack Query hooks (`useQuery`) — shared cache, dedupe, retry.
13. Localize the top 10 screens in the 3 largest languages or narrow the language promise.
14. Decide the Novo model strategy: verify Claude path in staging, then A/B on the eval set; migrate remaining 30 AI functions to the gateway.
15. Publish the free-vs-Pro matrix; one paywall component.

**Sprint 3 — Scale readiness** (prior plan): Supabase Pro upgrade, PITR + restore drill, second reviewer, authenticated E2E for the core loop, staged rollout dry-run.

**Metrics to gate each sprint:** signup→consent ≥80%; consent→exam set ≥90%; day-1 first sprint or Novo answer ≥50%; day-7 return ≥25%; AI-function daily success rate ≥98%; paywall→purchase-screen reach 100%.

---

## 12. What I could NOT verify (be skeptical of these)
- **No live walkthrough.** I could not sign in (credentials are not mine to use), so I did not observe real screens on a device. UI findings are from code metrics, `DESIGN.md`, one committed login screenshot, and structure — a designer should do a device pass (esp. Light theme, small phones, Tamil/Hindi UI).
- **The actual user complaints.** The DB has 0 rows in `app_reviews`, `question_reports`, `answer_reports`, `feedback`-style tables. I don't have the Play Store reviews or the wording of "bad remarks"; PM should attach them so I can map each to a root cause.
- iOS is not shipped; I did not test the native Android build on a device.
- Whether the 25 non-consented accounts are legacy/testers vs abandoned real users.
- Whether `/tools` and `/sprint` are discoverable through some path I did not trace.
- Claude-path behavior against a live Anthropic response (never exercised).
- Pre-Aug-28 AI failure rate (no gateway logging existed).
- Security/RLS status is taken from the August audits (`docs/enterprise/`), not re-run today.

## 13. Questions the PM should answer
1. Who is the primary user for the next 90 days — JEE/NEET students only, or also UPSC/CAT/boards/schools? (Determines what to hide.)
2. Is B2B (teacher/school/parent) in scope this quarter? If not, hide it.
3. Free vs Pro: what exactly is free after the trial?
4. Which single metric defines "working" (weekly active learners completing ≥3 sprints?).
5. Can we approve Supabase Pro + a Gemini/Anthropic billing budget?
6. Who reviews the 232 unreviewed PYQs (or do we hide them)?

---

*Appendices are generated from the repository and the live production database on 2026-09-24. Flags: **NO DATA** = every backing table is empty; **BROKEN TABLE REF** = page queries a table that does not exist in production; **EN-only** = page has no `t()` localization calls.*



---

## Appendix A — Every route (98 mapped pages)

Columns: Pro-gated = page references `ProGate`/`isPro`; Localised = page calls `t()`; row counts are live production row counts for the tables that page queries (views shown as `(view)`). Flags: **NO DATA** 17 pages · **BROKEN TABLE REF** 5 pages · **EN-only** 95 pages.

| # | Route | Page component | LOC | Pro-gated | Localised (t()) | Backing tables (rows in prod) | Edge fns called | Flags |
|---|---|---|---|---|---|---|---|---|
| 1 | `/account` | AccountSettingsPage | 466 |  | no | `profiles` (42) | delete-account, export-user-data | EN-only |
| 2 | `/achievements` | AchievementsPage | 214 |  | no | `achievements` (3) | — | EN-only |
| 3 | `/admin` | AdminConsolePage | 1087 |  | no | `cron_health` (1), `mains_band_stats` (view) | admin-console | EN-only |
| 4 | `/ai-quiz` | AIQuizBankPage | 498 |  | no | `ai_question_flags` **MISSING**, `question_reports` (0), `topic_performance` (1) | ai-question-gen, gemini-chat | BROKEN TABLE REF, EN-only |
| 5 | `/analytics` | AnalyticsDashboardPage | 423 | yes | no | `sprint_sessions` (2) | novo-analytics | EN-only |
| 6 | `/attention-heatmap` | AttentionHeatmapPage | 553 |  | no | — | analytics | EN-only |
| 7 | `/auth/classroom/callback` | ClassroomCallbackPage | 179 |  | no | — | — | EN-only |
| 8 | `/battle` | BattlePage | 978 |  | no | `battle_invites` (8), `battle_pass` (0), `battles` (0), `profiles` (42) | — | EN-only |
| 9 | `/boss-fight` | BossFightPage | 561 |  | no | `boss_fight_sessions` (0) | boss-fight | NO DATA, EN-only |
| 10 | `/browser` | BrowserPage | 121 |  | no | — | — | EN-only |
| 11 | `/cat-syllabus` | CATSyllabusPage | 191 |  | no | `cat_syllabus_progress` (0) | — | NO DATA, EN-only |
| 12 | `/certifications` | CertificationsPage | 679 |  | no | `certification_assessments` (0) | novo-certifications | NO DATA, EN-only |
| 13 | `/challenges` | NovoChallengesPage | 826 |  | no | — | novo-challenges | EN-only |
| 14 | `/chat` | ChatPage | 1365 | yes | no | `profiles` (42), `tutor_chats` (84) | gemini-chat, gemini-vision, novo-memory, novo-proactive | EN-only |
| 15 | `/circles` | StudyCirclePage | 653 |  | no | `circle_sprints` (0), `profiles` (42), `study_circle_members` (0), `study_circles` (0) | — | EN-only |
| 16 | `/concept-map` | ConceptMapPage | 1149 |  | no | `concept_edges` (0), `concept_nodes` (0) | — | NO DATA, EN-only |
| 17 | `/concept-videos` | ConceptVideosPage | 342 | yes | no | `concept_videos` **MISSING**, `novo_memories` (0), `video_watches` **MISSING** | — | BROKEN TABLE REF, EN-only |
| 18 | `/confidence` | ConfidenceScorePage | 768 |  | no | — | analytics | EN-only |
| 19 | `/course` | CoursePage | 849 |  | no | `lesson_progress` (0) | — | NO DATA, EN-only |
| 20 | `/curriculum` | CurriculumPage | 467 |  | no | — | curriculum-builder | EN-only |
| 21 | `/curriculum/:boardCode/:subject` | CurriculumDetailPage | 879 |  | no | — | curriculum-builder | EN-only |
| 22 | `/daily-session` | DailyPowerSessionPage | 465 |  | no | — | novo-daily-session | EN-only |
| 23 | `/data-rights` | DataRightsPage | 352 |  | no | `novo_memories` (0), `profiles` (42) | delete-account, export-user-data | EN-only |
| 24 | `/debate` | DebateModePage | 36 |  | no | — | — | EN-only |
| 25 | `/diagnostics` | DiagnosticsPage | 178 |  | no | — | — | EN-only |
| 26 | `/doubt-room` | DoubtRoomPage | 246 |  | no | `doubt_threads` **MISSING** | — | BROKEN TABLE REF, EN-only |
| 27 | `/error-patterns` | ErrorPatternsPage | 814 |  | no | `error_patterns` (0) | — | NO DATA, EN-only |
| 28 | `/eval` | EvalDashboardPage | 377 |  | no | `novo_eval_runs` (220) | novo-eval-run | EN-only |
| 29 | `/exam-prediction` | ExamPredictionPage | 1072 |  | no | — | exam-prediction | EN-only |
| 30 | `/exam-simulator` | ExamSimulatorPage | 385 |  | no | `quiz_sessions` (0) | — | NO DATA, EN-only |
| 31 | `/exam-war-room` | ExamWarRoomPage | 371 |  | no | `topic_stats` (2) | — | EN-only |
| 32 | `/feed` | AchievementFeedPage | 428 |  | no | `achievement_feed` (0), `feed_reactions` (0), `profiles` (42) | — | EN-only |
| 33 | `/flashcard` | FlashcardPage | 458 |  | no | `flashcards` (21) | — | EN-only |
| 34 | `/formula-ar` | FormulaARPage | 36 |  | no | — | — | EN-only |
| 35 | `/formulas` | FormulaSheetPage | 645 |  | no | — | — | EN-only |
| 36 | `/friends` | FriendsPage | 435 |  | no | `friendships` (0), `my_friends` (view), `profiles` (42) | — | EN-only |
| 37 | `/home` | HomePage | 1461 |  | no | `daily_mission_completions` (1), `daily_power_sessions` (0), `flashcards` (21), `lesson_progress` (0), `profiles` (42), `rivals` (0), `sprint_sessions` (2), `subtopic_mastery` (0), `topic_stats` (2) | novo-proactive | EN-only |
| 38 | `/journal` | MistakeJournalPage | 176 |  | no | `quiz_sessions` (0) | — | NO DATA, EN-only |
| 39 | `/languages` | RegionalLanguagePage | 442 |  | no | `pyq_content` (555), `question_translations` (1) | — | EN-only |
| 40 | `/leaderboard` | LeaderboardPage | 417 |  | no | `hall_of_fame` (0), `my_friends` (view), `profiles` (42), `rivals` (0), `xp_snapshots` (4) | — | EN-only |
| 41 | `/learning` | LearningPage | 403 |  | yes | `flashcards` (21), `quiz_sessions` (0), `sprint_sessions` (2) | — |  |
| 42 | `/learning-style` | LearningStylePage | 451 |  | no | — | — | EN-only |
| 43 | `/lesson-plan` | LessonPlanPage | 509 |  | no | — | lesson-planner | EN-only |
| 44 | `/live-event` | LiveEventPage | 281 |  | no | `live_event_participants` (0), `live_events` (0), `profiles` (42), `pyq_content` (555) | — | EN-only |
| 45 | `/live-study-rooms` | LiveStudyRoomsPage | 36 |  | no | — | — | EN-only |
| 46 | `/login` | LoginPage | 802 |  | no | — | — | EN-only |
| 47 | `/mnemonics` | MnemonicPage | 171 |  | no | — | — | EN-only |
| 48 | `/mock-postmortem` | MockPostmortemPage | 408 |  | no | `quiz_sessions` (0), `topic_stats` (2) | — | EN-only |
| 49 | `/mock-test` | MockTestPage | 976 | yes | no | `mock_test_attempt_starts` (0), `mock_test_attempts` (0), `pyq_content` (555), `sr_cards` (0) | mock-paper-composer | EN-only |
| 50 | `/ncert-chapters` | NCERTChaptersPage | 607 |  | no | `ncert_chapter_progress` **MISSING**, `ncert_chapter_questions` **MISSING**, `ncert_chapters` (274) | — | BROKEN TABLE REF, EN-only |
| 51 | `/ncert-deep` | NcertDeepPage | 440 |  | no | `ncert_paragraphs` (0) | — | NO DATA, EN-only |
| 52 | `/notes` | StudyNotesPage | 234 |  | no | `study_notes` (0) | — | NO DATA, EN-only |
| 53 | `/novo-insights` | NovoInsightsPage | 494 |  | no | `novo_insights` (0) | — | NO DATA, EN-only |
| 54 | `/novo-live` | NovoLivePage | 36 |  | no | — | — | EN-only |
| 55 | `/novo-messages` | NovoProactivePage | 351 |  | no | — | novo-proactive | EN-only |
| 56 | `/novo-reads` | NovoReadsPage | 1060 |  | no | `reading_sessions` (0), `study_notes` (0) | — | NO DATA, EN-only |
| 57 | `/offline-mode` | OfflineModePage | 521 |  | no | `flashcards` (21), `quiz_questions` **MISSING**, `topic_stats` (2) | — | BROKEN TABLE REF, EN-only |
| 58 | `/onboarding` | OnboardingPage | 575 |  | no | `profiles` (42), `user_moods` (82) | — | EN-only |
| 59 | `/parent` | ParentDashboardPage | 476 |  | no | — | analytics, weekly-report | EN-only |
| 60 | `/parent-portal` | ParentPortalPage | 687 |  | no | — | parent-link | EN-only |
| 61 | `/peer-explain` | PeerExplanationPage | 593 |  | no | `peer_explanations` (0) | — | NO DATA, EN-only |
| 62 | `/photo-solver` | PhotoSolverPage | 1062 |  | no | `photo_solves` (0), `sr_cards` (0), `user_snapshots` (0) | gemini-vision | NO DATA, EN-only |
| 63 | `/planner` | RevisionPlannerPage | 598 |  | no | `revision_plans` (1) | — | EN-only |
| 64 | `/privacy-policy` | PrivacyPolicyPage | 196 |  | no | — | — | EN-only |
| 65 | `/profile` | ProfilePage | 792 | yes | yes | `sprint_sessions` (2), `weekly_leaderboard` (view) | — |  |
| 66 | `/pyq-bank` | PYQBankPage | 707 | yes | no | `pyq_content` (555), `pyq_topic_frequency` (0) | mock-paper-composer | EN-only |
| 67 | `/quiz` | QuizPage | 1135 |  | no | `novo_memories` (0), `quiz_confidence` (1), `quiz_sessions` (0), `verified_question_bank` (0) | novo-memory, novo-ncert, question-explain | EN-only |
| 68 | `/rank-predictor` | RankPredictorPage | 430 |  | no | — | — | EN-only |
| 69 | `/reels` | ConceptReelsPage | 502 |  | no | `flashcards` (21), `topic_stats` (2) | — | EN-only |
| 70 | `/referral` | ReferralPage | 231 |  | no | `my_referrals` (view) | — | EN-only |
| 71 | `/reminders` | StudyRemindersPage | 203 |  | no | — | — | EN-only |
| 72 | `/roadmap` | RoadmapPage | 956 |  | no | `study_roadmap_progress` (0), `study_roadmaps` (1) | roadmap-generator | EN-only |
| 73 | `/scanner` | ScannerPage | 630 |  | no | `flashcards` (21), `study_notes` (0) | ocr | EN-only |
| 74 | `/school-admin` | SchoolAdminPage | 763 | yes | no | `institution_analytics` (view), `institution_student_analytics` (view), `institutions` (1) | — | EN-only |
| 75 | `/school/:schoolName` | SchoolLeaderboardPage | 142 |  | no | — | — | EN-only |
| 76 | `/sleep-review` | SleepReviewPage | 663 |  | no | `flashcards` (21), `profiles` (42) | — | EN-only |
| 77 | `/solved` | SolvedExamplesPage | 466 |  | no | — | — | EN-only |
| 78 | `/spaced-review` | SpacedRepetitionPage | 884 |  | no | — | — | EN-only |
| 79 | `/sprint` | SprintPage | 448 |  | no | `sprint_sessions` (2) | — | EN-only |
| 80 | `/story-mode` | StoryModePage | 884 |  | no | — | story-mode | EN-only |
| 81 | `/streaks` | StreakChallengePage | 976 |  | no | — | streak-challenges | EN-only |
| 82 | `/study-buddy` | StudyBuddyPage | 223 |  | no | `buddy_checkins` (0), `profiles` (42), `study_buddies` (0) | — | EN-only |
| 83 | `/study-dna` | StudyDNAPage | 444 |  | no | `profiles` (42), `quiz_sessions` (0), `sprint_sessions` (2), `topic_stats` (2) | — | EN-only |
| 84 | `/study-group/:groupId` | GroupDetailPage | 361 |  | no | — | study-groups | EN-only |
| 85 | `/study-groups` | StudyGroupsPage | 36 |  | no | — | — | EN-only |
| 86 | `/study-pack` | StudyPackPage | 1000 |  | no | `document_jobs` (0), `study_packs` (0) | ocr | NO DATA, EN-only |
| 87 | `/study-rooms` | StudyRoomPage | 1258 |  | no | `study_room_members` (1), `study_rooms` (2) | — | EN-only |
| 88 | `/subject-map` | SubjectDependencyPage | 814 |  | no | `subject_dependencies` (46) | — | EN-only |
| 89 | `/teacher` | TeacherDashboardPage | 1068 |  | no | `profiles` (42), `school_profiles` (0), `teacher_profiles` (0) | school-report | EN-only |
| 90 | `/teacher-export` | TeacherExportPage | 525 |  | no | — | teacher-export | EN-only |
| 91 | `/terms-of-service` | TermsOfServicePage | 220 |  | no | — | — | EN-only |
| 92 | `/tools` | ToolsPage | 460 |  | yes | — | — |  |
| 93 | `/tournament` | TournamentPage | 1006 |  | no | — | — | EN-only |
| 94 | `/tutoring` | TutoringSessionPage | 953 |  | no | `concept_edges` (0), `concept_nodes` (0) | tutoring-engine | NO DATA, EN-only |
| 95 | `/upsc-mains` | UPSCMainsPage | 330 | yes | no | — | mains-answer-evaluator | EN-only |
| 96 | `/video-companion` | VideoCompanionPage | 1047 |  | no | `sr_cards` (0), `video_sessions` (0) | video-companion | NO DATA, EN-only |
| 97 | `/weakness-radar` | WeaknessRadarPage | 530 |  | no | `jee_topic_weights` (17), `sprint_sessions` (2), `topic_performance` (1) | — | EN-only |
| 98 | `/whiteboard` | WhiteboardPage | 36 |  | no | — | — | EN-only |

---

## Appendix B — Every deployed backend function (76)

JWT verify = Supabase platform-level JWT check; **NO** means the function must authenticate internally (cron secret, service key, or in-code `getUser`). AI gateway = routes provider calls through the kill-switch/cost-ceiling gateway.

| Function | Ver | JWT verify | In repo | Called by UI | Unit tests | AI gateway | Purpose (from source header) |
|---|---|---|---|---|---|---|---|
| `adaptive-curriculum` | 13 | NO | yes | no | no | Direct | adaptive-curriculum — nightly background agent (Retention outcomes loop) |
| `admin-console` | 9 | yes | yes | yes | no | Direct | admin-console — staff-only operations, gated by public.has_role(uid,'admin') |
| `ai-question-gen` | 23 | NO | yes | yes | yes | Migrated | Edora — AI Question Generator Edge Function |
| `analytics` | 33 | yes | yes | yes | no | Direct | analytics — attention heatmap + confidence scores + overview stats |
| `anomaly-detection` | 6 | yes | yes | no | no | Direct | anomaly-detection — staff-only, gated by public.has_role(uid,'admin') |
| `backfill-corpus-embeddings` | 8 | NO | yes | no | no | Direct | backfill-corpus-embeddings — one-off/internal admin utility. |
| `boss-fight` | 16 | NO | yes | yes | no | Direct | boss-fight — Generates 10 MCQ questions for a chapter boss fight |
| `classroom-auth` | 26 | yes | yes | yes | no | Direct | classroom-auth — Google Classroom OAuth2 flow |
| `classroom-sync` | 25 | yes | yes | yes | no | Direct | classroom-sync — Create assignments + sync student grades to Google Classroom |
| `curriculum-builder` | 34 | NO | yes | yes | no | Direct | curriculum-builder  — Tier 2 Feature: Curriculum Builder |
| `db-backup-export` | 7 | NO | yes | no | no | Direct | db-backup-export — cron-triggered logical backup, stopgap for a paid-tier |
| `db-backup-restore` | 5 | NO | yes | no | no | Direct | db-backup-restore — companion to db-backup-export |
| `debate-mode` | 32 | NO | yes | no | no | Direct | debate-mode — Novo takes a position, student argues against it |
| `delete-account` | 37 | yes | yes | yes | no | Direct | CORS preflight |
| `elevenlabs-tts` | 35 | yes | yes | yes | no | Direct | Edora — ElevenLabs TTS Edge Function |
| `exam-prediction` | 36 | NO | yes | yes | no | Direct | exam-prediction — the "Exam-Day Readiness Score": projects likely exam |
| `export-user-data` | 11 | yes | yes | yes | no | Direct | DPDP Act Data Export ────────────────────────────────────────────────────── |
| `gemini-chat` | 81 | NO | yes | yes | yes | Partial (+Claude flag, OFF) | Edora — Novo Brain v4.0  (God-Mode Edition) |
| `gemini-vision` | 38 | NO | yes | yes | yes | Migrated | Edora — Gemini Vision Edge Function |
| `google-calendar` | 19 | yes | yes | no | no | Direct | google-calendar — Manage Google Calendar events for teachers |
| `google-drive` | 19 | yes | yes | no | no | Direct | google-drive — Manage Google Drive files for teachers |
| `google-gmail` | 19 | yes | yes | yes | no | Direct | google-gmail — Send teacher emails via Gmail API |
| `grok-eval-compare` | 8 | NO | yes | no | no | Direct | grok-eval-compare — one-off admin tool: is xAI's Grok worth adding to |
| `health-check` | 5 | NO | yes | no | no | Direct | health-check — public liveness/readiness endpoint for external uptime monitors |
| `lesson-planner` | 32 | NO | yes | yes | no | Migrated | lesson-planner — Novo generates & manages full weekly lesson plans |
| `mains-answer-evaluator` | 11 | NO | yes | yes | yes | Direct | mains-answer-evaluator — UPSC Mains / CBSE Boards long-answer practice. |
| `mistake-clustering` | 7 | yes | **NO** | no | no | Direct | (source not in repo) |
| `mock-paper-composer` | 6 | NO | **NO** | yes | no | Direct | (source not in repo) |
| `monitoring-check` | 14 | NO | yes | no | no | Direct | monitoring-check — cron-triggered health check, posts alerts to Slack |
| `ncert-ingest` | 32 | NO | yes | no | no | Direct | ncert-ingest v2 — Hierarchical RAG ingestion pipeline |
| `nova-insights` | 26 | NO | **NO** | no | no | Direct | (source not in repo) |
| `novo-analytics` | 26 | yes | yes | yes | no | Direct | novo-analytics — Advanced learning analytics for Novo Pro |
| `novo-certifications` | 31 | NO | yes | yes | no | Direct | novo-certifications — Mastery-verified in-app certificates |
| `novo-challenges` | 33 | NO | yes | yes | no | Direct | novo-challenges — daily boss-level problems with XP multiplier |
| `novo-cron-proactive` | 15 | NO | yes | no | no | Migrated | novo-cron-proactive — Scheduled cron worker for Proactive Novo Intelligence |
| `novo-daily-session` | 17 | NO | yes | yes | no | Direct | novo-daily-session — Curated 10-minute daily power session content generator |
| `novo-eval-run` | 25 | NO | yes | yes | no | Direct | novo-eval-run — Evaluation / QA harness for Novo AI |
| `novo-events` | 27 | yes | yes | yes | no | Direct | novo-events — Learning analytics event pipeline |
| `novo-insights` | 32 | NO | yes | yes | yes | Direct | Edora — Novo Insights Edge Function |
| `novo-language` | 27 | yes | yes | yes | no | Direct | novo-language — Google Cloud Translation + Text-to-Speech proxy |
| `novo-memory` | 32 | NO | yes | yes | yes | Direct | novo-memory — Cross-session memory layer for Novo AI |
| `novo-memory-consolidate` | 16 | NO | yes | no | yes | Direct | novo-memory-consolidate — nightly background agent |
| `novo-memory-extract` | 15 | NO | yes | no | no | Direct |  |
| `novo-morning-brief` | 19 | NO | yes | no | yes | Migrated | novo-morning-brief — Personalised daily 7 AM push notification |
| `novo-ncert` | 38 | NO | yes | yes | no | Direct | novo-ncert — NCERT Knowledge Base (RAG) |
| `novo-proactive` | 30 | NO | yes | yes | no | Direct | novo-proactive — Novo initiates conversations, not just responds |
| `novo-push` | 27 | NO | yes | no | no | Direct | novo-push — FCM v1 push notification dispatcher |
| `novo-stt` | 27 | yes | yes | yes | no | Direct | novo-stt — Google Cloud Speech-to-Text proxy |
| `novo-subscription` | 33 | yes | yes | yes | no | Direct | novo-subscription — Razorpay-powered Novo Pro subscription |
| `ocr` | 42 | yes | yes | yes | no | Direct | Edora — Cloud Vision OCR Edge Function |
| `parent-link` | 13 | yes | yes | yes | no | Direct | Edora — Parent-Link Edge Function |
| `process-document-jobs` | 6 | NO | yes | no | yes | Direct | Edora — process-document-jobs Edge Function |
| `pyq-bulk-ingest` | 5 | NO | **NO** | no | no | Direct | (source not in repo) |
| `pyq-content-audit` | 11 | NO | yes | no | no | Direct | pyq-content-audit — AI second-reviewer pass over pyq_content rows that |
| `pyq-embed-ingest` | 5 | NO | **NO** | no | no | Direct | (source not in repo) |
| `pyq-ingest` | 13 | NO | yes | no | no | Direct | pyq-ingest — JEE/NEET PYQ bulk ingest + embedding pipeline |
| `question-explain` | 5 | NO | **NO** | yes | no | Direct | (source not in repo) |
| `question-gen-eval-run` | 4 | NO | yes | no | no | Direct | question-gen-eval-run — Evaluation harness for ai-question-gen |
| `question-quality-audit` | 9 | NO | yes | no | yes | Direct | question-quality-audit — staff-only, gated by public.has_role(uid,'admin') |
| `revision-planner` | 17 | NO | yes | no | yes | Migrated | revision-planner — AI-powered exam revision schedule generator |
| `roadmap-generator` | 34 | NO | yes | yes | yes | Migrated | Edora — Roadmap Generator Edge Function |
| `school-report` | 26 | NO | yes | yes | no | Direct | school-report — Beautiful HTML reports for parents, teachers, and principals |
| `story-mode` | 30 | NO | yes | yes | yes | Direct | story-mode — concepts delivered inside an adventure narrative |
| `streak-challenges` | 33 | NO | yes | yes | no | Direct | streak-challenges — personalised AI-generated streak challenges from weak areas |
| `study-groups` | 29 | yes | yes | yes | no | Direct | study-groups — Social study groups with weekly leaderboards |
| `study-pack-generator` | 33 | NO | yes | no | yes | Migrated | Edora — Study Pack Generator Edge Function |
| `teacher-content-ingest` | 10 | NO | yes | no | no | Direct | teacher-content-ingest — B2B school-scoped content upload + embedding pipeline |
| `teacher-export` | 32 | NO | yes | yes | yes | Direct | teacher-export — mastery map + error log + improvement trajectory as HTML PDF |
| `tournament` | 33 | NO | yes | no | yes | Direct | tournament — weekly AI-generated tournaments, async head-to-head leaderboard |
| `tutoring-engine` | 36 | NO | yes | yes | yes | Direct | Edora — tutoring-engine Edge Function |
| `user-content-index` | 10 | NO | yes | yes | no | Direct | user-content-index — embed user's flashcards + study notes into private index |
| `vertex-export` | 26 | yes | yes | no | no | Direct | vertex-export — Vertex AI training data pipeline |
| `vertex-jobs` | 25 | yes | yes | no | no | Direct | vertex-jobs — Vertex AI fine-tuning job manager  [ADMIN ONLY] |
| `video-companion` | 31 | NO | yes | yes | yes | Direct | Edora — Video Companion Edge Function (Feature 15) |
| `weekly-report` | 34 | NO | yes | yes | no | Direct | weekly-report — Novo generates plain-English parent report |
| `youtube-search` | 7 | yes | yes | yes | no | Direct | youtube-search — server-side YouTube Data API v3 search |
