# Edora V5 "Landmark" — Master Implementation Plan (Final Revision)

| | |
|---|---|
| **Branch** | `release/5.0.0-landmark` |
| **Immutable pre-V5 baseline** | `eaf42abd515f2828db13042a4e168c83508c68ca` (`release/4.1.0-integration`, untouched) |
| **Revises** | plan committed at `c383ab052062df1705db3b21cfff0240749d94ff` — this file replaces it; there is no second plan |
| **Factual baseline** | `docs/product/APP_STATE_REPORT_2026-09-24.md` + independent Antigravity audit (findings re-checked below) |
| **Written** | 2026-09-25 |
| **Status** | PLANNING ONLY. No application code, migration, deployment or production write has been made in producing this revision. |
| **Budget** | 20 calendar days, weekends included. Days 18–20 are protected. |

**Evidence legend:** `[V]` verified by me in this session — repository facts read at baseline `eaf42ab` (identical to this branch), database facts queried 2026-09-25 unless marked `[R]` · `[R]` measured in the 2026-09-24 report, not re-measured · `[A]` reported by the Antigravity audit, **not independently re-verified by me** · `[P]` plan/assumption · `[U]` unverified, resolved on the stated day. Anything without a tag has not been verified.

### What changed in this revision (so reviewers can diff intent, not just text)
1. Added the **Global Affordable Education Doctrine** (§1) and made it the tie-breaker for every decision.
2. **Day 1 now starts with the `quiz_sessions.score_pct` repair**, with an 8-step evidence process. Re-reading `QuizPage` showed the repair will **unmask** a duplicate-write path (F18), so "exactly one row" is not guaranteed by the column alone. I have not called this zero-risk.
3. Purchase: **restore does not sync the backend** — verified (F19). Native/Razorpay isolation added.
4. New verified trust findings: student-facing PYQ reads have **no review filter** and the 323 "reviewed" questions are **AI-audited, not human-verified** (F7, F8). A three-tier provenance architecture (§7) replaces the old label.
5. Novo memory fix is now a decision, not an investigation: `EdgeRuntime.waitUntil` (F6). Groq 5xx/timeout currently have **no fallback** (F21).
6. Free-tier Novo cap is **client-side `localStorage` only** (F24) → server-side quota added.
7. Android back handling scheduled Day 5; blocking font/startup fixes Day 17; corrected my own earlier bundle estimate (F23).
8. Approved cuts applied: no LLM misconception tags, no separate Chapter Practice browser, Mock engine untouched, no Novo "Plan" mode, EN+HI UI only, thin Progress.
9. G7 redefined to required user-facing AI calls with per-provider reporting; performance and content-trust gates added; V5.1 deferred list added; day schedule re-cut around the exact critical path you specified.

---

## 1. EDORA GLOBAL AFFORDABLE EDUCATION DOCTRINE

**Edora is a global, corporate-grade, mobile-first education platform that delivers high-quality education at an affordable price.** It must never become an expensive AI wrapper, a prototype, a feature dump, a heavy app for premium hardware, an app that only works on fast Wi-Fi, an app whose core learning is locked behind an expensive paywall, or an app that trades educational accuracy for AI novelty.

> **Internal principle:** *"Premium-quality education should not require premium hardware, premium internet, or premium pricing."*
>
> **The V5 test, applied to every decision:** *Can a student on an affordable Android phone, average mobile data and a low-cost Edora plan trust this application every day for serious study?* If not: **fix it, simplify it, or hide it from V5.**

**The five principles**

| # | Principle | What it forces in V5 |
|---|---|---|
| **P1** | **Affordable-education** | Free keeps a *useful* learning loop: exam setup, Today's Plan, basic Novo with a sensible cap, Quick Practice with subject/chapter filter, Review, basic Progress, limited verified PYQs. Pro *expands* value (higher/unlimited Novo, full verified PYQ access, advanced analytics, premium mock/test features). Pro never makes basic studying impossible. No Pro gate may dead-end (G2). |
| **P2** | **Low-end-device** | Target: ~3 GB RAM Android, budget chipsets, limited storage. Every core screen is measured on real low-end hardware; heavy libraries leave the startup path; no feature ships that needs a premium phone. **No timing number is a release fact until measured on hardware** (§10). |
| **P3** | **Low-data / offline-resilient** | Slow 3G, unstable 4G, Wi-Fi↔mobile switching, intermittent offline. The core loop must survive all of them without losing an answer. Fewer, smaller requests: no duplicate fetches, no `select('*')` on hot paths, no startup analytics burst. |
| **P4** | **Academic trust** | Three content states are architecturally distinct — **authentic PYQ**, **human-reviewed question**, **AI-generated question** — never merged, never mislabelled. AI questions are labelled, reportable, carry provenance, and are never presented as PYQs. If trusted content is missing we say so; we do not fake it. Educational trust outranks feature completeness. |
| **P5** | **Scalable cost** | AI is the *learning-intelligence layer*, not the foundation of every backend operation. Plan, mastery, Review scheduling, progress, routing, sync and persistence are deterministic. AI is used only for explanation, solving, practice assistance, and question generation when trusted content is insufficient. Free-tier limits are enforced **server-side** where cost is real. |

**A student must never wonder:** *Did my answer save? Did my progress disappear? Why is this frozen? Why is Novo unavailable? Why does poor internet break everything? Is this really a PYQ? Can I trust this answer? Why 30 features instead of what to study? Why does this need an expensive phone? Why is everything Pro?* Each of these maps to a gate in §18.

---

## 2. Mission and the one loop

**Promise:** *Open Edora → know exactly what to study → learn with Novo → practice → understand mistakes → Edora adapts tomorrow.*

**The V5 loop (everything else is secondary):**
`Exam Setup → Today's Plan → Novo → Practice → Answer → Persist → Mistake → Review → Progress → Adaptive Next Plan`

**Navigation:** `Home · Novo · Practice · Progress · Profile`. Battle leaves primary navigation. Tools and Learn catalogues leave discovery. Secondary features stay in the repository behind remote flags; **stable code is not deleted merely because it is hidden.**

**Structural rules**
1. **Deterministic spine, AI at the edges.** A dead AI provider must not blank Home, Review or Progress.
2. **One place records an answer** (`record_answer`), exactly once (idempotency key).
3. **Additive database changes only** until after release — the production database is shared with the live 4.0.0 app `[V: origin/main is 4.0.0, versionCode 52]`. (The one deliberate exception, the `pyq_content` read policy, is decision D-3 with a recorded rollback.)
4. **Native release = no client hot-fix.** `capacitor.config.ts` bundles `dist/` with no remote `url` `[V]`, so after release only server changes and remote flags can fix things → a remote flag table ships Day 5.
5. **Claims are evidence-based.** Gates are proved by query, test run or device log — never "looks fine".

**Out of scope:** new social network · new major gamification · B2B expansion · analytics expansion · redesign of all 98 routes · new AI provider · features "because they're possible". See the V5.1 list (§17).

---

## 3. Verified facts that drive this plan

| # | Fact | Tag | Consequence |
|---|---|---|---|
| F1 | `/pro` is `<Navigate to="/profile">`; `ProSubscriptionPage` imported as `_ProSubscriptionPage`, never rendered. Gates call `navigate('/pro')`. | `[V]` App.tsx:76,509 | Day 1 |
| F2 | `SyncQueue.processAction` does `await withRetry(() => supabase.from(..).insert(..))` and never reads the returned `{error}`; Supabase returns errors rather than throwing, so failed writes count as success and the entry is deleted. Entries failing 5× are dropped silently. | `[V]` syncQueue.ts `flush` 101–125, `processAction` 130–232 | Day 4 |
| F3 | Queue writes to nonexistent `xp_history`, `quiz_user_answers`, `study_streaks`; offline path also targets nonexistent `pyq_questions`/`quiz_questions`. `xp_grant` enqueue sites: QuizPage:521, CoursePage:75; no live enqueue site found for `quiz_answer`/`streak_tick` `[U]`. XP itself uses existing `increment_xp` `[V]`. | `[V]` code; tables `[R]` | Day 3–4 |
| F4 | `profiles`: **42/42 have `exam_name` and `exam_date` NULL.** | `[V]` queried today | Day 4 |
| F5 | Learner state is written by scattered code: `subtopic_mastery` (client `adaptiveDifficulty.ts` **and** `tutoring-engine`, two implementations), `topic_stats` (`upsert_topic_stat`: MockTestPage, novo-memory), `topic_performance` (`upsert_topic_performance`: syncQueue only), `sr_cards`, `error_patterns`, `mistake_journal`. Counts 0/2/1/0/0/0. | `[V]` code+RPCs; counts `[R]` | Day 9 spine |
| F6 | **Memory extraction is an unprotected background promise**: `extractAndSaveMemories(...).catch(() => {})` at gemini-chat:2478 and 2558; no `EdgeRuntime.waitUntil` anywhere in `supabase/functions`. `novo_memories` = 0 rows `[R]`. The root cause of the zero rows is **not proven** by the missing `waitUntil` alone. | `[V]` code | Day 2: fix with `waitUntil` **and** prove by observing a written row |
| F7 | Reviewed usable PYQs: JEE_MAIN 102, JEE_ADV 58, NEET 162 (=322) + 1 CAT = **323**. **All 323 have `validation_state = 'ai_reviewed_ok'`; none are `human_verified`** (that state requires `reviewed_by LIKE 'human:%'`). Separate column `reviewed` is `false` for all rows (duplicate, meaningless). 232 rows (CAT/BOARDS/UPSC) unreviewed. `pyq_content` has `chapter`, no `topic`. | `[V]` queried today | "Verified" may not be used for these in UI (§7) |
| F8 | RLS `pyq_public_read` on `pyq_content` is `USING (is_active = true)` for role `public`. `PYQBankPage`, `MockTestPage` (id-list and fallback `.eq exam/subject .limit`), `LiveEventPage` and `RegionalLanguagePage` apply **no `is_reviewed` filter**. **Unreviewed CAT/BOARDS/UPSC questions are served to students today, including as Mock Exam questions.** | `[V]` policy query + grep | Day 3 (RLS) + Day 13 (client) — rule J is currently violated |
| F9 | NCERT chapter catalogue: 274 chapters, classes 6–12. | `[V]` | Chapter filter has a source |
| F10 | `AIFeedback.tsx` inserts then updates `ai_interactions` (user_id, session_type, user_query, ai_response, subject, topic, class_num; then thumbs, dwell_ms); table missing. | `[V]` | Day 3 |
| F11 | Tests: Vitest 104, Deno 278, tsc/ESLint 0 errors, build OK. | `[R]` | Re-run Day 1 |
| F12 | Android `versionCode 53`, `versionName` from package.json (`4.1.0-alpha.1`); only `release-builds/edora-v4.0.0-52.aab` present; keystore location unknown. `origin/main` = `4.0.0`/52. | `[V]`; keystore `[U]` | P-6 |
| F13 | 6 deployed functions have no repo source (`mistake-clustering`, `mock-paper-composer`, `nova-insights`, `pyq-bulk-ingest`, `pyq-embed-ingest`, `question-explain`); the UI calls two of them. | `[R]` | Day 2 |
| F14 | 34 edge functions contain retry loops; `novo-morning-brief` retried a permanent HTTP 403 three times per user per day for 12 days (1,512 calls). | `[R]` | Day 2 |
| F15 | Gemini key: 3,375 failures vs 1 success since 2026-08-29 (429 → 403). | `[R]` | Day 2 |
| F16 | Novo primary = Groq `openai/gpt-oss-120b` (small: `-20b`). Gemini is used for embeddings, vision and the rate-limit fallback. | `[V]` | §8 |
| F17 | **Quiz results have never been persisted.** `QuizPage` live insert and `SyncQueue` `quiz_session` both send `score_pct`; production `quiz_sessions` has no such column. I ran the exact insert in a transaction that was never committed: `42703 column "score_pct" of relation "quiz_sessions" does not exist`. `quiz_sessions` = 0 rows vs 1 `quiz_complete` event. `questions_count` is NOT NULL but defaults to 0 (not the cause). | `[V]` schema + reproduced error, nothing written | Day 1, first action |
| F18 | **Repairing F17 unmasks a second defect.** `QuizPage` enqueues write-ahead `quiz_session`, `xp_grant`, `topic_perf`, does the live insert, and on success calls `SyncQueue.flush()` — which *processes* every queued entry (the comment says it removes them; it does not) — then calls `increment_xp` **again** live. Once the insert can succeed, the code predicts **two `quiz_sessions` rows** (identical `completed_at`) and **double XP** per quiz. Today these paths never run, so nothing in production has exercised them. | `[V]` by code reading (QuizPage ~505–540, syncQueue `quiz_session`/`xp_grant`) — **predicted, not yet observed** | Day 1 must test before declaring success; "exactly one row" is an acceptance criterion, not an assumption |
| F19 | **Restore never syncs the backend.** `restorePurchases()` returns RevenueCat's local boolean only; `ProSubscriptionPage.handleRestore` then calls `refetchProfile()` and shows "Pro access restored!". The backend actions `restore_purchases` (novo-subscription:699) and `verify_revenuecat` (:666) exist, but **no client code calls `restore_purchases`**; only purchase calls `verify_revenuecat` (iap.ts:117). A RevenueCat webhook handler exists (:285); whether it fires on restore is `[U]`. So the UI can claim success while `profiles.is_pro` is unchanged. | `[V]` code; device behaviour `[A]` | Day 1 |
| F20 | Native purchase uses RevenueCat (`platform` is ios or android); Razorpay inline checkout exists only in the web branch. Isolation holds by code path but has no test. | `[V]` | Day 1 test |
| F21 | **Groq failure handling is thin.** Only HTTP 429 triggers the small-model → Gemini fallback. A fetch exception returns `503 "Groq unreachable"` to the client; a non-429 error status (500/502/503) is returned to the client directly. Claude exists only as a whole-provider swap (`AI_CHAT_PROVIDER=claude`, currently OFF), never exercised against a live response; its streaming and tool-call translation are untested. | `[V]` code | Day 2 |
| F22 | **Android back is partial.** `useAndroidBack` is mounted only in `AppShell` (so not on `/login`, `/onboarding`, teacher/admin routes), handles only "root ⇒ minimise, else `navigate(-1)`", and ignores modals/sheets/overlays. `StudyRoomPage` registers a second, competing `backButton` listener. | `[V]` | Day 5 |
| F23 | **Startup path.** `main.tsx` `bootstrap()` awaits `document.fonts.ready` and `initStorage()` **before** the first React render; fonts are three Google-Fonts CDN families with many weights (index.html:38); splash failsafe is 8 s. Initial-load JS (entry + modulepreloads from built `index.html`, gzip-9) = **494.5 KB**, including a 72.8 KB analytics vendor chunk. **This corrects my earlier ~610 KB estimate, which double-counted a chunk.** | `[V]` | Day 17 |
| F24 | **Free Novo cap is client-side only**: `FREE_AI_DAILY_LIMIT = 10`, counted in `localStorage` (`edora_ai_daily_<uid>_<date>`). Server rate limit is 30 requests/hour for everyone. A cleared cache, reinstall or modified client bypasses the cap. | `[V]` ChatPage:128–136, gemini-chat:1655 | Day 11: server-side quota |
| F25 | `gemini-chat` per-turn AI work in code: main completion, background memory extraction every turn, and RAG helpers (`generateHypotheticalAnswer`, `generateQueryVariantsOnce`, `crossEncoderRerankOnce`, `generateStepBackQueryOnce`, `embedQuery`) called directly (not via the gateway). Which run on which turns is `[U]`. `WORLD_CURRICULUM_KNOWLEDGE` is injected into the system prompt on non-fallback routes. | `[V]` existence; conditions `[U]` | Day 10 measurement |
| F26 | `verified_question_bank` has 0 rows; `question_reports` exists (0 rows; columns `[U]`). `ai-question-gen/validate.ts` checks *structure* (4 options, explanation present), not factual correctness. | `[V]` | §7: AI questions can still be wrong — labelled accordingly |

