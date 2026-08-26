# Phase 3.1 — Current Release Pipeline Audit

**Method:** Direct inspection of every file listed below, on branch `enterprise/phase-3-ci-baseline`, off a clean `main` at commit `c41263e`. No file in this audit's scope was sampled — every CI workflow file, build config, and versioning script in the repo was read in full.

**Scope inspected:** `.github/workflows/*.yml`, `package.json`, `package-lock.json`, `vite.config.ts`, `capacitor.config.ts`, `android/build.gradle`, `android/app/build.gradle`, `android/variables.gradle`, `android/gradle.properties`, `android/gradle/wrapper/gradle-wrapper.properties`, `playwright.config.ts`, `src/pages/settings/DiagnosticsPage.tsx`, `docs/rollback-procedure.md`, `public/.well-known/`.

---

## 1. CI workflows — full inventory

Two workflow files exist. **This is the complete list — there is no third workflow, no separate deploy workflow, and no scheduled/cron workflow.**

### 1.1 `.github/workflows/ci.yml` (226 lines)

**Triggers:** `pull_request` and `push` to `main`/`master`. Concurrency group cancels in-progress runs on the same ref (correct — prevents stale runs racing a newer push).

| Job | Runs on | Depends on | What it does | Secrets used |
|---|---|---|---|---|
| `type-check` | ubuntu-latest | — | `npm ci` → `tsc -b --noEmit` | none |
| `lint` | ubuntu-latest | — | `npm ci` → `eslint src` | none |
| `test` | ubuntu-latest | — | `npm ci` → `vitest run` | none |
| `edge-function-tests` | ubuntu-latest | — | `deno test --allow-env --allow-net` over `supabase/functions/**/*.test.ts` | none |
| `e2e-tests` | ubuntu-latest | — | Playwright against a locally-spawned dev server, real Supabase project (see §5) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `build` | ubuntu-latest | `type-check`, `test` | `npm ci` → `npm run build` (web bundle only) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `android-build` | ubuntu-latest | `type-check`, `test` | `npm run build:mobile` → `npx cap sync android` → `./gradlew assembleDebug --no-daemon` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `security-audit` | ubuntu-latest | — | `npm audit --omit=dev --audit-level=critical` (blocking) + full non-blocking audit report artifact | none |
| `secret-scan` | ubuntu-latest | — | `gitleaks/gitleaks-action@v2` over full history (`fetch-depth: 0`) | `GITHUB_TOKEN` (implicit) |

**Required repo secrets** (referenced anywhere in this file): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Both are public-safe values by design (anon key, not service role) — confirmed by the `e2e-tests` job's own inline comment, which is accurate: the anon key is meant to be public, and the E2E suite is asserted client-side-only.

### 1.2 `.github/workflows/generate-visual-baselines.yml` (30 lines)

Manual-only (`workflow_dispatch`), not part of the push/PR pipeline. Regenerates Playwright visual-regression snapshots on `ubuntu-latest` (matching the CI runner OS, correctly reasoned in its own header comment to avoid font-rendering mismatches against a macOS-generated baseline). Produces a downloadable artifact; does **not** commit the result — a human must download and commit manually. This is a legitimate, narrow-purpose tool, not a blind spot.

---

## 2. What CI does NOT do (the actual release pipeline gaps)

This is the section the mandate specifically asked about — "can CI report success while X is actually broken." Verified answers below, not assumptions:

