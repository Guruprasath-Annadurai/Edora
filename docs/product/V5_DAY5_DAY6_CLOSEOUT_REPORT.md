# EDORA V5 — DAY 5 + DAY 6 FINAL CLOSEOUT REPORT

Starting SHA `8dc8f558bd1f369c146406d4a1b9641dd399045a` · final SHA: see `git log -1`. Production changes: **NONE**. Day 7 not started.

## 1. AI-generation flag — all in-page bypasses closed
Enforced at the client's single Edge-Function choke point (`lib/aiGeneration.ts`, installed on the shared supabase client): with `ai_generation_enabled=false`, `supabase.functions.invoke()` to any of 23 AI generation functions returns `{data:null, error:AiGenerationPausedError}` **before any network request**. This covers Chat, Flashcards, Home cards, Scanner, Concept-of-day, Daily session, Tutoring, Story/Debate/Boss, Curriculum builder, certifications, etc. without editing ~110 call sites. The flag value is pushed from the existing `AppFlagsProvider` (no second flag system). Not blocked: memory, subscription, push, analytics, sync (deterministic).
UI: Flashcards "Generate 5 Cards" is disabled with a calm status line ("AI generation is temporarily paused. Your saved practice and review still work."; manual card creation unaffected). Chat quiz-intent and snap-solve reply with that same message in the thread and make no request. `geminiCall`/`geminiJSON` rethrow the paused error immediately (no retry storm).
Scope decision: the Novo conversation stream is governed by `novo_enabled`, not by this flag.
Tests: `aiGeneration.test.ts` (every generation function refused with zero calls to the underlying invoke; flag on restores; non-AI functions never blocked), `gemini.paused.test.ts`, `FlashcardPage.aigen.test.tsx` (real page: false -> disabled + message + no geminiJSON/invoke/insert; true -> runs), `ChatPage.aigen.test.ts` (static wiring; ChatPage is not rendered in a unit test).

## 2. Android Back overlay coverage
Registered with the central `backStack` (no private Capacitor listeners; a test asserts the only `backButton` listener is `useMobileHardware`): SpacedReviewInterrupt, EmotionalCheckIn (Back = skip), QuickStartFAB sheet, LanguageSelector + LanguageSwitcher, VoiceStudyOverlay, FocusModeOverlay, SpeedReaderOverlay, StudyBreakPlayer (an *enforced* break swallows Back without closing), DPDP consent (mandatory: Back swallowed, app minimised on Android, nothing navigates underneath), OnboardingTour (Back = skip), plus the 10 registered in the previous patch. Priority unchanged: overlay > modal > sheet > in-page step > route.
**Practice/Quiz exit rule** (`lib/quizExit.ts`, `QuizPage`): the quiz already saves a resumable draft at start and after every answered question. Back between questions returns to setup and now re-loads that draft so "Resume" is offered immediately (previously only read on mount, so a mid-quiz exit looked like the quiz vanished). Back after choosing an option on the current question (the only unsaved work) opens a "Leave this quiz?" confirmation (Keep going / Leave); Back on that sheet closes it. The in-page back arrow follows the same rule. Setup/loading/result fall through to normal route navigation. Tests: `quizExit.test.ts`, `QuizPage.exit.test.tsx` (real page, 6 cases), `overlaysBack.test.tsx` (7 behavioural + 22 static).

## 3. Onboarding cohort rule (fixed cutoff, no rolling window)
`needsOnboarding` no longer uses `now - created_at < 24h`. `V5_ONBOARDING_COHORT_CUTOFF_ISO = 2026-09-27T00:00:00Z` (after every existing learner: production had 42 profiles, newest 2026-08-31). Created before the cutoff => never forced (GENERAL/NULL get the exam nudge). Created at/after with no `study_preferences.onboarding_completed_at` => sent to onboarding whenever they return (2 h, 3 days, 3 weeks: tested; decision independent of the current time). Missing/invalid `created_at` or no profile => never forced (documented safe default). **Release-gate action:** set the constant to the V5 release date (must be <= the day the build reaches users). No migration.

## 4. GENERAL display
All student-facing exam labels use `examDisplayName` -> "General study" for NULL/blank/GENERAL: Home hero + war-room banner, Chat empty state, Revision planner, Sleep review, Exam war room, Mock postmortem (previously fell back to "Your Exam"/"Exam"/"JEE"). Prefill inputs (Roadmap, Account Settings) show empty rather than the sentinel "GENERAL". Test: `examLabels.test.ts` (helper + static "no raw fallback strings remain").

## 5. Pro copy
`lib/proPricing.ts` is the copy source: footers now say "₹99/month or ₹699/year · Cancel anytime" (ProGate card + sheet, Chat limit sheet). The annual plan's sub-label is "per year · about ₹58/month on the annual plan" (explicitly an annual-plan equivalent); "Save 41%" is computed. No RevenueCat/purchase/server changes. `proPricing.test.ts` fails if copy drifts from `iap.ts` prices or `novo-subscription` amounts (9900/69900 paise), if "From ₹58/month" reappears, or if ₹58 appears outside the labelled annual copy. Note: `experiments.getPricingConfig()` still returns unused ₹149/₹799/₹1199 values that do not match the live plans (dead, not displayed; not changed here).

## 6. Device / emulator
No Android device/emulator available (`adb` and `emulator` not installed/on PATH; SDK has no platform-tools). Not set up. **ANDROID DEVICE VALIDATION = DEFERRED TO RELEASE GATE** (mandatory for Days 18–19). Nothing here was run on hardware; Back behaviour is unit-tested with mocked Capacitor and real components in jsdom only.

## Gates (final tree, sequential)
type-check pass · lint 0 errors (7 pre-existing warnings, none in this patch's files) · `npm test` 38 files / 299 tests pass (was 29 / 234) · build OK · `check_schema_references.js` PASSED.

## Known remaining limitations
- No device validation (above). Overlays not covered: any ad-hoc modal not built from the listed components.
- `ai_generation_enabled` covers generation Edge Functions; pure client-side generators (none found) or a newly added function must be added to `GENERATION_FUNCTIONS` (a test enumerates the audited set, it cannot discover new functions).
- The leave-quiz confirmation protects the current unanswered/unsaved selection only; earlier answers rely on the existing local + auth-metadata draft.
- Onboarding gating is client-side (marker in `study_preferences`); cutoff constant must be set at release.
- Unverified: whether the exam-normalisation migration and `get_app_flags` are live in production.

## Production changes
NONE.