---

## 4. Day-0 prerequisites (humans only)

| ID | Prerequisite | Needed by | Note |
|---|---|---|---|
| P-1 | Gemini key/billing restored, **or** confirmation that Claude fallback credits/key are live | Day 1 (verified Day 2) | Anthropic balance `[U]` |
| P-2 | Play Console access; confirm whether a **closed-test (≥N testers × 14 days) rule applies** to this account; if yes start a closed test **Day 1** with the existing AAB | Day 1 | `[U]`; the clock cannot be compressed |
| P-3 | ≥2 physical Android devices (one ~3 GB RAM Android 10–12) with Play internal testing | **Day 5** (baseline capture) | Performance gates need hardware |
| P-4 | RevenueCat + Play products (₹99/₹699) live; licence testers | Day 1 | Purchase/restore verification |
| P-5 | Test accounts: ≥3 fresh Google accounts, 1 completed-trial, 1 returning, 1 **dedicated production test account** for Day-1 legacy checks | Day 1 | Production test rows are purged only by logged, user-scoped SQL |
| P-6 | Signing keystore / Play App Signing available | Day 5 | `[U]` |
| P-7 | Founder decisions D-1…D-9 (§19) | Day 1 (D-1, D-2, D-3, D-7), Day 4 (rest) | |
| P-8 | Supabase Pro | not V5-gating; before any ramp beyond ~100 concurrent | Free plan = 60 DB connections `[R]` |
| P-9 | A native Hindi reader to review Hindi strings for the core screens | Day 16 | `uiStrings.ts` states existing translations are unreviewed `[V]` |

---

## 5. V5 architecture (text)

```
┌───────────────── ANDROID (Capacitor, bundled dist, EN+HI UI) ─────────────────┐
│ TabBar: Home · Novo · Practice · Progress · Profile          BackStack manager │
│                                                                               │
│ Home ─ ONE Next Action ◄── get_today_plan()  (deterministic, no AI)            │
│   ├─► /practice/session?filter=…      (Quick Practice; subject/chapter filter) │
│   ├─► /review                          (due cards, mistake history)            │
│   └─► /chat?mode=explain|solve|practice&focus=…   (learner-aware Novo)         │
│ Practice shell ─► QuestionCard (provenance badge) ─► answer                    │
│ Novo (Explain · Solve · Practice) ─► inline check via the same question sources│
│                              │  answers never bypass the queue                 │
│                    SyncQueue v2: checked {error}, retryable/permanent split,   │
│                    dead-letter store + "Sync issues", idempotency key          │
└────────────────────────────────┬──────────────────────────────────────────────┘
                                 │ record_answer(idempotency_key, …)
┌────────────────────────────────▼──── SUPABASE ───────────────────────────────┐
│ RPC record_answer / record_review                                              │
│   ├─► answer_events        append-only, question snapshot + provenance         │
│   ├─► subtopic_mastery     ONE update rule (SQL)                               │
│   ├─► topic_stats/topic_performance (legacy readers stay correct)              │
│   ├─► sr_cards             wrong ⇒ due tomorrow (automatic, server-side)        │
│   └─► error_patterns       deterministic tag "<topic> — review needed"          │
│ RPC get_today_plan() · consume_novo_quota() (server-side free cap)             │
│ practice_questions  shared store of AI-generated questions (provenance,        │
│                     validation, report_count, reuse across users = cost lever) │
│ app_flags           remote kill-switch table                                   │
│ Edge: gemini-chat ◄ learnerContext.ts (server-built) ; Groq → Groq-small →     │
│       Claude (text fallback) → graceful "Novo is busy" ; Gemini = embeddings/  │
│       vision only ; memory extraction under EdgeRuntime.waitUntil              │
│ Views: ai_success_rate_by_function_provider (feeds G7)                         │
└───────────────────────────────────────────────────────────────────────────────┘
Hidden behind flags (code kept): battles, tournaments, circles/groups/rooms, concept map,
video companion, offline model, teacher/school/parent portals, planners, and the rest of §11.
```

---

## 6. Data-flow specification

### 6.1 Learner-state spine (Day 9)
**`answer_events`** (append-only, additive): `id · user_id · idempotency_key uuid UNIQUE(user_id, idempotency_key) · session_id · mode (quick, pyq, novo) · question_id text · provenance (official_pyq, human_reviewed, ai_generated) · subject · chapter · topic · question jsonb (snapshot: stem, options, correct_index, explanation) · chosen int · is_correct · time_ms · misconception text · created_at`. RLS: own rows only. `[U: confirm the invoker can also write subtopic_mastery/sr_cards/error_patterns under existing policies; else a narrowly scoped SECURITY DEFINER with pinned search_path and auth.uid(), added to the definer review]`.

**`record_answer(...)`** in one transaction: (1) insert event `ON CONFLICT DO NOTHING` (duplicate ⇒ `{duplicate:true}`); (2) update `subtopic_mastery` with **one** rule — `m' = m + α(outcome − m)`, α=0.25 (0.35 for the first 5 attempts), seed 0.5 `[P: constants fixed and unit-tested Day 9]` — replacing the two divergent implementations; (3) keep `topic_stats`/`topic_performance` in sync; (4) if wrong: create/refresh an `sr_cards` row due tomorrow — **mistakes enter Review automatically, server-side**; (5) upsert `error_patterns` with the deterministic tag `"<topic> — review needed"` (approved cut: no LLM tagging); (6) return `{mastery_after, review_card_id}`.
**`record_review(card_id, quality)`**: SM-2 port of `src/lib/spacedRepetition.ts`, server-side single source of truth.
*(Mock Exam is **not** wired to the spine in V5 — approved cut; it keeps its own persistence — V5.1.)*

### 6.2 Today's Plan (Days 7–8) — deterministic
`get_today_plan()` → ≤3 items, priority: (1) `review_due` if any `sr_cards.next_review_date ≤ today`; (2) `fix_weak` — weakest subtopic with `attempts ≥ 3 AND mastery < 0.5`; (3) `diagnostic` — no history: 5-question check; (4) `learn_next` — next chapter in syllabus order; (5) `exam_push` — exam ≤ 14 days: PYQ set. Each item: deep link + duration. `exam_name = 'GENERAL'` learners get (1)–(4). Adaptivity is by construction: `record_answer` changes mastery/cards, so the next call differs.

### 6.3 Persistence rule
The only route for a learning answer to the database is `SyncQueue.enqueue({type:'answer', idempotency_key,…})` → `record_answer`. Legacy `quiz_answer`, `xp_history`, `study_streaks`, `pyq_questions` writes are removed (Day 3/4).

### 6.4 Offline behaviour
Answers persist locally first; flush checks `{error}`, retries only retryable failures (network, 408, 429, 5xx) with backoff, moves permanent failures (4xx, constraint, RLS) to a persistent **dead-letter store** shown in Profile → **Sync issues** (retry / export / discard-with-confirmation). After reconnect the client reconciles queued answers against `answer_events` by idempotency key and shows a count, never silence.

---

## 7. Content-trust architecture (three states, never merged)

| State | Meaning | Source of truth | UI label | May be used in |
|---|---|---|---|---|
| **Authentic PYQ** | Genuine past-year question from `pyq_content` with `is_reviewed = true AND is_active = true` | `pyq_content` | "PYQ · {exam} {year}" plus, **until human verification exists**, the honest qualifier "checked by automated audit" (F7 — the state is `ai_reviewed_ok`) | Practice (PYQ), Novo Practice, existing Mock (JEE/NEET only) |
| **Human-reviewed question** | A non-PYQ question a named human approved | `verified_question_bank` (`is_approved`) / `validation_state = human_verified` | "Reviewed by Edora" | Practice; V5 has **0** such items — the tier exists, empty, and is never faked |
| **AI-generated question** | Produced by `ai-question-gen`, not human-reviewed | `practice_questions` (new, `provenance = ai_generated`) | Visible "AI-generated · practice only" badge, on every card | Quick Practice top-up, Novo Practice — **never** Mock scoring, **never** called PYQ |

