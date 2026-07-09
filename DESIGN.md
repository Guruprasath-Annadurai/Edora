# Edora Design System

> **Memorable thing:** "The brilliant friend who shows up 3 days before your exam and actually fixes everything."
>
> Every design decision flows from this. UI is a tool under pressure. Novo is the friend. The app must convey trust instantly — not delight, not fun, not cleverness. Trust.

---

## Design Direction

**Aesthetic:** Dark precision. The UI of a weapon, not a toy.
**Mood:** Confident, fast, personal. Zero clutter. Nothing decorative that isn't also functional.
**Anti-patterns:** Purple gradient blobs, slow animations, pastel surfaces, centered-everything layouts, playful illustrations, feature soup on the home screen.

**The hierarchy rule:** Every screen answers one question first. If a student opens the app at 11pm the night before the exam, they should know exactly what to do in under 2 seconds.

---

## Tokens

### Color

```css
/* Foundation */
--color-base:        #06070D;   /* true near-black — richer than current #0A0A0F */
--color-surface-1:   #0D0F18;   /* primary card surface */
--color-surface-2:   #141822;   /* elevated card / input bg */
--color-surface-3:   #1A2030;   /* highest elevation — sheets, modals */

/* Borders */
--color-border:      rgba(255,255,255,0.07);   /* subtle dividers */
--color-border-em:   rgba(255,255,255,0.13);   /* emphasized borders on focus/hover */

/* Text */
--color-text-primary:   #F0F2F8;   /* near white — not pure white, less harsh */
--color-text-secondary: #8A94B0;   /* muted labels, metadata */
--color-text-tertiary:  #4A5270;   /* ghost text, placeholders */

/* Brand — Novo Purple */
--color-novo:        #7C3AED;
--color-novo-light:  #9B5CF6;
--color-novo-dim:    rgba(124,58,237,0.15);   /* tinted surfaces */
--color-novo-glow:   rgba(124,58,237,0.35);   /* shadows, halos */

/* Semantic */
--color-success:     #10B981;
--color-warning:     #F59E0B;
--color-danger:      #EF4444;
--color-info:        #3B82F6;

/* Subject identity — keep existing, they work */
--color-physics:     #7C3AED;
--color-chemistry:   #10B981;
--color-maths:       #3B82F6;
--color-biology:     #22C55E;
```

### Typography

Two problems with current type: arbitrary px sizes (10px, 11px) and inconsistent weight use.

**Scale (use these, nothing else):**

```
xs:   11px / 1.4  — metadata, tags, timestamps
sm:   13px / 1.5  — secondary labels, captions
base: 15px / 1.6  — body text, descriptions
lg:   17px / 1.5  — card titles, prominent labels
xl:   20px / 1.3  — section headers
2xl:  24px / 1.2  — page titles
3xl:  30px / 1.1  — hero numbers (score, streak, rank)
4xl:  38px / 1.0  — full-screen moments only
```

**Weights:**
- `400` — body prose only
- `500` — secondary labels
- `600` — card titles, nav labels
- `700` — section headers, CTAs
- `800` — page titles, hero text

