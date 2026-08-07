# Phase 3.2 — Deterministic Toolchain Versions

## Current behaviour before this change (from Phase 3.1's audit)

CI pinned Node (`22`) and Java (`21`) correctly, but only inside `.github/workflows/*.yml` — duplicated as a literal 7 separate times across two files, with no repo-root version file a local developer or any other tool could read. Local machine (this session) is running **Node 26.0.0** and **Java 17.0.16** — both genuinely different from CI's pins, confirming RISK-015's claim was accurate, not stale.

## What was changed

1. **`.nvmrc`** created at repo root, value `22` — matches CI's existing Node pin exactly (not a new decision, a codification of the existing one).
2. **`.java-version`** created at repo root, value `21` — matches CI's existing Java pin and the `android/gradle.properties` comment explaining *why* 21 is required (capacitor-android's Gradle module needs JDK 21 even though `app/build.gradle`'s `sourceCompatibility` targets 17).
3. **`package.json`**: added `"engines": { "node": "22.x" }` and `"packageManager": "npm@11.12.1"` (pinned to the locally-verified npm version, itself constrained by `package-lock.json`'s `lockfileVersion: 3`).
4. **Both CI workflow files**: all 7 occurrences of the hardcoded `node-version: 22` replaced with `node-version-file: '.nvmrc'`, so Node's version now has exactly one source of truth instead of 7 independently-editable copies that could silently drift from each other over time.
5. **Java pin left hardcoded in CI** (`java-version: "21"` in the `android-build` job), with a new inline comment explaining why: `actions/setup-java` has no equivalent of `setup-node`'s `node-version-file` input, so there is no way to make it read `.java-version` directly. The comment instructs future maintainers to bump both files together.

## What this does NOT do — stated honestly, not left implicit

- **Does not fix the local machine's actual Node/Java versions.** This session's machine is still running Node 26 and Java 17 after this change. `.nvmrc`/`.java-version` are the correct machine-readable signal for tools like `nvm use`/`jenv`/`asdf` to act on, but nothing in this change forces that to happen — it requires the founder to actually run the corresponding switch command locally.
- **Does not make `npm install`/`npm run dev` fail locally on the wrong Node version.** No `.npmrc` with `engine-strict=true` was added. This was a deliberate choice, not an oversight: enabling strict engine enforcement would have made the founder's own local `npm install` break immediately (Node 26 vs. required 22.x) without them having switched yet, which is a disruptive side effect a documentation/tooling task shouldn't introduce as a surprise. **This is named here as a residual option, not silently decided against forever** — see Residual risks below.
- **Does not add a `packageManager`-based Corepack enforcement.** The `packageManager` field is metadata `npm` itself does not enforce (only `corepack enable` acting on it would). No `corepack enable` step was added to CI. `npm ci`'s existing strict lockfile matching already provides the practical protection the mandate's "fail on lockfile drift" requirement asks for — this was true before this change and remains true after it, unrelated to the `packageManager` field's presence.
- **Does not touch Gradle wrapper, AGP, Capacitor CLI, or Playwright pinning** — Phase 3.1's audit already confirmed these are correctly pinned (Gradle wrapper via `gradle-wrapper.properties`, AGP via `android/build.gradle`, both Capacitor CLI and Playwright via `package-lock.json` enforced by `npm ci`). Nothing needed changing there.
- **Supabase CLI remains entirely unpinned**, because it remains entirely *unused* in this repo (Phase 3.1 finding, unchanged) — there is nothing to pin yet since no CI job invokes it. This is a Phase 3.3+ concern (release governance / migration automation), not a toolchain-pinning gap by itself.

## Validation performed

- `python3 -c "import yaml; yaml.safe_load(...)"` — both edited workflow YAML files parse without error after the `sed` replacement.
- `python3 -c "import json; json.load(...)"` — `package.json` remains valid JSON after the manual edit.
- `npm run type-check` — ran clean (`tsc -b --noEmit`, zero errors) against the existing `node_modules`, confirming the `package.json` edits didn't break the existing install in a way visible to TypeScript's project-reference build.
- **Not run this pass:** a real CI execution (would require pushing this branch and observing GitHub Actions actually resolve `node-version-file: '.nvmrc'` correctly — the YAML is valid and the `setup-node@v4` action's documented behavior supports this input, but "the YAML parses and the documented behavior should work" is not the same evidence tier as watching an actual green run). This should be verified in Phase 3's final validation pass before merge, not asserted as done here.
- **Not run this pass:** a full `npm ci` from scratch (would remove and reinstall `node_modules`, unnecessary risk/time for a metadata-only change when `type-check` already exercised the existing install successfully).

## Residual risks

- **Local toolchain drift is documented, not eliminated.** The founder's machine still runs Node 26/Java 17. Recommend switching locally (`nvm install 22 && nvm use 22`, and pointing `JAVA_HOME` at a JDK 21 install) as a follow-up, at low urgency since CI remains the authoritative gate for anything that actually ships.
- **CI's real-world behavior with `node-version-file` is unverified by an actual run** — flagged above, should be confirmed before this branch merges.
- **Java pin sync is manual, not automatic** — a future PR could bump `.java-version` without remembering to bump the CI YAML's hardcoded value (or vice versa), since nothing enforces they match. This is a known, accepted small gap, not hidden.

**Status: Phase 3.2 — PARTIALLY COMPLETE.** All originally-scoped pin files created and CI's Node duplication eliminated. Local machine alignment and a real CI-run verification remain open, both correctly named rather than assumed.

**Branch:** `enterprise/phase-3-ci-baseline`
**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet)
**Date:** 2026-08-06