**Enforcement, not convention**
- Types: `QuestionProvenance` union; only the PYQ adapter can construct `official_pyq`, only from a row passing the filter; unit tests assert an AI question can never carry that value.
- **Server:** tighten `pyq_public_read` to `is_active AND is_reviewed` (Day 3, D-3) — fixes F8 for every client including 4.0.0. The client also filters (Day 13) so behaviour is explicit.
- **AI questions** carry `generator_model`, `prompt_version`, `validation_state`, `report_count`; structural validation (existing) **plus** deterministic checks — options distinct, `correct_index` in range, explanation non-empty, near-duplicate stem via `content_hash` (Days 12–13). The plan does **not** claim these make a question *correct*; the label says so. A report button writes `question_reports`; at N reports (D-8) the question auto-deactivates. Generated questions are cached and reused across learners (cost lever, §9).
- **Mock Exam:** unchanged engine; available for JEE Main / JEE Advanced / NEET (reviewed supply exists). For CAT / UPSC / Boards it shows a clear limitation notice instead of unreviewed content (consequence of the Day-3 policy: their questions become invisible until reviewed — see D-3, R6).
- If trusted content is missing for a chapter: label AI practice content, or say "not enough verified questions yet".

---

## 8. Novo: context, modes, and AI reliability

### 8.1 Learner context (server-assembled, Day 10)
Client sends only `{prompt, mode: explain | solve | practice, focus?: {subject, chapter?, topic?}}`, validated against an allow-list. `_shared/learnerContext.ts` builds (≤ ~700 tokens; truncate `last_session → strongest → mistakes 5→3→1 → weakest 3→2`; never truncate exam/focus/mode):
`exam{name,date,days_left | GENERAL} · level · language · personality · first_name · focus{subject,chapter,topic,origin} · mastery{weakest×3, strongest×2} · mistakes(last 5: topic, stem≤120ch, chosen, correct, days_ago) · review{due_count} · streak · last_session summary`.
Prompt = identity lock + `LEARNER STATE` + a mode block from `ai_prompt_versions` (`novo.mode.explain`, `.solve`, `.practice`; `getActivePrompt()` null ⇒ inline default, non-breaking).

### 8.2 Modes (approved: **no Plan mode**)
| Mode | Behaviour | Writes |
|---|---|---|
| Explain | Teach the focus topic bridging from the learner's weakest related subtopic; ends with a 1-question check | via check |
| Solve | Step-by-step solution to a chosen question; refuses graded/mock submissions (existing integrity rule) | none |
| Practice | Serves questions from the same adapters (reviewed PYQ first, labelled AI second) through `InlineQuizEmbed`; evaluation is **deterministic** (index compare) | `record_answer` per answer |

**Adaptive loop (deterministic):** Teach → Test → Evaluate (deterministic) → Tag (`"<topic> — review needed"`) → Update state (`record_answer`) → Next plan changes (`get_today_plan`).
Deep links from Home / Review / Practice: `/chat?mode=…&focus=…`.

### 8.3 Provider chain and failure handling (Day 2) — no new provider
`Groq primary → Groq small → Claude (text fallback) → graceful message`. Retry policy: 400/401/403/404 **never retried**; 408/429/5xx/network retried with backoff honouring `Retry-After`. **All of** 429, 500, 502, 503, timeout and fetch exception route to the next tier (today only 429 does — F21). Claude is approved **only** as a tested secondary text fallback and as the existing operational switch; **Gemini remains for embeddings/vision only** (separate health, separate reporting).
**Required automated tests (fake-provider harness):** Groq success · 429 · 500 · 503 · network timeout · fetch exception · Claude fallback · streaming (Groq and Claude→OpenAI-shaped SSE) · tool calls (Claude `tool_use` translation) · all-provider-failure UX. **Plus one real live smoke per provider** (Groq, Claude, Gemini) recorded with ids from `ai_gateway_requests`. Anthropic balance and Claude live behaviour are `[U]` until that smoke passes.
**All-provider failure UX:** "Novo is busy — your practice and review still work", with a retry action; never a stack trace, never a frozen spinner.

### 8.4 Memory (Day 2 fix, Day 10 proof)
Wrap `extractAndSaveMemories` in `EdgeRuntime.waitUntil(...)` (both call sites) so completion is guaranteed. **Acceptance is a written `novo_memories` row observed after a real chat**, not the presence of `waitUntil`. If rows still don't appear, the next hypotheses (RLS/insert shape, model output parsing, `normalizeMemories` filtering) are tested in that order on the same day. Extraction runs on a bounded cadence (measured Day 10) to control cost.

---

## 9. Cost per Active Learner

**Goal:** scale to many learners without an AI-cost explosion. **No dollar figures are asserted here — they are measured** during Days 10–19 and reported in the release report.

**Where V5 deliberately uses no AI (P5):** Today's Plan · mastery updates · Review scheduling · progress calculations · routing · sync · persistence · misconception tag · answer evaluation · free-cap enforcement · flag evaluation.
**Where AI is justified:** Novo explain · Novo solve · Novo practice assistance · question generation only when trusted content is insufficient (then cached and reused).

**Cost levers built into V5**
1. AI question **cache/reuse** (`practice_questions`, keyed by `content_hash`, subject/chapter/difficulty) — one generation serves many learners.
2. **Server-side Novo quota** (`consume_novo_quota()`); Pro raises/removes it. Currently client-side only (F24).
3. **Call budget per Novo turn** — instrument, then cap: main call plus background memory extraction on a measured cadence; RAG helper calls (HyDE, variants, rerank, step-back) only where measured to help (F25 `[U]` conditions).
4. **System-prompt size** — measure `WORLD_CURRICULUM_KNOWLEDGE` tokens per turn; inject only when the focus needs it.
5. Small model for small tasks; large model only for Solve/Explain; no repeated AI retries (Day 2 policy).
6. Home = one RPC + cached profile via TanStack Query; no `select('*')` on core-loop reads.

**Monitoring to support this (recommendations only; no billing analytics built now):** AI requests/user/day · tokens/user/day · question-generation cost and cache hit rate · provider fallback rate (Groq→Claude) · Novo turns/user/day vs quota · model calls per Novo turn · Supabase requests/user/day · bytes/session. Data sources: `ai_gateway_requests` (already logs tokens and estimated cost), `analytics_events`, Supabase logs.

---

## 10. Low-end-device and low-data standard (measurement protocol)

**Targets:** ~3 GB RAM Android 10–12, budget chipset, limited storage; slow 3G / unstable 4G; Wi-Fi↔mobile switching; intermittent offline.
**Rule:** *no timing is a release fact until measured on real hardware.* This plan sets **what to measure and how**, not invented thresholds.

| Requirement | Measure | How (recorded in `V5_PERF_LOG.md`) |
|---|---|---|
| Cold startup | tap → first meaningful screen | `adb shell am start -W` (TotalTime) + screen recording; median of ≥5 cold starts |
| Startup JS | initial gzip bytes | build script over `dist/index.html` modulepreload set; **baseline 494.5 KB `[V]`**; gate ≤ 450 KB **or** ≥ 20 % below baseline |
| Home render | launch → Next-Action card interactive | screen recording frame count |
| Novo opening | tap tab → input focusable | recording |
| Practice opening | tap → first question rendered | recording |
| Scroll / jank | janky-frame % | `adb shell dumpsys gfxinfo` on Home, Practice, Review |
| Keyboard | tap input → keyboard + caret; layout jump | recording |
| Memory | PSS after 10 min mixed use; OOM/ANR symptoms | `dumpsys meminfo`; logcat ANR/lowmemory scan |
| Resume / background↔foreground | state preserved after 30 min background | manual script |
| App-kill recovery | mid-answer, mid-onboarding, mid-mock | manual script + DB reconciliation |
| Low bandwidth | journey on throttled 3G; requests and bytes per screen | throttled profile; `dumpsys netstats`/proxy capture |
| Network switching | Wi-Fi→mobile→offline→Wi-Fi during a practice set | manual script; no answer lost |

**Devices:** 1 low-end (~3 GB RAM) + 1 normal. **Baseline** of the current build captured on Day 5 on the same devices, so every later number is a comparison, not a claim. **User-perceived device performance is the primary gate**; the bundle target is secondary and may be met by the "≥20 % below baseline" alternative.
**Low-data engineering rules:** self-hosted subset fonts (no CDN dependency; Devanagari for Hindi), analytics deferred until after first paint, heavy libraries (KaTeX, syntax highlighting, ExcelJS, PDF, HuggingFace worker) off the startup path, single request per screen where possible, reuse cache via TanStack Query.

---

## 11. Feature visibility matrix (all 99 routes + 5 V5 additions)

`CORE V5` on the loop · `SECONDARY` works, reachable via one "More" link from Progress/Profile, not restyled · `FLAG OFF` hidden behind a remote flag, **code kept**, re-enable only with a data + reliability check · `ADMIN/B2B` role-gated · `REMOVE FROM DISCOVERY` route stays alive for deep links but is listed nowhere. Evidence refers to `[R]`/Appendix A of the state report unless tagged.

**Counts (104 routes = 99 existing + 5 new):** CORE V5 22, SECONDARY 8, FLAG OFF 62, ADMIN/B2B 9, REMOVE FROM DISCOVERY 3.