**Font assignments:**
- `Space Grotesk` — headings, numbers, CTAs (keep — it's sharp and authoritative)
- `Plus Jakarta Sans` — body, labels, descriptions (keep — warmer for reading)
- `JetBrains Mono` — formulas, code, scores only

**Rule:** Never use arbitrary font sizes. Every font-size in the codebase must map to the scale above.

### Spacing

Mobile-first. Base unit: `4px`.

```
4px   — gap between inline elements, icon padding
8px   — tight internal card padding
12px  — compact row height padding
16px  — standard card padding
20px  — section gap
24px  — card-to-card gap
32px  — section-to-section gap
```

**Screen padding:** `px-4` (16px) on all pages. Never `px-3` or `px-5` — pick one.

### Border Radius

Inconsistency problem: pages mix `rounded-xl` (12px) and `rounded-2xl` (16px) randomly.

```
4px  — tags, badges, small chips
8px  — inline elements, small buttons
12px — standard cards, inputs (rounded-xl)
16px — sheet bottoms, large cards
24px — full-pill buttons only
```

**Rule:** Cards always `rounded-xl` (12px). Sheets always `rounded-t-2xl`. Buttons: destructive/secondary `rounded-xl`, primary CTA `rounded-2xl`.

### Elevation System

Three levels — students need to know what's important at a glance.

```
L0 — base: background (#06070D) — page background
L1 — surface: (#0D0F18) + border 7% — standard cards, nav items
L2 — raised: (#141822) + border 13% + shadow card — active/focus states, inputs
L3 — overlay: (#1A2030) + border 13% + shadow card-lg — bottom sheets, modals
```

CSS classes to create:
```
.card-l1 { background: var(--color-surface-1); border: 1px solid var(--color-border); border-radius: 12px; }
.card-l2 { background: var(--color-surface-2); border: 1px solid var(--color-border-em); border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.4); }
.card-l3 { background: var(--color-surface-3); border: 1px solid var(--color-border-em); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
```

### Motion

Positioning: "fast, purposeful." Students under exam pressure perceive slow animations as lag.

```
duration-fast:   150ms — micro interactions (tap feedback, toggle)
duration-base:   220ms — state transitions (show/hide, expand)
duration-slow:   350ms — page transitions, sheet open
duration-x-slow: 500ms — onboarding, celebration moments only
```

Easing:
```
ease-snap:  cubic-bezier(0.4, 0, 0.2, 1)  — standard UI movement
ease-pop:   cubic-bezier(0.34, 1.56, 0.64, 1)  — emphasis (badge unlock, XP pop)
ease-slide: cubic-bezier(0.0, 0.0, 0.2, 1)  — sheets entering
```

**Rule:** No `duration-700`, no `animate-float`, no decorative animation on utility screens. Animation must communicate state, not decorate.

---

## Component Standards

### Buttons

```tsx
// Primary CTA — one per screen max
className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-[#7C3AED] to-[#9B5CF6] text-white active:scale-[0.98] transition-transform duration-150"

// Secondary
className="w-full py-3.5 rounded-xl font-semibold text-base bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border border-white/10 active:scale-[0.98] transition-transform duration-150"

// Ghost / text
className="px-4 py-2 rounded-xl font-medium text-sm text-[var(--color-novo-light)] active:opacity-70 transition-opacity duration-150"

// Destructive
className="w-full py-3.5 rounded-xl font-semibold text-base bg-red-500/15 text-red-400 border border-red-500/20 active:scale-[0.98] transition-transform duration-150"
```

### Cards

```tsx
// Standard card
className="card-l1 p-4"

// Interactive card (tappable)
className="card-l1 p-4 active:scale-[0.98] active:bg-[#141822] transition-all duration-150"

// Novo-tinted card (AI features)
className="card-l1 p-4 bg-gradient-to-br from-[rgba(124,58,237,0.12)] to-transparent"
```

### Bottom Navigation

Current: inconsistent. Standard:
- Height: `64px` + safe-area-inset-bottom
- Background: `rgba(6,7,13,0.88)` + `backdrop-filter: blur(32px)`
- Border top: `1px solid rgba(255,255,255,0.07)`
- Active icon: `#9B5CF6` (novo-light)
- Inactive icon: `#4A5270` (text-tertiary)
- Active label: `11px / 600 weight`
- Tap target: `48px` minimum (WCAG)

### Input Fields

```tsx
className="w-full px-4 py-3.5 rounded-xl bg-[var(--color-surface-2)] border border-white/10 text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-novo)] focus:outline-none transition-colors duration-150"
```

### Loading States

Every data-fetch screen needs a skeleton. Pattern:
```tsx
// Skeleton shimmer — use this everywhere
className="rounded-xl bg-[var(--color-surface-2)] animate-pulse"
```

Create `<SkeletonCard />`, `<SkeletonList n={5} />` components. No spinners on content areas.

### Empty States

Pattern for all empty states:
```tsx
<div className="flex flex-col items-center gap-3 py-16 px-6">
  <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center">
    <Icon size={24} className="text-[var(--color-text-tertiary)]" />
  </div>
  <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</p>
  <p className="text-[13px] text-[var(--color-text-secondary)] text-center leading-relaxed">{body}</p>
  {cta && <Button>{cta}</Button>}
</div>
```

No illustrations. No emoji walls. Just icon + message + optional CTA.

---

## Page Audit & Priority Tiers

### Tier 0 — Fix Before Tester Reports (Days 1-4)

These pages testers WILL hit. Broken/stub UI = bad production access report.

| Page | Problem | Fix |
|------|---------|-----|
| `DoubtRoomPage` | 12 stubs, placeholder text visible | Hide behind "Coming Soon" gate OR build basic Q&A UI |
| `LiveStudyRoomsPage` | 10 stubs, looks broken | Coming Soon gate |
| `NovoLivePage` | Placeholder content visible | Coming Soon gate |
| `WhiteboardPage` | Clearly unfinished | Coming Soon gate |
| `DebateModePage` | Stub UI | Coming Soon gate |
| `StudyGroupsPage` | 6 stubs | Coming Soon gate |
| `FormulaARPage` | AR doesn't work on most devices | Coming Soon gate |

**Coming Soon gate pattern:**
```tsx
// Replace page content with this — takes 5 min per page
<div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
  <div className="w-16 h-16 rounded-2xl card-l2 flex items-center justify-center">
    <Sparkles size={28} className="text-[var(--color-novo-light)]" />
  </div>
  <h2 className="font-heading text-xl font-bold text-white">{featureName}</h2>
  <p className="text-sm text-[var(--color-text-secondary)] text-center">
    Coming in v3.7. Your study streak and data are safe.
  </p>
  <button onClick={() => navigate(-1)} className="mt-2 text-sm font-semibold text-[var(--color-novo-light)] active:opacity-70">
    Go Back
  </button>
</div>
```

### Tier 1 — Core Loop Pages (v3.6.1, Days 4-8)

These are the pages that define the app. Must be polished.

| Page | Key Issues | Changes |
|------|-----------|---------|
| `HomePage` | No hierarchy, everything equal weight, section headers compete | Redesign: 3-zone layout (hero strip → primary actions → secondary features) |
| `ChatPage` | Good overall, minor: font sizes inconsistent, smart replies overlap | Fix type scale, fix smart reply z-index |
| `PYQBankPage` | Filter chips too small (10px text), option buttons cramped | Increase chip height to 36px, increase option padding |
| `MockTestPage` | Timer placement awkward on small screens | Fix timer to top bar, not floating |
| `OnboardingPage` | Progress indicator barely visible | Increase contrast on progress dots |
| `ProSubscriptionPage` | Feature list uses generic bullets | Replace with icon+text rows |

### Tier 2 — High-Value Secondary Pages (v3.6.2, Days 8-13)

| Page | Issues |
|------|--------|
| `FlashcardPage` | Card flip animation jank, back face text overflow |
| `SpacedRepetitionPage` | Rating buttons too small for thumb reach |
| `QuizPage` | Option selection state unclear (selected vs correct vs wrong) |
| `BattlePage` | ELO/rank display inconsistent with rest of app |
| `LeaderboardPage` | Avatar placeholder is gray box — looks broken |
| `ProfilePage` | Stats section has no visual grouping |
| `AnalyticsDashboardPage` | Charts overflow on small screens |
| `MockPostmortemPage` | Subject breakdown chart unreadable at small sizes |

### Tier 3 — Polish (v3.7, post-production)

| Page | Issues |
|------|--------|
| `AchievementsPage` | Badge grid has inconsistent sizes |
| `RevisionPlannerPage` | Calendar view overflow on 375px screens |
| `NCERTChaptersPage` | Chapter list cards all same weight — no completion status |
| `FormulaSheetPage` | Formula cards need better LaTeX rendering size |
| `StudyRoomPage` | Participant list placeholder avatars |
| `NcertDeepPage` | Content width too wide for mobile reading |
| `SleepReviewPage` | Chart has no empty state |
| `ErrorPatternsPage` | Table is not mobile-friendly |

### Tier 4 — Redesign Later (v4.0)

`TeacherDashboardPage`, `SchoolAdminPage`, `ParentPortalPage` — these are for a different user (teacher/parent), need their own design language. Not mobile-dark-UI — they need a lighter, administrative feel. Out of scope for now.

---

## HomePage Redesign Spec

This is the most important screen. Current: 8 sections all equal weight = cognitive overload.

**New 3-zone layout:**

```
┌─────────────────────────────────┐
│  ZONE 1: STATUS BAR (56px)      │
│  Streak · XP · Exam countdown   │
├─────────────────────────────────┤
│  ZONE 2: HERO ACTION (120px)    │
│  "Study with Novo" CTA          │
│  or active sprint if running    │
├─────────────────────────────────┤
│  ZONE 3: PRIMARY GRID (2x2)     │
│  PYQ Bank · Mock Test           │
│  Flashcards · AI Quiz           │
├─────────────────────────────────┤
│  ZONE 4: QUICK STATS (80px)     │
│  Today's progress bar           │
├─────────────────────────────────┤
│  ZONE 5: SECONDARY LIST         │
│  Battle · Leaderboard · More    │
│  (collapsed by default)         │
└─────────────────────────────────┘
```

Zone 1 answers: "Where am I?" (streak, XP, days to exam)
Zone 2 answers: "What should I do now?" (one clear primary action)
Zone 3 answers: "What are my tools?" (4 key features)
Zone 4 answers: "How am I doing today?"
Zone 5: everything else, accessible but not competing for attention.

---

## Typography Corrections

Pages currently violating the type scale:

| Violation | Found in | Fix |
|-----------|---------|-----|
| `text-[10px]` | HomePage, PYQBankPage, multiple | Replace with `text-xs` (11px) |
| `text-[11px]` | ChatPage, MockTestPage | Replace with `text-xs` (11px) |
| `text-[10px] font-bold uppercase tracking-widest` | Multiple pages | Use `text-xs font-bold uppercase tracking-widest` |
| Mixed `font-body` / `font-sans` | Inconsistent across pages | All body text → `font-body` |
| `text-white/30`, `text-white/40`, `text-white/50` | Everywhere | Replace with `text-[var(--color-text-tertiary)]` / secondary |

---

## Implementation Plan

### v3.6.1 — Tester-Safe Release (target: Day 5 of testing)

**Task 1.1:** Gate 7 stub pages with Coming Soon screen
- Files: `DoubtRoomPage`, `LiveStudyRoomsPage`, `NovoLivePage`, `WhiteboardPage`, `DebateModePage`, `StudyGroupsPage`, `FormulaARPage`
- Time: ~1 hour
- Test: tap all 7, confirm Coming Soon shows, back button works

**Task 1.2:** Fix type scale violations
- Files: global search-replace across `src/pages/`
- Replace `text-[10px]` → `text-xs`, `text-[11px]` → `text-xs`
- Time: ~30 min

**Task 1.3:** Add elevation CSS classes to globals.css
- Add `.card-l1`, `.card-l2`, `.card-l3` to `src/styles/globals.css`
- Time: ~10 min

**Task 1.4:** Create `<EmptyState />` component
- File: `src/components/ui/EmptyState.tsx`
- Props: `icon, title, body, cta?, onCta?`
- Time: ~20 min

**Task 1.5:** Create `<SkeletonCard />` and `<SkeletonList />` components
- File: `src/components/ui/Skeleton.tsx`
- Time: ~20 min

**Task 1.6:** Bump version to 3.6.1, build AAB, upload

### v3.6.2 — Core Loop Polish (target: Day 9 of testing)

**Task 2.1:** Redesign HomePage with 3-zone layout
- File: `src/pages/HomePage.tsx`
- Full rewrite of layout structure
- Time: ~3 hours

**Task 2.2:** Fix ChatPage type + smart reply issues
- File: `src/pages/ChatPage.tsx`
- Fix font sizes, smart reply z-index
- Time: ~1 hour

**Task 2.3:** Fix PYQBankPage filter chips + option padding
- File: `src/pages/PYQBankPage.tsx`
- Chip height 36px, option padding fix
- Time: ~45 min

**Task 2.4:** Fix MockTestPage timer placement
- File: `src/pages/MockTestPage.tsx`
- Move timer to top bar
- Time: ~30 min

**Task 2.5:** Fix FlashcardPage card flip + text overflow
- File: `src/pages/FlashcardPage.tsx`
- Time: ~1 hour

**Task 2.6:** Fix QuizPage option selection states
- File: `src/pages/QuizPage.tsx`
- Clear selected/correct/wrong visual states
- Time: ~45 min

**Task 2.7:** Bump version to 3.6.2, build AAB, upload

### v3.7 — Full Polish + Tier 2/3 Pages

**Task 3.1:** Apply design tokens globally (CSS variable audit)
**Task 3.2:** Standardize all page padding to `px-4`
**Task 3.3:** Audit all border-radius usage
**Task 3.4:** Build bottom nav to spec (height, tap targets, active states)
**Task 3.5:** Fix all Tier 2 pages (BattlePage, LeaderboardPage, ProfilePage, etc.)
**Task 3.6:** Fix Tier 3 pages (AchievementsPage, RevisionPlannerPage, etc.)

---

## What NOT to Change

- **Novo purple `#7C3AED`** — keep. It's the brand, it works, it's distinctive.
- **Space Grotesk + Plus Jakarta Sans** — keep. Right choices.
- **Dark base** — keep. Correct for the audience and use case.
- **Subject color system** — keep. Physics/chemistry/math/bio identity is valuable.
- **Framer Motion** — keep, just slow it down on utility screens.
- **ChatPage overall layout** — keep. Best page in the app.

---

## Definition of Done

A page is "done" when:
1. All text uses the type scale (no arbitrary px sizes)
2. All cards use `.card-l1`, `.card-l2`, or `.card-l3`
3. All empty states use `<EmptyState />`
4. All loading states use `<SkeletonCard />` or `<SkeletonList />`
5. Screen padding is `px-4` consistently
6. No stub/placeholder text visible to users
7. Primary CTA is visually dominant — one per screen
8. Works on 375px screen width without overflow
