# Contributing to Edora

Thank you for your interest in contributing. This document covers everything you need to get started — branch conventions, commit format, PR process, and local setup.

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/Guruprasath-Annadurai/Edora.git
cd Edora

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_CLIENT_ID, VITE_SENTRY_DSN, VITE_POSTHOG_KEY

# 4. Start dev server
npm run dev
```

**Requirements:** Node 18+, npm 9+

For mobile development:
- Android: Android Studio + Java 21 (`JAVA_HOME` must point to Temurin 21)
- iOS: Xcode 15+ on macOS

---

## Branch Naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/<short-description>` | `feat/battle-spectator-mode` |
| Bug fix | `fix/<short-description>` | `fix/elo-race-condition` |
| Docs | `docs/<short-description>` | `docs/contributing-guide` |
| Refactor | `refactor/<short-description>` | `refactor/storage-abstraction` |
| Chore | `chore/<short-description>` | `chore/upgrade-capacitor-6` |

Always branch off `main`. Never commit directly to `main`.

---

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body — explain WHY, not what]

[optional footer — Closes #123]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Examples:**
```
feat(battle): add spectator mode to 1v1 battles
fix(elo): prevent race condition with SELECT FOR UPDATE
docs(readme): add SM-2 algorithm deep-dive
perf(flashcards): lazy-load card images to reduce initial bundle
```

Reference issues in the footer: `Closes #12` or `Fixes #34`

---

## Pull Request Process

1. **Open an issue first** for any non-trivial change — discuss before building.
2. Create a branch off `main` using the naming convention above.
3. Keep PRs focused — one feature or fix per PR.
4. Fill out the PR template (auto-populated when you open a PR).
5. All checks must pass before merging.
6. Squash-merge into `main`.

---

## Code Style

- **TypeScript strict mode** — no `any`, no implicit returns
- **Tailwind CSS** — utility classes only, no custom CSS files unless necessary
- **Components** — functional components with explicit prop types
- **Hooks** — custom hooks in `src/hooks/`, pure logic in `src/lib/`
- **Edge Functions** — Deno/TypeScript, keep functions under 200 lines, one responsibility per function

Run the linter before pushing:
```bash
npm run lint
npm run typecheck
```

---

## Project Structure

```
src/
├── pages/          # Route-level components (one file per page)
├── components/     # Shared UI components
├── hooks/          # Custom React hooks (data fetching, side effects)
├── lib/            # Pure logic — spacedRepetition, storage, trial, syncQueue
└── contexts/       # React context providers

supabase/
├── functions/      # Edge Functions — one folder per function
└── migrations/     # SQL migrations — numbered sequentially
```

---

## Reporting Bugs

Open a GitHub Issue with:
- Steps to reproduce
- Expected vs actual behaviour
- Device / OS / browser
- Console errors if any

---

## Questions

Open a [Discussion](https://github.com/Guruprasath-Annadurai/Edora/discussions) for anything that isn't a bug or feature request.