| Route | V5 disposition | Where it lives | Reason / evidence |
|---|---|---|---|
| `/account` | CORE V5 | Profile | Consent/legal must work |
| `/chat` | CORE V5 | Tab: Novo | Core product; Explain·Solve·Practice |
| `/data-rights` | CORE V5 | Profile | Consent/legal must work |
| `/flashcard` | CORE V5 | Redirect → /review | Same concept; replaced by server-side SM-2 + `answer_events` |
| `/home` | CORE V5 | Tab: Home | 20+ modules → one Next Action |
| `/journal` | CORE V5 | Redirect → /review | Same concept; replaced by server-side SM-2 + `answer_events` |
| `/login` | CORE V5 | Login | Simplify (3 stacked choices today `[R]`) |
| `/mock-test` | CORE V5 | Practice → Mock (existing engine) | Engine untouched (approved cut); JEE/NEET only, limitation notice otherwise; Day-13 P0 checks only |
| `/onboarding` | CORE V5 | Onboarding (3 steps) | 7 steps, exam skippable `[V]` |
| `/practice` | CORE V5 | Tab: Practice | Unified Practice shell; chapter is a filter (approved cut) |
| `/practice/session` | CORE V5 | Tab: Practice | Unified Practice shell; chapter is a filter (approved cut) |
| `/privacy-policy` | CORE V5 | Profile | Consent/legal must work |
| `/pro` | CORE V5 | Pro screen | Route fixed Day 1 (F1); restore syncs backend (F19) |
| `/profile` | CORE V5 | Tab: Profile | Exam target, language, Sync issues, legal |
| `/progress` | CORE V5 | Tab: Progress | Thin by design (approved cut) |
| `/pyq-bank` | CORE V5 | Practice → PYQ mode | Kept as PYQ source; reviewed-only filter + provenance badge (F8) |
| `/quiz` | CORE V5 | Redirect → /practice/session | Legacy engine retired behind adapter; Day-1 patch until then (F17/F18) |
| `/reminders` | CORE V5 | Profile | Consent/legal must work |
| `/review` | CORE V5 | Practice → Review; Home card | Mistakes enter Review automatically |
| `/setup-exam` | CORE V5 | Gate + onboarding step | Mandatory exam target (F4); `GENERAL` allowed, never NULL |
| `/spaced-review` | CORE V5 | Redirect → /review | Same concept; replaced by server-side SM-2 + `answer_events` |
| `/terms-of-service` | CORE V5 | Profile | Consent/legal must work |
| `/achievements` | SECONDARY | Profile | Working, low-cost, not on the loop (referral = affordability growth lever; diagnostics = support) |
| `/analytics` | SECONDARY | Progress → Advanced (Pro) | Pro-gated advanced analytics |
| `/diagnostics` | SECONDARY | Profile | Working, low-cost, not on the loop (referral = affordability growth lever; diagnostics = support) |
| `/error-patterns` | SECONDARY | Progress → More | Fed by loop data (mastery, tags) |
| `/exam-war-room` | SECONDARY | Home banner if exam < 48 h | Existing logic; only relevant near exam |
| `/novo-messages` | SECONDARY | Home bell | Proactive message inbox (11 rows) |
| `/referral` | SECONDARY | Profile | Working, low-cost, not on the loop (referral = affordability growth lever; diagnostics = support) |
| `/weakness-radar` | SECONDARY | Progress → More | Fed by loop data (mastery, tags) |
| `/ai-quiz` | FLAG OFF | — | Reference nonexistent tables `[R]` — must not be reachable (G3) |
| `/attention-heatmap` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/battle` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/boss-fight` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/cat-syllabus` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/certifications` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/challenges` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/circles` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/concept-map` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/concept-videos` | FLAG OFF | — | Reference nonexistent tables `[R]` — must not be reachable (G3) |
| `/confidence` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/course` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/curriculum` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/curriculum/:boardCode/:subject` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/daily-session` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/debate` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/doubt-room` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/exam-prediction` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/exam-simulator` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/feed` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/formula-ar` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/formulas` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/friends` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/languages` | FLAG OFF | — | Serve unreviewed content (`pyq_content` unfiltered, F8) |
| `/leaderboard` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/learning-style` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/lesson-plan` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/live-event` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/live-study-rooms` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/mnemonics` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/mock-postmortem` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/ncert-chapters` | FLAG OFF | — | Reference nonexistent tables `[R]` — must not be reachable (G3) |
| `/ncert-deep` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/notes` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/novo-insights` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/novo-live` | FLAG OFF | — | Gemini-vision / heavy media; failing key `[R]` and low-data doctrine; re-enable after measured health |
| `/novo-reads` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/offline-mode` | FLAG OFF | — | Reference nonexistent tables `[R]` — must not be reachable (G3) |
| `/peer-explain` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/photo-solver` | FLAG OFF | — | Gemini-vision / heavy media; failing key `[R]` and low-data doctrine; re-enable after measured health |
| `/planner` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/rank-predictor` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/reels` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/roadmap` | FLAG OFF | — | Overlap Today's Plan; AI-generated plans with 0–1 rows `[R]`; Gemini-dependent |
| `/scanner` | FLAG OFF | — | Gemini-vision / heavy media; failing key `[R]` and low-data doctrine; re-enable after measured health |
| `/sleep-review` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/solved` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/sprint` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/story-mode` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/streaks` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/study-buddy` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/study-dna` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/study-group/:groupId` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/study-groups` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/study-pack` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/study-rooms` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/subject-map` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/tournament` | FLAG OFF | — | Social / multiplayer / gamified; no users to populate (0 battles, 0 friendships `[R]`); → V5.1. `/doubt-room` and `/peer-explain` also reference missing tables |
| `/tutoring` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/upsc-mains` | FLAG OFF | — | Serve unreviewed content (`pyq_content` unfiltered, F8) |
| `/video-companion` | FLAG OFF | — | Gemini-vision / heavy media; failing key `[R]` and low-data doctrine; re-enable after measured health |
| `/whiteboard` | FLAG OFF | — | Empty backing tables and/or unfinished/overlapping `[R]`; re-enable per feature only with a data + reliability check |
| `/admin` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/auth/classroom/callback` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/eval` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/parent` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/parent-portal` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/school-admin` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/school/:schoolName` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/teacher` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/teacher-export` | ADMIN/B2B | Role-gated / deep link | 0 classrooms, 1 institution `[R]`; B2B deferred to V5.1 |
| `/browser` | REMOVE FROM DISCOVERY | — | The 40-item catalogue and Learn hub are the sprawl `[R]` |
| `/learning` | REMOVE FROM DISCOVERY | — | The 40-item catalogue and Learn hub are the sprawl `[R]` |
| `/tools` | REMOVE FROM DISCOVERY | — | The 40-item catalogue and Learn hub are the sprawl `[R]` |

**Free vs Pro (P1; Decision D-1):** *Free* — exam setup, Today's Plan, Novo with a server-enforced daily cap, Quick Practice with subject/chapter filter, Review, basic Progress, PYQ with a daily limit. *Pro* — higher/unlimited Novo, full verified-PYQ access, full-length Mock Exams and premium test features, advanced analytics. The trial stays 30 days; after it the learner drops to Free, **never** to a locked app.

---

## 12. Core-screen specification (10 screens)

Direction: calm, professional, corporate, low cognitive load; solid surfaces, one accent, **no decorative gradients**; body ≥ 15–16 px, no text < 12 px; touch targets ≥ 48 dp; contrast ≥ 4.5:1; light + dark; every screen has loading, empty and error states; English + Hindi fully translated for these screens (P-9 review).

| Screen | Question it answers | Primary element | Empty / error | Key states |
|---|---|---|---|---|
| Login | How do I get in? | Continue with Google; email below; OTP as a link | inline errors, offline banner | wrong password, no network, Google cancel |
| Onboarding | What are you preparing for? | exam chips + date → level + subjects → language (**"App: English / हिन्दी. Novo can explain in 9 languages."**) | resumable | kill mid-step, back |
| Home | What should I do next? | one Next-Action card from `get_today_plan()[0]`; ≤2 more rows; exam chip; bell | plan RPC fails → static "Ask Novo / Practice" | new user, returning, exam < 14 d, `GENERAL` |
| Novo | Help me understand this | input + mode chips (Explain, Solve, Practice) + focus strip | all-provider fail → deterministic message | each mode, offline, long answer, LaTeX |
| Practice | What kind of practice? | Quick / PYQ / Mock cards; subject + chapter filter | Pro states → purchase screen | filter empty ⇒ "not enough verified questions yet" |
| Question | Which option is right? | question + options + provenance badge + report | AI label always visible | correct/wrong, offline answer, resume |
| Review | What's due / what did I get wrong? | due queue; Mistakes tab | "nothing due" + next due | mistake appears next day |
| Progress *(thin, approved cut)* | Am I improving? | exam countdown, subject mastery, weak topics, streak, questions completed, review due | "answer 5 questions to see progress" | zero data, some data |
| Pro | What do I get and how do I pay? | plan cards → Play purchase; Restore | not-found, cancelled, pending | purchase, **restore syncs backend**, expired |
| Profile | My account | exam target (editable), language, reminders, **Sync issues**, legal, sign-out | — | sign-out → login |

---

## 13. The 20-day plan

**Conventions.** Each day: Objective · Systems · Files · Acceptance · Automated tests · Manual verification · Production verification · Rollback · Depends on · GO/NO-GO. "(new)" = to create. `[V]` paths exist at baseline. **Every day ends with** `npm run type-check`, `npm run lint`, `npx vitest run`, `deno test supabase/functions/**/*.test.ts` green (or an explained pre-existing exception), a commit and push to `release/5.0.0-landmark`, and an evidence entry in `docs/product/V5_EVIDENCE_LOG.md` (new). **Production mutations happen only on the days that name them, each additive and with a stated rollback.** **Day 17 24:00 = code freeze.**

### PHASE 1 — PRODUCTION RECOVERY (Days 1–4)

#### Day 1 — Persistence repair first, then purchase
| | |
|---|---|
| **Objective** | Repair the verified production persistence defect (F17) **first**, prove downstream behaviour honestly (F18), then make every Pro gate reach a purchase screen and make restore actually restore (F19). |
| **Systems** | `quiz_sessions`; QuizPage/SyncQueue quiz flow; routing; ProGate; RevenueCat/Play; billing isolation; baseline CI |
| **Files** | `docs/product/V5_EVIDENCE_LOG.md` and `V5_DAY1_EVIDENCE.md` (new); `supabase/migrations/2026093000000*_v5_hotfix_quiz_sessions_score_pct.sql` (new; tracked); **contingent** `…_v5_quiz_sessions_dedupe_index.sql` (new); `src/pages/QuizPage.tsx` (stop double-writing: when the live insert succeeds, remove the write-ahead entries instead of flushing them; stop the duplicate live `increment_xp`); `src/lib/iap.ts` (`restorePurchases()` → after RevenueCat restore, invoke `novo-subscription` action `restore_purchases`; success only if `pro_active === true`); `src/pages/ProSubscriptionPage.tsx` (handleRestore truthfulness; error states); `src/App.tsx` (`/pro` → `ProSubscriptionPage`, drop the `_` alias); `src/components/ui/ProGate.tsx`; `e2e/authenticated/pro-gate.spec.ts` (new); unit test asserting native never reaches `loadRazorpayScript` / `create_order` |
| **Acceptance** | **Ordered process, each step recorded with evidence:** (1) reconfirm production `quiz_sessions` columns (no `score_pct`); (2) write down the **predicted** outcome from F18 (2 rows, double XP) *before* changing anything; (3) create the additive tracked migration `ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS score_pct numeric`; (4) apply it via the CLI; confirm PostgREST accepts `score_pct` (schema reload verified by a real insert, not assumed); (5) complete a legacy quiz on the dedicated production test account using a build of `origin/main` (4.0.0, `[V]` same QuizPage) **and** the branch build; (6) count `quiz_sessions` rows for that test user and the XP delta — **expected exactly one row**; if it is two, apply the contingent unique index `(user_id, completed_at) WHERE completed_at IS NOT NULL` (both writes share `completedAt`) and re-test; record the XP delta and whether the achievement check ran; (7) confirm 4.0.0 behaviour did not regress beyond the documented XP effect (below); (8) record the evidence and purge only that test user's rows with logged, user-scoped SQL. **Not called zero-risk:** the repair activates never-exercised production code (live `increment_xp`, `loadUnlockedIds`, `checkAchievements`, queue flush). **Known effect on field 4.0.0 clients:** until they update, a completed quiz may award XP twice (the server cannot dedupe `increment_xp`); this is measured in step 6, disclosed in the evidence log, and accepted or rejected by the founder (D-7). **Purchase:** every `navigate('/pro')` site reaches the purchase UI (no redirect to Profile); Restore calls the backend, `profiles.is_pro` and `pro_expires_at` are read back and match RevenueCat; UI says "restored" only when they do; Razorpay never appears on Android/iOS. **Baseline:** tsc/lint/Vitest/Deno/build recorded; a **legacy 4.0 smoke** (login → home → quiz → chat) recorded on `origin/main`. |
| **Automated tests** | Vitest: QuizPage live-success path removes queue entries (no second insert, no second XP); `restorePurchases` calls the backend and returns false when `pro_active` is false; native branch never calls Razorpay; route-table test `/pro` ⇒ subscription page. Playwright: every ProGate site → purchase UI. |
| **Manual** | Device with licence tester: purchase, then *uninstall/reinstall* and Restore; confirm `is_pro` in the app and in the database. Legacy quiz on the 4.0.0 web build and on the branch build. |
| **Production verification** | Queries recorded: `information_schema.columns` before/after; row count and `min(created_at)` from `quiz_sessions` for the test user; XP before/after on `profiles`; function logs for `novo-subscription` `restore_purchases`; `subscriptions`/`profiles.is_pro` after restore. |
| **Rollback** | Column: leave in place (additive, nullable). Index: `DROP INDEX`. Client: revert commits. Nothing destructive is applied. |
| **Depends on** | P-4, P-5, D-7; P-2 starts today |
| **GO/NO-GO** | **GO** iff a completed quiz leaves exactly one persisted row with the recorded XP behaviour understood, and Restore demonstrably syncs entitlement (or is marked `NOT VERIFIED` if P-4 is not ready — then G2 stays open and is re-attempted Day 5). **NO-GO for Day 2** if the quiz repair caused any new error in the legacy smoke. |

#### Day 2 — AI reliability, memory persistence, source recovery
| | |
|---|---|
| **Objective** | Failures stop being silent or self-amplifying; Novo survives a Groq outage; memory extraction is guaranteed to finish; missing function sources are in git; AI health is measured per provider. |
| **Systems** | `gemini-chat` provider chain; `_shared/aiGateway.ts`; retry policy; monitoring; function recovery |
| **Files** | `supabase/functions/_shared/retryPolicy.ts` and test (new; §8.3 status matrix, `Retry-After`); apply to the 8 gateway-migrated functions; `supabase/functions/gemini-chat/index.ts` (provider **chain**: Groq → Groq-small → Claude text fallback; 429/500/502/503/timeout/fetch-exception all route to the next tier; all-fail message; **both** `extractAndSaveMemories` calls wrapped in `EdgeRuntime.waitUntil`); `supabase/functions/gemini-chat/providerChain.test.ts` (new, fake-provider harness); log-only helper in `_shared/aiGateway.ts` for embedding/RAG-helper calls (no gating; env-gated `AI_LOG_HELPERS`); SQL view `ai_success_rate_by_function_provider` (new migration, additive); `monitoring-check` (alert on 0 successes/24 h or < 98 % per required function); export sources of the 6 functions (`supabase functions download <fn> --use-api`; fallback MCP `get_edge_function`) |
| **Acceptance** | Permanent 4xx attempted once and logged distinctly; every case in §8.3 passes in the harness; **one live smoke per provider** (Groq, Claude, Gemini) with `ai_gateway_requests` ids recorded; a real chat on the deployed function produces a **written `novo_memories` row** (if not, hypotheses tested the same day per §8.4); view returns per-function and per-provider 24 h success; six sources committed and byte-verified against deployed content. |
| **Automated tests** | Deno: retry matrix; provider-chain scenarios (Groq success/429/500/503/timeout/fetch-exception, Claude fallback, streaming, tool-calls, all-fail); waitUntil wrapper invoked on both paths. |
| **Manual** | Force Groq failure via a bad key in a scratch environment; observe Claude serve and the graceful message when both fail. |
| **Production verification** | Deploy `gemini-chat` (previous version recorded; v81 at time of writing `[V]`); SQL on the view; row in `novo_memories` for the test user; per-function diff of the six recovered sources. Production `AI_CHAT_PROVIDER` remains **unset** — the chain uses Claude only as fallback. |
| **Rollback** | Redeploy the recorded previous versions; the view is additive; the chain is bypassable via env. |
| **Depends on** | P-1, D-2 |
| **GO/NO-GO** | GO iff the harness is green, the live smokes pass (or a failing provider is explicitly recorded), and a memory row is observed. If Gemini is unresolved: continue (embeddings/vision are not on the loop's critical path) but G7 reports Gemini separately and the failure stays visible. **If the Claude fallback cannot be made to work, Novo has no second tier → escalate.** |

#### Day 3 — Schema truth and content trust
| | |
|---|---|
| **Objective** | Zero UI references to nonexistent tables **or columns**; dead offline targets removed; unreviewed PYQs unreachable. |
| **Systems** | Migrations; schema manifest; CI guard; hidden-feature data calls; `pyq_content` RLS |
| **Files** | `…_v5_schema_truth.sql` (new): create `ai_interactions` (shape F10) with own-rows RLS; **`pyq_content` policy `pyq_public_read` → `is_active = true AND is_reviewed = true`** (subject to D-3; the previous policy text is recorded in the migration header for rollback); `supabase/schema-manifest.json` (new; from production `information_schema` **including columns**); `scripts/check-schema-refs.mjs` (new; unknown tables fail; literal keys of `.insert/.upsert` checked against columns — the F17 class; dynamic payloads listed as "unchecked", never silently passed); `.github/workflows/ci.yml` (step); remove/guard broken calls in `ConceptVideosPage`, `DoubtRoomPage`, `AIQuizBankPage`, `NCERTChaptersPage`, `OfflineModePage`, `lib/offlineStudy.ts` (`pyq_questions`, `quiz_questions`); remove `xp_history`, `quiz_user_answers`, `study_streaks` targets from `lib/syncQueue.ts` |
| **Acceptance** | The script exits 0 **and is shown to fail on the original `score_pct` insert** (run against `eaf42ab`); no frontend reference to a missing table; AI thumbs persist; after the policy change an **anon and an authenticated request for CAT/BOARDS/UPSC rows return none**, JEE/NEET rows still return; the 4.0.0 web smoke still loads PYQ Bank for JEE/NEET. |
| **Automated tests** | Vitest: script fixtures (missing table, missing column, unchecked dynamic payload). pgTAP `supabase/tests/database/pyq_trust.test.sql` (new): public role cannot read unreviewed; `ai_interactions` RLS. |
| **Manual** | Open Concept Videos / Doubt Room / Offline Mode / NCERT deep links → no crash (flags land Day 5; until then a static "unavailable" state). |
| **Production verification** | Apply migrations; count `pyq_content` as `anon` with JWT-claim simulation (rolled back) = 323 visible, 232 hidden; fresh manifest regenerated from production and the script re-run against it. |
| **Rollback** | Re-create the recorded old policy; leave `ai_interactions`; revert client commits. |
| **Depends on** | Day 1 baseline; D-3 |
| **GO/NO-GO** | GO iff the guard passes on a **fresh** production manifest and the trust test proves unreviewed rows are unreachable. NO-GO if any primary-flow file still references a missing table/column. |

#### Day 4 — SyncQueue, exam target, write-path audit (Recovery Gate)
| | |
|---|---|
| **Objective** | No write can vanish; every learner has a real exam target; every write path in the core loop is audited. |
| **Systems** | `SyncQueue`; auth guard; profile |
| **Files** | `src/lib/syncQueue.ts` and test (inspect every `{data,error}`; classify retryable vs permanent; **persistent dead-letter store**; idempotent replay by key; reconcile-after-reconnect count); `src/pages/settings/SyncIssuesPage.tsx` (new, functional list: retry / export / discard-with-confirmation); `src/pages/SetupExamPage.tsx` (new; exam chips + date; **"Not sure yet" stores `GENERAL`, never NULL**); `src/App.tsx` (`AuthGuard` ⇒ `/setup-exam` after consent for null `exam_name`); `src/pages/settings/AccountSettingsPage.tsx` (editable); `docs/product/V5_WRITE_PATH_AUDIT.md` (new: table of every `SyncQueue` action and every core-loop `.insert/.upsert` — target table, columns verified against the manifest, error handling, idempotency) |
| **Acceptance** | An entry whose insert returns `{error}` is **not** removed; permanent failures land in dead-letter and are visible in Sync issues; replaying the same key twice writes once; a user with null `exam_name` cannot reach Home until choosing (including `GENERAL`); existing 42 users are gated on next launch with friendly copy; no `exam_name` is NULL for any account created or gated during V5 testing. |
| **Automated tests** | Vitest: error-returned-not-thrown; 5-failure ⇒ dead-letter; replay; permanent vs retryable. Playwright: fresh-account and existing-null-account flows. |
| **Manual** | Airplane-mode answer → reconnect → reconcile; force a bad payload → dead-letter visible. |
| **Production verification** | `exam_name` for test accounts non-null; no mass update of real users. |
| **Rollback** | Revert client commits; dead-letter is local storage. |
| **Depends on** | Days 1–3 |
| **GO/NO-GO — RECOVERY GATE** | GO to Phase 2 only if F1–F4, F6, F8, F13, F14, F17–F19, F21 each have test/query evidence in the log. **If F17 or F19 is still open: do not proceed — these are user-visible defects in shipped software.** |

### PHASE 2 — PRODUCT SIMPLIFICATION (Days 5–8)

#### Day 5 — Remote flags, five-tab navigation, Android back, baselines
| | |
|---|---|
| **Objective** | Five tabs; every non-loop feature hidden by a remote flag; centralised Android back; measured device baseline. |
| **Systems** | Flags; nav; discovery; back handling; performance baseline |
| **Files** | `…_v5_app_flags.sql` (new; `app_flags(key, value jsonb, updated_at)`, authenticated read-only); `src/lib/featureFlags.ts` (defaults = §11, remote override, cached safe fallback); `src/components/guards/FeatureGate.tsx` (new); `src/App.tsx` (wrap flagged routes; add `/practice`, `/review`, `/progress` shells); `src/components/layout/TabBar.tsx` and `TabBar.test.tsx`; `src/hooks/useBackStack.ts` (new **centralised back manager**: priority stack — overlay/image viewer → modal → sheet → in-page step (onboarding/auth step) → tab history → root ⇒ minimise); mounted at app root (covers `/login`, `/onboarding`, teacher/admin); modals/sheets/`PermissionRationale`/`DPDPConsentModal` register handlers; remove the competing listener in `StudyRoomPage`; `ToolsPage`/`LearningPage` unlinked; `featureRegistry.ts`, `CommandPalette.tsx`, `QuickStartFAB.tsx` filtered by flags; `docs/product/V5_PERF_LOG.md` (new; **baseline** on both devices per §10) |
| **Acceptance** | Tab bar = the 5 V5 tabs; every FLAG-OFF route redirects to `/home` without error; toggling a flag row changes visibility after relaunch with no rebuild; **back button** correctly closes (in order) image overlay, modal, sheet, onboarding step, auth step, Novo sub-state, Practice session (with confirm), and only then navigates/minimises — no double-firing, no app exit from a modal; baseline metrics recorded. |
| **Automated tests** | Vitest: flag defaults == §11; back-stack priority and unregister; TabBar. Playwright route-smoke updated. |
| **Manual** | Device: back from every layer on every core screen; 10 hidden deep links. |
| **Production verification** | `select * from app_flags`; flip a flag on a tester device. |
| **Rollback** | Set nav flags off / revert TabBar; back manager behind flag `back.v5`. |
| **Depends on** | Day 3 (broken refs gone), D-4, P-3 |
| **GO/NO-GO** | GO iff flag toggle changes visibility live and the back-button script passes on a device. |

#### Day 6 — Onboarding, login, language scope, consent
| | |
|---|---|
| **Objective** | First value in three steps; honest language promise. |
| **Systems** | `OnboardingPage`, `LoginPage`, consent, i18n |
| **Files** | `OnboardingPage.tsx` (7 → 3 steps: exam + date [reuse `SetupExamPage`] → level + subjects → language; **language step states: app UI = English / हिन्दी; Novo can explain in 9 languages**); `LoginPage.tsx` (Google primary, email secondary, OTP as link; fix nested-border input); `DPDPConsentModal.tsx` (single integrated consent); `src/lib/i18n/uiStrings.ts` (`en` + `hi` keys for Login/Onboarding/Home/consent); e2e `onboarding.spec.ts` (new) |
| **Acceptance** | Fresh signup → consent → 3 steps → Home with a plan item; resumable after force-close; UI language offers **only English and Hindi**; no screen claims translated UI in other languages. |
| **Automated tests** | Playwright full path + kill/resume; Vitest step validators and string-key parity (`en` ⊇ `hi` keys for core screens). |
| **Manual** | 3 fresh accounts on the low-end device, time recorded in the perf log (no target invented). |
| **Production verification** | `analytics_events`: `signup_completed`, `dpdp_consent_given`, new `onboarding_completed`. |
| **Rollback** | Flag `onboarding.v5`; old page retained. |
| **Depends on** | Days 4–5, D-6 |
| **GO/NO-GO** | GO if a fresh account reaches Home unassisted with an exam target. |

#### Day 7 — Today's Plan engine
| | |
|---|---|
| **Objective** | Deterministic `get_today_plan()`; Home hook. |
| **Systems** | SQL RPC; TanStack Query |
| **Files** | `…_v5_get_today_plan.sql` (new, §6.2); `src/hooks/useTodayPlan.ts` (new); `supabase/tests/database/get_today_plan.test.sql` (new; pgTAP) |
| **Acceptance** | Correct ordering for five personas (no history, weak topic, due reviews, exam < 14 d, `GENERAL`); RPC failure ⇒ safe static fallback; **0 AI calls**. |
| **Automated tests** | pgTAP personas; Vitest hook with mocked RPC. |
| **Manual** | Device: new user sees the 5-question check; seeded user sees review first. |
| **Production verification** | Run as a test user via rolled-back JWT-claim simulation (technique used in earlier audits). |
| **Rollback** | RPC additive; Home falls back to static. |
| **Depends on** | Days 5–6 (does **not** need the spine: empty-data path works) |
| **GO/NO-GO** | GO if all five persona outputs match §6.2. |

#### Day 8 — Home rebuilt around one Next Action
| | |
|---|---|
| **Objective** | Home answers "What should I do next?" and nothing else competes. |
| **Systems** | Home |
| **Files** | `src/pages/home/HomeV5.tsx` (new, flag `home.v5`); unmount from Home: A/B variant cards, streak-freeze shop, focus/break overlays, social card, mission card, insights, concept-of-day, XP-ring clutter (components stay in repo); Home data = one RPC + cached profile; `uiStrings.ts` (`home.*` en+hi); e2e `home.spec.ts` (new) |
| **Acceptance** | ≤ 5 visible blocks, ≤ 3 plan items, one primary action; no widget unrelated to the loop; **link-crawl finds no navigation to a FLAG-OFF route (G8)**; network requests on Home cold load counted and recorded (target: fewer than baseline, measured). |
| **Automated tests** | Playwright link-crawl; Vitest block-count snapshot. |
| **Manual** | Device: all five tabs; TalkBack pass on Home. |
| **Production verification** | `app_flags` populated with §11 defaults. |
| **Rollback** | Flag `home.v5`. |
| **Depends on** | Days 5–7 |
| **GO/NO-GO — SIMPLIFICATION GATE** | GO to the spine only if Home is finished, link-crawl clean, onboarding ≤ 3 steps, no known P0 in these screens. Otherwise apply §16 cuts — never eat into Days 9–11 by more than a day. |

### PHASE 3 — LEARNER SPINE + NOVO (Days 9–11)

#### Day 9 — The learner spine
| | |
|---|---|
| **Objective** | One RPC records every answer, updates mastery and files mistakes into Review. |
| **Systems** | Postgres; SyncQueue; RLS |
| **Files** | `…_v5_answer_events_and_record_answer.sql` (new, §6.1: `answer_events`, `record_answer`, `record_review`); `src/lib/learnerState.ts` (new); `syncQueue.ts` (`type: 'answer'` → RPC, checked); `adaptiveDifficulty.ts` (deprecate write path, keep reads); decide the `tutoring-engine` mastery write (route through the RPC or document); pgTAP `supabase/tests/database/record_answer.test.sql` (new) |
| **Acceptance** | Same key twice ⇒ one event; a wrong answer ⇒ exactly one `sr_cards` row due tomorrow; mastery follows the rule; cross-user writes denied; legacy readers (`topic_stats`, `topic_performance`) update; deterministic tag stored. |
| **Automated tests** | pgTAP: idempotency, wrong⇒card, right⇒none, mastery math, RLS, replay. Vitest: queue→RPC with error injection. |
| **Manual** | Rolled-back SQL proof as a test user. |
| **Production verification** | Apply migration; rolled-back transaction proving all target tables change as specified; live 4.0.0 unaffected (additive). |
| **Rollback** | Client stops calling the RPC (flag `practice.record`); table/RPC additive and inert. |
| **Depends on** | Days 3–4 |
| **GO/NO-GO** | GO iff pgTAP green and the production rolled-back proof passes. **NO-GO here halts Days 10–15** — this is the critical-path artefact. |

#### Day 10 — LearnerContext, server-side, plus cost instrumentation
| | |
|---|---|
| **Objective** | Novo receives a validated, budgeted, server-built learner context; per-turn AI cost is measured. |
| **Systems** | `gemini-chat`; context builder; memory; cost instrumentation |
| **Files** | `_shared/learnerContext.ts` and `learnerContext.test.ts` (new, §8.1); `gemini-chat/index.ts` (accept validated `mode`/`focus`; inject `LEARNER STATE`; **count model calls and tokens per turn**; measure `WORLD_CURRICULUM_KNOWLEDGE` size); `src/lib/useGeminiStream.ts` (send only `mode`/`focus`) |
| **Acceptance** | Context ≤ ~700 tokens in all fixtures; malicious `focus` rejected/sanitised; with seeded mastery and mistakes they appear in the captured prompt; memory rows from real chats appear and are used in context; calls-per-turn and tokens-per-turn recorded in the evidence log (baseline before any trim). |
| **Automated tests** | Deno: context, truncation order, injection attempts; integration test with a fake provider capturing the prompt. |
| **Manual** | Chat with `mode=explain&focus=…` on a test account; inspect the dev-only prompt log (not persisted). |
| **Production verification** | Deploy; chat succeeds (`ai_gateway_requests`); context length metric sane; old clients (no `mode`) still work. |
| **Rollback** | Redeploy previous `gemini-chat` version; `mode`/`focus` optional. |
| **Depends on** | Day 9, Day 2 |
| **GO/NO-GO** | GO if learner data demonstrably reaches the model and old clients still work. |

#### Day 11 — Novo modes, deep links, server-side quota
| | |
|---|---|
| **Objective** | Explain · Solve · Practice work end-to-end, entered from Home/Review/Practice; free cap enforced on the server. |
| **Systems** | Chat UI; prompt registry; inline quiz; quota |
| **Files** | `ChatPage.tsx` (mode chips; read `?mode=&focus=`; extract only what is needed from the 1,364-line file); `InlineQuizEmbed.tsx` (Practice mode → `record_answer`, deterministic evaluation); `_shared/aiGateway.ts` prompt registration for `novo.mode.explain`, `.solve`, `.practice` (first real registry use); `…_v5_novo_quota.sql` (new: `novo_usage_daily`, `consume_novo_quota()`); `gemini-chat/index.ts` (call quota before the model; Pro exempt/raised); remove the `localStorage` cap as the authority (keep as a UI hint only) |
| **Acceptance** | Each mode behaves per spec on a scripted eval (≥ 5 cases/mode; existing 25 `novo_eval_cases` show no regression vs the Day-10 baseline); Practice answers create `answer_events`; Solve refuses graded/mock submissions; **quota cannot be bypassed by clearing app data or a modified client** (tested by calling the function directly); over-quota UX is clear and never blocks Practice/Review. |
| **Automated tests** | Vitest: mode chips, deep-link parsing; Deno: quota, prompt-registry fallback; eval run via `novo-eval-run`. |
| **Manual** | Device: each mode; kill network mid-answer; exceed quota. |
| **Production verification** | `ai_prompt_versions` rows active; `ai_gateway_requests.prompt_key/version` populated; quota counters correct. |
| **Rollback** | Deactivate prompt versions; flag `novo.modes`; quota fails **open to a low cap** if the RPC errors (never blocks core learning). |
| **Depends on** | Days 9–10 |
| **GO/NO-GO — NOVO GATE** | GO iff the loop *Explain → check → `record_answer` → next-plan change* is demonstrated with DB assertions on staging **and** a production test account, and eval shows no regression. If eval regresses: revert prompts to inline defaults, do not slip. |

### PHASE 4 — PRACTICE, REVIEW, PROGRESS (Days 12–15)

#### Day 12 — Unified Practice shell and question sources
| | |
|---|---|
| **Objective** | One session engine and one question screen; chapter is a filter; provenance is architectural. |
| **Systems** | Practice hub/session; question adapters; `practice_questions` |
| **Files** | `src/pages/practice/PracticeHubPage.tsx`, `PracticeSessionPage.tsx` (new); `src/components/practice/QuestionCard.tsx` (new; **provenance badge, report button**); `src/lib/practice/types.ts`, `sources/pyq.ts`, `sources/ai.ts` (new; `QuestionProvenance`; only the PYQ adapter can emit `official_pyq`); `…_v5_practice_questions.sql` (new: `practice_questions` with provenance, validation, `report_count`, `content_hash UNIQUE`, RLS read-active/insert-service); `QuizPage.tsx` becomes a redirect; verify `question_reports` columns `[U]` |
| **Acceptance** | Practice hub offers Quick Practice with a **subject + chapter filter** (no standalone chapter browser); the filter's chapter values are verified against `pyq_content.chapter` and `ncert_chapters` names (mismatch ⇒ use the values actually present, `[U]` resolved); a session runs end-to-end with a stub source; the type system rejects an AI question labelled PYQ (test). |
| **Automated tests** | Vitest: session state machine (resume/skip), provenance typing, adapter contracts. |
| **Manual** | Device: open Practice, apply filters, complete a stub session. |
| **Production verification** | Migration applied; table empty; RLS test. |
| **Rollback** | Flag `practice.v5` ⇒ legacy quiz route. |
| **Depends on** | Days 9, 5 |
| **GO/NO-GO** | GO if the shell runs and provenance cannot be mis-assigned. |

#### Day 13 — Quick Practice: reviewed PYQ first, labelled AI top-up
| | |
|---|---|
| **Objective** | Real Quick Practice from trusted content, honestly topped up. |
| **Systems** | PYQ adapter; `ai-question-gen`; cache; reporting |
| **Files** | `sources/pyq.ts` (`is_reviewed = true AND is_active = true`, client-side **and** relying on the Day-3 RLS); `sources/ai.ts` (cache lookup in `practice_questions` first; on miss call `ai-question-gen`, run deterministic checks, insert, serve); `PYQBankPage.tsx` (add the filter + badge; "Practice this set"); `MockTestPage.tsx` (**P0-only**: verify it cannot load unreviewed rows, show the CAT/UPSC/Boards limitation notice, nothing else changed — engine, scoring and recovery untouched); report → `question_reports` + auto-deactivate at N (D-8) |
| **Acceptance** | Sessions draw reviewed PYQs first, AI second; every AI card shows the badge; **no AI question is ever counted as a PYQ or used in Mock scoring**; unreviewed PYQ unreachable from PYQ Bank, Practice, Mock, Live Event, Regional Language (query proves 0); when trusted supply is short the UI says so; every answer produces one `answer_events` row; offline answering works; AI-generation success reported separately (G7). |
| **Automated tests** | Vitest: source order, top-up when PYQ supply is 0/2/5+, never-unreviewed assertion, cache hit path; Deno: `ai-question-gen` deterministic-check tests; Playwright: complete a set; airplane-mode test. |
| **Manual** | Device: JEE, NEET and a school-class learner (AI-only) — confirm the labelling reads honestly. |
| **Production verification** | `answer_events` joined to `pyq_content` shows `is_reviewed = true` for every `official_pyq`; `practice_questions` cache hit rate recorded; generation success from `ai_gateway_requests`. |
| **Rollback** | Flags `practice.ai`, `practice.pyq`. |
| **Depends on** | Days 3, 9, 12; Groq/Claude chain from Day 2 |
| **GO/NO-GO** | GO iff the trust query returns 0 rows and counts reconcile exactly on a device. |

#### Day 14 — Review
| | |
|---|---|
| **Objective** | Every mistake becomes a due card; Review closes the loop. |
| **Systems** | Review screen; `record_review`; redirects |
| **Files** | `src/pages/review/ReviewPage.tsx` (new; **Due** and **Mistake history** tabs); redirects `/flashcard`, `/spaced-review`, `/journal` → `/review`; `record_review` client wrapper; e2e `review.spec.ts` (new) |
| **Acceptance** | A wrong answer appears as due the next day (verified with a staging clock shift); grading updates the interval per SM-2 server-side; empty state shows the next due date; offline grading queues and reconciles. |
| **Automated tests** | pgTAP `record_review`; Playwright wrong-answer → next-day review → correct grade. |
| **Manual** | Device: two-day returning-user script. |
| **Production verification** | `sr_cards` rows and intervals for the test account. |
| **Rollback** | Flag `review.v5`; legacy pages still exist. |
| **Depends on** | Days 9, 13 |
| **GO/NO-GO — PRACTICE GATE** | GO iff Novo → Practice → Answer → Persist → Mistake → Review works end-to-end (G6) with DB assertions. |

#### Day 15 — Thin Progress (Mock engine untouched)
| | |
|---|---|
| **Objective** | Show progress honestly and minimally. |
| **Systems** | Progress; profile trim |
| **Files** | `src/pages/progress/ProgressPage.tsx` (new; **only**: exam countdown, subject mastery, weak topics, streak, questions completed, review due; links to WeaknessRadar/ErrorPatterns as SECONDARY); `ProfilePage.tsx` (menu trimmed to the §12 list; Sync issues linked); one RPC or view for the numbers (no `select('*')`) |
| **Acceptance** | Zero-data and some-data states correct; numbers reconcile with `answer_events`/`sr_cards`; **no charts library added**; Mock Exam remains unmodified apart from the Day-13 P0 checks. |
| **Automated tests** | Vitest Progress with fixtures; SQL reconciliation test. |
| **Manual** | Device: new vs returning learner. |
| **Production verification** | Reconcile figures for the test account by query. |
| **Rollback** | Flag `progress.v5`. |
| **Depends on** | Days 9–14 |
| **GO/NO-GO** | GO if figures reconcile exactly. |

### PHASE 5 — GLOBAL MOBILE QUALITY (Days 16–17)

#### Day 16 — Core UI design system
| | |
|---|---|
| **Objective** | The ten core screens feel like one calm, professional product on a budget phone. |
| **Systems** | Tokens; shared components; a11y; Hindi |
| **Files** | `src/styles/v5-tokens.css` (new; solid surfaces, one accent, scale 12/14/16/20/28, 4-pt spacing); `src/components/v5/` `Screen`, `Card`, `PrimaryButton`, `Chip`, `ListRow`, `EmptyState`, `ErrorState`, `Skeleton` (new); apply to Login, Onboarding, Home, Novo header/modes, Practice, Question, Review, Progress, Pro, Profile; `scripts/check-v5-styles.mjs` (new; fail on hex / `linear-gradient` / inline styles / font < 12 px in V5 screens); Hindi strings from the P-9 review |
| **Acceptance** | Style check green; every screen has loading/empty/error; touch targets ≥ 48 dp; contrast ≥ 4.5:1 (scripted over token pairs); light + dark; no animation that needs GPU headroom (reduced motion respected); Hindi renders without clipping. |
| **Automated tests** | Style script; component tests; Playwright visual snapshots (light/dark × EN/HI) with deliberate baselines. |
| **Manual** | Low-end device visual pass; TalkBack on Home/Question. |
| **Production verification** | n/a (client). |
| **Rollback** | Flag `ui.v5`. |
| **Depends on** | Days 6–15 stable, P-9 |
| **GO/NO-GO** | GO if the style check is green and no functional test regresses. |

#### Day 17 — Performance day and code freeze
| | |
|---|---|
| **Objective** | Only core startup work happens before the first meaningful screen; performance is measured, then freeze. |
| **Systems** | `main.tsx`; fonts; analytics; bundle; heavy libraries |
| **Files** | `src/main.tsx` (**remove `await document.fonts.ready` from the critical path**; render immediately with a system font, swap asynchronously; keep `initStorage()` but make it non-blocking where safe `[U: audit what depends on it]`); `index.html` and `public/fonts` (self-hosted subset woff2, Latin + Devanagari, minimal weights; drop the Google Fonts CDN); defer PostHog/Sentry until after first paint (idle); lazy KaTeX / syntax highlighting inside Chat only; verify ExcelJS, PDF libs and the HuggingFace offline worker are not on the startup path `[U]`; `vite.config.ts` manual chunks; `scripts/check-bundle-size.mjs` (new; reads the `dist/index.html` preload set); `package.json` → `5.0.0-rc.1`; `android/app/build.gradle` `versionCode` 54 |
| **Acceptance** | Initial-load JS ≤ **450 KB gzip** (baseline 494.5 KB) **or** ≥ 20 % below baseline (≤ ~396 KB) — reported either way with the exact figure; first render no longer waits on fonts or network; **device metrics recorded vs the Day-5 baseline** (cold start, Home usable, Novo open, Practice open, jank, memory) — improvements and any regressions stated plainly; freeze tag `v5.0.0-rc.1`. |
| **Automated tests** | Bundle-size script in CI; Playwright first-paint test with the font request blocked (app still renders). |
| **Manual** | Low-end device: cold starts ×5, Novo/Practice open, 10-minute soak for memory/ANR. |
| **Production verification** | Re-run **all** Day 1–16 production checks as a regression sweep; paste results. |
| **Rollback** | Flags; tag `v5.0.0-beta` created end of Day 15. |
| **Depends on** | Days 13–16 |
| **GO/NO-GO — FREEZE GATE** | GO to the war room only if every gate in §18 is met **or** listed with owner and a Day-18 fix plan; **P0 gates cannot be listed — they must be met.** After 24:00 only P0 fixes with a reproducing test/log and a same-day retest. |

### PHASE 6 — RELEASE WAR ROOM (Days 18–20) — *no new features*

#### Day 18 — Internal testing
| | |
|---|---|
| **Objective** | Prove the full journey and the purchase/restore/AI/persistence paths. |
| **Systems** | Playwright staging + production tester accounts; internal-testing AAB |
| **Files** | `e2e/authenticated/full-journey.spec.ts` (new: fresh install → signup → consent → exam setup → Home → Novo → Practice → answer → Review → Progress → Pro → logout → login); signed AAB `5.0.0-rc.1` (versionCode 54) → internal testing |
| **Acceptance** | Journey green automatically and by hand on device 1; **purchase and restore verified with backend read-back**; AI success reported per G7 over the validation window with numerator/denominator; persistence reconciled (answers given = `answer_events`); 0 open P0. |
| **Automated tests** | Journey spec; full unit/Deno/pgTAP; schema guard; style check; size gate. |
| **Manual** | Device 1 full journey ×2 with a usability log. |
| **Production verification** | 4.0.0 smoke on production (additive compatibility) + Day-17 sweep. |
| **Rollback** | Do not promote the build; 4.0.0 stays live. |
| **Depends on** | Day 17 freeze; P-3, P-4, P-5, P-6 |
| **GO/NO-GO** | GO if the journey is green and P0 = 0. Any P0 ⇒ Day 19 fixes P0 only; the closed test still starts. |

#### Day 19 — Physical devices, poor network, returning student
| | |
|---|---|
| **Objective** | Validate on hardware in bad conditions. |
| **Systems** | Low-end + normal Android; network shaping; closed testing |
| **Files** | `docs/product/V5_TEST_LOG.md` (new); P0 fixes only |
| **Acceptance** | On the low-end device: cold start, journey and a practice set on **throttled 3G**; **airplane mode mid-answer**; **Wi-Fi↔mobile switching** mid-set; **app kill** (mid-answer, mid-onboarding, mid-Mock) and **resume from background**; **offline answer reconciliation** with zero lost answers (DB count = answers); **returning student**: after a wrong answer, next-day Home leads with Review and Novo's context reflects it; purchase + restore again; all recorded with evidence (screen recording/logcat); perf metrics complete for both devices. Build on the **closed-testing** track. |
| **Automated tests** | Full suite on the final commit. |
| **Manual** | Structured scripts, pass/fail per scenario per device. |
| **Production verification** | Reconcile `answer_events`, `sr_cards`, `profiles.exam_name` for testers; re-measure AI success. |
| **Rollback** | Halt closed test; flip flags. |
| **Depends on** | Day 18 |
| **GO/NO-GO** | GO if no P0/P1 is open in the primary loop and every scenario passes. Otherwise fix P0 only, extend the closed test, **do not** ship Day 20 to 100 %. |

#### Day 20 — Release decision and procedure
| | |
|---|---|
| **Objective** | Ship — or consciously hold — with rollback ready. |
| **Systems** | Play Console; flags; monitoring |
| **Files** | `docs/product/V5_RELEASE_REPORT.md` (new; gate-by-gate evidence, verified vs assumed); tag `v5.0.0`; **merging to `main` is the founder's decision** |
| **Acceptance** | Every gate in §18 has an evidence entry; founder go/no-go recorded; if GO: **staged rollout 5 % → 20 % → 50 % → 100 %** with halt criteria (crash-free sessions, ANR rate, AI success < 98 %, purchase failure rate, any data-loss report — thresholds set from measured closed-test data, not invented here); **rollback exercised once** (flag flip + redeploy of previous functions + halt rollout). |
| **Automated tests** | Final full-suite run recorded. |
| **Manual** | Smoke of the Play-delivered build. |
| **Production verification** | Monitoring at T+1 h, T+4 h, T+24 h: signups, `answer_events`, per-provider AI success, `edge_function_errors`, Sentry, quota counters. |
| **Rollback** | Halt rollout; flags; previous function versions; previous release stays available. |
| **Depends on** | Day 19; P-2 outcome |
| **GO/NO-GO** | GO only if all P0 gates are met with evidence. **If P-2's closed-test rule applies and its duration has not elapsed, Day 20 delivers a closed-track V5, not public production — a platform constraint, stated plainly.** |

---

## 14. Critical path

`P-1/P-4/P-5 → D1 (quiz repair + /pro + restore) → D2 (provider chain, memory, health) → D3 (schema truth + PYQ trust) → D4 (SyncQueue + exam gate) → D5 (flags, nav, back) → D6 (onboarding) → D7 (plan RPC) → D8 (Home) → D9 (spine) → D10 (context) → D11 (Novo modes + quota) → D12 (Practice shell) → D13 (Quick Practice) → D14 (Review) → D15 (Progress) → D16 (design) → D17 (performance + freeze) → D18 → D19 → D20`

**Off the critical path / parallelisable:** Days 5–8 need only Days 3–4; Day 8 depends on the plan RPC, not the spine; Day 16 styling can begin on finished screens during Day 15. **Slack:** ≈ 0 between Day 9 and Day 15 — slack exists only if §16 cuts are taken early. **External path:** P-2 (Play closed-test rule) is independent of code and is the largest unknown.

---

## 15. Risk register

| ID | Risk | L | I | Signal | Mitigation |
|---|---|---|---|---|---|
| R1 | Play closed-test rule applies and isn't started Day 1 | M `[U]` | Critical | P-2 unanswered | Ask Day 0; start closed test with the existing AAB; V5 may ship closed-track only |
| R2 | Gemini not restored → embeddings/vision degraded; Groq/Claude chain carries Novo | H | High | Day 2 zero successes | Chain works without Gemini; Gemini reported separately; vision features stay flagged off |
| R3 | **Day-1 quiz repair unmasks duplicates / double XP (F18) or other dead code** | H | High | Day-1 count ≠ 1 | Test-before-declare; contingent unique index; QuizPage client fix; XP effect measured and disclosed (D-7) |
| R4 | Spine (Day 9) slips or RLS blocks user-invoked writes | M | Critical | pgTAP cross-table failure | Narrow SECURITY DEFINER with pinned `search_path`; definer review |
| R5 | Thin trusted supply: 323 PYQs (all AI-audited, none human-verified); non-JEE/NEET learners are AI-only | H | High | Reports of wrong questions | Provenance labels, report button, auto-deactivate, cache; honest "not enough verified questions"; post-V5 human review of top chapters |
| R6 | **Hiding unreviewed PYQs removes CAT/UPSC/Boards content from existing users** | H | Med | Complaints | D-3 explicit; copy explains; V5 targets JEE/NEET first; V5.1 review pipeline |
| R7 | No client hot-fix after native release | H | High | Post-release P1 | Remote flags (Day 5); staged rollout; server-side fixes |
| R8 | Single-person build/test capacity | H | High | Fatigue | Automated gates, freeze rule, evidence log |
| R9 | Device availability (P-3) or purchase config (P-4) late | M | High | Nothing on Day 1/5 | Emulator for smoke only; G2/G9/G11 stay open until hardware exists — no waiving |
| R10 | Production DB shared with live 4.0.0 | L | Critical | 4.0.0 smoke fails | Additive changes; the one policy change (D-3) has a recorded rollback; 4.0.0 smoke after each migration |
| R11 | Claude fallback unproven / balance empty | M | High | Day-2 smoke fails | Tested before reliance; if it fails Novo has one provider → escalate |
| R12 | Hindi strings unreviewed | M | Med | Reviewer unavailable | Ship EN + reviewed core-screen HI only; otherwise EN UI + Novo in Hindi, and say so |
| R13 | Bundle/startup goals unreachable | M | Med | Day-17 numbers | Gate accepts ≥ 20 % reduction; user-perceived device speed is the primary gate |
| R14 | Scope creep from PM/ChatGPT | H | High | New asks after Day 4 | Change control: anything new replaces an item of equal size or is refused |
| R15 | Staging schema drift ⇒ green staging, red production | M | High | Day-18 prod smoke | Regenerate manifest from production each day; run the journey on production tester accounts |
| R16 | Groq free-tier 429 bursts | M | Med | 429 rate | Chain + global RPM budget + server quota |
| R17 | AI cost drifts up (calls/turn, prompt size) | M | Med | Per-turn metrics | Day-10 instrumentation, cache, quota, call budget |
| R18 | Unverified assumptions (`[U]`, `[A]`) prove false | M | Var | §20 list | Each has a named day |

---

## 16. Scope cuts

**Approved cuts (applied throughout this plan)**
1. **No LLM-driven misconception tagging** — deterministic tag `"<topic> — review needed"`.
2. **No separate Chapter Practice browser** — chapter is a filter inside the unified Practice experience.
3. **Mock Exam is not rewritten into the learner spine** — existing engine preserved; P0 fixes only; unification → V5.1.
4. **No Novo "Plan" mode** — Today's Plan lives on Home/Progress; Novo = Explain · Solve · Practice.
5. **No full regional UI localisation** — UI languages are English and Hindi; Novo may answer in more languages; other UI languages → V5.1.
6. **Progress stays deliberately thin** — countdown, subject mastery, weak topics, streak, questions completed, review due.

**Further cuts if the schedule slips (in order; never touches Days 18–20):** (1) Hindi limited to Login/Onboarding/Home/Practice/Question/Review; (2) Progress "subject mastery" → weak topics only; (3) visual system on Login/Onboarding/Home/Novo/Question/Review only, token patch for Progress/Pro/Profile; (4) PYQ practice = browse-only (no session mode); (5) poor-network matrix 6 → 3 scenarios (airplane mid-answer, throttled 3G, app kill); (6) `practice_questions` reuse cache deferred (generate per session, still labelled/reportable).
**Never cut:** quiz persistence repair · `/pro` + restore sync · provider chain + alerting · schema/column guard · SyncQueue error checking + dead-letter · mandatory exam target (incl. `GENERAL`, never NULL) · `record_answer` + automatic Review · unreviewed-PYQ block · Home "what next" · server-side Novo quota · the Day 18–20 protocol.
**Freeze rule:** no new code after Day 17 24:00.

---

## 17. Deferred to V5.1 (deliberate sequencing, not failure)
Mock learner-spine integration · rich Progress analytics · full Tamil / Telugu / Marathi (and other) UI localisation · social network · Battles expansion · multiplayer · study rooms · deep B2B features · OTA update architecture · large content expansion / human PYQ verification programme · additional AI-provider experimentation · full-codebase redesign · complete Supabase service-layer migration.

---

## 18. Release gates, corporate release standard, Definition of Done

**V5 does not ship because "tests passed."** It ships only when the checklist below is true *and* each line has evidence in `V5_RELEASE_REPORT.md`.

| Gate | Requirement | Evidence that counts | Days |
|---|---|---|---|
| G1 | Zero known P0 in the primary loop | bug log 0 P0; journey green | 17, 18, 20 |
| G2 | 100 % of Pro gates reach a functional purchase screen; **purchase and restore work and update backend entitlement** | Playwright over every gate; device purchase + reinstall + restore with `profiles.is_pro` read-back; Razorpay absent on native | 1, 5, 14, 18, 19 |
| G3 | Zero UI references to nonexistent production **tables or columns** | `check-schema-refs` green against a manifest generated from production that day; the F17 case shown failing on baseline | 3, 17, 18 |
| G4 | Zero known silent data-loss path; **a completed quiz persists exactly once**; the queue never treats an error as success | SyncQueue tests; Day-1 evidence; write-path audit; on-device answer reconciliation | 1, 4, 13, 19 |
| G5 | Every new learner has an exam target (a real state incl. `GENERAL`, never NULL); existing users gently gated | Playwright; `exam_name IS NOT NULL` for all test accounts | 4, 6, 19 |
| G6 | Novo → Practice → Answer → Persist → Mistake → Review → Progress → adaptive next plan | e2e with DB assertions | 11, 14, 18 |
| G7 | **≥ 98 % success for REQUIRED V5 user-facing AI calls** over the validation window. Report **separately**: Novo · AI question generation · Groq · Claude fallback · Gemini embeddings/vision · whole-system aggregate. Numerator, denominator, window and query stated; failures on required user journeys count; provider-fault 4xx count as failures; legacy cron failures shown separately and do **not** block V5 if hidden/non-core and unable to affect the journey | `ai_success_rate_by_function_provider` + helper-call logging | 2, 18, 19, 20 |
| G8 | No unfinished feature exposed in primary navigation | link-crawl finds no FLAG-OFF route; 5 tabs | 8, 17 |
| G9 | Android release build verified | signed AAB passes the journey on ≥ 2 real devices | 18, 19 |
| G10 | **Academic trust:** unreviewed PYQs unreachable from every student-facing surface (server + client); AI questions always labelled and never PYQ/Mock; provenance stored; reports work | trust query = 0 rows; provenance tests | 3, 13, 18 |
| G11 | **Performance measured** on 1 low-end + 1 normal Android against the Day-5 baseline: cold start, Home usable, Novo open, Practice open, jank, memory/ANR, network behaviour; initial JS ≤ 450 KB gzip **or** ≥ 20 % below 494.5 KB; no blocking font/network wait before first render | perf log with raw numbers | 5, 17, 19 |
| G12 | **Weak network does not destroy progress**: offline answers reconcile with zero loss under airplane mode, 3G, Wi-Fi↔mobile switching, app kill | on-device counts | 4, 19 |
| G13 | **Novo works or fails gracefully**: provider chain tests green; all-provider-failure UX shown; free cap enforced server-side | tests + direct-call quota test | 2, 11, 19 |
| G14 | **Rollback exists and was exercised once**; unfinished features hidden | flag flip + function redeploy + rollout halt demonstrated | 5, 20 |

**Corporate release standard.** V5 ships only when: the core learning workflow is clear · no known P0 exists · student data persists · offline recovery works · purchase + restore work · the exam target exists · Novo works or fails gracefully · AI content provenance is clear · unreviewed PYQs are hidden · low-end Android is usable · weak network does not destroy progress · performance is measured · rollback exists · unfinished features are hidden · every release gate has evidence.

**Definition of Done — V5 is done only when:** (1) G1–G14 are met (a P1/P2 gate may be waived in writing by the founder; **P0 gates cannot**); (2) the required journey (*fresh install → signup → consent → exam setup → Home → Novo → Practice → answer → Review → Progress → Pro → logout → login*) passes automatically **and** on ≥ 2 real Android devices including poor-network and returning-user scenarios; (3) all unit, Deno, pgTAP, Playwright, schema-guard, style and size checks are green on the release commit; (4) every `[U]`/`[A]` in §20 is resolved or carried as a documented risk; (5) rollback has been exercised; (6) the release report separates *verified* from *assumed*; (7) `release/5.0.0-landmark` is tagged and `main` is untouched until the founder merges.

---

## 19. Founder decisions

| ID | Decision | Default if silent | Needed |
|---|---|---|---|
| D-1 | Free vs Pro matrix (§11) incl. Novo daily cap value (today 10, client-side) and PYQ daily limit | Keep 10 Novo/day (server-enforced); PYQ 10/day | Day 1 |
| D-2 | Claude as **tested secondary text fallback only**; Groq primary; no other provider | Approved per your brief | Day 1 |
| D-3 | **Hide unreviewed PYQs** by tightening `pyq_public_read` to `is_active AND is_reviewed` (CAT/BOARDS/UPSC content disappears from all clients until reviewed) | Approve | Day 1 |
| D-4 | Battle: out of navigation and **FLAG OFF** | Approve | Day 4 |
| D-5 | Visual direction: calm/solid/no gradients; supersedes `DESIGN.md`; follows system light/dark | Approve | Day 4 |
| D-6 | Onboarding exam list: JEE Main · JEE Advanced · NEET · CBSE 10 · CBSE 12 · UPSC · CAT · Other/Not sure yet (`GENERAL`) | As listed | Day 4 |
| D-7 | Accept a **temporary double-XP effect on field 4.0.0 quizzes** after the score_pct repair (bounded; measured Day 1), versus delaying the repair until the client fix ships | Repair now; disclose effect | Day 1 |
| D-8 | AI-question auto-deactivate threshold N reports | N = 3 | Day 12 |
| D-9 | UI wording for PYQs: "checked by automated audit" until human verification exists; "Verified" reserved for `human_verified` | Approve | Day 4 |

---

## 20. Unverified items and where each is resolved

| Item | Tag | Resolved |
|---|---|---|
| Play closed-test rule applicability | `[U]` | Day 1 (P-2) |
| Restore/purchase behaviour on device, and whether the RevenueCat webhook fires on restore | `[A]`/`[U]` | Day 1 (P-4) |
| Antigravity findings not independently re-checked (device-level restore result) | `[A]` | Day 1 |
| Whether the Day-1 repair yields exactly one row vs two; XP delta; new dead-code failures | predicted `[V code]` | Day 1 |
| User-invoked RLS can write mastery/cards/patterns | `[U]` | Day 9 |
| Real cause of empty `novo_memories` (beyond `waitUntil`) | `[U]` | Day 2 |
| Which RAG helper calls run per turn | `[U]` | Day 10 |
| `question_reports` columns | `[U]` | Day 12 |
| `pyq_content.chapter` ↔ `ncert_chapters` naming match | `[U]` | Day 12 |
| `initStorage()` dependents, so it can be made non-blocking | `[U]` | Day 17 |
| ExcelJS/PDF/HF worker off the startup path | `[U]` | Day 17 |
| Anthropic balance and Claude live behaviour | `[U]` | Day 2 |
| Keystore/signing availability | `[U]` | Day 5 (P-6) |
| Staging schema parity | `[U]` | Day 3 |
| Hindi review availability | `[U]` | Day 16 (P-9) |

---

## 21. Honest assessment

**Question:** *With this revised scope, can Edora realistically become a fast, reliable, affordable, corporate-grade mobile education core product within 20 days?*

**Verdict: REVISE.** Not because the scope is wrong — the approved cuts made it materially more achievable — but because three things this revision surfaced mean "GO" would overstate what I can promise:

1. **The core loop and the doctrine are achievable in 20 days *only if* the external items land early:** P-1/P-4/P-5 (Day 1), P-3 (Day 5), P-2 (Day 1). The single largest unknown, the **Play closed-test rule**, cannot be resolved by engineering; if it applies and the clock isn't started on Day 1, V5 reaches a closed track, not public production.
2. **Content limits how "high-quality" practice can honestly be in V5.** The only trusted supply is 323 AI-audited PYQs for JEE/NEET; none is human-verified. Everyone else practises on labelled AI questions. That is an honest V5, but it is a *limited-content* V5, and hiding 232 unreviewed PYQs (D-3) is a visible loss for CAT/UPSC/Boards users.
3. **Days 9–15 have essentially no slack**, and Day 1 now carries a real production-repair risk (F18) plus purchase verification that needs hardware and store configuration. A slip in Days 1–2 pushes into the protected war room unless cuts are taken early.

**What would make it GO:** P-1…P-5 resolved by Day 1, P-3 by Day 5, D-1/D-2/D-3/D-7 answered Day 1, and the Day-1 quiz repair proven to persist exactly one row. **What would make it NOT EXECUTABLE:** Play's closed-test rule applying without an already-running clock *and* public production being a hard requirement; or the Day-9 spine not working under RLS.

**Are Days 18–20 protected?** Yes: freeze at Day 17 24:00, P0-only fixes, no new features, cuts ordered in §16 that never touch them, and gates that cannot be waived (P0) or silently deferred.

**Top five schedule risks:** (1) Play closed-test rule (R1) · (2) Day-1 quiz-repair side effects and purchase verification dependent on P-4 (R3, R9) · (3) Claude fallback/Gemini state deciding whether Novo has a second tier (R2, R11) · (4) the Day-9 spine under RLS with zero slack after it (R4) · (5) content trust — thin, AI-audited-only supply and the D-3 trade-off (R5, R6).

---

## 22. Validation (executed 2026-09-25 at commit time)
- **Days:** 20 day blocks found; every one contains all ten required fields (Objective, Systems, Files, Acceptance, Automated tests, Manual, Production verification, Rollback, Depends on, GO/NO-GO; five carry a named gate suffix).
- **Routes:** 99 routes parsed from `src/App.tsx`; each appears exactly once in §11, none duplicated, none unclassified; the 5 V5 additions are present (104 rows). This checks *coverage*, not whether each disposition is the right product call — that remains a founder/PM judgement.
- **Days 18–20:** protected by the Day-17 24:00 freeze, the P0-only rule, the §16 cut order that never touches them, and the non-waivable P0 gates.
- **Scope of this change:** documentation only; no application code, migration, deployment or production write was made. Evidence for the F-facts was gathered by read-only queries and one never-committed insert that returned an error.
