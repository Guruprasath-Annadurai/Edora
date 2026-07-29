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
7. **Profile** (`ProfilePage.tsx`) — already redone in v2 pass; re-audit only.
8. **Learning Hub** (`LearningPage.tsx`) — partially redone; extend.
9. **Tools Hub** (`ToolsPage.tsx`) — not yet touched.
10. **Quiz** (`QuizPage.tsx`), **AI Quiz Bank** (`AIQuizBankPage.tsx`) —
    question/results UI, high-frequency screens.
11. **Flashcards** (`FlashcardPage.tsx`), **Spaced Repetition**
    (`SpacedRepetitionPage.tsx`)
12. **NCERT reader** (`NCERTChaptersPage.tsx`, `NcertDeepPage.tsx`)
13. **Roadmap** (`RoadmapPage.tsx`), **Lesson Plan** (`LessonPlanPage.tsx`),
    **Revision Planner** (`RevisionPlannerPage.tsx`)
14. **Account Settings** (`settings/AccountSettingsPage.tsx`), **Data Rights**
    (`settings/DataRightsPage.tsx`), **Study Reminders**
    (`settings/StudyRemindersPage.tsx`)

---

## Phase 3 — Competitive / social screens

15. **Battle** (`BattlePage.tsx`), **Boss Fight** (`BossFightPage.tsx`),
    **Tournament** (`TournamentPage.tsx`), **Streak Challenge**
    (`StreakChallengePage.tsx`)
16. **Leaderboard** (`LeaderboardPage.tsx`), **School Leaderboard**
    (`SchoolLeaderboardPage.tsx`) — the anonymization work done earlier this
    session already changed the data shape here; redesign should keep that.
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
