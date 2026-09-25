# Edora V5 "Landmark" — Master Implementation Plan

| | |
|---|---|
| **Branch** | `release/5.0.0-landmark` |
| **Immutable pre-V5 baseline** | `eaf42abd515f2828db13042a4e168c83508c68ca` (`release/4.1.0-integration`, untouched) |
| **Factual baseline document** | `docs/product/APP_STATE_REPORT_2026-09-24.md` |
| **Written** | 2026-09-25 |
| **Status** | PLAN ONLY. No application code has been changed on this branch. |
| **Budget** | 20 calendar days (weekends included). Days 18–20 are protected. |

**Evidence legend — used throughout so nothing is over-claimed:**
`[V]` verified by me in this session — **repository facts were read at baseline SHA `eaf42ab` (identical to this branch); database facts were queried on 2026-09-25 unless a row says `[R]`** ·
`[R]` taken from the 2026-09-24 state report (measured then, not re-measured today) ·
`[P]` a plan or assumption · `[U]` unverified, must be checked on the stated day.
Anything not tagged `[V]` has **not** been verified today.

---

## 0. Mission, principles, non-goals

**Core promise:** *Open Edora → know exactly what to study → learn with Novo → practice → understand mistakes → Edora adapts tomorrow.*

**The one loop V5 ships:**
`Exam setup → Today's plan → Novo → Practice → Review → Adaptive next plan`

**Principles (each one is a tie-breaker when a decision is unclear):**
1. **One loop, not one hundred features.** If it isn't on the loop, it is hidden, not polished.
2. **Deterministic spine, AI at the edges.** Today's plan, Review, mastery and Progress are plain SQL/TypeScript and never depend on an AI provider being up. Only Novo replies and AI-generated questions use a model. (Today's failing Gemini key `[R]` must not be able to blank the Home screen.)
3. **Every answer is recorded exactly once, in one place.** One RPC writes the answer, updates mastery, and files mistakes into Review. Everything else reads from that.
4. **Additive database changes only.** The production database is shared with the live 4.0.0 app `[P]`; V5 migrations must be expand-only (no drops, no renames) until after release.
5. **Native release = no hot-fix for client code.** The app is a Capacitor APK bundling `dist/` (`[V]` `capacitor.config.ts` `server` block sets scheme/hostname/`allowNavigation` only — no remote `url`). After release, only server-side changes and remote flags can fix things → V5 ships a **remote kill-switch flag table** (Day 5).
6. **Don't claim what isn't verified.** Gates are evidence-based (query, test run, device log) — never "looks fine".

**Explicitly out of scope (from the brief, restated):** no new social network · no new major gamification · no B2B expansion · no analytics expansion · no redesign of all 98 routes · no new AI-provider experiment · nothing added "because it's possible".
**One narrow exception, needs founder approval (Decision D-2):** if the Gemini key cannot be restored by Day 2, an *already-built and deployed* Claude path may serve as a **fallback tier only**. It is not a new experiment: `callClaude()` is deployed, `ANTHROPIC_API_KEY` is set, and the flag is currently OFF `[V: prior session]`. It has never been exercised against a live response `[V]`.

---

## 1. Verified facts that shape this plan

| # | Fact | Tag | Consequence for the plan |
|---|---|---|---|
| F1 | `/pro` is routed to `<Navigate to="/profile">`; `ProSubscriptionPage` is imported as `_ProSubscriptionPage` and never rendered. Paywalls call `navigate('/pro')` (ProGate.tsx, ChatPage.tsx, AnalyticsDashboardPage.tsx). | `[V]` (App.tsx:76,509) | Day 1, first task. |
| F2 | `SyncQueue.processAction` does `await withRetry(() => supabase.from(...).insert(...))` and **never inspects the returned `.error`**. Supabase returns `{error}` rather than throwing, so a failed write is counted as success and the entry is deleted. Separately, entries failing 5 times are dropped silently. | `[V]` (syncQueue.ts `flush` 101–125, `processAction` 130–232) | This is the concrete silent-data-loss mechanism. Fixes on Day 4. |
| F3 | `syncQueue.ts` writes to `xp_history`, `quiz_user_answers`, `study_streaks` — none exist in production `[R]`. Enqueue sites found: `xp_grant` (QuizPage:521, CoursePage:75). `quiz_answer` and `streak_tick` are defined in the queue but I found **no live enqueue site** in `src/pages` `[U]`. With F2, failures on these are invisible. Impact is **low** (history rows only; XP itself goes through the existing `increment_xp` RPC `[V]`). | `[V]` code + `increment_xp` exists; missing tables `[R]` | Day 3/4 removes the dead entries. **Correction to an earlier draft of this plan:** I first wrote that "every quiz answer since launch was discarded" — that was wrong (QuizPage enqueues `quiz_session`/`xp_grant`/`topic_perf`, not `quiz_answer`). The real quiz defect is F17. |
| F4 | Production `profiles`: **42 of 42 have `exam_name = NULL` and `exam_date = NULL`.** | `[V]` (queried today) | Mandatory exam gate, Day 4. |
| F5 | Mastery/learner tables are written by scattered code with no shared path: `subtopic_mastery` (client `adaptiveDifficulty.ts` **and** `tutoring-engine`, two separate implementations), `topic_stats` (via `upsert_topic_stat`: MockTestPage, novo-memory), `topic_performance` (via `upsert_topic_performance`: syncQueue only), `sr_cards`, `error_patterns`, `mistake_journal`. Row counts (2026-09-24 `[R]`): 0 / 2 / 1 / 0 / 0 / 0. | `[V]` code + RPC signatures; counts `[R]` | The "spine" (Day 9) unifies them behind one RPC. |
| F6 | `gemini-chat` already loads `profiles` (exam, level, personality…), `novo_memories`, `subtopic_mastery` server-side (index.ts ~1871–1892). But `novo_memories` = 0 rows and `subtopic_mastery` = 0 rows (`[R]`, 2026-09-24), so Novo has **nothing learner-specific to read**. Why `novo_memories` is empty despite 84 chat rows is **unknown**. | `[V]` code+counts; cause `[U]` | Day 10 diagnoses the empty memory path before building on it. |
| F7 | Reviewed, usable practice questions: **JEE_MAIN 102, JEE_ADV 58, NEET 162 = 322**, plus 1 CAT. CAT/BOARDS/UPSC are entirely unreviewed (233). `pyq_content` has `exam, year, subject, chapter, class_level, options, correct_option, difficulty, is_reviewed` (no `topic`). Roughly 1–2 reviewed questions per NCERT chapter for JEE/NEET. | `[V]` (queried today) | Chapter Practice **cannot** be served from PYQs alone. It needs AI-generated questions (`ai-question-gen`, Groq, gateway-protected). Non-JEE/NEET learners are AI-question-only. |
| F8 | NCERT chapter catalogue exists: 274 chapters, classes 6–12 (6–10 Maths+Science; 11–12 Physics/Chemistry/Maths/Biology). | `[V]` | Chapter picker has a real source. |
| F9 | Only 4 of the 12 missing-table references are user-critical on the V5 loop: `quiz_user_answers`, `xp_history`, `study_streaks` (silent loss) and `ai_interactions` (AI thumbs feedback). The other 8 belong to features V5 hides. | `[V]` classification of `[R]` list | Day 3 does not need to invent 12 tables. |
| F10 | `ai_interactions` is *inserted then updated* by `AIFeedback.tsx` (user_id, session_type, user_query, ai_response, subject, topic, class_num, then `thumbs`, `dwell_ms`). | `[V]` (AIFeedback.tsx:40,136) | Table shape is known; create it additively on Day 3. |
| F11 | Web/Vitest 104 tests, Deno 278 tests, tsc 0 errors, ESLint 0 errors, build passes. | `[R]` (re-run needed on Day 1) | Baseline to protect. Re-run Day 1. |
| F12 | Android: `versionCode 53`, `versionName` derived from `package.json` (`4.1.0-alpha.1`). Only `release-builds/edora-v4.0.0-52.aab` exists locally. Signing keystore location unknown. | `[V]` version; keystore `[U]` | Human prerequisite P-7. |
| F13 | 6 deployed edge functions have no source in the repo (`mistake-clustering`, `mock-paper-composer`, `nova-insights`, `pyq-bulk-ingest`, `pyq-embed-ingest`, `question-explain`); two are called by the UI (`mock-paper-composer`, `question-explain`). | `[R]` | Day 2. |
| F14 | Retry-on-any-failure exists in callers (34 edge functions contain retry loops). `novo-morning-brief` retried a permanent HTTP 403 three times per user per day for 12 days (1,512 calls). | `[R]` | Day 2: one shared "is this retryable?" rule. |
| F15 | Gemini key: 3,375 failures vs 1 success since 2026-08-29 (429 then 403). | `[R]` | Day 1 human action P-1; Day 2 verification. |
| F16 | Novo chat's primary provider is Groq (`openai/gpt-oss-120b`); Gemini is used for RAG embeddings, vision, and the rate-limit fallback. | `[V]` (gemini-chat constants) | Novo's *core reply path* does not need Gemini, but retrieval quality and fallback do. |
| F17 | **Quiz results have never been persisted.** `QuizPage.tsx` (live insert, ~line 530) and `SyncQueue` case `quiz_session` (syncQueue.ts:198–207) both insert a `score_pct` column. Production `quiz_sessions` has **no `score_pct` column** (columns: id, user_id, subject, topic, questions, score, completed_at, created_at, user_answers, questions_count). I executed the exact insert in a transaction that was never committed; production returned `42703: column "score_pct" of relation "quiz_sessions" does not exist`. Because the live insert fails, the success branch (immediate flush, live `increment_xp`, achievement check) never runs, and because of F2 the queued retry silently "succeeds" and is deleted. Corroboration: `quiz_sessions` has 0 rows while analytics recorded 1 `quiz_complete` event. The 2026-09-24 report missed this — it checked table existence, not column existence. | `[V]` (schema query + reproduced error; nothing written) | **Zero-risk server-side hotfix exists:** additive `ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS score_pct numeric` repairs the live 4.0.0 client and the legacy V5 path with no app release. Scheduled Day 3; the founder may authorise it earlier. Day 3's CI guard is extended to **column-level** checks. |

