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
17. **Study Rooms / Circles / Groups** — ✅ all 6 screens audited + fixed.

    **Study Room** (`StudyRoomPage.tsx`) — ✅ 18th occurrence. Every phase
    (lobby, waiting room, study, generating, quiz, results) plus the shared
    RoomHeader had dark-theme-tuned hex on fixed tints — fixed via
    isLight branches throughout. Converted 3 conditional-className
    patterns (`text-red-500`/`text-white`, and the quiz option
    correct/wrong/selected `textColor`) to inline styles so they could
    branch on isLight — arbitrary Tailwind color classes like
    `text-[#818CF8]` can't be reached by the global safety net. Verified
    live: Join Room panel's Users icon renders exactly `#047857`.

    **Live Study Rooms** (`LiveStudyRoomsPage.tsx`), **Study Groups**
    (`StudyGroupsPage.tsx`) — audited, no fix needed. Both are "coming in
    v3.7" placeholder stubs using only theme tokens and the
    globally-remapped `text-white` className.

    **Study Circle** (`StudyCirclePage.tsx`) — ✅ 19th occurrence. Violet/
    amber/blue/red colors across the circle list, detail view, and modals
    fixed with isLight branches. Found 2 variants of the "fixed background
    + bad text token" bug: the WhatsApp-share button's `var(--ink-950)`
    was actually WORSE in dark theme (≈2:1) and only accidentally okay in
    light theme — replaced with a literal `#0F172A` that works in both
    (≈9.3:1), fixing a pre-existing dark-theme bug as a side effect; and 3
    Create/Join buttons using the `text-white` className over a fixed
    violet background (same class as SchoolLeaderboardPage's Share
    button) — overrode with inline `#ffffff`. Verified live: both
    "Create Circle" buttons render exactly `rgb(255,255,255)`.

    **Group Detail** (`GroupDetailPage.tsx`) — ✅ 20th occurrence. Reused
    TournamentPage's exact `rankLabel()` gold/silver/bronze light values
    for consistency. Fixed a literal inline `color: 'white'` (not the
    remapped className) and the tab-bar's theme-flipping-token-on-fixed-
    gradient bug (same class as Battle's "Find Opponent" button). Could
    not live-verify — this route needs a seeded study group reachable via
    the `study-groups` edge function, and an invalid ID redirects away
    rather than erroring; relies on the same math verified live elsewhere.

    **Doubt Room** (`DoubtRoomPage.tsx`) — ✅ 21st occurrence. All 6
    `'#A0AEFF'` instances (empty state, subject badge, Novo answer
    header/spinner, selected subject chip) fixed to isLight ? '#4338CA'.
    Verified live: empty-state icon and selected "Physics" chip both
    render exactly `rgb(67,56,202)`.

    This closes out item 17 — the pale-color-on-light-theme pattern has
    now been found and fixed in 21 distinct files this session.
18. **Friends / Referral** — ✅ both audited + fixed.

    **Friends** (`FriendsPage.tsx`) — ✅ 22nd occurrence. Indigo/orange/
    green/red dark-theme-tuned colors across the friends list, requests,
    and search results fixed with isLight branches. Found the fixed-
    gradient-background bug (same class as Battle/StudyRoom/GroupDetail)
    in 3 places — Avatar fallback, active tab pill, and the search-result
    "Add" button all used `var(--ink-950)` on a fixed indigo/purple
    gradient — fixed to literal `#ffffff`, plus converted the "Share
    Invite Link" button off the `text-white` className for the same
    reason. Verified live: active "Friends (0)" tab renders exactly
    `rgb(255,255,255)`, header Share icon exactly `rgb(67,56,202)`.

    **Referral** (`ReferralPage.tsx`) — ✅ 23rd occurrence. STATUS_CONFIG's
    3 badge colors and the "Total XP" icon fixed with isLight branches.
    Found a NEW, distinct bug: this file used `var(--v2-success)` — a
    fixed `#10B981` in both themes intended for background tints/borders
    — directly as TEXT/icon color in 3 places, when ThemeContext.tsx
    already defines a separate `--v2-success-text` token exactly for this
    (its own code comment notes the darkening exists because the plain
    token "was 3.6:1, fails AA"). Switched all 3 to the correct token.
    Verified live: milestone XP values render with correct contrast;
    confirmed `+100 XP` renders exactly `rgb(79,95,228)` (--v2-primary).

    This closes out item 18 — 23 distinct files fixed this session.
19. **Achievements** — ✅ all 3 audited + fixed.

    **Achievements** (`AchievementsPage.tsx`) — audited, no fix needed.
    No hardcoded colors found; uses only theme tokens and the globally-
    remapped `text-white` className.

    **Achievement Feed** (`AchievementFeedPage.tsx`) — ✅ 24th occurrence.
    The "School Toppers This Week" heading fixed with an isLight branch.
    Also found a variant of the "fixed background fails regardless of
    theme" bug class (same as BossFightPage): the #1/#2/#3 rank badge on
    each topper's avatar uses fixed gold/silver/bronze fills in both
    themes with white text — white fails 1.5-2.1:1 against all three.
    Fixed to a literal dark ink, clearing 5.3-8.9:1 against all three.
    Could not live-verify this specific banner — no seeded feed items in
    this dev environment (only the empty state renders) — relies on the
    same math already verified for BossFightPage's identical bug class.

    **Certifications** (`CertificationsPage.tsx`) — ✅ 25th occurrence.
    Score/percentage text, badges, and icons across the cert list, detail
    view, and assessment flow fixed with isLight branches. Found 2 more
    variants of the fixed-background-fails-regardless-of-theme bug: the
    pass/fail result icon (on a fixed green→cyan or red→amber gradient)
    and the quiz answer-letter badge (fixed indigo/emerald/red fill) both
    used white text that fails 3:1-4.5:1 against the emerald/amber/red
    segments — fixed both to a literal dark ink, which clears 4.2-8.5:1
    against every fill. Computed contrast for 5 other `text-white`-on-
    fixed-indigo-gradient icons and left them unchanged — both white and
    the light-theme remap's dark-ink substitute clear ~4.2-4.4:1 against
    that specific gradient, so there's no real failure there. Also caught
    and fixed a JSX syntax bug introduced by my own edit (missing `}`)
    that broke the dev build — found via live preview reload, since tsc
    alone didn't catch it (SWC/JSX-level break, not a type error).
    Verified live: empty-state Award icon (56px) and step-number badges
    both render exactly `rgb(67,56,202)` (#4338CA).

    This closes out item 19 and all of Phase 3 — the pale-color-on-
    light-theme pattern has now been found and fixed in 25 distinct
    files this session, across every competitive and social screen in
    the app.

---

## Phase 4 — Analysis / prediction / reporting screens

20. **Exam Prediction / Rank Predictor / Confidence Score** — ✅ all 3
    audited + fixed.

    **Exam Prediction** (`ExamPredictionPage.tsx`) — ✅ 26th occurrence.
    CONFIDENCE_CONFIG (3 tiers), the score-trajectory SVG chart, and
    every indigo/amber/emerald/red instance across the setup screen,
    results screen, and topic rows fixed with isLight branches. Found
    the "stacking alpha on an already-darkened color" bug again
    (`conf.color + 'cc'`) — replaced with a distinct descLight shade.
    Fixed the grade-picker chips' theme-flipping-token-on-fixed-gradient
    bug (same class as Battle/Friends/GroupDetail). Verified live: the
    selected "A" grade chip renders exactly `rgb(255,255,255)`.

    **Rank Predictor** (`RankPredictorPage.tsx`) — ✅ 27th occurrence.
    4-tier rankColor, 3 subject slider colors, exam-picker active item,
    and disclaimer fixed with isLight branches; same alpha-suffix-hack
    bug found and fixed (`${rankColor}cc`). This page runs its Monte
    Carlo simulation entirely client-side — verified live immediately:
    "Physics" label exactly `rgb(67,56,202)`, rank-range subtitle (>50k
    tier) exactly `rgb(146,64,14)` (#92400E).

    **Confidence Score** (`ConfidenceScorePage.tsx`) — ✅ 28th occurrence.
    LEVEL_CONFIG (4 tiers) and overallColor() (4 score bands) fixed with
    isLight branches across the circular meter, legend cards, topic
    cards, and subject badges. Found another fixed-gradient-white-text
    failure (same class as CertificationsPage): the "Start Targeted
    Review" button on a fixed amber→red gradient — fixed to a literal
    dark ink. Verified live: the analytics edge function resolved
    successfully and rendered the theme-safe empty state with no crash;
    this test profile had insufficient review data to render populated
    topic cards, so those specific instances rely on the same WCAG math
    already verified across 27 other files this session.

    This closes out item 20 and all of Phase 4 — 28 distinct files fixed
    this session.
21. **Weakness Radar / Error Patterns / Attention Heatmap / Study DNA** —
    ✅ all 4 audited + fixed.

    **Weakness Radar** (`WeaknessRadarPage.tsx`) — ✅ 29th occurrence.
    Added SUBJECT_COLORS_LIGHT (7 subjects) + isLight-aware
    subjectColor()/masteryColor() helpers for the radar chart's axis
    labels and data points, plus TopicRow's progress bar. Verified live:
    empty-state Target icon exactly `#4338CA`.

    **Error Patterns** (`ErrorPatternsPage.tsx`) — ✅ 30th occurrence.
    patternColor()'s 4 tiers and OccurrenceBadge's 2 count tiers fixed
    with isLight branches. Fixed the "All Subjects" filter's theme-
    flipping-token-on-fixed-gradient bug. Left the per-subject active
    pill unchanged — its pale-lavender background is fixed in both
    themes already, not the "breaks in light theme" pattern.

    **Attention Heatmap** (`AttentionHeatmapPage.tsx`) — ✅ 31st
    occurrence. topicColor()'s 5 neglect-tiers and urgencyConfig()'s 3
    alert tiers fixed with isLight branches; fixed 2 more "stacking alpha
    on an already-darkened color" instances. Found and fixed a new
    variant of BossFightPage's "fixed bg, one text color fails
    regardless of theme" bug in the "Study Now" button — flipped its
    text color with isLight instead of leaving it static, since the tier
    color itself flips from pale (dark theme) to dark/saturated (light
    theme).

    **Study DNA** (`StudyDNAPage.tsx`) — ✅ 32nd occurrence. StatCard
    colors, subject-verdict dots, and Top Topics/Focus Next Week colors
    fixed with isLight branches. Left the decorative DNA helix animation
    and the canvas-drawn share-card image unchanged (ornamental / always
    renders on a fixed dark canvas regardless of app theme). Verified
    live: XP Earned icon exactly `#92400E`, verdict dots exactly
    `#047857`/`#B91C1C`.

    This closes out item 21 — 32 distinct files fixed this session.
22. **Analytics Dashboard / Novo Insights / Eval Dashboard** — ✅ all 3
    audited.

    **Analytics Dashboard** (`AnalyticsDashboardPage.tsx`) — ✅ 33rd
    occurrence. 3 KPI-tile icons and ScoreRing's 3 score bands fixed with
    isLight branches. Verified live: icons render exactly `#4338CA`/
    `#047857`/`#92400E`.

    **Novo Insights** (`NovoInsightsPage.tsx`) — ✅ 34th occurrence. The
    biggest instance yet of the "background itself flips with theme"
    bug: the full-report header's `var(--grad-purple-header-*)` tokens
    are a deep purple gradient in dark theme but a pale lavender gradient
    in light theme (confirmed in ThemeContext.tsx) — every raw Tailwind
    color class inside it (text-yellow-300, text-purple-300, 4 stat
    icons) was tuned for the dark version and fixed with isLight-aware
    inline styles. ScoreArc and DAY_COLORS also fixed. Could not
    live-verify the full-report header itself — this test profile has no
    generated report yet, so only the theme-safe empty state rendered.

    **Eval Dashboard** (`EvalDashboardPage.tsx`) — audited, no fix
    needed. This is an internal eval/dev console with a permanently
    fixed `bg-zinc-950` root — it never reads `data-theme` or calls
    `useTheme()`, so it always renders dark regardless of the app's
    theme setting. None of its Tailwind zinc/emerald/red/amber classes
    can ever break in light theme because the page never renders in
    light theme; this is a different (and valid) pattern from every
    other file in this session.

    This closes out item 22 — 34 distinct files fixed this session.
23. **Mock Test / Mock Postmortem / Exam Simulator / Exam War Room** —
    ✅ all 4 audited + fixed.

    **Mock Test** (`MockTestPage.tsx`) — ✅ 35th occurrence. EXAM_CONFIG's
    5 exam-brand colors and the per-subject color map fixed with isLight
    branches (resolved once at generation time so downstream consumers
    stay correct). Left the exam-brand buttons unchanged — they pair a
    fixed background with `var(--color-on-accent)`, a single fixed near-
    black defined once with no per-theme override, already correct in
    both themes since every exam color is light/mid enough for dark text
    to read well regardless of app theme. Verified live: selected "JEE
    Main" title exactly `#1D4ED8`, "FREE · BETA" badge exactly `#047857`.

    **Mock Postmortem** (`MockPostmortemPage.tsx`) — ✅ 36th occurrence.
    Fixed indigo `topicColor`, summary stats, coach-note colors, and a
    literal inline `color: 'white'` (not the remapped className) on the
    active tab pill. Verified live: Accuracy stat exactly `#B91C1C`,
    active tab in dark ink per `var(--ink-950)`.

    **Exam Simulator** (`tools/ExamSimulatorPage.tsx`) — ✅ 37th
    occurrence. Fixed the count/time-picker chips' theme-flipping-token-
    on-fixed-gradient bug (same class as Battle/StudyRoom/GroupDetail).
    Found and fixed a new "one fixed background, single hardcoded text
    color fails regardless of theme" instance (BossFightPage's bug
    class) in the question-navigator dots — white fails against the
    green fill while dark ink fails against the violet fill, so text
    color is now chosen per fill value instead of one fixed choice.
    Verified live: selected "10" questions chip exactly `#ffffff`.

    **Exam War Room** (`ExamWarRoomPage.tsx`) — ✅ 38th occurrence. Fixed
    CheckCircle2, subject/priority badges, and 6 mindset-card icons with
    isLight branches. Verified live: renders with real checklist data, no
    crash, no new console errors.

    This closes out item 23 and all of Phase 4 — 38 distinct files fixed
    this session.

---

## Phase 5 — Admin / teacher / parent portals (professional tone matters most here)

24. **Teacher Dashboard** (`teacher/TeacherDashboardPage.tsx`), **Teacher
    Export** (`TeacherExportPage.tsx`), **Teacher Content Ingest** flows

    **Teacher Export** (`TeacherExportPage.tsx`) — ✅ 39th occurrence.
    Fixed `TrajectoryBadge`'s 3-tier color (improving/stable/declining),
    error-patterns `AlertTriangle` icon, predicted-score text, and "View
    Full Report" button with isLight branches. Left `MasteryBar`'s
    3-tier color unchanged — verified decorative bar-fill only, no text
    rendered in that color.

    **Teacher Dashboard** (`teacher/TeacherDashboardPage.tsx`) — ✅ 40th
    occurrence, largest file this session (1061 lines, 33 hardcoded-hex
    hits). Fixed icons/buttons/badges across the "not a teacher yet"
    screen, header sync/stats row, Assignments tab (incl. `scoreColor()`
    helper in `teacherDashboardHelpers.ts` gaining an `isLight` param),
    Reports tab, Services tab (Google Meet/Calendar/Drive sections), and
    the Create Meet / Send Email modals. Also fixed two fixed-gradient
    buttons using the theme-flipping `var(--ink-950)` token (should be
    a literal `#ffffff`), and two submit buttons where per-value
    contrast math showed white failing badly against cyan/amber
    gradient segments — fixed to literal `#0F172A`. Verified live at
    `/teacher` in light theme: no crash, `getComputedStyle()` confirms
    School icon/CheckCircle2/button text all match expected hex exactly.

    No "Teacher Content Ingest" route or file exists in the current
    codebase (confirmed via grep across `src/` and `App.tsx`) — this
    closes out item 24 in full.

25. **School Admin** (`admin/AdminConsolePage.tsx`, `SchoolAdminPage.tsx`)

    **School Admin Page** (`SchoolAdminPage.tsx`) — ✅ 41st occurrence.
    Fixed icons/badges/StatCards across the setup wizard, header,
    Quick Actions, Students tab, and Topics tab with isLight branches
    (TIER_CONFIG and StatCard each gained a `lightColor` field/prop).
    Discovered a new bug sub-class: `className="text-white"` (not an
    inline style) sitting on a FIXED gradient background — the global
    light-theme safety net that flips `.text-white` to dark ink assumes
    the background is theme-adaptive, and was silently making these
    buttons marginally worse-contrast. Fixed by moving `color` into an
    inline style, which wins on specificity over the class-based rule.
    Verified live at `/school-admin` in light theme: renders, no crash,
    `getComputedStyle()` confirms icon and button colors match exactly.

    **Admin Console** (`admin/AdminConsolePage.tsx`) — ✅ 42nd
    occurrence. Fixed status/severity/verdict badge colors across all 9
    tabs (Live Events, Audit Log, Admins, Question QA, Anomalies,
    Content QA, Mains QA, Cron Health, Observability). Same
    text-white-on-fixed-gradient bug sub-class fixed on 2 buttons.
    Verified live at `/admin`: test profile lacks the admin role, so
    the "Admin access required" gate renders correctly with no crash;
    the 9 RLS-gated tab contents could not be exercised live this
    session — fixes rely on contrast math established elsewhere.

    This closes out item 25.

26. **Parent Portal** (`settings/ParentDashboardPage.tsx`,
    `ParentPortalPage.tsx`)

    **Parent Portal Page** (`ParentPortalPage.tsx`) — ✅ 43rd occurrence.
    Fixed SUBJECT_COLORS and the weekly-stats icon colors with isLight
    branches. Also found a wider-blast-radius variant of the
    text-white-on-fixed-background bug class: several bg-indigo-600/
    bg-emerald-600 buttons and avatar chips have no color of their own
    — they *inherit* "white" from an ancestor `text-white`-classed root
    div, and the global light-theme safety net downgrades that
    ancestor to dark ink, breaking every fixed-background child that
    inherits it. Fixed each to its own correct explicit color (computed
    per-background — dark ink wins on the emerald-600 avatar, white
    wins on the indigo-600 buttons). Verified live at `/parent-portal`
    in light theme, no crash, `getComputedStyle()` confirms fix.
    Not fixed: the page's pervasive raw Tailwind `text-gray-400/500`
    (vs. the app's ink-token system) — lower-severity, flagged for a
    dedicated migration rather than folded into this targeted pass.

    **Parent Dashboard** (`settings/ParentDashboardPage.tsx`) — ✅ 44th
    occurrence. Fixed the MasteryRing donut's 3-tier color, the weekly-
    activity stat icons, a recurring lavender `#8B9BFA` (headline
    label, "View Full Report" button, 2 icon badges), and 4 instances
    of the fixed-gradient text-white bug class (header icon badge,
    generating-state icon badge, "Generate Report" button, modal
    footer's "Share Report" button). Verified live at `/parent` in
    light theme, no crash, `getComputedStyle()` confirms all 4 stat
    icons and the header icon match expected hex exactly.

    This closes out item 26 and all of Phase 5.

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

    **Concept Reels** (`ConceptReelsPage.tsx`) — ✅ 45th occurrence. Each
    reel's per-subject `color1` is rendered against a background that
    gradients into the theme-adaptive `var(--surface-sheet)` token
    (dark theme: near-black; light theme: pure white) — fixed with a
    `COLOR1_LIGHT` lookup and `useTheme()` in `ReelCard`. Left the
    Like/Save/Share action-bar icons unchanged — those sit on a FIXED
    black `rgba(0,0,0,0.5)` scrim regardless of theme, already correct.
    Verified live at `/reels`, no crash, icon color confirmed via
    `getComputedStyle()`.

    **Concept Videos** (`ConceptVideosPage.tsx`) — ✅ 46th occurrence.
    `subjectColor()` gained an `isLight` param (same pattern as
    `scoreColor()` from the Teacher Dashboard fix) backed by a
    `SUBJECT_COLORS_LIGHT` map. Fixed the theme-flipping-token-on-
    fixed-background bug class on the video-duration badge (fixed
    black background) and the YouTube CTA button (fixed brand-red
    background — kept literal white to match YouTube's own universal
    branding since computed contrast was marginal either way).
    Verified live at `/concept-videos`, no crash (no seed video data
    for this test profile to visually exercise the fixed colors).

    **Story Mode** (`StoryModePage.tsx`) — ✅ 47th occurrence. ~20
    hardcoded amber/emerald/indigo occurrences across all 6 function
    components fixed with isLight branches. Found the
    text-white-on-fixed-gradient bug class cutting BOTH ways in one
    file: the amber→red and amber→dark-amber gradients (header icon
    badge, Send button) need dark ink (white fails ~2.76:1 there),
    while the indigo→violet gradient (tab buttons, subject chips,
    "Explore More Stories") needs white — confirming this bug class
    requires computing contrast per-gradient, never a blanket rule.
    Verified live at `/story-mode`, no crash, both fixes confirmed via
    `getComputedStyle()`.

    This closes out item 27.
28. **Debate Mode** (`DebateModePage.tsx`), **Peer Explanation**
    (`PeerExplanationPage.tsx`), **Whiteboard** (`WhiteboardPage.tsx`)

    **Debate Mode** and **Whiteboard** — ✅ audited, no fix needed.
    Both are identical 35-line "coming in v3.7" stub screens using only
    CSS-variable-based Tailwind classes (`bg-[var(--color-base)]`,
    `text-[var(--color-novo-light)]`) and `text-white/70` (covered by
    the global safety net) — no hardcoded hex, fully theme-adaptive.

    **Peer Explanation** (`PeerExplanationPage.tsx`) — ✅ 48th
    occurrence. This file uses the same older raw-Tailwind convention
    as ParentPortalPage.tsx (43rd occurrence, Phase 5) —
    `text-indigo-400`/`text-emerald-400`/`text-amber-400`/
    `text-pink-400`/`text-red-400` classes have no light-theme CSS
    override at all (confirmed only `.text-white` variants are
    covered), so every one directly fails contrast in light theme.
    Converted ~10 such classes to isLight-branched inline styles across
    `SUBJECT_COLORS`, the page-local `scoreColor()` helper (gained an
    `isLight` param, same pattern as Teacher Dashboard's), and the
    result-phase section headers/bullets. Also fixed 4 instances of the
    inheritance-based text-white-on-fixed-background bug class (bg-
    indigo-600 buttons + Novo avatar icon inheriting white from the
    root `text-white` div, broken by the safety net's downgrade to dark
    ink). Verified live at `/peer-explain`, no crash,
    `getComputedStyle()` confirms the active subject pill matches fix.

    This closes out item 28.
29. **Formula Sheet** (`FormulaSheetPage.tsx`), **Formula AR**
    (`FormulaARPage.tsx`), **Solved Examples** (`SolvedExamplesPage.tsx`),
    **PYQ Bank** (`PYQBankPage.tsx`), **Subject Dependency**
    (`SubjectDependencyPage.tsx`), **Concept Map** (`ConceptMapPage.tsx`)

    **Formula AR** — ✅ audited, no fix needed (identical theme-adaptive
    "coming in v3.7" stub as Debate Mode/Whiteboard).

    **Formula Sheet** (`FormulaSheetPage.tsx`) — ✅ 49th occurrence.
    Raw Tailwind hue-400/300/200 classes (no light-theme CSS override
    exists for these) converted to isLight-branched inline styles in
    the standalone `FormulaCard` component.

    **Solved Examples** (`SolvedExamplesPage.tsx`) — ✅ 50th occurrence.
    Same class of fix across `StepBlock` and `ExampleCard` (each gained
    `useTheme()`), plus a `background:'#5B6AF5'`+`text-white`
    Bot-icon badge converted to inline for consistency. Verified live:
    all 3 seed examples render legibly.

    **Concept Map** (`ConceptMapPage.tsx`) — ✅ 51st occurrence.
    `masteryColor()` gained an `isLight` param, threaded through
    `MasteryArc`, `DetailPanel`, and `ConceptGraph` (each a standalone
    component needing its own `useTheme()`).

    **Subject Dependency** (`SubjectDependencyPage.tsx`) — ✅ 52nd
    occurrence. `MASTERY_FILL()`/`STRENGTH_COLORS` gained isLight
    variants across 4 components + the main page. Also fixed a
    backwards case: the loading spinner's `#E5E7EB` base ring is
    nearly invisible against a LIGHT background (opposite of the usual
    pattern) — replaced with the theme-adaptive `var(--ink-100)`.

    **PYQ Bank** (`PYQBankPage.tsx`) — ✅ 53rd occurrence. EXAM_OPTIONS
    and `difficultyColor()` gained isLight variants across the exam/
    subject/difficulty selectors, question badges, and session-summary
    stat cards. Left the `var(--color-on-accent)` buttons and the fixed
    red-gradient submit button unchanged — both already correct
    (on-accent is an intentionally fixed dark-ink token; white passes
    better than dark ink on that specific red gradient).

    This closes out item 29.
30. **Sleep Review** (`SleepReviewPage.tsx`), **Sprint**
    (`SprintPage.tsx`), **Daily Power Session**
    (`DailyPowerSessionPage.tsx`), **Live Event** (`LiveEventPage.tsx`),
    **Novo Live** (`NovoLivePage.tsx`), **Novo Proactive**
    (`NovoProactivePage.tsx`), **Novo Challenges** (`NovoChallengesPage.tsx`)

    **Novo Live** — ✅ audited, no fix needed (identical theme-adaptive
    "coming in v3.7" stub as Debate Mode/Whiteboard/Formula AR).

    **Sprint** (`SprintPage.tsx`) — ✅ 54th occurrence. Pale hex across
    mode cards/status pill/pause-end buttons/completion stats fixed
    with isLight branches; also fixed a theme-flipping-token-on-fixed-
    emerald-gradient "Resume" button (dark ink passes ~7.0/4.7:1 vs
    white's failing ~2.5/3.8:1 at the two gradient ends).

    **Novo Proactive** (`NovoProactivePage.tsx`) — ✅ 55th occurrence.
    TYPE_STYLES gained a light-color map for the 11 message-type badge
    colors; fixed 2 more text-white-on-fixed-indigo-gradient icons.

    **Live Event** (`LiveEventPage.tsx`) — ✅ 56th occurrence. Pale hex
    fixed with isLight branches; fixed 3 more text-white-on-fixed-
    gradient instances (Avatar helper + 2 shared-Button CTAs whose
    default `text-white` className was being downgraded by the safety
    net despite a fixed-gradient background override).

    **Daily Power Session** (`DailyPowerSessionPage.tsx`) — ✅ 57th
    occurrence. Pale hex across 4 components fixed; also fixed a fixed-
    emerald-gradient Trophy icon (`color="#fff"` → literal dark ink) —
    the same gradient/contrast finding as Sprint's Resume button,
    confirming this is a pre-existing issue independent of theme,
    surfaced by this session's contrast-math rigor.

    **Sleep Review** (`SleepReviewPage.tsx`) — ✅ 58th occurrence. Pale
    hex across 6 components fixed; found a genuinely mixed-contrast
    fixed gradient (`#7C3AED→#A78BFA`) where white and dark ink each
    win at opposite ends — picked dark ink for the better worst-case
    minimum.

    **Novo Challenges** (`NovoChallengesPage.tsx`) — ✅ 59th occurrence.
    `scoreColor()` gained an `isLight` param (4 call sites); `MedalBadge`
    gold/silver/bronze and a repeated pale amber fixed with isLight
    branches.

    This closes out item 30.
31. **Study Buddy** (`StudyBuddyPage.tsx`), **Learning Style**
    (`LearningStylePage.tsx`), **Regional Language**
    (`RegionalLanguagePage.tsx`), **Offline Mode** (`OfflineModePage.tsx`)

    **Study Buddy** (`StudyBuddyPage.tsx`) — ✅ 60th occurrence. Pale hex
    fixed with isLight branches; fixed the Avatar helper and two shared-
    Button CTAs (fixed indigo→violet gradient, established white-wins
    case).

    **Learning Style** (`LearningStylePage.tsx`) — ✅ 61st occurrence.
    Pale hex across `EmptyState`/`BarRow`/main component fixed; found a
    "one literal color must serve 6 possible fixed gradients" case
    (`styleGradient()`) — picked dark ink as the majority-safe choice
    after computing that amber-orange and teal-cyan variants strongly
    favor dark ink (~5.6-7.3:1 vs white's ~2.4-3.7:1).

    **Regional Language** (`RegionalLanguagePage.tsx`) — ✅ 62nd
    occurrence. Pale hex + raw Tailwind hue-400/300 classes (no light-
    theme override exists for these) fixed across `QuestionCard` and
    the main component.

    **Offline Mode** (`OfflineModePage.tsx`) — ✅ 63rd occurrence. Same
    raw-Tailwind-convention + `text-white`-root-inheritance bug class as
    ParentPortalPage/PeerExplanationPage this session — fixed ~15
    instances across the connection-status card, SW badge, storage
    usage, per-subject cache rows, and feature list, plus 2 inherited-
    white-on-solid-bg buttons (emerald-600 needs dark ink, indigo-600
    needs white — opposite fixes for the two).

    This closes out item 31.
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
