# EDORA V5 — DAY 5 + DAY 6 PRODUCT REPORT

Branch `release/5.0.0-landmark` · starting SHA `af074a6fc4bd13becb37e28fb205777875aca39b` (fast-forwarded, worktree clean) · final SHA: see `git log -1`.
Production changes: **NONE** (read-only queries only). Day 7 not started. `new_home_enabled` stays false.

## Day 5 — product-facing
**Navigation.** Bottom nav is now exactly Home · Novo · Practice · Progress · Profile (`TabBar.tsx`, solid/calm, no glow, 56 px targets). Battle and Learn tabs removed. New `/practice` and `/progress` shells (`PracticePage`, `ProgressPage`) index existing core screens; Day 7+ replaces their content.
**Routes hidden vs retained.** No route was deleted. Discovery is now an allowlist (`lib/routeVisibility.ts` `CORE_ENTRY_PATHS`): command palette/search, hubs and the QuickStart button only offer core destinations. Removed from discovery (still reachable by direct link so existing "back" links to `/tools` and `/learning` never dead-end): Battle, Boss Fight, Tournament, Streak challenges, Leaderboard, social/study-rooms, AR/whiteboard/reels/story/debate, admin/eval/diagnostics, Tools/Learning hubs and the other non-loop tools. Registry links that pointed at non-existent routes (`/pyq`, `/mistake-journal`) were corrected. Home's war-room banner went to `/battle`; it now goes to `/exam-war-room`.
**Flag wiring** (client only; backend/SDK untouched). `AppFlagsProvider` loads `getAppFlags()` at start and on resume; `GatedOutlet` in the app shell enforces flags for every route, including deep links:
- `battle_enabled=false` -> Battle routes redirect to /home (default false).
- `pyq_enabled=false` -> `/pyq-bank` redirects; hidden in hubs/search.
- `pro_enabled=false` -> `/pro` redirects; every "Upgrade" CTA (ProGate card + sheet, Chat limit banner + sheet, Mock, Analytics) is hidden.
- `novo_enabled=false` -> `/chat` shows a calm "Novo is taking a short break" screen with links to Practice / Home.
- `ai_generation_enabled=false` -> generation screens (`/quiz`, `/ai-quiz`, `/study-pack`, `/roadmap`, `/lesson-plan`, `/planner`, `/photo-solver`, `/mnemonics`, `/exam-prediction`) show a paused state; the QuickStart button is hidden.
- `new_home_enabled` -> no consumer yet (V5 Home not built); default false.
- Unknown flag -> false. Config/network failure -> SDK defaults (battle/new_home false; novo/pyq/pro/ai true, as the frozen SDK defines).
**Android Back.** One app-wide listener (`useAndroidBack`, mounted at the router root so it also covers /login and /onboarding) replaces the AppShell one and StudyRoomPage's competing listener. `lib/backStack.ts`: priority registry (overlay 90 > modal 80 > sheet 70 > in-page step 60); the top handler consumes Back, nothing else fires. Registered: CommandPalette, SessionEndRitual, StreakFreezeShop, PermissionRationale, ProGate sheet, PersonalitySheet, NovoMemoryPanel, AchievementCardModal, StudyRoom leave, onboarding step. No overlay -> Home exits (minimise); other tabs -> Home; nested route -> previous screen if there is history, else Home (never a blank/legacy dead end).

## Day 6 — onboarding + exam target
**Production finding that shaped this.** `profiles` has **no** `onboarding_completed` and **no** `subjects` column (verified). The old onboarding wrote both, so PostgREST rejected the whole update and the result was never checked — onboarding data was never saved; and because a profile row is created at signup, new users skipped onboarding entirely. All 42 profiles have `exam_name` NULL (pre-migration). The new flow writes only existing columns (`study_level`, `preferred_language`, `exam_name`, `exam_date`) and stores subjects + a completion marker in the existing `study_preferences` jsonb (merged, not replaced).
**Flow.** 3 steps, no AI: (1) exam — approved list JEE Main · JEE Advanced · NEET · CBSE Class 10 · CBSE Class 12 · UPSC · CAT · Not sure yet/general study (+ optional date for specific exams); (2) level + subjects; (3) language (text states screens are English/हिन्दी, Novo explains in more). Mood and referral steps were dropped (referral remains at `/referral`). "Skip for now" always available (GENERAL + defaults). Solid design, >=48 px targets, keyboard-safe scroll layout, `100dvh`.
**Recovery/resume.** Every change is saved to a per-user local draft; a killed app resumes at the last step with answers. A failed profile save keeps all answers, shows an alert + "Try again", never navigates, never marks completion; success clears the draft and refetches the profile.
**Who sees onboarding.** Only an account created < 24 h ago without the V5 marker (`needsOnboarding`). Existing learners are never forced.
**GENERAL / exam target.** `lib/examTargets.ts`: `resolveExamName` (NULL/blank -> GENERAL, legacy labels mapped), `isGeneralExam`, `examDisplayName`, `normaliseExamDate`. Existing learners on GENERAL/NULL get a dismissible, 7-day-snoozed nudge on Practice and Progress and `/setup-exam` (change exam any time). Account Settings now saves `resolveExamName(...)` instead of null.

## Tests / gates (final tree, run sequentially)
- `npm run type-check`: pass · `npm run lint`: 0 errors (7 warnings; none in files added here) · `npm test`: 29 files / 234 tests pass (was 20 / 135) · `npm run build`: OK · `node scripts/schema/check_schema_references.js`: PASSED.
- New tests: examTargets, onboardingState, backStack, routeVisibility (incl. static "no dead-end routes": every tab/hub/registry target exists in App.tsx; `/pro`, `/setup-exam`, `/practice`, `/progress` exist), FeatureGate/GatedOutlet (all six flags + defaults), OnboardingPage (path, skip, failed-save retry, resume, Back, date field, targets), useAndroidBack, ExamTargetNudge, TabBar (5 tabs, no Battle). `proRoute.test.ts` allowlist updated for `routeVisibility.ts` (a flag rule, not a navigation).

## Known limitations / not verified
- **No device/emulator validation.** Android Back is unit-tested (mocked Capacitor) only; nothing was run on a phone. No Playwright run, no screenshots; the visual result is unseen.
- Back handlers are not registered for every overlay (SpacedReviewInterrupt, EmotionalCheckIn, QuickStart sheet, LanguageSelector, Voice/Focus overlays, DPDP modal, tour); Back over those uses route logic. No "confirm exit" on an in-progress practice session yet.
- `ai_generation_enabled` is enforced at route level and on QuickStart; in-page generate buttons on non-gated screens (e.g. inside Chat/Flashcards) are not individually gated.
- Onboarding gating is client-side (created < 24 h + marker); a user who signed up before this build ships is not gated. Home still reads `exam_name ?? 'Your Exam'`.
- Whether `get_app_flags` / the exam-normalisation migration are applied in production is unverified (Antigravity's migrations). With them unapplied the client uses defaults and NULL is handled client-side.
- Copy issue not fixed: several Pro screens say "From ₹58/month" while the real monthly price is ₹99.
- ToolsPage/LearningPage remain as unlinked routes (existing back links).
