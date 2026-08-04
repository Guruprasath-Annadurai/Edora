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

## Real finding this surfaced: GitHub Actions had zero repository secrets

The first CI run of the new `e2e-tests` job failed all 6 tests with
"element(s) not found" — the login page never actually rendered. Checked
`gh secret list` for this repo: **empty. Zero secrets configured, at all.**
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — referenced by both this
job and the pre-existing `build` job in `.github/workflows/ci.yml` — had
never been set.

This had been invisible until now because `vite build` (the `build` job)
only bundles code; it doesn't execute it. An empty/undefined Supabase URL
gets silently inlined into the JS bundle and the build step succeeds either
way — `npm run build` passing has never been proof the resulting bundle
actually works in a browser. The Supabase client (`createClient()` in
`src/lib/supabase.ts`) only throws when a real browser actually loads and
runs the code — which is exactly what this E2E job is the first thing in
this repo's CI history to do.

**Fixed**: set both secrets via `gh secret set`, using the project's real
URL and *publishable* anon key (fetched via the Supabase MCP `get_project_url`
/ `get_publishable_keys` tools — the anon key is meant to be public/embedded
in client bundles, protected by RLS, not a sensitive credential; setting it
as a GH secret is conventional plumbing, not a security-sensitive action).
Re-ran the failed job after setting them: all 6 E2E tests passed.

**Real-world impact, stated precisely — not overstated**: this did **not**
mean the live, deployed app (edora-bb02e.web.app) was ever broken. Web/Android
deploys are manual (see `docs/rollback-procedure.md` — no automated deploy
pipeline exists), run by a human locally using their own `.env` with real
secrets, entirely separate from this CI job. What it does mean: **the CI
`build` job's "passing" status has been giving false confidence for the
entire life of this pipeline** — it verified the code compiles, never that
a build with the actual configured secrets produces a working app. This is
exactly the class of gap E2E/real-runtime testing exists to catch, and
exactly why it hadn't been caught before now: nothing before this job ever
actually ran the app.

## Next decision this needs, honestly stated

To get real golden-path coverage (login → home → do something → see the
result), someone needs to decide: provision a dedicated test Supabase
project (cost + setup), or build a mock-network-layer approach (more
engineering work, zero infra cost, but doesn't exercise the real backend).
Neither decision was made unilaterally here — this pass shipped the
narrowest safe starting point and documented the fork in the road rather
than picking a direction that commits to ongoing cost or risk without
asking.
