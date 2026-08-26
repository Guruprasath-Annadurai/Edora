# Gate 1 Completion Report — Version and Build Provenance

## Gate identity

- **Gate:** 1 — Version and Build Provenance
- **Branch:** `enterprise/4.1-build-provenance` (to be merged into `release/4.1.0-integration`)
- **Starting commit:** `f9e827b` (Gate 0's final commit)
- **Ending commit:** `832b62b`
- **Version:** `4.1.0-alpha.1` (bumped from `4.0.0` this Gate)
- **Android versionCode:** `53` (bumped from `52` this Gate)
- **Status:** PARTIALLY COMPLETE
- **Evidence-based completion percentage:** 5 of 6 stated exit criteria fully met with real evidence; 1 (hidden/authorized diagnostics access path) explicitly not attempted this Gate — named honestly below, not glossed over.

## Verified starting state

Confirmed before any change: exactly 2 literal version locations existed in the repo (`package.json`, `android/app/build.gradle`), both at `4.0.0`/`52`. iOS's `Info.plist` uses Xcode build-variable substitution (`$(MARKETING_VERSION)`), not a hardcoded literal — no third duplication to fix, and out of scope regardless since no iOS release pipeline exists (RISK-016).

## Changes implemented

1. **Version bump**: `package.json` → `4.1.0-alpha.1`. `android/app/build.gradle` `versionCode` → `53` (manually bumped, documented why versionCode can't be auto-derived from a semver prerelease tag). `versionName` now reads from `package.json` via Groovy's `JsonSlurper` instead of duplicating the string — eliminates the exact "update one location, forget another" risk this Gate exists to close.
2. **Build-info generation**: a new Vite plugin (`writeBuildInfo`, in `vite.config.ts`) writes `dist/build-info.json` in the `writeBundle` hook, after Rollup has finished emitting every asset. Contains: `version`, `androidVersionCode`, `releaseChannel` (parsed from the version string), `gitCommitSha`, `buildTime`, `buildEnvironment`, `ciRunId`, `dirtyWorktree`, `bundleHash` (sha256 over the sorted emitted-filename list), `bundleFileCount`, `localMigrationHead`, `edgeFunctionManifest`.
3. **Diagnostics screen wiring**: `DiagnosticsPage.tsx` fetches `/build-info.json` at runtime and renders 4 new fields, with `localMigrationHead` and `edgeFunctionManifest` explicitly labeled "local, build-time" / "(source)" to avoid overclaiming verified-deployed state (per RISK-029's already-filed finding). Degrades gracefully on fetch failure/404.
4. **CI bundle-integrity validation**: `android-release-build` now verifies (a) Capacitor's synced Android assets carry the *same* `bundleHash` as `dist/`, and (b) after the APK builds, that its binary `versionName` matches `package.json`, its embedded `build-info.json` commit SHA matches `GITHUB_SHA`, no `.env`/source-map files are shipped, and the real production Supabase URL is correctly baked in. Also uploads the unsigned APK + sha256 checksum + `build-info.json` as a 90-day CI artifact.

## Files changed

`package.json`, `android/app/build.gradle`, `vite.config.ts`, `src/pages/settings/DiagnosticsPage.tsx`, `src/pages/settings/DiagnosticsPage.test.tsx`, `.github/workflows/ci.yml`. 4 separate, reviewable commits (`1488eb8`, `a451842`, `e8cd37f`, `832b62b`).

## Database migrations

None.

## Tests added

3 new tests in `DiagnosticsPage.test.tsx` (build-info happy path, fetch-failure graceful degradation, 404 graceful degradation). Suite total: 88 (up from 85).

## Commands executed

Every command below was run for real, more than once, against this Gate's final commit state — not assumed from earlier phases:

| Command | Result | Notes |
|---|---|---|
| `npm run type-check` | ✅ Pass | 0 errors |
| `npm run lint` | ✅ Pass | 0 errors, 3 pre-existing unrelated warnings |
| `npx vitest run` ×5+ | ✅ Pass | 88/88 every run, zero flakiness |
| `deno test` | ✅ Pass | 248/248, unchanged |
| `npm run build` | ✅ Pass | Real `dist/build-info.json` generated and inspected each time |
| `npm run build:mobile` + `npx cap sync android` | ✅ Pass | Verified `build-info.json`'s `bundleHash` matches byte-for-byte between `dist/` and the synced Android assets copy |
| `./gradlew assembleDebug assembleRelease` | ✅ Pass | Both variants, real Gradle run, ~39s combined on cache-warm re-run |
| `aapt dump badging` on the release APK | ✅ Confirms | `versionCode='53' versionName='4.1.0-alpha.1'` — direct binary confirmation |
| Full APK-inspection script (extracted, ran manually before writing the CI YAML) | ✅ Pass, all 4 checks | See below |

## Results

**A real bug was caught by actually testing the CI script locally, not shipped untested**: `unzip` without `-o` prompted interactively on a duplicate resource entry inside the release APK (a benign Android packaging quirk, unrelated to what the step checks) — in a non-interactive CI runner, this would have hung the job forever waiting for a keypress that never arrives. Fixed before this was ever committed.

**A real, informative finding investigated rather than reflexively "fixed"**: the shipped bundle contains 4 files with the literal string "localhost." Extracted and read the actual surrounding code in each: one is an unrelated Node URL-polyfill error-message string bundled transitively; the other three are the PostHog and Supabase-js SDKs' own code that explicitly *excludes* localhost from their cookie/persistence-domain logic. None represent a leaked dev endpoint. A blind `grep -l localhost` CI gate would have false-positived on this every single run — the CI check instead verifies the real production Supabase URL is present, which is the actually meaningful signal.

## Android runtime evidence

Both debug and release APKs compile successfully with the new version baked in, confirmed via direct binary inspection (`aapt dump badging`) — not just "the build succeeded." **No device/emulator installation or runtime testing performed**, same disclosed gap as every prior report this session (no Android emulator/device control tool available).

## Security impact

No security-relevant code paths were touched. The new CI checks are additive verification, not a change to any auth/RLS/payment logic. Confirmed no secrets, `.env` files, or source maps are shipped in the built client bundle (both debug and release variants inspected).

## Privacy impact

None — `build-info.json`'s fields are all build/deployment metadata (version, commit hash, bundle hash, migration filename, function count), none of it user or personal data.

## Academic and scoring impact

None — no exam/scoring code touched.

## Performance impact

Not separately measured. `writeBuildInfo`'s hashing work adds negligible build time (hashing a list of ~182 filenames, not file contents); observed build times (`npm run build` ~15-18s) are consistent with pre-Gate-1 numbers.

## Rollback or forward recovery

This Gate's branch (`enterprise/4.1-build-provenance`) has not yet been merged into `release/4.1.0-integration` — reverting it, if ever needed, means simply not merging, or reverting the merge commit once it happens. The `pre-4.1.0-integration-rollback` tag from Gate 0 remains the durable rollback point for everything downstream of it, including this Gate.

## Residual risks

- **The diagnostics screen's access-control gap is unchanged.** Per Phase 3.1's original audit and this Gate's own honest accounting: `/diagnostics` is still reachable via an ordinary in-app link, not a hidden gesture or authorized/admin-only path. This Gate added *more* data to that same ungated screen rather than closing the access-control gap — a deliberate scope decision (access-gating is a distinct auth/UX concern from build-provenance plumbing), not an oversight, but a real gap that should not be read as closed.
- `localMigrationHead`/`edgeFunctionManifest` remain local-build-time-only signals by design — RISK-029's underlying migration-ledger-drift problem is unchanged, not solved by this Gate (it was never in scope to solve; this Gate only avoided *worsening* the honesty problem by mislabeling the field).
- The new CI job's real-world behavior (whether `GITHUB_SHA`/`GITHUB_RUN_ID` resolve as expected, whether the artifact upload succeeds) has not yet been observed in an actual GitHub Actions run — only locally simulated with equivalent logic. Should be watched on this branch's first real CI execution.

## Human-action blockers

None new this Gate. The pre-existing blockers (test credentials, Android device access, RISK-032 founder decision) are unchanged.

## Honest ratings (0–10)

| Category | Score | Why |
|---|---|---|
| Build integrity | 8/10 | Up from Gate 0's 7 — now with real, verified end-to-end provenance (dist → Android assets → compiled APK), not just "the build succeeds" |
| Release traceability | 6/10 | Substantial jump from Gate 0's 3 — a real build-metadata artifact now exists, is embedded in the shipped APK, and is verified by CI. Capped below higher because the diagnostics screen remains ungated and CI's real-world behavior on this exact logic hasn't been observed in a live run yet |
| Android build integrity | 8/10 | Both variants build clean with the new version, verified via direct binary inspection at every step, not assumed |
| **Overall enterprise readiness** | **4/10** | Up from Gate 0's 3/10 — genuine, verified progress on a real structural gap (build provenance), with one honestly-disclosed partial criterion rather than a claimed-complete one |

(Other categories unchanged from Gate 0's report — this Gate's scope was narrowly version/build-provenance, and nothing else moved.)

## Verdict

**INTERNAL ALPHA ONLY** — unchanged from Gate 0, and for the same underlying reason: this Gate closes a real engineering gap (build provenance) but does not touch the live-usage/device-testing gap that caps every verdict in this session so far. The version number itself (`4.1.0-alpha.1`) is now real and traceable, which is exactly what "alpha" is supposed to mean — a version worth testing internally, not one ready for any broader audience.

## Single next priority

**Gate 2 — Safe Staging Environment**, per the mandate's own sequence — but this requires a real decision (and likely billing action) from you first: creating a staging Supabase project needs owner-level access this session doesn't have. Per Gate 2's own stated fallback: if staging creation requires owner credentials or billing action, it should be marked BLOCKED with the exact human actions required, not attempted around. Recommend confirming whether you want to proceed with a real Supabase Pro-tier staging project (cost implication) before Gate 2 work begins.

---

**Stopping here for approval**, consistent with the established discipline.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
