# Edora v3 Redesign Plan — Corporate/Professional UI

**Goal:** Move Edora from its current mascot/gamified visual language to a
corporate-grade, professional design system — dark + light theme, no vector
character illustrations, no emojis, monoline icons only. Applies from splash
screen through every page.

**Status:** Planning. First concrete step done — vector character removed
from the login screen (see Phase 1 below).

---

## Why a plan, not a page-by-page rewrite

There are ~90 page components in this app. Redesigning them one at a time
without a locked system first means redoing earlier pages once the system
settles — this already happened once this session (the v2 pass left ~18
pages "pending" because the token/spacing decisions kept shifting mid-pass).

The sequence below locks the system first (Phase 0), then works outward from
the highest-traffic, highest-first-impression screens to the long tail.

---

## Phase 0 — Design system foundation (audit + close gaps)

**Correction from the original plan:** a complete, production-ready light
theme already exists — `src/contexts/ThemeContext.tsx` defines 8 full themes
(`default`, `light`, `oled`, `blue`, `green`, `red`, `gold`, `midnight`,
`sakura`) as CSS custom-property maps, swapped at runtime via
`data-theme` on `<html>`, including a correct dark-slate ink-token inversion
for light mode. This is NOT a gap. The real Phase 0 work is auditing which
pages bypass this token system with hardcoded inline hex/rgba colors (like
`LoginPage.tsx`'s old `BG`/`DARK`/`GRAY` consts) and would render broken or
inconsistent under the `light`/`oled`/other theme variants.

- **Color tokens** — already exist and are complete (see correction above).
  Work item: audit + migrate pages with hardcoded inline colors onto the
  existing `--v2-*` / `--ink-*` / `--surface-*` tokens.
- **Semantic tokens** — success/warning/error/info already defined per theme
  (`--v2-success`, `--v2-error`, `--v2-warning`, `--v2-info`) — reuse, don't
  redefine.
- **Typography scale** — heading font (geometric sans) + body font
  (humanist sans), display/h1/h2/h3/body-large/body/caption/label sizes.
- **Iconography** — already monoline (lucide-react) — keep, just audit for
  any remaining filled/duotone icons that snuck in.
- **Illustration policy** — no vector character illustrations, no emojis,
  anywhere. Abstract geometric shapes / line-art only for empty states.
  (NovoAvatar's pixel-sprite mascot is a separate, deliberate brand asset for
  Novo specifically — decide explicitly whether it survives the corporate
  repositioning or gets replaced with a non-character indicator; flagged
  below, not decided here.)
- **Spacing/radius** — 8pt grid, one card radius, one border-width, no more
  ad hoc `rounded-3xl` vs `rounded-2xl` mixing between pages.
- **Motion** — the spring/ease presets in `src/lib/motion.ts` are already
  decent; carry them forward as-is, just apply consistently.

**Deliverable:** an actual `DESIGN.md` with these locked, plus updated CSS
tokens in the codebase. Nothing in Phase 1+ should require re-deciding a
color or type size.

---

## Phase 1 — First impression (splash → auth): highest priority

1. **Splash screen** — ✅ checked, already compliant: `resources/splash.png`
   is a clean "E" monogram logo mark (star + open book forming the letter)
   centered on a purple gradient, driven by Capacitor's native SplashScreen
   plugin (`capacitor.config.ts`: 1.8s duration, no spinner, full screen).
   No vector character/mascot here — nothing to remove. Not touching further
   unless you want the mark itself redrawn as part of a broader logo refresh
   (that's a brand-identity decision, out of scope for "remove characters").
2. **Onboarding** (`OnboardingPage.tsx`, `components/onboarding/OnboardingTour.tsx`)
   — checked: neither actually uses `CharacterImage` (the original plan's
   claim here was wrong, corrected). Real work item instead: rewrite each
   step's copy to make one concrete promise per screen (exam-specific prep /
   AI tutor with memory / weak-topic targeting) instead of generic feature
   bullets, and migrate any hardcoded colors onto tokens.
3. **Login / Sign up** (`auth/LoginPage.tsx`) — ✅ **done**: vector character
   removed, replaced with a minimal monogram + wordmark mark. Still to do:
   migrate its inline hex colors (`BG`, `DARK`, `GRAY` consts) onto the
   existing token system, and verify it renders correctly across all 8
   themes (`ThemeContext.tsx`), not just dark.
4. **Terms of Service / Privacy Policy** (`TermsOfServicePage.tsx`,
   `PrivacyPolicyPage.tsx`) — ✅ **done**: both used `CharacterImage`
   (`terms-character`, `privacy-character`); replaced with the professional
   monoline icon each page already defined as its image-load fallback
   (`FileText`, `ShieldCheck`) in a simple rounded mark, matching the login
   screen's treatment.

---

## Phase 2 — Core daily-use screens (highest traffic after auth)

5. **Home** (`HomePage.tsx`) — audited live under light theme (not just
   grep): found and fixed 3 real WCAG contrast failures in the shared
   `--v2-text-4` / `--v2-chevron` / `--v2-success-text` tokens (see
   `ThemeContext.tsx` — this fixes the same bug on every v2-rebuilt page,
   not just Home). Also found: `components/onboarding/OnboardingTour.tsx`
   renders a hardcoded-dark mock dashboard preview (`text-white` on a dark
   card) as part of its tutorial illustration — looks jarring against a
   light-themed real page underneath. Not yet fixed — it's a full separate
   component with its own extensive dark-only styling, bigger than a token
   tweak. Real lesson from this page: static grep for hardcoded colors is
   NOT reliable — even properly-themed pages have dozens of legitimate
   `text-white` instances (on fixed-color badges). Verification requires
   actually running the page in each theme and looking at it.
6. **Novo / Chat** (`ChatPage.tsx`) — audited live under light theme. Found
   and fixed a severe real bug in `components/chat/PersonalityCards.tsx`:
   the active (selected) personality card's label text was hardcoded white,
   giving 1.26:1 contrast against its own pale-tinted background in light
   theme — essentially invisible on the single most prominent card on the
   page. Also fixed matching failures in the inactive card's label, tagline,
   and icon (all computed via the real WCAG contrast formula, see commit
   `bf5a554`). Citation chips, report control, and the message action row
   ("Listen · Save · Report") already verified rendering correctly in light
   theme — no changes needed there. Still open: decide the NovoAvatar sprite
   question explicitly (open decision #1).
7. **Profile** (`ProfilePage.tsx`) — audited live under light theme. Found a
   severe bug in the "Study DNA" card (`components/profile/StudyDNA.tsx`):
   hardcoded `#F4F6FA` (near-white) text at 1.09:1 / 1.17:1 contrast against
   its own light-purple-tinted card. This turned out to be a copy-pasted
   pattern repeated identically in 4 more files — `MoodCheckIn.tsx`,
   `MoodHeatmap.tsx`, `ProfilePage.tsx` itself (Novo Memory card), and 5
   separate occurrences in `OnboardingPage.tsx` (step heading, study-level
   card, language card, exam-date input, referral input). All fixed to
   `var(--ink-950)`, verified live (see commit `8ba29d6`). Deliberately left
   `auth/LoginPage.tsx`'s matching constant alone — that page ignores the
   theme system entirely, a separate already-tracked issue. Top summary
   card, Achievements, and Leaderboard sections were already correct.
8. **Learning Hub** (`LearningPage.tsx`) — ✅ audited live under light theme,
   both tabs ("Study Tools" and "My Progress"). Genuinely clean — no
   hardcoded near-white text, no unconditional white overlays, grep found
   zero instances of the `#F4F6FA` pattern or raw `rgba(255,255,255,...)`
   usage. All card titles, subtitles, and stat numbers render with correct
   dark text on light backgrounds. No fix needed. (Empty/zero-data states
   verified only — this test account has no flashcards/sprints yet, so the
   populated Subject Progress bars weren't visually checked.)
9. **Tools Hub** (`ToolsPage.tsx`) — ✅ audited live under light theme, full
   page scrolled top to bottom (Exam Score Predictor, Weakness Radar,
   Attention Heatmap, Confidence Score, Parent Report, Teacher Export, Mock
   Full Test, PYQ Bank, PDF Study Pack, Exam Simulator, Notes Scanner,
   Mistake Journal, Study Notes, Mnemonic AI, Browser). Genuinely clean —
   every colorful pastel-tinted card renders correct dark text, no bugs
   found. No fix needed.
10. **Quiz** (`QuizPage.tsx`) — ✅ audited + fixed. Found and fixed a real
    WCAG contrast bug: `subjectColor()` returned hardcoded pale pastel text
    (`#93C5FD`, `#C4B5FD`, etc.) for the subject chip and "Question N" label,
    assuming a permanently-dark page background. Under light theme this
    rendered at 1.1-1.7:1 contrast (needs 4.5:1) — verified via WCAG formula
    and live in browser (typed a real quiz topic, generated questions,
    inspected computed styles). Fixed by making the function theme-aware
    (`isLight` param) with darkened same-hue variants for light theme,
    verified 4.6-6.7:1 after fix. Also confirmed QuizPage's many
    `text-white`/`placeholder:text-white/30` classes are NOT bugs — a global
    `[data-theme="light"] .text-white` remap rule in globals.css already
    handles those safely across the whole app. **AI Quiz Bank**
    (`AIQuizBankPage.tsx`) not yet audited — question/results UI,
    high-frequency screens.
11. **Flashcards** (`FlashcardPage.tsx`) — ✅ audited + fixed. Found the same
    class of bug as Quiz, this time in the *shared* `src/lib/subjectColors.ts`
    lib (`getSubjectTheme`) — its `accent` field is used as text color on
    Question/Answer chips and read at 1.2-3.1:1 contrast on light theme.
    Fixed by adding a darkened `accentLight` variant per subject (4.0-7.3:1)
    behind an `isLight` param. Also found and fixed the same bug in
    FlashcardPage's own local `ratingConfig` (Again/Hard/Good/Easy buttons,
    1.5-2.5:1 → 4.7-6.6:1). Verified live: created a real card, reviewed it
    under light theme, confirmed computed styles match exactly. **Spaced
    Repetition** (`SpacedRepetitionPage.tsx`) — code-reviewed, not fully
    live-verified (test account had no due cards so the review session
    never loaded). Its `FlipCard` uses the same theme-adaptive
    `var(--ink-070)`/`rgba(...)` backgrounds with `text-white`, already
    covered by the global light-theme remap rule — same pattern confirmed
    safe on Quiz and Flashcards, so treated as safe by inspection.
12. **NCERT reader** (`NCERTChaptersPage.tsx`, `NcertDeepPage.tsx`) — ✅
    audited + fixed. The subject-color bug appeared a 4th time, independently
    in both files: `NcertDeepPage.tsx`'s local `SUBJECT_COLORS` (4 subjects)
    and `NCERTChaptersPage.tsx`'s local `SUBJECT_COLORS` (9 subjects) both
    used pale pastels as text on light-theme tinted/adaptive cards
    (1.17-2:1 contrast). Fixed both with `SUBJECT_COLORS_LIGHT` darkened
    variants (4.6-7.8:1) behind an `isLight` flag. Also caught a subtler bug
    in NcertDeepPage: the subtitle text applied 50% alpha on top of the
    already-darkened color, dropping it back to ~2.3:1 — fixed by using full
    opacity in light theme. Also fixed 6 more standalone hardcoded pastels in
    NCERTChaptersPage's quiz flow (Exemplar badge, correct/wrong option
    text+icon, "Novo explains" label, active Class pill, AI-banner icon).
    Verified live on both pages under light theme — computed colors match
    the fixes exactly.
13. **Roadmap** (`RoadmapPage.tsx`) — ✅ audited + fixed. Same subject-color
    bug (13 subjects, 1.1-2:1 → 4.4-6.5:1 fixed). Also fixed 6 more
    standalone pastels in the header/stats row (the "Study Roadmap" eyebrow
    label and stat captions use literal Tailwind color classes with no
    theme awareness, unlike text-white which has a global safety net) plus
    a pre-existing theme-independent low-contrast badge (WeekCard's
    #10B981/#5B6AF5/#9CA3AF gave white text only 2.5-4.35:1 in BOTH themes).
    Verified live by inserting a real study_roadmaps row directly (the AI
    generation edge function isn't reachable in this dev environment) —
    every computed color matched exactly.

    **Lesson Plan** (`LessonPlanPage.tsx`) — ✅ audited + fixed. Same bug in
    TASK_STYLES (study/practice/review/quiz/milestone_quiz, 1.2-2:1 →
    4.6-6.6:1) plus 7 more standalone pastels (header button, empty state,
    week-progress %, Milestone Day label, Week Complete trophy, day-tab
    checkmark). Verified live via a seeded lesson_plans + lesson_plan_tasks
    row — week-progress % and Milestone Day label matched exactly; the
    per-task chip colors use the identical already-proven pattern but
    couldn't be independently re-confirmed since the lesson-planner edge
    function (which fetches tasks) isn't reachable in this dev environment.

    **Revision Planner** (`RevisionPlannerPage.tsx`) — ✅ audited + fixed.
    Same bug in PRIORITY_STYLE (1.3-3.1:1 → 4.7-6.2:1) plus ~14 more raw
    Tailwind color classes (text-emerald/red/indigo/violet/amber-400/300)
    across every sub-component. Also found and fixed a genuine visual bug,
    not just contrast: HeatmapBar's future-day cells used a hardcoded
    rgba(255,255,255,X) tint that's invisible on light theme's light page —
    the whole future portion of the heatmap silently disappeared. Verified
    live via a seeded revision_plans row — computed colors matched exactly,
    and the heatmap's future cells are now visibly present.

    This is now the 7th independent occurrence of the same pale-color-on-
    dark-bg-assumption bug across Quiz, subjectColors.ts, Flashcards, both
    NCERT pages, Roadmap, Lesson Plan, and Revision Planner. Flagged as a
    background task for a systemic sweep of any remaining pages.
14. **Account Settings** (`settings/AccountSettingsPage.tsx`) — ✅ audited +
    fixed. Same bug pattern as raw ad-hoc Tailwind classes (not a color map
    this time): text-emerald-400 (Novo AI Index icon + Sync button,
    1.66-1.89:1) and text-red-400/red-400-70%/red-500 (Danger Zone header,
    description, delete controls, 1.84-3.2:1). Fixed with #047857/#B91C1C
    (4.7-5.4:1). Also fixed the exam-date native picker's hardcoded
    `colorScheme: 'dark'` (forced a dark OS date-picker chrome over an
    otherwise light-themed page). Verified live — computed styles match
    exactly.

    **Data Rights** (`settings/DataRightsPage.tsx`) — ✅ audited + fixed.
    RightCard's icon/button `color` prop (indigo/emerald/red/amber) read
    1.5-3.7:1 on light theme's pale tints. Added a
    RIGHT_CARD_COLOR_LIGHT map (4.7-6.75:1) covering all 4 right-cards,
    the consent-status icon, header Shield icon, and all 4 action buttons.
    Also fixed the delete-confirmation warning box/icon and enabled-state
    Delete button. Verified live — Download My Data (#4338CA), Edit Profile
    (#047857), Request Account Deletion (#B91C1C), and the delete
    confirmation warning all matched exactly.

    **Study Reminders** (`settings/StudyRemindersPage.tsx`) — ✅ audited,
    genuinely clean. Uses only theme-safe patterns throughout (text-white
    covered by the global remap, text-muted-foreground, var(--ink-*)
    backgrounds) — no pale-color maps or raw Tailwind color classes found.
    Verified live under light theme with reminders enabled — the time
    picker's "20"/"00" digits render dark and fully legible. No fix needed.

    This closes out Phase 2. The pale-color-on-dark-bg bug has now been
    found and fixed independently 9 times across Quiz, subjectColors.ts,
    Flashcards, both NCERT pages, Roadmap, Lesson Plan, Revision Planner,
    Account Settings, and Data Rights — a background task remains open for
    a systemic sweep of any pages beyond Phase 2's scope.

---

## Phase 3 — Competitive / social screens

15. **Battle** (`BattlePage.tsx`) — ✅ audited + fixed (10th occurrence of
    the pattern, widest-reaching yet). Uses Tailwind-500-level colors
    directly across ELO tier badges, score displays, timers, option-reveal
    states, and the result screen — 1.3-3.7:1 on light theme (silver/gold
    ELO tiers especially bad, as low as 1.32:1 since they're light colors
    to begin with). Fixed with per-tier `colorLight` fields and isLight
    branches, verified 4.7-8.5:1. Also found a NEW bug class: the "Find
    Opponent" button used the theme-flipping `var(--ink-950)` token for
    text on a FIXED red gradient — dark theme happens to look fine (ink-950
    → near-white), but light theme flips it to near-BLACK on the same red
    (3.6:1, visually wrong) — fixed to a literal white since the button's
    background doesn't invert with theme either. SearchingScreen/
    CountdownScreen's red icon/large-text were checked and left as-is —
    already clear the large-text/icon 3:1 threshold (3.55:1). Verified live
    end-to-end: played a full bot battle from lobby through all 10
    questions to the result screen under light theme; every computed color
    matched exactly.

    **Boss Fight** (`BossFightPage.tsx`) — ✅ audited + fixed (11th
    occurrence). BOSS_CATALOGUE's 5 per-boss colors read 1.6-6.3:1 on light
    theme's pale tints across selection cards, info panel, loading spinner,
    HP bars, and taunt bubbles — fixed with `colorLight` variants
    (4.3-6.8:1). Also found a second, theme-INDEPENDENT bug: the "Start
    Fight" button's background is always the raw boss color regardless of
    theme, and white button text failed against the two lighter bosses —
    emerald (2.5:1) and amber (2.1:1), both below the 3:1 large-text
    minimum — fixed with a `buttonTextDark` flag giving those two bosses
    dark ink text instead. Verified live: selected Baron Valence (emerald)
    and triggered The Integral (amber), confirmed boss-name text, HP label,
    and Start Fight button all render the exact fixed colors.

    **Tournament** (`TournamentPage.tsx`) — ✅ audited + fixed (12th
    occurrence, across every screen: list, weekly-schedule banner, quiz,
    results, leaderboard). Rank medals/subject badges/XP colors read
    1.3-3:1 on light theme — fixed via `rankLabel(rank, isLight)` and
    isLight branches throughout. Also found 2 more "fixed bg needs fixed
    text" bugs (Continue Attempt button, quiz answer-letter badge) and a
    third distinct bug: the leaderboard used a literal inline
    `color: 'white'` (not the `text-white` className the global remap
    catches) — invisible on a light-theme card. Verified live: header
    Trophy, active schedule phase, and empty-state Calendar icon all
    matched exactly; couldn't seed a tournament to verify per-row medal
    colors live since the `tournaments` table blocks client-side inserts
    via RLS (generated by a scheduled job) — those fixes rely on the same
    verified WCAG math and code pattern already live-proven in
    Battle/Boss Fight.

    **Streak Challenge** (`StreakChallengePage.tsx`) — ✅ audited + fixed
    (15th occurrence). Every hardcoded hex color in the file — subject
    palette, error banners, XP labels, tab bar, history-row status colors —
    was tuned against the dark theme and read 1.6-3.3:1 on light theme.
    Fixed via a `SUBJECT_COLORS_LIGHT` map + isLight branches throughout
    StreakDots/GenerateSheet/TaskSheet/ChallengeCard/history rows. Found a
    NEW variant of the "fixed bg" bug class: three subjects (Mathematics,
    Physics, Computer Science) fail 4.5:1 with BOTH white and dark text
    against their own brand hex — no text-color swap fixes it. Fix: nudge
    just the day-dot fill for those three to a slightly darkened variant
    (#4F5FE4/#7C4FE0/#5457E0), leaving the subject's brand color untouched
    everywhere else. Verified live: signed in, set light theme, navigated
    to `/streaks` — header Flame icon computed exactly `rgb(185,28,28)`
    (#B91C1C), active tab text exactly `rgb(67,56,202)` (#4338CA), History
    empty state correct. Could not seed active/history challenge rows to
    verify ChallengeCard/history-row colors live since generation requires
    the Gemini-backed edge function (same known dev-sandbox limitation
    documented for Boss Fight/Tournament) — those fixes rely on the same
    WCAG math already verified live elsewhere in this file and session.

    This closes out item 15 (Battle, Boss Fight, Tournament, Streak
    Challenge) — the pale-color-on-light-theme pattern has now been found
    and fixed in 15 distinct files this session.
16. **Leaderboard** (`LeaderboardPage.tsx`) — ✅ audited + fixed (16th
    occurrence). `SCOPE_COLORS` (blue/violet/emerald/amber/pink 400-shades)
    plus standalone hex for the rival callout, Hall of Fame panel, podium
    medals, avatar-initials fallback, and rank-delta arrows all read
    1.5-2.8:1 on light theme — fixed with a `SCOPE_COLORS_LIGHT` map +
    `scopeColor()` helper and isLight branches throughout, reusing the
    exact gold/silver/bronze light values already verified in Tournament's
    `rankLabel()` for consistency. Verified live: Global tab renders
    exactly `#1D4ED8`, School tab exactly `#92400E`. Rival/Hall of
    Fame/podium not visually verifiable live (this dev environment has
    only one seeded profile, no rival/podium data) — those rely on the
    same WCAG math already verified elsewhere this session. The
    anonymization work done earlier this session already changed the data
    shape here; this pass kept that intact.

    **School Leaderboard** (`SchoolLeaderboardPage.tsx`) — ✅ audited +
    fixed (17th occurrence). Same icon/text pattern (1.4-2.6:1) plus a NEW
    variant of the "theme-flipping token on fixed background" bug: the
    avatar-initials fallback used `var(--ink-950)` on a FIXED indigo/purple
    gradient (invisible in light theme, same bug class as Battle/Boss
    Fight), and the "Share This Page" button used the `text-white`
    className on that same fixed gradient — since this page sits outside
    AppShell but still respects the app theme, the global light-theme
    `.text-white` safety net would have flipped the button text to
    near-black on the fixed indigo background. Fixed both to a literal
    `#ffffff`, bypassing the CSS remap for the button via inline style.
    Verified live at the public, no-login `/school/:schoolName` route:
    School icon renders exactly `#4338CA`, Share button text stays pure
    `#ffffff`, footer link exactly `#4338CA`.

    This closes out item 16 — 17 distinct files fixed this session.
17. **Study Rooms / Circles / Groups** (`StudyRoomPage.tsx`,
    `LiveStudyRoomsPage.tsx`, `StudyCirclePage.tsx`, `StudyGroupsPage.tsx`,
    `GroupDetailPage.tsx`, `DoubtRoomPage.tsx`)
18. **Friends / Referral** (`FriendsPage.tsx`, `ReferralPage.tsx`)
19. **Achievements** (`AchievementsPage.tsx`, `AchievementFeedPage.tsx`,
    `CertificationsPage.tsx`)

---

## Phase 4 — Analysis / prediction / reporting screens

20. **Exam Prediction** (`ExamPredictionPage.tsx`), **Rank Predictor**
    (`RankPredictorPage.tsx`), **Confidence Score** (`ConfidenceScorePage.tsx`)
21. **Weakness Radar** (`WeaknessRadarPage.tsx`), **Error Patterns**
    (`ErrorPatternsPage.tsx`), **Attention Heatmap**
    (`AttentionHeatmapPage.tsx`), **Study DNA** (`StudyDNAPage.tsx`)
22. **Analytics Dashboard** (`AnalyticsDashboardPage.tsx`), **Novo Insights**
    (`NovoInsightsPage.tsx`), **Eval Dashboard** (`EvalDashboardPage.tsx`)
23. **Mock Test** (`MockTestPage.tsx`), **Mock Postmortem**
    (`MockPostmortemPage.tsx`), **Exam Simulator**
    (`tools/ExamSimulatorPage.tsx`), **Exam War Room**
    (`ExamWarRoomPage.tsx`)

---

## Phase 5 — Admin / teacher / parent portals (professional tone matters most here)

24. **Teacher Dashboard** (`teacher/TeacherDashboardPage.tsx`), **Teacher
    Export** (`TeacherExportPage.tsx`), **Teacher Content Ingest** flows
25. **School Admin** (`admin/AdminConsolePage.tsx`, `SchoolAdminPage.tsx`)
26. **Parent Portal** (`settings/ParentDashboardPage.tsx`,
    `ParentPortalPage.tsx`)

These three groups are the ones where "corporate-level" matters most in
practice — a teacher or school administrator judging the product's
legitimacy will see these screens, not the gamified student-facing ones.
Prioritize these earlier than their phase number if you have a
sales/procurement conversation coming up.

---

## Phase 6 — Long-tail feature screens (lower traffic, do last)

27. **Concept Reels** (`ConceptReelsPage.tsx`), **Concept Videos**
    (`ConceptVideosPage.tsx`), **Story Mode** (`StoryModePage.tsx`) — these
    are the most "playful" screens in the app; decide whether they keep a
    lighter tone deliberately (they're inherently entertainment-adjacent) or
    get folded into the same corporate language as everything else.
28. **Debate Mode** (`DebateModePage.tsx`), **Peer Explanation**
    (`PeerExplanationPage.tsx`), **Whiteboard** (`WhiteboardPage.tsx`)
29. **Formula Sheet** (`FormulaSheetPage.tsx`), **Formula AR**
    (`FormulaARPage.tsx`), **Solved Examples** (`SolvedExamplesPage.tsx`),
    **PYQ Bank** (`PYQBankPage.tsx`), **Subject Dependency**
    (`SubjectDependencyPage.tsx`), **Concept Map** (`ConceptMapPage.tsx`)
30. **Sleep Review** (`SleepReviewPage.tsx`), **Sprint**
    (`SprintPage.tsx`), **Daily Power Session**
    (`DailyPowerSessionPage.tsx`), **Live Event** (`LiveEventPage.tsx`),
    **Novo Live** (`NovoLivePage.tsx`), **Novo Proactive**
    (`NovoProactivePage.tsx`), **Novo Challenges** (`NovoChallengesPage.tsx`)
31. **Study Buddy** (`StudyBuddyPage.tsx`), **Learning Style**
    (`LearningStylePage.tsx`), **Regional Language**
    (`RegionalLanguagePage.tsx`), **Offline Mode** (`OfflineModePage.tsx`)
32. **Mistake Journal / Mnemonic / Study Notes / Study Pack / Scanner /
    Browser** (all under `tools/`) — utility tool screens, low visual risk.
33. **UPSC Mains** (`UPSCMainsPage.tsx`), **Curriculum /
    Curriculum Detail** (`CurriculumPage.tsx`, `CurriculumDetailPage.tsx`),
    **Course** (`CoursePage.tsx`), **Photo Solver** (`PhotoSolverPage.tsx`),
    **Tutoring Session** (`TutoringSessionPage.tsx`), **Video Companion**
    (`VideoCompanionPage.tsx`)
34. **Subscription** (`ProSubscriptionPage.tsx`) — worth doing earlier than
    its phase number, since this is a conversion-critical screen; keep
    "straightforward business upsell" tone per the earlier god-mode plan,
    not a pressure-tactic paywall.

---

## Open decisions (need your call, not mine to silently pick)

1. **NovoAvatar pixel-sprite** — keep as Novo's deliberate mascot, or replace
   with a non-character indicator (waveform, abstract mark) to match the
   corporate direction fully?
2. **Concept Reels / Story Mode tone** — keep intentionally lighter (they're
   entertainment-adjacent features), or fold into the same corporate
   language as the rest of the app?

---

## Suggested execution order

Phase 0 (system) → Phase 1 (splash/onboarding/auth/legal) → Phase 2 (daily
core) → Phase 5 (admin/teacher/parent, pulled forward if procurement
conversations are near-term) → Phase 3 → Phase 4 → Phase 6.