---

## 2. Day-0 prerequisites (humans only — I cannot do these)

The 20 days assume these are resolved **by the end of Day 1 unless noted**. Each one that slips is a schedule risk in §12.

| ID | Prerequisite | Owner | Needed by | Why it can't be done by engineering |
|---|---|---|---|---|
| P-1 | Restore Gemini (new/unrestricted key + billing on Google AI Studio) **or** approve D-2 (Claude fallback tier) | Founder | Day 1 → verified Day 2 | Requires Google account / billing |
| P-2 | Google Play Console access; confirm **whether this developer account is subject to Google's "closed test with ≥N testers for ≥14 days before production" rule**; if yes, **start a closed test on Day 1 with the existing 4.0.0 AAB** | Founder | Day 1 | The 14-day clock cannot be compressed. If it applies and isn't started Day 1, V5 cannot reach public production in 20 days. `[U]` whether it applies. |
| P-3 | ≥2 physical Android devices (one low-end, ≤3 GB RAM, Android 10–12) with Play internal-testing access | Founder | Day 5 | Real-device gate on Day 19 |
| P-4 | RevenueCat + Play Console subscriptions for ₹99/month and ₹699/year created, active, and testable by licence testers | Founder | Day 3 (needed for Day 17 verification) | Store configuration |
| P-5 | ≥3 fresh Gmail test accounts + 1 account with a completed trial + 1 "returning user" seeded | Founder | Day 5 | Not mine to create |
| P-6 | Signing keystore + Play App Signing details available to whoever builds the AAB | Founder | Day 5 | `[U]` where the keystore lives |
| P-7 | Founder decisions D-1…D-6 (§14) | Founder | Day 1 (D-1, D-2), Day 4 (rest) | Product/business choices |
| P-8 | Supabase Pro upgrade (connection ceiling / PITR) | Founder | Not V5-gating; before any ramp beyond ~100 concurrent | Billing. Tracked in `READINESS_CLOSURE_SEQUENCE.md`. |

---

## 3. V5 architecture (text diagram)

```
┌────────────────────────────── ANDROID (Capacitor shell) ───────────────────────────────┐
│  TabBar:  Home · Novo · Practice · Progress · Profile                                   │
│                                                                                         │
│  Home ──────────────► "What should I do next?"  ◄── get_today_plan()  (deterministic)   │
│    │  primary card ─┬──► /practice/session?…     (Quick / Chapter / PYQ)                │
│    │                ├──► /review                 (due cards)                             │
│    │                └──► /chat?mode=explain&focus=…   (Novo, learner-aware)              │
│    ▼                                                                                    │
│  Novo (Explain · Solve · Practice · Plan) ──► inline check-questions ─┐                 │
│  Practice hub (Quick · Chapter · PYQ · Mock) ─► Question screen ──────┤                 │
│  Review (due cards + mistakes) ───────────────────────────────────────┤                 │
│                                                                       ▼                 │
│                                                        SyncQueue (offline-safe, checked)│
└───────────────────────────────────────────────────────────────────────┬─────────────────┘
                                                                        │ record_answer(idempotency_key, …)
┌──────────────────────────────── SUPABASE (production) ────────────────▼─────────────────┐
│  RPC  record_answer / record_answers_batch / record_review                                │
│    ├─► answer_events        (append-only log, question snapshot, idempotency unique key)  │
│    ├─► subtopic_mastery     (canonical mastery; ONE update rule, in SQL)                  │
│    ├─► topic_stats / topic_performance (kept in sync so legacy readers still work)        │
│    ├─► sr_cards             (wrong answer ⇒ card due tomorrow — automatic)                │
│    └─► error_patterns       (misconception tag aggregation)                               │
│  RPC  get_today_plan()  reads mastery + sr_cards + profile + exam date  ⇒ ≤3 ordered items│
│  Edge  gemini-chat  ◄── learnerContext.ts builds LearnerContext server-side (never client)│
│  Edge  ai-question-gen (Groq) → questions when PYQ supply is thin      [AI gateway]       │
│  Table app_flags (remote kill-switch, read at launch, cached)                             │
│  Monitoring: ai_gateway_requests success-rate view + alert (≥98% gate)                    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**What is deliberately *not* in the diagram:** battles, tournaments, circles, study rooms, teacher/school/parent portals, concept map, video companion, offline model, formula AR. They stay in the repo, hidden behind flags.

---

## 4. Data-flow specification

### 4.1 Learner-state spine (built Day 9)

**New table `answer_events`** (append-only; additive):
`id uuid pk · user_id · idempotency_key uuid UNIQUE(user_id, idempotency_key) · session_id uuid · mode text ('quick'|'chapter'|'pyq'|'mock'|'novo') · source text ('pyq'|'ai'|'mock') · source_id text null · subject · chapter · topic · question jsonb (snapshot: stem, options[], correct_index, explanation) · chosen int · is_correct bool · time_ms int · misconception text null · created_at`
RLS: user can insert/select own rows only. `[U: confirm RLS-invoker path can also write subtopic_mastery/sr_cards/error_patterns under existing policies; if not, use a narrowly-scoped SECURITY DEFINER with `auth.uid()` and `search_path` pinned, and add it to the RISK-034 definer review]`.

**RPC `record_answer(...) → jsonb`** in one transaction:
1. `INSERT answer_events … ON CONFLICT (user_id, idempotency_key) DO NOTHING` — replays from offline sync are harmless. Returns `{duplicate:true}` on conflict.
2. Update `subtopic_mastery` (attempts, correct, consecutive_correct/wrong, `mastery_score`) with **one** rule (replaces the two divergent implementations in `adaptiveDifficulty.ts` and `tutoring-engine`). Proposed: `m' = m + α·(outcome − m)`, α = 0.25 (0.35 for the first 5 attempts), `outcome ∈ {0,1}`; seed `m = 0.5`. `[P]` — exact constants finalised on Day 9 with a unit test.
3. `upsert_topic_stat` + `upsert_topic_performance` so existing readers (Weakness Radar, Home, Study DNA) keep working.
4. If wrong: insert/refresh an `sr_cards` row (`source_type='answer_event'`, `source_id=event.id`, front=stem, back=correct+explanation, `next_review_date = today+1`) — **mistakes enter Review automatically, with no client code involved.**
5. If a `misconception` tag is supplied: upsert `error_patterns` (`occurrence_count+1`).
6. Return `{mastery_before, mastery_after, review_card_id, streak_delta}`.

**RPC `record_review(card_id, quality 0–5)`** — SM-2 port of `src/lib/spacedRepetition.ts` (single source of truth server-side). **RPC `record_answers_batch`** for Mock Exam submit.

**Client rule:** the only way a learning answer reaches the database is `SyncQueue.enqueue({type:'answer', idempotency_key, …})` → `record_answer`. The old `quiz_answer`, `xp_history`, `study_streaks` queue entries are removed.

### 4.2 Today's plan (built Days 7–8, deterministic, no AI)

**RPC `get_today_plan()` → ≤3 items**, priority order:
1. `review_due` — if `count(sr_cards where next_review_date ≤ today) > 0`: "Review *N* cards · ~*M* min".
2. `fix_weak` — weakest subtopic with `attempts ≥ 3 AND mastery < 0.5` (ties → nearest to exam weight): "Practice *Topic* · 5 questions".
3. `diagnostic` — no answer history: "5-question check in *your first subject*" (this is also the activation step).
4. `learn_next` — next chapter in syllabus order not yet attempted: "Learn *Chapter* with Novo".
5. `exam_push` — exam ≤ 14 days: PYQ set or Mock slot.

Each item carries a deep link and an estimated duration. The Home screen's primary card is item 1. **Adaptivity is by construction:** `record_answer` changes mastery/sr_cards ⇒ next `get_today_plan()` returns a different list.

### 4.3 Offline behaviour
Answers enqueue locally with a client-generated UUID. Flush calls the RPC, **checks `error`**, retries only retryable failures, and moves permanent failures to a visible **dead-letter list** (Profile → Sync issues) instead of deleting them (fix for F2).

---

## 5. Novo context architecture

**Principle: the server assembles the context; the client can only *request* a mode and a focus, both validated.** A client cannot inject "the student is a topper" into the prompt.

**Request:** `{ prompt, mode: 'explain'|'solve'|'practice'|'plan', focus?: {subject, chapter?, topic?, question_ref?}, stream }`

**`_shared/learnerContext.ts` → `LearnerContext` (≤ ~700 tokens, hard truncation order below):**
```
exam:        { name, date, days_left }            level, language, personality, first_name
focus:       { subject, chapter, topic, origin: 'home_plan'|'practice_mistake'|'user' }
mastery:     { weakest: [3 × {subject, subtopic, score, attempts}], strongest: [2 × …] }
mistakes:    last 5 × { topic, stem≤120 chars, chosen, correct, misconception?, days_ago }
review:      { due_count, oldest_due_days }
streak:      n
last_session:{ 1–2 sentence summary from novo_session_summaries, if present }
mode:        one of the four
```
Truncation order when over budget: `last_session` → `strongest` → `mistakes 5→3→1` → `weakest 3→2`. Never truncate `exam`, `focus`, `mode`.

**Prompt assembly:** existing identity lock + `LEARNER STATE` block + **mode block** (four prompts registered in `ai_prompt_versions` under `novo.mode.explain|solve|practice|plan` — first real use of the registry built earlier; `getActivePrompt()` returns null → inline default, so it is non-breaking).

