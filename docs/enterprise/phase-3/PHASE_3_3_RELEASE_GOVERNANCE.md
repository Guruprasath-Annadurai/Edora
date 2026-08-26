# Phase 3.3 — Release Build Provenance (CI release-config gate + diagnostics versionCode)

**Scope note:** the user's pasted mandate text for this program was truncated mid-Phase-3.2 in the conversation that requested this work — the literal text for "Phase 3.3" was never actually seen. Rather than fabricate compliance with a spec that wasn't visible, this phase's scope was derived directly from two concrete, evidence-based gaps Phase 3.1's audit already named: (1) zero CI coverage for a release-configured Android build, and (2) the diagnostics screen missing the Android versionCode field. This is stated plainly so the phase's scope is traceable to real findings, not assumed mandate text.

## 1. CI release-build gate

### Current behaviour before this change
`android-build` (existing job) only ever ran `assembleDebug`. No CI job had ever compiled the `release` build variant, which has R8 minification and resource shrinking active (`android/app/build.gradle`'s `buildTypes.release` block). Minification is a well-known source of "works in debug, breaks in release" failures (reflection, missing ProGuard/R8 keep rules) that debug-only CI coverage cannot catch.

### Risk identified
A release build could silently start failing (or silently misbehave post-minification, e.g. a stripped reflection-dependent class) with zero CI signal, only discoverable when the founder ran a real signed release build locally — the worst possible time to discover it.

### Validation performed BEFORE adding this as a CI job (not after)
Ran the actual release build locally, using JDK 21 (matching CI's pin) and the Android SDK already present on this machine:
1. First attempt (`./gradlew assembleRelease --no-daemon`) **failed** — but not from minification. `android/keystore.properties` still exists locally and points at the now-locked `edora-release.jks` (RISK-026); Gradle's `signingConfig` block applies whenever that file exists, so it tried to sign with the known-bad password and failed with `KeytoolException: keystore password was incorrect`. This is expected local behavior, not a CI-relevant finding — CI never has `keystore.properties` (correctly gitignored, confirmed absent from every workflow and from git history in Phase 3.1's audit).
2. To get a clean read matching CI's actual environment, temporarily renamed `keystore.properties` aside (non-destructive `mv`, restored immediately after) and re-ran the build.
3. **Result: `BUILD SUCCESSFUL in 42s`.** The release-configured build — R8 minification, resource shrinking, all active — compiles cleanly, unsigned, producing `app-release-unsigned.apk` (53.4 MB). `keystore.properties` was restored to its original location immediately after this test; nothing about the local keystore state was altered.

This is real, first-attempt evidence of a genuine failure (the keystore issue) followed by real, second-attempt evidence of success (the actual thing being tested) — not a single clean run assumed safe.

### What was changed
Added a new CI job, `android-release-build`, to `.github/workflows/ci.yml`:
- Mirrors the existing `android-build` job's structure (Node/Java setup, Gradle cache, `npm run build:mobile` → `npx cap sync android`).
- Runs `./gradlew assembleRelease --no-daemon` instead of `assembleDebug`.
- **Blocking** (no `continue-on-error`) — given the local validation above confirmed this currently passes, making it a hard gate is justified; a future regression here should fail CI, not be silently tolerated.
- Produces an **unsigned** APK only, by construction (CI has no `keystore.properties`, so `build.gradle`'s own guard skips the signing step) — this job proves the release *configuration* compiles, it does not produce and never uploads a distributable artifact.
- **One deliberate inconsistency, disclosed rather than silently left**: this new job hardcodes `node-version: 22` rather than referencing `.nvmrc` via `node-version-file`, because this branch (`enterprise/phase-3-release-governance`) was created from `main`, which predates Phase 3.2's toolchain-pinning work (that lives on the separate `enterprise/phase-3-ci-baseline` branch and hasn't merged yet). A code comment on the new job explains this and instructs switching to `node-version-file: '.nvmrc'` once that branch merges. This was caught and fixed during this same session — an earlier draft of this job referenced `.nvmrc` before I checked whether the file actually existed on this branch, confirmed it didn't, and corrected it before committing.

### What this does NOT do
- Does not produce a signed, distributable release artifact — that still only happens locally, manually, as documented in Phase 3.1's audit. Solving that (a fully automated, provenance-linked signed release pipeline) is a larger undertaking than this phase's scope and would need a real decision about whether release signing secrets should ever live in CI at all — not attempted here.
- Does not add CI coverage for iOS (no iOS release pipeline exists per RISK-016, unchanged).
- Does not verify the release build's *runtime* correctness (e.g. that a minified reflection-dependent code path actually still works when executed) — only that it *compiles*. Runtime verification of a release build would require either an emulator/device test run in CI or a manual install-and-smoke-test step, neither of which exists yet.

## 2. Diagnostics screen — Android version code field

### Current behaviour before this change
Per Phase 3.1's audit, `DiagnosticsPage.tsx` satisfied 3 of 7 mandate-required fields. The Android versionCode field was missing because it's a native-only value baked into `android/app/build.gradle` at build time, with no existing bridge exposing it to the web/JS layer.

### What was changed
`@capacitor/app` (already an existing dependency, no new package added) exposes `App.getInfo()`, whose `AppInfo.build` field is documented directly in its own TypeScript definition as: *"The build version. On iOS it's the CFBundleVersion. On Android it's the versionCode."* Confirmed this by reading the type definition directly (`node_modules/@capacitor/app/dist/esm/definitions.d.ts`) before using it, not from memory of the API.

Added a `nativeApp` state fetched via this same existing dynamic-import pattern the page already uses for `@capacitor/device`, and a new "Android version code" field that renders only when `nativeApp` is populated (i.e., only on native platforms — it's conditionally spread into the `fields` array, same pattern as the existing device-info fields).

### Tests added
`DiagnosticsPage.tsx` had **zero** existing test coverage before this phase (confirmed via `find` — no matching test file existed). Added `src/pages/settings/DiagnosticsPage.test.tsx` with 3 tests:
1. Core fields (App version, Build commit, Environment) render on web.
2. "Android version code" does **NOT** render on web — this is a real negative-case assertion, not just a happy-path check, and matters because a stray "undefined" in a support-diagnostics screen would actively mislead whoever's troubleshooting a bug report.
3. "Android version code" renders with the correct value (`52`, the actual current `versionCode`) when `Capacitor.isNativePlatform()` is mocked true and `@capacitor/app`'s `getInfo()` is mocked to resolve realistic `AppInfo`.

All 3 passed on first real run (not iterated to green after a failure — reported honestly either way, but this is what happened).

### Remaining gaps in the diagnostics screen (from Phase 3.1's original 7, now updated)

| Mandate requirement | Status after this phase |
|---|---|
| Semantic version | ✅ (unchanged, already present) |
| Android version code | ✅ **added this phase** |
| Git commit hash | ✅ (unchanged) |
| Build timestamp | ✅ (unchanged) |
| Environment | ✅ (unchanged) |
| Bundle hash | ❌ still missing — would require a build-time content-hash computation of `dist/`, not attempted this phase |
| DB migration version | ❌ still missing — would require a live query against the connected Supabase project's migration ledger from the client, which raises its own question of whether an ordinary authenticated user should be able to query that at all; needs a scoped RPC or admin-only gate, not a quick add |
| Edge Function deployment identifier | ❌ still missing — no existing mechanism anywhere in this codebase surfaces this; would need new backend work |
| Reachable only via hidden gesture/authorized path | ❌ **still unmet** — this phase did not touch routing/access to `/diagnostics`; it remains an ordinary link. This is arguably the single most important of the 7 requirements from a security-hygiene standpoint (limiting who can see build/environment internals) and deliberately was not attempted in this same pass to keep this phase's diff small and reviewable, not because it was forgotten. |

**4 of 7 now satisfied (up from 3 of 7).** Bundle hash, DB migration version, Edge Function deployment ID, and the hidden-path gate remain open — named explicitly as candidates for a future Phase 3.x sub-item, not silently dropped.

## Validation summary

- `npm run type-check` — clean, zero errors, both after the CI YAML edit and after the DiagnosticsPage edit.
- `python3 -c "import yaml; yaml.safe_load(...)"` — `ci.yml` re-validated as parseable after adding the new job.
- `npm run test` (full suite) — **85 tests passed, 12 files** (up from 82 tests / 11 files pre-phase), zero failures, zero skipped.
- Real local `./gradlew assembleRelease` run, twice (once revealing the real keystore-lock issue, once confirming success under CI-accurate conditions) — not merely asserted safe from reading the Gradle config.

## Residual risks

- The new `android-release-build` CI job has not yet been observed running for real in GitHub Actions (same caveat as Phase 3.2's `node-version-file` change) — local validation is strong evidence but is a different execution environment (macOS + locally cached Gradle/SDK vs. a fresh `ubuntu-latest` runner). Should be watched on this branch's first real CI run before merge.
- The Node-version-pin inconsistency between this job and the rest of the file (hardcoded `22` here vs. `.nvmrc` reference elsewhere once `phase-3-ci-baseline` merges) is a known, disclosed, temporary state — not a permanent design decision.
- The diagnostics screen's most security-relevant gap (no hidden/authorized-path gate) remains fully open.

**Status: Phase 3.3 — PARTIALLY COMPLETE.** Both scoped items (release-build CI gate, diagnostics versionCode field) are implemented, tested, and validated with real evidence. The diagnostics screen's remaining 3 gaps (bundle hash, DB migration version, Edge Function deployment ID) and the access-control gap are explicitly out of scope for this pass, not silently missed.

**Branch:** `enterprise/phase-3-release-governance`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
