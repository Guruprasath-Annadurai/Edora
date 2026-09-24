# E2E Testing

Status: **two suites — client-side-only against production, authenticated
against staging**. Last verified 2026-08-07.

## Current truth

Two separate Playwright configs exist, deliberately kept apart:

- `playwright.config.ts` — client-side-only specs (`e2e/login.spec.ts`,
  `e2e/visual.spec.ts`), run against the real production Supabase project's
  public anon key. Safe because these tests provably never submit real
  credentials or reach an authenticated code path — see "The real
  constraint" below.
- `playwright.staging.config.ts` — authenticated specs
  (`e2e/authenticated/*.spec.ts`), run against `edora-staging`, a real,
  fully migrated, but genuinely isolated Supabase project (never
  production). This suite logs in for real and exercises authenticated
  writes. See "Authenticated E2E suite (staging)" below — this is the
  resolution to the fork this doc used to describe as an open decision.

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

Explicitly not covered by either suite:

- **Mobile-specific behavior** — Playwright here drives a desktop Chromium
  browser against the web build; Capacitor-specific native behavior
  (camera, push notifications, haptics, native auth flows) isn't reachable
  this way at all.
- **Visual regression** — narrow, see below. 2 pages covered (login sign-in/sign-up), no authenticated pages, no mobile viewport, no dark-mode variant.

## Visual regression

`e2e/visual.spec.ts` — 2 screenshot-comparison tests (login sign-in and
sign-up modes), same client-side-only scope as `login.spec.ts`. Wired into
the same `npm run test:e2e` / `e2e-tests` CI job (Playwright runs every spec
in `testDir`, no separate job needed).

**Platform constraint, handled deliberately, not glossed over**: Playwright
screenshot comparison is sensitive to OS-level font rendering. This repo's
CI runs on `ubuntu-latest`; local development here is macOS. A baseline
generated locally would never match CI and would fail every PR on
unrelated antialiasing differences, not real regressions. No Docker was
available locally to generate Linux-matching baselines directly either.

**How the baselines were actually generated**: a `workflow_dispatch`-only
CI job, `.github/workflows/generate-visual-baselines.yml`, runs on
`ubuntu-latest` (matching the real `e2e-tests` job) and uploads the
resulting `.png` files as an artifact. To avoid ever landing a broken
intermediate state on `main` — the E2E job would fail on every push
between "spec file added" and "baseline committed" if done as two separate
main-branch commits — the spec file was pushed to a throwaway branch
first, the baseline workflow triggered against that branch (`gh workflow
run generate-visual-baselines.yml --ref <branch>`), the resulting
`login-signin-chromium-linux.png` / `login-signup-chromium-linux.png`
downloaded (`gh run download`), and only then committed to `main` together
with the spec file in one push.

Verified locally (not just assumed): running `playwright test
e2e/visual.spec.ts` on macOS correctly reports "no snapshot exists for
chromium-darwin" rather than silently comparing against the Linux
baseline — proving the platform-suffix mechanism actually works as
intended, not just in theory. `.gitignore` excludes `*-darwin.png` /
`*-win32.png` under `e2e/**/*-snapshots/` so a future contributor running
`--update-snapshots` locally can't accidentally commit a baseline CI will
never use.

**To regenerate baselines after an intentional UI change**: `gh workflow
run generate-visual-baselines.yml`, download the `visual-baselines`
artifact, replace the `.png` files under `e2e/visual.spec.ts-snapshots/`.

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

## Authenticated E2E suite (staging)

The fork this doc used to leave open — dedicated test project vs. a
mock-network layer — is resolved: `edora-staging` (Supabase project ref
`uldgosisjidydqstabvl`, $0/month free tier) was provisioned during Gate 2,
bootstrapped with all 178 local migrations, and verified fully isolated
from production. A disposable, permanently-seeded test account
(`e2e-test@edora-staging.internal`) lives only in that project's
`auth.users`/`profiles` tables.

**Config**: `playwright.staging.config.ts`, separate from
`playwright.config.ts` — `testDir: e2e/authenticated/`, a `setup` project
(`auth.setup.ts`) that logs in via the real UI and saves `storageState`,
and a `chromium` project depending on it that reuses that session. Points
the dev server at staging via `vite --mode staging` (port 8101; see the
`dev:staging` / `test:e2e:staging` npm scripts).

**Run locally**: `npm run test:e2e:staging`

**Current coverage** (`e2e/authenticated/`):
- `auth.setup.ts` — real login, asserts landing on `/home` (not
  `/onboarding`) for an already-onboarded account.
- `navigation.spec.ts` — tab-bar navigation across Home/Learn/Novo/Battle/
  Profile.
- `route-smoke.spec.ts` — 26 core authenticated routes render without the
  per-route error boundary firing (see `components/ErrorBoundary.tsx`).
- `profile-signout.spec.ts` — sign-out flow, ending back on `/login`.
- `account-settings.spec.ts` — a real write round-trip: edit display name,
  save, hard-reload, confirm the DB write persisted.

This list is a reconstruction built from the app's real route table
(`src/App.tsx`), not a recovery of some prior "30 mandated flows" list —
no such list exists anywhere in this repo's docs. It prioritizes shared
infrastructure (nav, auth lifecycle, settings writes) that every other
authenticated journey depends on, over exhaustively covering all ~90
routes.

**CI**: `e2e-authenticated-tests` job in `.github/workflows/ci.yml`, gated
on `secrets.VITE_STAGING_SUPABASE_URL` being set — it no-ops (not fails)
on a fork or any repo where the secrets aren't configured. `VITE_STAGING_SUPABASE_URL`
and `VITE_STAGING_SUPABASE_ANON_KEY` are set on this repo (`gh secret set`,
using `edora-staging`'s real URL and legacy anon key — same "public,
RLS-protected, not sensitive" reasoning as the production secrets above).
Runs on every push/PR alongside `e2e-tests`; not yet observed green in a
real CI run as of this writing — verified locally only so far.

### Two real bugs this suite found (not written to find — found by running)

1. **`/login` route redirect race** (`src/App.tsx`) — the route decided
   between `/home` and `/onboarding` based on `profile` without checking
   `profileLoading`, so a fast auth-state update could `replace`-navigate a
   fully-onboarded user to `/onboarding` and strand them there.
2. **`useAuth()` was never actually shared** (`src/hooks/useAuth.tsx`) —
   every one of its ~90 call sites ran an independent copy of the
   auth/profile state machine, so different components' views of "is the
   profile ready" could disagree. Concretely: `AccountSettingsPage`'s Save
   button silently no-opped (`profile` was `null` in its own instance)
   while the page visibly displayed real data from a different instance.
   Fixed by hoisting the state machine into a single `AuthProvider`
   context mounted once in `App.tsx`. Also fixed in the same pass: a CSS
   stacking-context bug that made modal buttons unclickable where they
   overlapped the floating tab bar, and `signOut()` defaulting to
   Supabase's `scope: 'global'` (logs out every device, not just this
   one).

Both were invisible to the client-side-only suite by construction — they
only exist on authenticated code paths — and neither was caught by manual
testing, because both require a specific timing window (a fast auth-state
resolution, or clicking before a `useAuth()` instance's own fetch
resolves) that's easy to hit in an automated run and easy to miss by hand.