**Modes:**
| Mode | Behaviour | Writes |
|---|---|---|
| Explain | Teach the focus topic from first principles, using the learner's weakest related sub-topic as the bridge; ends with a 1-question check | none until the check is answered |
| Solve | Step-by-step solution to a pasted/selected question; must not solve graded/mock questions (academic-integrity rule already in the identity lock) | none |
| Practice | Serves 3 questions (PYQ first, `ai-question-gen` second) inline via the existing `InlineQuizEmbed`; evaluates each answer | `record_answer` per answer, with `misconception` |
| Plan | Shows today's plan + why; lets the learner swap/skip an item (writes nothing but a preference note) | none |

**Adaptive loop (Days 11–12):** *Teach* (Explain) → *Test* (inline check via Practice) → *Evaluate* (deterministic correctness) → *Identify misconception* (Novo returns a ≤6-word tag for wrong answers; falls back to `"<topic> — concept gap"` if the model call fails) → *Update learner state* (`record_answer`) → *Alter future plan* (`get_today_plan` recomputes).

**Provider reliability for Novo:** Groq primary → Groq small model → fallback tier (Gemini if restored, else Claude per D-2). If **all** fail, Novo returns a clear "Novo is busy — your practice and review still work" message; **the rest of the loop keeps working** because it is deterministic.

---

## 6. Feature visibility matrix (all existing routes + V5 additions)

**Categories:** `CORE V5` = on the loop, restyled/owned · `SECONDARY` = works, reachable via **one** "More" entry (Progress/Profile/Practice), **not restyled**, no primary-nav slot · `FLAG OFF` = hidden behind a remote flag; code stays; re-enable criteria noted · `ADMIN/B2B` = role-gated, not in learner discovery · `REMOVE FROM DISCOVERY` = route stays alive for deep links but is listed nowhere.
Backing-data evidence is from `[R]`/Appendix A of the state report.

**V5 additions:** `/practice` (hub), `/practice/session`, `/review`, `/progress`, `/setup-exam`.

| Route | V5 disposition | Where it lives in V5 | Reason (evidence) |
|---|---|---|---|
| `/login` | CORE V5 | Login | Simplify; 3 stacked choices today `[R]` |
| `/onboarding` | CORE V5 | Onboarding (3 steps) | 7 steps, exam skippable `[V]` |
| `/setup-exam` (new) | CORE V5 | Gate + onboarding step | F4 |
| `/home` | CORE V5 | Tab: Home | 20+ modules `[R]` |
| `/chat` | CORE V5 | Tab: Novo | Core product |
| `/practice`, `/practice/session` (new) | CORE V5 | Tab: Practice | Consolidation |
| `/review` (new) | CORE V5 | Practice → Review; Home card | Mistakes → review |
| `/progress` (new) | CORE V5 | Tab: Progress | Thin, deterministic |
| `/profile` | CORE V5 | Tab: Profile | — |
| `/pro` | CORE V5 | Pro screen (route fixed) | F1 |
| `/quiz` | CORE V5 → redirect | `/practice/session?mode=quick` | Legacy engine kept as source adapter |
| `/mock-test` | CORE V5 | Practice → Mock Exam | Has recovery lib `[V: mockExamRecovery.ts]`; Pro |
| `/pyq-bank` | CORE V5 | Practice → PYQ | 322 reviewed JEE/NEET only exposed |
| `/flashcard` | CORE V5 → redirect | `/review` | Same SM-2 concept |
| `/spaced-review` | CORE V5 → redirect | `/review` | Same |
| `/journal` | CORE V5 → redirect | `/review` (Mistakes tab) | Empty today; replaced by `answer_events` |
| `/account`, `/data-rights`, `/reminders`, `/privacy-policy`, `/terms-of-service` | CORE V5 | Profile | Legal/consent, must work |
| `/weakness-radar` | SECONDARY | Progress → Weak topics | Reads `topic_performance` |
| `/error-patterns` | SECONDARY | Progress → Patterns | Fed by misconception tags (Day 12) |
| `/analytics` | SECONDARY (Pro) | Progress → Advanced | Pro-gated |
| `/achievements` | SECONDARY | Profile → Achievements | 3 rows |
| `/sprint` | SECONDARY | Practice → Focus sprint | 2 sprints ever `[R]` |
| `/daily-session` | SECONDARY | Reachable from plan item | Overlaps Today's plan |
| `/roadmap`, `/planner`, `/lesson-plan` | SECONDARY | Progress → Study plan | Depend on Gemini/AI; 1 row each `[R]` |
| `/ncert-chapters` | SECONDARY | Practice → Chapter picker source | Broken table refs removed Day 3 |
| `/ncert-deep`, `/formulas`, `/solved`, `/mnemonics`, `/reels` | SECONDARY | Profile → Study library | Content tables empty `[R]`; hidden until content exists → see FLAG OFF note |
| `/exam-war-room` | SECONDARY | Home banner if exam < 48 h | Existing logic |
| `/rank-predictor`, `/exam-prediction`, `/mock-postmortem`, `/confidence`, `/study-dna` | SECONDARY | Progress → More | Mock-adjacent; not restyled |
| `/scanner`, `/photo-solver` | SECONDARY | Novo attach (camera) | Gemini-vision dependent; re-verify Day 2 |
| `/battle` | SECONDARY | Practice → Compete | 0 battles, 0 friendships, 8 invites; **removed from tab bar** (D-4) |
| `/leaderboard`, `/feed`, `/friends`, `/study-buddy`, `/circles`, `/study-groups`, `/study-group/:groupId`, `/live-event`, `/live-study-rooms`, `/study-rooms`, `/streaks`, `/challenges`, `/tournament`, `/debate`, `/story-mode` | FLAG OFF | — | Social/gamified; no users to populate `[R]`; re-enable when ≥500 WAU |
| `/referral` | SECONDARY | Profile → Invite | 3 rewards; growth lever |
| `/boss-fight`, `/certifications`, `/course`, `/novo-reads`, `/video-companion`, `/novo-insights`, `/novo-live`, `/whiteboard`, `/formula-ar`, `/attention-heatmap`, `/subject-map`, `/learning-style`, `/sleep-review`, `/cat-syllabus`, `/upsc-mains`, `/curriculum`, `/curriculum/:boardCode/:subject`, `/tutoring`, `/concept-map`, `/study-pack`, `/notes`, `/exam-simulator` | FLAG OFF | — | 0-row backing tables and/or unfinished/Gemini-dependent `[R]`. Re-enable per-feature only with a data + reliability check. (`/upsc-mains`,`/cat-syllabus`: 233 unreviewed PYQs, Decision on content review pending.) |
| `/ai-quiz`, `/concept-videos`, `/doubt-room`, `/offline-mode`, `/peer-explain` | FLAG OFF | — | Reference nonexistent tables (`[R]`) — must not be reachable (release gate G3) |
| `/novo-messages` | SECONDARY | Home bell icon | Proactive messages inbox; 11 rows |
| `/languages` | SECONDARY | Profile → Language | Existing |
| `/tools`, `/learning`, `/browser` | REMOVE FROM DISCOVERY | — | The 40-item catalogue and Learn hub *are* the sprawl `[R]` |
| `/diagnostics` | SECONDARY | Profile → About (build info) | Useful for support |
| `/admin`, `/eval`, `/teacher`, `/teacher-export`, `/school-admin`, `/school/:schoolName`, `/parent`, `/parent-portal`, `/auth/classroom/callback` | ADMIN/B2B | Role-gated / deep-link only | 0 classrooms, 1 institution `[R]` |

> A validation script (§17, run at commit time) confirms every route in `src/App.tsx` appears above exactly once. Result recorded in the final report.

**Free vs Pro (proposal, Decision D-1):** Free after trial — Novo (existing daily cap), Quick Practice, Chapter Practice, Review, Progress (basic), PYQ (limited/day). Pro — unlimited Novo, full PYQ, Mock Exams, advanced analytics. Trial stays 30 days. **No feature hard-locks a learner out of the core loop.**

---

## 7. Core-screen specification (10 screens)

Design direction: calm, premium, mobile-first, low cognitive load. Solid surfaces, one accent colour, no decorative gradients, no glow, no "dashboard" density. Minimum text 12 px (body 15–16 px), touch targets ≥ 48 dp, contrast ≥ 4.5:1, one primary action per screen. Existing tokens: light theme has WCAG-AA-adjusted values `[V: ThemeContext.tsx comments]`; `DESIGN.md`'s "dark precision/purple gradient" direction is **superseded for V5** (Decision D-5).

| Screen | Single question it answers | Primary element | Content (max) | Empty / error / loading | Key states to test |
|---|---|---|---|---|---|
| **Login** | "How do I get in?" | Continue with Google; email below | 2 methods visible; OTP as a text link | Inline errors; offline banner | wrong password, no network, Google cancel |
| **Onboarding** | "What are you preparing for?" | Exam chips → date → level+subjects → language | 3 steps, progress bar, ≤ 45 s | Skeleton for none; resumable | kill mid-step, back navigation |
| **Home** | "What should I do next?" | **One Next-Action card** from `get_today_plan()[0]` | header (name, streak), Next-Action, up to 2 more plan rows, exam countdown chip, bell | Plan RPC fails → static "Ask Novo / Practice" fallback | new user (diagnostic), returning user, exam < 14 d |
| **Novo** | "Help me understand this." | Message box + **mode chips** (Explain·Solve·Practice·Plan) | context strip: focus topic | Provider down → deterministic message | each mode, offline, long answer, LaTeX |
| **Practice** | "What kind of practice?" | 4 cards: Quick · Chapter · PYQ · Mock | recommended one highlighted | Mock/PYQ Pro states → purchase screen | Pro gate → `/pro` reachable |
| **Question** | "Which option is right?" | Question + options + timer (optional) | one question per view; explanation after answer | AI-generated label; report button | correct/wrong, offline answer, resume |
| **Review** | "What did I get wrong / what's due?" | Due-cards queue; Mistakes tab | count + est. time | "Nothing due" + next-due date | mistake auto-appears next day |
| **Progress** | "Am I improving?" | Exam countdown + mastery by subject | ≤ 3 weak topics, streak, questions this week | "Answer 5 questions to see progress" | zero-data, some data |
| **Pro** | "What do I get and how do I pay?" | Plan cards → Play purchase | ₹99/mo, ₹699/yr, restore | product-not-found, cancelled, pending | purchase, restore, expired |
| **Profile** | "My account & settings." | List | exam target (editable), language, reminders, sync issues, legal, sign-out | — | sign-out → login |