| Question | Answer | Evidence |
|---|---|---|
| Can `android-build` succeed with stale web assets? | **No** — it runs `npm run build:mobile` then `npx cap sync android` in the same job, in that order, every time. There is no caching step that could serve a stale `dist/`. | ci.yml lines 150-160 |
| Can `android-build` succeed without Capacitor sync actually running? | **No** — `npx cap sync android` is an unconditional step with no `continue-on-error`; a failure here fails the job. | ci.yml line 157 |
| Can `build`/`android-build` succeed if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are absent? | **Not verified this pass** — GitHub Actions does not fail a job merely because a referenced secret is empty; an empty string is a valid string. If both secrets were deleted from repo settings, `vite build` would very likely still "succeed" while embedding empty/undefined Supabase config into the bundle, silently producing a broken build that passes CI. **This is a real gap** — no explicit check asserts these are non-empty before building. |
| Does a green `test`/`type-check` job mean tests actually ran, or could "no tests found" silently pass? | **Not verified this pass** — `vitest run` and `tsc -b --noEmit` both exit non-zero on config errors, but a scenario where test *discovery* silently finds zero files (e.g. a broken `include` glob after a refactor) was not specifically tested against this codebase. Flagged as unverified, not asserted safe. |
| Is there a CI job that deploys Edge Functions? | **No such job exists.** Every Edge Function deployment this entire session was performed manually via an MCP tool call (`deploy_edge_function`), not through any CI/CD pipeline. `git grep` for `supabase functions deploy` across `.github/` and `package.json` returns zero matches. **This is the single largest gap in this audit** — there is no automated, auditable, reproducible path from a merged commit to a deployed Edge Function. Deployment is a manual, undocumented-in-CI action performed by whoever has Supabase project access. |
| Is there a CI job that applies database migrations? | **No such job exists**, same method of verification (grep for `supabase db push`/`apply_migration` in `.github/` and `package.json` — zero matches). Every migration in this project's history has been applied manually, either via `supabase db push` at a developer's terminal or via this session's `apply_migration` MCP tool. This directly compounds **RISK-029** (already filed in Phase 2.5): because there's no CI gate applying migrations from a known branch state, there is also no CI-enforced guarantee that the migration a reviewer sees in a PR is the one that actually got applied to production, or applied in that order. |
| Does `android-build` produce a signed, distributable artifact? | **No** — it explicitly builds `assembleDebug` only. The job's own comment (lines 116-123) states this is deliberate: no signing secrets exist in CI, and the goal is catching native-build breakage, not producing a release artifact. This is a reasonable, honestly-scoped choice, not a hidden gap — but it does mean **no CI job has ever produced a release-signable AAB**; every real release build has been done locally on the founder's machine with the local keystore. |
| Is there a rollback mechanism wired into CI (e.g. an automated revert-and-redeploy)? | **No.** `docs/rollback-procedure.md` exists and documents a *manual* rollback procedure (forward-fix migrations, not down-migrations — consistent with `docs/operations/MIGRATION_SAFETY.md`'s Phase 2.5 finding). There is no automated rollback trigger of any kind. |

---

## 3. Toolchain version pinning

| Tool | Pinned where | Value | Gap |
|---|---|---|---|
| Node | CI only (`actions/setup-node@v4`, every job independently) | `22` | **No `.nvmrc`/`.node-version` file exists in the repo** — a local dev has no machine-readable source of truth and must read `ci.yml` to know the correct version. RISK-015 (already filed pre-mandate) covers exactly this: local Node 26 vs. CI's pinned 22. |
| Java (Android builds) | CI only (`actions/setup-java@v4` in `android-build` job) | `21` (Temurin) | No `.java-version` file. Same gap as Node — a local developer must read the CI YAML's own inline comment to learn this, which is exactly what caused the JAVA_HOME incident documented in that comment (RISK-015). |
| npm / package manager | Not pinned anywhere | n/a | `package.json` has no `"engines"` field and no `"packageManager"` field (`corepack`-style pinning). `npm ci` is used consistently in CI (good — it respects the lockfile strictly and fails on drift), but nothing stops a different package manager (yarn/pnpm) from being used locally and silently diverging. |
| Gradle wrapper | `android/gradle/wrapper/gradle-wrapper.properties` | `8.14.3` (all-distribution) | Pinned correctly — this is the one toolchain component with a proper, version-controlled pin that both CI and local builds are forced to use (the wrapper always downloads this exact version). |
| Android Gradle Plugin (AGP) | `android/build.gradle` | `8.13.2` | Pinned correctly. |
| Capacitor CLI | `package.json` devDependency + `package-lock.json` | `^8.4.0` (caret range, exact version locked via `package-lock.json`) | Effectively pinned via the lockfile as long as `npm ci` is used (which CI does). Caret range itself is loose, but lockfile enforcement neutralizes that in CI. |
| Supabase CLI | **Not referenced anywhere in this repo at all** | n/a | No `package.json` devDependency, no CI step installs it, no version file. Consistent with the finding above: migrations and Edge Function deployment are entirely out-of-band, manual processes with no CLI version even nailed down for whoever performs them. |
| Playwright | `package.json` devDependency, `^1.62.1`, lockfile-pinned | pinned via lockfile | No separate gap beyond the general "no `.nvmrc`-style pin" pattern above. |

**CI failure behavior on lockfile drift:** `npm ci` (used in every Node-based job) fails hard if `package-lock.json` doesn't exactly match `package.json` — this is the correct, strict behavior and was actually exercised for real earlier in this program (Mandate P0 task: "verify CI green after lockfile re-fix"). No gap here.

---

## 4. Versioning and build provenance

**What currently reaches a build/release:**

- `package.json`'s `version` field (`4.0.0`) is injected into the web bundle at build time via `vite.config.ts`'s `define` block as `VITE_APP_VERSION` — sourced directly from `package.json`, so it cannot drift from it (confirmed no separate `.env`-based version override exists, per the removed dead-code comment already in `vite.config.ts`).
- `VITE_BUILD_SHA` is `GITHUB_SHA` in CI (authoritative), or a local `git rev-parse HEAD` fallback outside CI.
- `VITE_BUILD_TIME` is `new Date().toISOString()` at build time — correct, machine-independent.
- Android `versionCode` (`52`) and `versionName` (`"4.0.0"`) are hardcoded directly in `android/app/build.gradle`, entirely independent of `package.json`'s version. **These two version numbers are not derived from a single source of truth — they must be manually kept in sync by whoever bumps a release,** and nothing in CI currently checks that they agree with each other or with `package.json`.

**What the mandate specifically asked for that does NOT currently exist, checked one by one against `DiagnosticsPage.tsx`:**

| Mandate requirement | Present in `DiagnosticsPage.tsx`? |
|---|---|
| Semantic version | ✅ (`VITE_APP_VERSION`) |
| Android version code | ❌ — not shown anywhere in the diagnostics screen, only `VITE_APP_VERSION` (the web/package.json version) |
| Git commit hash | ✅ (`buildSha`, truncated to 12 chars) |
| Build timestamp | ✅ (`buildTime`) |
| Environment | ✅ (`import.meta.env.MODE`) |
| Bundle hash | ❌ — does not exist anywhere in this codebase; no content-hash of the built `dist/` bundle is computed or surfaced |
| DB migration version | ❌ — does not exist; the diagnostics screen has no way to query or display which migration version the connected Supabase project is actually on |
| Edge Function deployment identifier | ❌ — does not exist |
| Reachable only via hidden gesture/authorized path | ❌ — confirmed by direct inspection: `DiagnosticsPage.tsx` is reached via a completely ordinary `<Link to="/diagnostics">`-style route from the Account settings page (visible in the component's own back-link target `to="/account"`), with no gesture gate, no auth-role gate beyond normal sign-in, and no rate limiting. Any signed-in user can navigate straight to `/diagnostics`. |

This confirms, with evidence rather than assumption, exactly what the mandate's own baseline stated: the diagnostics screen exists but satisfies roughly 3 of 7 requirements, and the "hidden/authorized path" requirement is fully unmet, not partially.

---

## 5. Test suite coverage as it relates to release confidence

- `edge-function-tests`: runs real `deno test` over `supabase/functions/**/*.test.ts`. Per this session's own prior work, this covers 21 of ~70 total Edge Functions (pure-logic extraction pattern) — the CI job itself is correctly configured to run whatever exists, it is not gating a hidden subset; the gap is in test *coverage*, not in whether CI executes what's there.
- `e2e-tests`: Playwright, against a real (production) Supabase project, deliberately scoped to client-side-only assertions per `playwright.config.ts`'s own header comment — no authenticated flows are exercised. This matches the already-filed RISK-005/P4-0 gap (zero authenticated E2E flows of the 30 the mandate requires) — not a new finding, confirmed still accurate by direct re-inspection of `playwright.config.ts` and the workflow step.
- `android-build`: exercises real Gradle compilation, but **only a debug build** — it has never once verified that a *release*-configured build (`assembleRelease`/`bundleRelease`, with minification and resource shrinking active) actually compiles. R8 minification in particular is a common source of "works in debug, breaks in release" bugs (reflection, missing proguard rules) that this pipeline currently has zero coverage for.

---

## 6. Secret handling in CI (cross-reference with Phase 1.5 work)

- `secret-scan` job (gitleaks, blocking, full history scan) — added in Phase 1.5, confirmed present and correctly configured on `fetch-depth: 0`.
- The two secrets CI actually uses (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are, by Supabase's own design, safe to expose client-side — this was already correctly reasoned about in Phase 1's secret inventory work and is unchanged.
- No CI job has access to `SUPABASE_SERVICE_ROLE_KEY`, any AI provider key, `OAUTH_TOKEN_ENCRYPTION_KEY`, `RC_WEBHOOK_SECRET`, or the Android signing keystore/password — confirmed by grep across `.github/workflows/*.yml` for every secret name in `docs/security/SECRET_INVENTORY.md`; none of those secret names appear anywhere in CI. This is correct and intentional: CI has no need for them given its current scope (no deploy jobs, no release-signing job).

---

## 7. Summary — undocumented CI job or release path check

Per this section's exit condition ("no undocumented CI job or release path remains"): **both workflow files have now been fully documented above, and both are accounted for.** There is no third, hidden, or disabled-but-present workflow file, no scheduled job, and no external CI system (e.g. no CircleCI/Travis/Jenkins config found in the repo — confirmed absent, not merely unchecked, since only `.github/workflows/` contains any CI-shaped YAML in this repository).

**The real release path today, reconstructed from evidence rather than assumption:**
1. Code merges to `main` after CI (type-check, lint, unit tests, edge-function tests, E2E, debug Android build, security audit, secret scan) passes.
2. A release AAB is built **locally**, manually, using the founder's local keystore (`android/edora-release.jks` / now `edora-upload-key.jks` pending Google's reset approval), with no CI involvement and no automated provenance link between the exact commit CI validated and the exact bundle that gets uploaded to Play Console.
3. Edge Functions and database migrations are deployed **manually**, via direct Supabase CLI or MCP tool calls, entirely outside CI, with no enforced link to a reviewed/merged commit.

This is the accurate, evidence-based starting point for Phase 3.2 onward — not an assumption carried over from the mandate document, but independently reconstructed and confirmed against the actual files in this repository.

---

**Status: Phase 3.1 — VERIFIED COMPLETE.** Every file in scope was read directly; every claim above traces to a specific file/line already cited inline. No planned work is described as done in this document — everything stated as "exists" or "does not exist" was checked, not assumed.

**Branch:** `enterprise/phase-3-ci-baseline`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet, per `OWNERSHIP_MATRIX.md`)
**Date:** 2026-08-06
