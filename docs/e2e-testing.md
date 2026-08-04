# E2E Testing

Status: **started, narrow scope**. Last verified 2026-08-05.

## Current truth

Zero E2E tooling existed in this repo before this pass. Playwright
(`@playwright/test`) is now installed, configured (`playwright.config.ts`),
and has **1 spec file, 6 tests** (`e2e/login.spec.ts`), all passing —
verified against a real local dev server, not just written and trusted.

## The real constraint: no dedicated test Supabase project

This project has one Supabase backend — the production one — with real user
data (37+ accounts as of the backup work earlier in this remediation pass).
There is no staging/test project. That means every E2E test written against
this app is, by default, running against production infrastructure unless
it's scoped to avoid touching it.

**Decision made this pass**: rather than provision a test project (a real
infra/cost decision that should be made deliberately, not silently as a side
effect of "add some E2E tests"), the first spec file is scoped to
**client-side-only behavior that provably never calls Supabase**:

- Login/signup mode switching, form field visibility
- Client-side validation (e.g. empty password blocks submit before any
  network call — one test explicitly asserts no `/auth/v1/` request fires)
- Forgot-password modal open/close
- Password show/hide toggle

None of these tests submit real credentials, create accounts, or trigger an
auth request. This is why the CI job (`e2e-tests` in `.github/workflows/ci.yml`)
can safely use the real project's public anon key — the tests never reach a
point where that key would do anything against real data.

## What this does NOT cover

This is a narrow starting point, not a golden-path suite. Explicitly not
covered:

- **Actual sign-in/sign-up** — needs either a dedicated test Supabase
  project + a disposable test account, or a mocking layer at the network
  level (Playwright supports route interception, not used yet). Not built.
- **Any authenticated flow** — home, chat, quizzes, mock tests, everything
  that requires a logged-in session. This is the overwhelming majority of
  the app's actual user-facing behavior and none of it has E2E coverage.
- **Mobile-specific behavior** — Playwright here drives a desktop Chromium
  browser against the web build; Capacitor-specific native behavior
  (camera, push notifications, haptics, native auth flows) isn't reachable
  this way at all.
- **Visual regression** — no screenshot-diffing configured.

## Next decision this needs, honestly stated

To get real golden-path coverage (login → home → do something → see the
result), someone needs to decide: provision a dedicated test Supabase
project (cost + setup), or build a mock-network-layer approach (more
engineering work, zero infra cost, but doesn't exercise the real backend).
Neither decision was made unilaterally here — this pass shipped the
narrowest safe starting point and documented the fork in the road rather
than picking a direction that commits to ongoing cost or risk without
asking.