---

## 8. The 20-day plan

**Conventions.** Each day: Objective · Systems · Files · Acceptance · Automated tests · Manual · Production verification · Rollback · Depends on · GO/NO-GO. "(new)" = file to create. Paths are `[V]` existing unless marked (new). **Every day ends with:** `npm run type-check`, `npm run lint`, `npx vitest run`, `deno test supabase/functions/**/*.test.ts` all green, plus a commit and push to `release/5.0.0-landmark`. **Day 17 24:00 = code freeze.** Rollback for any day = `git revert` of that day's commits; DB changes are additive (rollback = ignore/deprecate, never drop); server flags can disable any user-visible piece.

### PHASE 1 — PRODUCTION RECOVERY (Days 1–4)

#### Day 1 — Purchase path + baseline
| | |
|---|---|
| **Objective** | Users who hit any Pro gate reach a working purchase screen. Establish the trusted baseline. Start the Play clock (P-2). |
| **Systems** | Routing; ProGate; RevenueCat/IAP; CI baseline; Play Console |
| **Files** | `src/App.tsx` (route `/pro` → `ProSubscriptionPage`, remove `_` alias); `src/components/ui/ProGate.tsx`; `src/pages/ProSubscriptionPage.tsx` (verify only); `e2e/authenticated/` new spec `pro-gate.spec.ts` (new) |
| **Acceptance** | Every `navigate('/pro')` call site lands on the purchase UI; purchase UI renders plans ₹99/₹699 with legal lines; restore-purchases button present; **no redirect to `/profile`**. Baseline: tsc/lint/Vitest/Deno counts recorded (F11 re-verified). |
| **Automated tests** | Vitest: `ProGate` navigates to `/pro` and the routed element is the subscription page (route-table unit test). Playwright: locked feature → `/pro` visible. |
| **Manual** | On a device with a licence-tester account: open a Pro-gated feature → purchase screen → initiate purchase in Play sandbox → entitlement flips. (Needs P-4.) If P-4 not ready: verify UI only, mark purchase `NOT VERIFIED`. |
| **Production verification** | After Day 1 deploy of nothing server-side: none. `subscriptions`/`profiles.is_pro` unchanged. Confirm RevenueCat webhook still reaches `novo-subscription` `[U]` by checking function logs after a sandbox purchase. |
| **Rollback** | Revert route commit (restores today's redirect). |
| **Depends on** | P-2 (start closed test today), P-4, D-1 |
| **GO/NO-GO** | GO if every Pro gate reaches the purchase screen in automated test. **NO-GO for Day 2 if the route test fails.** |

#### Day 2 — AI provider reliability + source recovery
| | |
|---|---|
| **Objective** | Provider failures stop being silent or self-amplifying; the six source-less functions are in git; Gemini restored or fallback decided. |
| **Systems** | `_shared/aiGateway.ts`, retry rules in the 8 gateway-migrated functions + `gemini-chat`; monitoring; function source export |
| **Files** | `supabase/functions/_shared/retryPolicy.ts` (new: `isRetryableStatus(status)` → false for 400/401/403/404, true for 408/429/5xx; honour `Retry-After`); apply in `novo-morning-brief`, `novo-cron-proactive`, `revision-planner`, `lesson-planner`, `roadmap-generator`, `study-pack-generator`, `gemini-vision`, `ai-question-gen`; `_shared/aiGateway.ts` (add `provider_health` helper); SQL view `ai_success_rate_24h` (new migration); `monitoring-check` (alert when any AI function has 0 successes in 24 h or success < 98%); export sources of `mistake-clustering`, `mock-paper-composer`, `nova-insights`, `pyq-bulk-ingest`, `pyq-embed-ingest`, `question-explain` into `supabase/functions/<name>/` (try `supabase functions download <name> --use-api`; fallback MCP `get_edge_function`) |
| **Acceptance** | A 403 is attempted **once** and logged with a distinct `error_message`; new view returns per-function 24 h success rate; alert fires in a synthetic test; all 6 sources are committed and byte-verified against deployed content; if P-1 done, ≥1 Gemini success logged. |
| **Automated tests** | Deno: `retryPolicy.test.ts` (status matrix, Retry-After); function-level tests for two retry loops (`novo-morning-brief`, `revision-planner`) asserting 403 ⇒ 1 attempt. |
| **Manual** | Trigger `novo-morning-brief` with a deliberately bad key in a scratch project/branch; observe 1 attempt. |
| **Production verification** | SQL: `select * from ai_success_rate_24h`. After P-1: one real `gemini-vision` or morning-brief call with `status='success'` in `ai_gateway_requests`. Diff each exported function against `get_edge_function` output. |
| **Rollback** | Redeploy previous function versions (Supabase keeps versions; commit SHAs recorded in the Day-2 note). View/migration is additive. |
| **Depends on** | P-1 (or D-2 decision) |
| **GO/NO-GO** | GO if (a) permanent-4xx no-retry proven by test, (b) 6 sources committed, (c) either Gemini success observed **or** D-2 approved with Claude fallback path staged in test. NO-GO → escalate: without a working fallback the ≥98 % AI gate (G7) is at risk. |

#### Day 3 — Schema truth: no UI reference to a nonexistent table
| | |
|---|---|
| **Objective** | Zero frontend `.from('x')` calls to tables that don't exist. Prevent recurrence in CI. |
| **Systems** | Migrations; frontend data access; CI |
| **Files** | `supabase/migrations/2026093000000*_v5_schema_truth.sql` (new; **(a)** `ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS score_pct numeric` — fixes F17; **(b)** create `ai_interactions(id, user_id, session_type, user_query, ai_response, subject, topic, class_num, thumbs, dwell_ms, created_at)` + RLS own-rows, per F10); `supabase/schema-manifest.json` (new; generated from production `information_schema` **including columns**); `scripts/check-schema-refs.mjs` (new; scans `src/**` for `.from('…')` and fails on unknown tables; **also** checks the literal object keys of `.insert({…})`/`.upsert({…})` against the table's columns — best-effort for object literals, which is exactly the F17 class; dynamic payloads are reported as "unchecked" rather than passed silently); `.github/workflows/ci.yml` (add step); references removed/guarded in `ConceptVideosPage`, `DoubtRoomPage`, `AIQuizBankPage`, `NCERTChaptersPage`, `OfflineModePage`, `lib/offlineStudy.ts` (those routes are FLAG OFF; for `NCERTChaptersPage` remove the `ncert_chapter_progress/questions` calls); `lib/syncQueue.ts` entries for missing tables **removed** (`xp_history`, `study_streaks`, `quiz_user_answers`) — interim, replaced by `record_answer` on Day 9 |
| **Acceptance** | `node scripts/check-schema-refs.mjs` exits 0 **and** is shown to fail on the original `score_pct` insert (run it against baseline commit `eaf42ab`); a completed legacy quiz now persists exactly one `quiz_sessions` row; CI fails when a fake reference is added; the 3 syncQueue entries no longer exist; `AIFeedback` thumbs persist (row visible in DB). |
| **Automated tests** | Vitest: schema-ref script against fixtures (missing table ⇒ failure). pgTAP: `ai_interactions` RLS (user A cannot read user B). |
| **Manual** | Thumb an AI answer in Novo → row appears; open each hidden route by URL → redirected/blocked (flags land Day 5; until then guarded with a static "unavailable" state). |
| **Production verification** | Apply migration to production via CLI; `select count(*) from ai_interactions` after a manual thumb; re-run `check-schema-refs` against a **fresh** production manifest. |
| **Rollback** | Migration is additive (leave table in place). Revert client commits. |
| **Depends on** | Day 1 baseline |
| **GO/NO-GO** | GO iff schema-ref check passes on both repo and freshly generated manifest. NO-GO if any primary-flow file still references a missing table. |

#### Day 4 — Silent data loss + mandatory exam target (Recovery Gate)
| | |
|---|---|
| **Objective** | No write can vanish without a trace; every learner has an exam target. |
| **Systems** | `SyncQueue`; auth guard; profile; onboarding component reuse |
| **Files** | `src/lib/syncQueue.ts` (check `.error` on every operation → throw; classify retryable vs permanent; **dead-letter store** instead of silent drop after 5; expose `getDeadLetters()`); `src/lib/syncQueue.test.ts` (extend); `src/pages/SetupExamPage.tsx` (new; exam chips + date; writes `profiles.exam_name/exam_date`); `src/App.tsx` (`AuthGuard`: profile without `exam_name` ⇒ `/setup-exam`, after consent); `src/pages/settings/AccountSettingsPage.tsx` (exam editable); **manual write-path audit** of every `SyncQueue` action and every primary-loop `.insert/.upsert` (quiz_session, xp_grant, topic_perf, lesson_complete, flashcard_review → `novo-insights update_sr` `[U]`), recorded in `docs/product/V5_WRITE_PATH_AUDIT.md` (new) |
| **Acceptance** | A queue entry whose insert returns `{error}` is **not** removed; permanent failures land in dead-letters and are shown in Profile → Sync issues (list only, Day 6 polish); a user with null `exam_name` cannot reach `/home` until they choose (including "Not sure yet" which stores `GENERAL` and shows a Home chip); existing 42 users are gated on next launch. |
| **Automated tests** | Vitest: syncQueue — error-returned-not-thrown case; 5-failure ⇒ dead-letter; idempotent replay. Playwright: fresh account → exam screen mandatory; existing null-exam account → redirected. |
| **Manual** | Airplane-mode answer a question, restore network, confirm flush; force a bad payload, confirm dead-letter entry. |
| **Production verification** | After release of the gate to a tester account: `select exam_name from profiles where id = …` non-null. (No mass update of existing users.) |
| **Rollback** | Flag `exam_gate_enforced` in `app_flags` is Day 5; until then revert commit. Dead-letter store is additive local storage. |
| **Depends on** | Day 3 (queue entries removed), D-6 (exam list) |
| **GO/NO-GO — RECOVERY GATE** | **GO to Phase 2 only if:** F1–F4, F13, F14, F17 each show test/query evidence; ≥98 % provider success or an approved fallback demonstrably serving; schema-ref CI green. **If Gemini/fallback is unresolved: proceed but mark G7 "at risk" and re-check Day 8 (hard stop Day 12).** |

### PHASE 2 — PRODUCT SIMPLIFICATION (Days 5–8)

#### Day 5 — Remote flags + navigation reshape
| | |
|---|---|
| **Objective** | Five-tab navigation; every non-loop feature hidden by a remote flag; native kill-switch exists. |
| **Systems** | Feature flags; nav; discovery surfaces |
| **Files** | `supabase/migrations/…_v5_app_flags.sql` (new; `app_flags(key pk, value jsonb, updated_at)` + read-only RLS for authenticated); `src/lib/featureFlags.ts` (new; defaults from the §6 matrix, overridden by remote row, cached with safe fallback); `src/components/guards/FeatureGate.tsx` (new); `src/App.tsx` (wrap FLAG-OFF routes; add `/practice`, `/review`, `/progress` placeholders → real screens later); `src/components/layout/TabBar.tsx` (Home·Novo·Practice·Progress·Profile; update `TabBar.test.tsx`); `src/pages/ToolsPage.tsx`, `LearningPage.tsx` (unlinked, kept), `src/lib/featureRegistry.ts`, `src/components/ui/CommandPalette.tsx`, `QuickStartFAB.tsx` (filter by flags) |
| **Acceptance** | Tab bar shows the 5 V5 tabs; every FLAG-OFF route redirects to `/home` with no error; command palette/FAB/registry list only allowed routes; flipping a flag row in the DB hides/shows a route within one app launch. |
| **Automated tests** | Vitest: flag defaults == §6 matrix (test reads the matrix constant); TabBar test; FeatureGate. Playwright `route-smoke.spec.ts` updated: hidden routes redirect, core routes render. |
| **Manual** | Device: walk every tab; try 10 hidden deep links. |
| **Production verification** | Migration applied; `select * from app_flags`; toggle `feature.battle` off/on in DB and observe app after relaunch (staging or a tester account). |
| **Rollback** | Set all V5 nav flags off → old routes still exist in code; revert TabBar commit for old nav. |
| **Depends on** | Day 3 (broken refs removed), matrix approved (D-4) |
| **GO/NO-GO** | GO if flag toggle demonstrably changes visibility without a rebuild. |

#### Day 6 — Onboarding + Login (first value in ≤ 3 steps)
| | |
|---|---|
| **Objective** | New user reaches a first meaningful action fast. |
| **Systems** | `OnboardingPage`, `LoginPage`, consent modal |
| **Files** | `src/pages/OnboardingPage.tsx` (7 → 3 steps: exam+date [reuse `SetupExamPage`] → level+subjects → language; mood & referral removed from the first run); `src/pages/auth/LoginPage.tsx` (Google primary, email secondary, OTP as a link; remove nested-border input); `src/components/consent/DPDPConsentModal.tsx` (single consent screen, inline in flow); e2e `onboarding.spec.ts` (new) |
| **Acceptance** | Fresh signup → consent → 3 steps → **lands on Home with a plan item** in ≤ 60 s on a mid-range device (measured on device Day 19, provisional here); onboarding is resumable after force-close; no step is skippable except language (defaults to device locale). |
| **Automated tests** | Playwright: full new-user path; kill/resume. Vitest: step validators. |
| **Manual** | 3 fresh accounts on device; time it. |
| **Production verification** | `analytics_events`: `signup_completed`, `dpdp_consent_given`, plus a new `onboarding_completed` event — funnel query. |
| **Rollback** | Flag `onboarding.v5`; old page remains in code. |
| **Depends on** | Day 4 (exam screen), Day 5 (flags) |
| **GO/NO-GO** | GO if a fresh account reaches Home unassisted with exam set. |

#### Day 7 — Today's plan engine + Home skeleton
| | |
|---|---|
| **Objective** | Home answers "What should I do next?" from real data. |
| **Systems** | SQL RPC; Home |
| **Files** | `supabase/migrations/…_v5_get_today_plan.sql` (new; per §4.2); `src/hooks/useTodayPlan.ts` (new; TanStack Query — first real `useQuery` use on a core screen); `src/pages/HomePage.tsx` → new `src/pages/home/HomeV5.tsx` (new) behind flag `home.v5`; `supabase/tests/database/get_today_plan.test.sql` (new; pgTAP tests live in `supabase/tests/database/` `[V]`) |
| **Acceptance** | RPC returns ≤3 items in the documented priority order for four seeded personas (no history / weak topic / due reviews / exam < 14 d); Home renders the first item as the primary card; RPC failure shows a safe static fallback (never a blank screen). |
| **Automated tests** | pgTAP persona fixtures; Vitest hook + component with mocked RPC; Playwright happy path. |
| **Manual** | Device: new user sees "5-question check"; seeded user sees review-due first. |
| **Production verification** | Run RPC as a test user via SQL editor (JWT claim simulation, rolled back) — same technique used in earlier audits. |
| **Rollback** | Flag `home.v5` off ⇒ legacy HomePage. RPC additive. |
| **Depends on** | Day 5, Day 6; **does not** depend on the Day 9 spine (empty-data path works) |
| **GO/NO-GO** | GO if all four persona outputs match the spec. |

#### Day 8 — Home complete + classification applied (Simplification Gate)
| | |
|---|---|
| **Objective** | Home is finished; nothing outside the loop is exposed; feature matrix enforced. |
| **Systems** | Home; discovery; remote flags; a11y basics |
| **Files** | `HomeV5.tsx` (header, Next-Action, ≤2 plan rows, exam chip, bell→`/novo-messages`); remove Home mounts of A/B variant cards, streak-freeze shop, focus overlays, social card, mission card (components stay in repo); `src/lib/i18n/uiStrings.ts` (new keys `home.*`, `en` + `hi` only); e2e `home.spec.ts` (new) |
| **Acceptance** | Home renders ≤ 5 visible blocks; initial Home JS (measured) ≤ current; every FLAG-OFF route unreachable from any UI; **Gate G8 test:** crawl of all in-app links finds none pointing at a FLAG-OFF route. |
| **Automated tests** | Playwright link-crawl asserting no navigation to hidden routes; Vitest snapshot of Home block count. |
| **Manual** | Device walk-through of all 5 tabs; TalkBack pass on Home. |
| **Production verification** | Flag table populated with §6 defaults; a relaunch on a tester device shows the same set. |
| **Rollback** | `home.v5` flag; per-route flags. |
| **Depends on** | Days 5–7 |
| **GO/NO-GO — SIMPLIFICATION GATE** | **GO to Novo only if:** Home answers the one question; link-crawl clean; onboarding ≤ 3 steps; no known P0 in these screens. Otherwise cut per §13 (never eat into Days 9–12 by more than 1 day). |

### PHASE 3 — NOVO (Days 9–12)

#### Day 9 — Learner-state spine
| | |
|---|---|
| **Objective** | One RPC records every answer, updates mastery, and files mistakes into Review. |
| **Systems** | Postgres; SyncQueue; RLS |
| **Files** | `supabase/migrations/…_v5_answer_events_and_record_answer.sql` (new; §4.1: `answer_events`, `record_answer`, `record_answers_batch`, `record_review`); `src/lib/syncQueue.ts` (`type:'answer'` action → RPC; error-checked); `src/lib/learnerState.ts` (new; thin client wrapper + idempotency key); `src/lib/adaptiveDifficulty.ts` (deprecate write path; keep read); `supabase/functions/tutoring-engine/index.ts` (route its mastery write through the RPC or leave and document — decide Day 9) ; pgTAP `supabase/tests/database/record_answer.test.sql` (new); RISK-034 note for any `SECURITY DEFINER` |
| **Acceptance** | Replaying the same idempotency key inserts one event; a wrong answer creates exactly one `sr_cards` row due tomorrow; mastery moves per rule; RLS blocks cross-user writes; legacy readers (`topic_stats`, `topic_performance`) update. |
| **Automated tests** | pgTAP: idempotency, wrong⇒card, right⇒no card, mastery math, cross-user denial, duplicate replay. Vitest: queue → RPC contract with error injection. |
| **Manual** | SQL: call the RPC as a test user (rolled back). |
| **Production verification** | Apply migration; run a synthetic rolled-back transaction proving all 5 tables change as specified (technique used in prior audits); confirm the live 4.0.0 client is unaffected (additive). |
| **Rollback** | Client falls back to queue-disabled; RPC/table additive and unused if client reverted. |
| **Depends on** | Day 4 (queue fixed), Day 3 |
| **GO/NO-GO** | GO iff pgTAP green and the rolled-back production proof shows all writes. **This is the single most critical-path artefact — NO-GO here halts Days 10–15.** |

#### Day 10 — Novo learner context (server)
| | |
|---|---|
| **Objective** | Novo receives a validated, budgeted `LearnerContext` built server-side. |
| **Systems** | `gemini-chat`; shared context builder; memory path diagnosis |
| **Files** | `supabase/functions/_shared/learnerContext.ts` (new; §5); `learnerContext.test.ts` (new; fixtures + truncation order + injection attempts); `supabase/functions/gemini-chat/index.ts` (accept `mode` + `focus`, validate against allow-list, inject `LEARNER STATE`); `src/lib/useGeminiStream.ts` (send `mode`/`focus`, never free-form context); diagnose `extractAndSaveMemories` (why 0 rows, F6) |
| **Acceptance** | Context ≤ 700 tokens in all fixtures; malicious `focus` (e.g. containing instructions) is rejected/sanitised; with seeded mastery/mistakes, Novo's system prompt contains them (asserted in test); root cause of empty `novo_memories` identified and either fixed or explicitly deferred with evidence. |
| **Automated tests** | Deno unit tests (context, truncation, sanitisation); a gemini-chat integration test with a fake provider capturing the prompt. |
| **Manual** | Send a chat with `mode=explain&focus=…` against staging/prod tester account; inspect logged prompt (dev-only debug log, not persisted). |
| **Production verification** | Deploy `gemini-chat` (prior version recorded); confirm a chat still succeeds (`ai_gateway_requests` success) and that the context length metric is sane. |
| **Rollback** | Redeploy previous `gemini-chat` version (v81 at time of writing `[V]`). `mode`/`focus` are optional ⇒ old clients unaffected. |
| **Depends on** | Day 9 (mistakes/mastery to read) |
| **GO/NO-GO** | GO if the prompt-capture test proves learner data reaches the model **and** old clients still work. |

#### Day 11 — Novo modes (UI + prompts)
| | |
|---|---|
| **Objective** | Explain · Solve · Practice · Plan exist end-to-end with deep-link entry. |
| **Systems** | Chat UI; prompt registry; inline quiz |
| **Files** | `src/pages/ChatPage.tsx` (mode chips; read `?mode=&focus=`; split out of the 1,364-line monolith only as far as needed); `src/components/chat/InlineQuizEmbed.tsx` (Practice mode; wire to `record_answer`); `supabase/functions/_shared/aiGateway.ts` (`registerPromptVersion` for `novo.mode.*` — first adoption); prompts seeded via migration or admin action; `gemini-chat/index.ts` (mode block via `getActivePrompt`, inline default fallback) |
| **Acceptance** | Each mode produces mode-appropriate behaviour in a scripted eval (5 cases/mode); Practice mode answers write `answer_events`; Home/Review/Practice deep-links open Novo with the right mode+focus; Solve refuses graded/mock question submissions per identity rule. |
| **Automated tests** | Vitest UI (mode chips, deep link parsing); extend `novo_eval_cases` with ≥ 20 learner-aware cases (5/mode) and run via `novo-eval-run`; Deno prompt-registry fallback test. |
| **Manual** | Device: run each mode; kill network mid-answer. |
| **Production verification** | `ai_prompt_versions` rows exist and are active; `ai_gateway_requests.prompt_key/version` populated on Novo calls. |
| **Rollback** | Deactivate prompt versions (registry rollback) ⇒ inline defaults; flag `novo.modes` off ⇒ classic chat. |
| **Depends on** | Day 10, Day 9 |
| **GO/NO-GO** | GO if eval pass-rate ≥ 80 % on the new cases **and** no regression on the existing 25 `novo_eval_cases` (baseline recorded Day 10). |

#### Day 12 — The adaptive loop, end-to-end (Novo Gate)
| | |
|---|---|
| **Objective** | Teach → test → evaluate → misconception → state update → different plan tomorrow, demonstrated on a device and in tests. |
| **Systems** | Novo Practice mode; misconception tagging; `get_today_plan`; Review |
| **Files** | `gemini-chat/index.ts` (evaluation turn returns `{correct, misconception_tag, next_step}`; tag optional, deterministic fallback); `src/components/chat/InlineQuizEmbed.tsx`; `src/lib/learnerState.ts`; e2e `adaptive-loop.spec.ts` (new) |
| **Acceptance** | Scripted persona: answers 3 questions on Topic X wrong ⇒ (a) mastery(X) decreases, (b) 3 `sr_cards` due next day, (c) `error_patterns` row/tag, (d) `get_today_plan()` now leads with review/Topic X, (e) next Novo Explain turn's context lists Topic X as weakest. **Each of (a)–(e) asserted by query/test, not observation.** |
| **Automated tests** | Playwright end-to-end (staging) + SQL assertions; Deno context test with the post-answer state. |
| **Manual** | Device: repeat with a real account; then advance the clock (server-side `next_review_date` override in staging) to prove tomorrow's plan differs. |
| **Production verification** | Same scenario with a test account on production, then delete/leave test data marked `is_test` (no PII) `[P]`. |
| **Rollback** | Flags `novo.modes`, `practice.record` (client stops calling RPC, Practice still works statelessly). |
| **Depends on** | Days 9–11 |
| **GO/NO-GO — NOVO GATE** | **GO only if (a)–(e) all pass.** If the LLM misconception tag is flaky: ship the deterministic fallback tag (§13 cut #1), do **not** slip. If (a)–(d) fail: STOP — Practice/Review cannot proceed meaningfully. |

### PHASE 4 — PRACTICE + REVIEW (Days 13–15)

#### Day 13 — Practice engine + Quick Practice
| | |
|---|---|
| **Objective** | One session engine and one question screen; Quick Practice live. |
| **Systems** | Practice hub; question source adapters; `ai-question-gen` |
| **Files** | `src/pages/practice/PracticeHubPage.tsx`, `PracticeSessionPage.tsx` (new); `src/components/practice/QuestionCard.tsx` (new; the Question screen); `src/lib/practice/sources/{pyq,ai,mock}.ts` + `QuestionSource` interface (new); `src/pages/QuizPage.tsx` becomes a **redirect** to Practice (logic reused only via adapter); `supabase/functions/ai-question-gen/index.ts` (verify contract; unchanged if sufficient) |
| **Acceptance** | Quick Practice: 5 questions from the learner's weakest topics (PYQ reviewed first, AI fill); every answer calls `record_answer` with an idempotency key; offline answering works; AI-generated questions are labelled and have a report button; session summary shows score + "N added to Review". |
| **Automated tests** | Vitest: session state machine (resume, skip, timer), adapter selection order; Playwright: complete a Quick Practice; airplane-mode test. |
| **Manual** | Device: 3 sessions incl. poor network; verify `answer_events` count = answers given. |
| **Production verification** | `select count(*) from answer_events where user_id = <tester>` equals answers; `ai_gateway_requests` shows `ai-question-gen` success. |
| **Rollback** | Flag `practice.v5` off ⇒ legacy QuizPage route restored. |
| **Depends on** | Days 9, 12 |
| **GO/NO-GO** | GO if a tester completes Quick Practice and DB counts reconcile exactly. |

#### Day 14 — Chapter Practice + PYQ practice
| | |
|---|---|
| **Objective** | Chapter Practice and PYQ are modes of the same engine. |
| **Systems** | Chapter picker; PYQ filters; Pro gating |
| **Files** | `src/pages/practice/ChapterPicker.tsx` (new; reads `ncert_chapters` by class/subject); `src/lib/practice/sources/pyq.ts` (filter exam/year/chapter, `is_reviewed = true AND is_active` only); `src/pages/PYQBankPage.tsx` (browse view retained, "Practice this set" → engine); `src/components/ui/ProGate.tsx` (per D-1) |
| **Acceptance** | Chapter Practice works for every class/subject in F8; when < 5 reviewed PYQs exist for a chapter the engine tops up with AI questions and labels them; **only reviewed PYQs are served** (CAT/BOARDS/UPSC hidden); Pro gate leads to `/pro` (G2). |
| **Automated tests** | Vitest: source top-up logic (0, 2, 5+ PYQs); adapter never returns `is_reviewed=false`. Playwright: chapter flow; Pro-gate → purchase. |
| **Manual** | Device: one chapter per class band (6–10, 11–12 PCB). |
| **Production verification** | Query proves no unreviewed row was served (`answer_events.source='pyq'` join `pyq_content.is_reviewed`). |
| **Rollback** | Flags `practice.chapter`, `practice.pyq`. |
| **Depends on** | Day 13, D-1 |
| **GO/NO-GO** | GO if unreviewed-content query returns 0 rows and AI top-up path works with the fallback provider chain. |

#### Day 15 — Mock Exam wiring + Review (Practice Gate)
| | |
|---|---|
| **Objective** | Mock Exam feeds the spine; Review is the destination for every mistake. |
| **Systems** | `MockTestPage`; Review screen; SM-2 |
| **Files** | `src/pages/MockTestPage.tsx` (on submit → `record_answers_batch`; **no other change to the exam engine or its recovery lib**); `src/pages/review/ReviewPage.tsx` (new; Due tab + Mistakes tab; grading → `record_review`); redirects for `/flashcard`, `/spaced-review`, `/journal`; `src/lib/spacedRepetition.ts` (reads only; SM-2 now server-side); e2e `review.spec.ts` (new) |
| **Acceptance** | Finishing a mock creates one `answer_events` row per question and `sr_cards` for each wrong one; Review shows them due next day (verified by clock shift in staging); grading a card updates interval per SM-2; interrupted mock recovery still works (existing `mockExamRecovery` tests green). |
| **Automated tests** | Existing `mockScoring`/`mockExamRecovery` tests untouched and green; pgTAP `record_review` (SM-2 table); Playwright: wrong answer → next-day review → correct grading. |
| **Manual** | Device: take a 10-question mock; kill app mid-way; resume; submit. |
| **Production verification** | `mock_test_attempts` row + matching `answer_events` batch; no duplicates on retry (idempotency). |
| **Rollback** | Flag `review.v5`; Mock batch-recording behind `practice.record`. |
| **Depends on** | Days 9, 13 |
| **GO/NO-GO — PRACTICE GATE** | **GO only if** Novo → Practice → Review works end-to-end (G6) on staging with DB assertions. If Mock wiring is unstable, ship Mock **unchanged** (records nothing) and log the exception (§13 cut #6). |

### PHASE 5 — DESIGN + PERFORMANCE (Days 16–17)

#### Day 16 — V5 design system on the loop screens
| | |
|---|---|
| **Objective** | Login, Onboarding, Home, Novo, Practice, Question, Review look and feel like one calm, premium product. |
| **Systems** | Tokens; shared components; a11y |
| **Files** | `src/styles/v5-tokens.css` (new; solid surfaces, one accent, type scale 12/14/16/20/28, spacing 4-pt); `src/components/v5/{Screen,Card,PrimaryButton,Chip,ListRow,EmptyState,ErrorState,Skeleton}.tsx` (new); apply to the 7 screens above; `eslint` rule/`scripts/check-v5-styles.mjs` (new; fail on hex literals and `linear-gradient` in `src/**/v5/**` and V5 pages, min font-size 12 px) |
| **Acceptance** | No hex/gradient/inline-style violations in V5 screens (script green); every V5 screen has loading, empty and error states; contrast ≥ 4.5:1 for text (checked with a script over token pairs); tap targets ≥ 48 dp; dark and light both supported. |
| **Automated tests** | Style-lint script; Vitest component tests for the shared components; Playwright visual snapshots for the 7 screens × light/dark (update baselines deliberately). |
| **Manual** | Device visual pass on the low-end phone; TalkBack focus order on Home & Question. |
| **Production verification** | n/a (client only). |
| **Rollback** | Flag `ui.v5`; old styles still shipped. |
| **Depends on** | Days 6–15 stable |
| **GO/NO-GO** | GO if style-lint is green and no screen regresses a Playwright functional test. |

#### Day 17 — Progress + Pro + Profile, performance, FREEZE
| | |
|---|---|
| **Objective** | Remaining three core screens done; performance budget met; **code freeze at 24:00**. |
| **Systems** | Progress; Pro; Profile; bundle |
| **Files** | `src/pages/progress/ProgressPage.tsx` (new; thin: exam countdown, mastery by subject from `subtopic_mastery`, ≤3 weak topics, streak, this-week question count; links to WeaknessRadar/ErrorPatterns); `ProSubscriptionPage.tsx` (token patch only); `ProfilePage.tsx` (trim menu to §7 list; add Sync issues); `vite.config.ts` manual chunks; lazy-load PostHog/Sentry after first paint; lazy KaTeX/highlight in Chat; verify `exceljs` is not on the startup path `[U]`; bump `package.json` → `5.0.0-rc.1`, `android/app/build.gradle` `versionCode` → 54 |
| **Acceptance** | Initial-load JS (gzip) ≤ **450 KB** (baseline ≈ 610 KB `[R]`; if not reachable, ≥ 20 % reduction is the gate); Progress works with zero and some data; Profile menu contains only V5 items; **freeze tag** `v5.0.0-rc.1` created. |
| **Automated tests** | Build-size check script in CI (fails > budget); Vitest Progress; Playwright Profile→sign-out→login. |
| **Manual** | Cold-start timing on the low-end device (record numbers). |
| **Production verification** | n/a; but run **all** Day 1–16 production verification queries again as a regression sweep and paste results. |
| **Rollback** | Flags; previous tag `v5.0.0-beta` (tag created end of Day 15). |
| **Depends on** | Days 13–16 |
| **GO/NO-GO — FREEZE GATE** | **GO to War Room only if** all release gates G1–G9 (§12) are *either* met *or* explicitly listed with owner and a Day-18 fix plan (P0 gates may not be listed — they must be met). After 24:00 only P0 fixes with a written reason. |

### PHASE 6 — RELEASE WAR ROOM (Days 18–20) — *no new features*

#### Day 18 — Internal testing: full journey, automated + first device
| | |
|---|---|
| **Objective** | Prove the required journey end-to-end. |
| **Systems** | Playwright staging suite; internal-testing AAB; AI success-rate measurement |
| **Files** | `e2e/authenticated/full-journey.spec.ts` (new: Fresh install → Signup → Consent → Exam setup → Home → Novo → Practice → Answer → Review → Progress → Pro → Logout → Login); CI job `e2e-staging` extended; signed AAB `v5.0.0-rc.1` (versionCode 54) uploaded to **Internal testing** |
| **Acceptance** | Journey passes automatically on staging **and** manually on device 1; bug log created with severity; **≥ 98 % AI success over the last 24 h** measured from `ai_gateway_requests` (formula and query recorded in the report); no P0 open. |
| **Automated tests** | The journey spec; full unit/Deno/pgTAP suites; schema-ref check; style-lint; size budget. |
| **Manual** | Device 1: full journey twice; note every hesitation/confusion (usability log). |
| **Production verification** | Production DB still additive-compatible with the live 4.0.0 app: run the 4.0.0 e2e smoke against production `[P]`. |
| **Rollback** | Do not promote the build; keep 4.0.0 live. |
| **Depends on** | Day 17 freeze; P-3, P-5, P-6 |
| **GO/NO-GO** | GO if the journey is green and P0 = 0. Any P0 ⇒ Day 19 is a fix day for P0 only, closed test still starts. |

#### Day 19 — Real devices, poor network, returning user
| | |
|---|---|
| **Objective** | Validate on hardware in bad conditions; prove adaptivity for a returning user. |
| **Systems** | Devices; network shaping; closed testing |
| **Files** | none new (P0 fixes only); test log `docs/product/V5_TEST_LOG.md` (new) |
| **Acceptance** | On the low-end device: cold start, journey, and Quick Practice complete on **throttled 3G** and with **airplane mode mid-answer** (no lost answers: `answer_events` reconciles); returning-user test: after answering wrongly on Day N, Day N+1 (clock-shifted in staging or a real next-day tester) Home leads with review and Novo's context reflects it; app kill during Mock and during onboarding recovers; Pro purchase + restore on device (needs P-4); **closed-testing track** receives the build. |
| **Automated tests** | Re-run full suite on the final commit. |
| **Manual** | Structured scripts: 6 scenarios × 2 devices, logged with pass/fail/evidence (screenshots or logcat). |
| **Production verification** | Reconcile counts (`answer_events`, `sr_cards`, `profiles.exam_name`) for all tester accounts; ai success rate re-measured. |
| **Rollback** | Halt the closed test; server flags off. |
| **Depends on** | Day 18 |
| **GO/NO-GO** | GO if no P0/P1 open in the primary loop and the 6 scenarios pass. Otherwise: fix only P0, extend the closed test, **do not** ship Day 20 to 100 %. |

#### Day 20 — Release decision and procedure
| | |
|---|---|
| **Objective** | Ship (or consciously hold) with a rollback ready. |
| **Systems** | Play Console; flags; monitoring |
| **Files** | `docs/product/V5_RELEASE_REPORT.md` (new; gate-by-gate evidence table); tag `v5.0.0`; merge decision **left to the founder** (the brief forbids merging `main` in this task) |
| **Acceptance** | Every gate G1–G9 has an evidence entry; go/no-go recorded by the founder; if GO: **staged rollout 5 % → 20 % → 50 % → 100 %** with halt criteria (crash-free sessions < 99 %, ANR > 0.5 %, AI success < 98 %, purchase failure > 5 %, any data-loss report); rollback = halt rollout + flip flags + (server) redeploy previous functions. |
| **Automated tests** | Final full-suite run recorded. |
| **Manual** | Smoke on the production build from Play. |
| **Production verification** | First-hour monitoring queries (signups, `answer_events`, `ai_success_rate_24h`, `edge_function_errors`, Sentry) at T+1h, T+4h, T+24h. |
| **Rollback** | As above; Play "halt rollout" + previous release remains available. |
| **Depends on** | Day 19; P-2 outcome |
| **GO/NO-GO** | GO only if all P0 gates are met with evidence. **If P-2's closed-test rule applies and 14 days have not elapsed, Day 20 delivers a *closed-track* V5, not public production — that is a platform constraint, not an engineering failure.** |

---

## 9. Critical path

`P-1/D-2 (provider) → D1 /pro → D3 schema truth → D4 sync fix + exam gate → D9 record_answer spine → D10 learner context → D11 modes → D12 adaptive loop → D13 Practice engine → D15 Mock+Review → D17 freeze → D18 journey → D19 devices → D20 release`

**Parallelisable (off the critical path):** D5–D8 (nav/onboarding/Home) can run alongside D2–D4 once D3 lands; D8 Home depends on the plan RPC (D7), not on the spine. D16 design system can start on finished screens during D15.
**Slack:** ≈ 0 days between D9 and D15. The plan has **no schedule slack** in the middle; slack exists only if §13 cuts are taken early.
**External critical path:** P-2 (Play closed-test rule) is independent of code and is the single largest unknown.

---

## 10. Scope-cut order (if the schedule slips) — Days 18–20 are never cut

Trigger: any phase gate misses by ≥ 1 day, or cumulative slip ≥ 2 days by end of Day 12. Cut in this order, one at a time, stopping when the schedule recovers:

1. **LLM misconception tagging → rule-based tag** (`"<topic> — concept gap"`). Loop still updates state and plan.
2. **Chapter Practice → filter inside Quick Practice** (drop the separate picker screen).
3. **Visual system depth:** apply V5 tokens to Login, Onboarding, Home, Novo, Question, Review only; Progress/Pro/Profile get a token patch, not a rebuild.
4. **Progress → thin** (countdown + weak topics + streak; no per-subject breakdown).
5. **Novo "Plan" mode → a read-only plan card** (no swap/skip).
6. **Mock Exam ships unchanged** (does not call the spine); log as a known gap.
7. **PYQ practice → browse-only** (no session mode); Practice hub shows 3 cards.
8. **Poor-network matrix 6 → 3 scenarios** (airplane mid-answer, throttled 3G, app-kill).
9. **Onboarding language step → device-locale default.**
10. **Hindi strings for Home** dropped (English only).

**Never cut:** `/pro` fix · provider reliability & alerting · schema-truth CI guard · sync error-checking/dead-letter · mandatory exam target · `record_answer` + automatic Review filing · Home "what next" · the Day 18–20 protocol · the ≥98 % AI success measurement.

**Freeze rule:** no new code after Day 17 24:00. Days 18–20 accept only P0 fixes with (a) a failing test/log reproducing it and (b) a same-day re-test of the affected journey step.

---

## 11. Risk register

| ID | Risk | L | I | Early signal | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | **Play "closed test ≥ N testers × 14 days" rule applies** and isn't started Day 1 | M `[U]` | Critical | P-2 unanswered by Day 1 | Ask Day 0; start closed test with 4.0.0 on Day 1; V5 ships to closed track if needed | Founder |
| R2 | Gemini key not restored → ≥ 98 % AI gate fails, retrieval/vision degraded | H | High | Day 2: zero Gemini successes | D-2 Claude fallback tier; deterministic spine keeps loop alive | Founder / me |
| R3 | Spine (Day 9) slips or RLS blocks user-invoked writes to mastery/cards | M | Critical | pgTAP cross-table write fails | Use narrowly-scoped SECURITY DEFINER with pinned `search_path`; add to definer review | Me |
| R4 | Question supply too thin: 322 reviewed PYQs; non-JEE/NEET learners get AI-only questions of unreviewed quality | H | High | Users report wrong answers | Label AI questions; report button; `ai-question-gen` validation + quality flags; hide unreviewed PYQs; consider founder review of top chapters post-V5 | Me / Founder |
| R5 | Adaptive loop judged "not really adaptive" (rule too weak) | M | High | Day 12 tests pass but feels flat | Deterministic rules are testable and explainable; show "why this plan" line on Home | Me |
| R6 | No hot-fix path after native release | H | High | Post-release P1 | Remote `app_flags` kill-switches (Day 5); staged rollout with halt criteria; server-side fixes | Me |
| R7 | Solo-reviewer/bus factor: all code + all testing by one human + me | H | High | Fatigue, missed regressions | Automated gates; freeze rule; explicit evidence table; no unreviewed P0 merge | Founder |
| R8 | Real-device access/time (P-3) is late or only one device | M | High | No device on Day 5 | Emulator for smoke, but G-android requires hardware — block Day 19 sign-off otherwise | Founder |
| R9 | RevenueCat/Play products not ready (P-4) | M | High | Day 1 sandbox purchase fails | UI verified without purchase; mark purchase `NOT VERIFIED` and hold G2 | Founder |
| R10 | Production DB shared with live 4.0.0 app → a V5 migration breaks it | L | Critical | 4.0.0 e2e smoke fails | Expand-only migrations; run 4.0.0 smoke after each migration | Me |
| R11 | Consent gate (40 % pass) suppresses activation regardless of UX | M | Med | Onboarding funnel drop at consent | Merge consent into onboarding flow (Day 6); measure `dpdp_consent_given` funnel | Me |
| R12 | Bundle budget unreachable (analytics/Sentry/KaTeX/chat are heavy) | M | Med | Day 17 build-size check | Lazy-load; accept ≥ 20 % reduction as the gate | Me |
| R13 | Existing 42 users hit the exam gate en masse on next launch | L | Low | Support noise | Copy explains why; "Not sure yet" option | Me |
| R14 | Scope creep from PM/ChatGPT mid-sprint | H | High | New asks after Day 4 | Change control: anything new replaces an item of equal size or is refused | Founder |
| R15 | Staging environment schema drift → e2e green on staging, red on prod | M | High | Day 18 prod smoke fails | Regenerate schema manifest from prod each day; run journey on prod tester accounts too | Me |
| R16 | Groq free-tier rate limits (429) under tester load | M | Med | 429 bursts | Existing small-model fallback + provider fallback; global RPM budget env | Me |
| R17 | Unverified assumptions in this plan turn out false (all `[U]` items) | M | Var | See §13 verification list | Each `[U]` has a named day where it is checked | Me |

---

## 12. Release gates (mandatory) and how each is *proved*

| Gate | Requirement | Evidence that counts | Checked |
|---|---|---|---|
| G1 | Zero known P0 in the primary learning loop | Bug log: 0 open P0; full-journey spec green | D17, D18, D20 |
| G2 | 100 % of Pro gates reach a functional purchase screen | Playwright over every `ProGate`/`navigate('/pro')` site; device purchase in sandbox | D1, D14, D19 |
| G3 | Zero UI references to nonexistent production tables | `check-schema-refs` green vs a manifest generated from prod **that day** | D3, D17, D18 |
| G4 | Zero known silent data-loss path | syncQueue tests (error-returned, dead-letter), answer-count reconciliation on device, code review of every `SyncQueue.enqueue` site; **a completed legacy quiz leaves 1 `quiz_sessions` row (F17)**; column-level schema check green | D3, D4, D13, D19 |
| G5 | Every new learner captures an exam target | Playwright fresh-user; `profiles.exam_name IS NOT NULL` for all V5-created test accounts | D4, D6, D19 |
| G6 | Novo → Practice → Review works end-to-end | Adaptive-loop e2e with (a)–(e) DB assertions | D12, D15, D18 |
| G7 | ≥ 98 % AI success during release validation | `ai_success_rate_24h` over the validation window; **denominator and window recorded**; provider 4xx (our fault) counted as failures | D2, D18, D19, D20 |
| G8 | No unfinished feature exposed in primary navigation | Link-crawl finds no FLAG-OFF route; tab bar = 5 tabs | D8, D17 |
| G9 | Android release build verified | Signed AAB installs and passes journey on ≥ 2 real devices (P-3); release-build CI job green | D18, D19 |

**Not gates but tracked:** initial JS ≤ 450 KB gzip (or −20 %); TalkBack pass on Home/Question; crash-free sessions in closed test.

---

## 13. `[U]` items and where each is resolved

| Unverified assumption | Resolved |
|---|---|
| Whether Google's closed-test rule applies to this account | Day 0 / Day 1 (P-2) |
| User-invoked RLS path can write `subtopic_mastery`/`sr_cards`/`error_patterns` | Day 9 |
| Why `novo_memories` is empty despite 84 chats | Day 10 |
| `exceljs` (938 KB) is not on the startup path | Day 17 |
| `novo-daily-session` reuse for plan items | Day 7 |
| Staging project schema parity with production | Day 3 (manifest diff) |
| RevenueCat webhook → `novo-subscription` works in production | Day 1 (sandbox purchase, needs P-4) |
| Keystore/signing availability | Day 5 (P-6) |
| Whether unreviewed-question labelling is acceptable to founder (D-3/D-1) | Day 4 |

---

## 14. Founder decisions needed

| ID | Decision | Default I will assume if silent | Needed by |
|---|---|---|---|
| D-1 | Free vs Pro matrix (§6) | As proposed in §6 | Day 1 |
| D-2 | Fallback provider if Gemini can't be restored | Enable Claude as **fallback tier only**; Groq stays primary | Day 1 |
| D-3 | AI-generated questions are served (labelled, reportable) without human review | Yes, labelled; PYQs limited to reviewed rows | Day 4 |
| D-4 | Battle leaves the tab bar (→ Practice → Compete) | Yes | Day 4 |
| D-5 | V5 visual direction supersedes `DESIGN.md` (calm, solid, no gradients); default follows system light/dark | Yes | Day 4 |
| D-6 | Onboarding exam list: JEE Main · JEE Advanced · NEET · CBSE Class 10 · CBSE Class 12 · UPSC · CAT · Other/Not sure yet | As listed | Day 4 |

---

## 15. Definition of Done for V5

V5 is **done** only when *all* are true, each with evidence in `V5_RELEASE_REPORT.md`:
1. Gates G1–G9 met (or a P1/P2 gate consciously waived in writing by the founder — **P0 gates cannot be waived**).
2. The full journey (*Fresh install → Signup → Consent → Exam setup → Home → Novo → Practice → Answer → Review → Progress → Pro → Logout → Login*) passes automatically **and** on ≥ 2 real Android devices, including poor-network and returning-user scenarios.
3. All unit, Deno, pgTAP, Playwright, schema-ref, style-lint and size-budget checks are green on the release commit.
4. Every `[U]` in §13 is resolved or explicitly carried as a documented risk.
5. Remote flags can disable every FLAG-OFF/SECONDARY surface without a client build; rollback procedure has been **exercised once**, not just written.
6. The release report distinguishes *verified* from *assumed* for every claim.
7. `release/5.0.0-landmark` is tagged; `main` is untouched until the founder merges.

---

## 16. Honest assessment

**Verdict: REVISE.**

*Executable in 20 days:* the **Tier-1 V5** — deterministic core loop (exam gate → today's plan → Novo with learner context → Quick/Chapter/PYQ practice → automatic Review → recomputed plan), recovery fixes, five-tab navigation, calm styling on the loop screens, and a protected 3-day war room.

*Not executable at full depth in 20 days, as literally specified:* all of the following at once — polished redesign of ten screens **and** four practice modes **and** LLM-driven misconception analysis **and** verified Play-store purchase **and** real-device poor-network validation. Days 9–15 hold the heaviest engineering with essentially zero slack (§9), and two dependencies are outside engineering control (Gemini/billing, Play closed-test rule). The plan above already embeds the revision: §10 pre-approves the cuts.

*What would change my verdict:* to **GO** — P-1/P-2/P-3/P-4 resolved by Day 1 and D-2 approved. To **NOT EXECUTABLE** — the Play closed-test rule applies and isn't started on Day 1 (public production would then be impossible inside 20 days), or the Day 9 spine cannot be made to work under RLS.

**Top five schedule risks:** (1) Play closed-test rule (R1) · (2) Gemini/provider restoration and the ≥ 98 % gate (R2) · (3) Day 9 spine correctness under RLS with zero slack after it (R3) · (4) thin/unreviewed question supply undermining Practice quality (R4) · (5) single-person testing capacity and device availability for Days 18–19 (R7/R8).

---

## 17. Route-coverage validation

**Result (executed 2026-09-25 against `src/App.tsx` at baseline `eaf42ab`):** 99 routes found; 99 appear in §6; 0 unclassified; 0 classified twice; the 5 V5 additions (`/practice`, `/practice/session`, `/review`, `/progress`, `/setup-exam`) are present. Method: extract every `<Route path="…">`, require each to appear once in the first column of a §6 row. This checks *coverage of the table*, not the correctness of each disposition, which is a product judgement the founder/PM should review.

