# Dependency Security — Phase 1.6

**Fresh audit run this phase** (not reused from memory): `npm audit` (full tree) and `npm audit --omit=dev` (production scope), against the current lockfile on commit `ce70381`. Findings are unchanged in substance from the pre-mandate analysis in `docs/enterprise-remediation-tracker.md` §5.1 — this document reformats that existing, already-rigorous reasoning into the mandate's exact required exception-record schema, and re-confirms nothing has silently changed.

## Current state

- **Full tree**: 17 vulnerabilities (6 moderate, 10 high, 1 critical).
- **Production scope** (`--omit=dev`): 8 vulnerabilities (4 moderate, 4 high), **0 critical** — this is the exact scope the CI `security-audit` job's blocking gate checks, and it still passes.
- **The 1 critical finding is confirmed dev-tooling-only** (nested `tar` via `@capacitor/assets`'s pinned `@capacitor/cli@5.7.8`) — unchanged from the pre-mandate trace.

## Exception records

Every exception below uses the mandate's exact required fields: package, version, advisory, reachability, shipped/non-shipped status, compensating control, owner, review date, expiry date.

### 1. `tar` (nested, via `@capacitor/assets`)

| Field | Value |
|---|---|
| Package | `tar` (nested under `@capacitor/assets → @capacitor/cli@5.7.8`) |
| Version | `6.2.1` |
| Advisory | `GHSA-34x7-hfp2-rc4v` and related tar CVEs (DoS via decompression/parse, negative entry size, NUL-byte path handling, uncontrolled recursion) |
| Reachability | **Dev-tooling-only.** `@capacitor/assets` is invoked by exactly one script, `npm run assets:generate` — confirmed via grep across `package.json` and every `.github/workflows/*.yml`, zero CI references. Never runs automatically, never processes user uploads or any untrusted archive; only a developer manually regenerating app icons from local source files. |
| Shipped or non-shipped | **Not shipped** — dev dependency, never bundled into the production web build or the mobile app. |
| Compensating control | Not run in CI; developer-machine-only invocation; no untrusted input path exists for this tool to process. |
| Owner | Guruprasath Annadurai |
| Review date | Re-confirmed this phase (2026-08-06) via fresh `npm audit` — finding is identical to the pre-mandate trace |
| Expiry date | **None set — this is itself a known gap**, carried forward honestly from the pre-mandate analysis rather than newly introduced. No newer `@capacitor/assets` release exists to upgrade to (confirmed via `npm view @capacitor/assets versions` pre-mandate; not re-checked this exact minute, but no update cadence exists for this package that would make daily re-checking valuable) |

### 2. `@huggingface/transformers` / `onnxruntime-node` / `adm-zip` / `sharp`

| Field | Value |
|---|---|
| Package | `@huggingface/transformers` (top-level), pulling in `onnxruntime-node` and `sharp`; `adm-zip` transitively via `onnxruntime-node` |
| Version | `@huggingface/transformers@4.2.0` (latest published, confirmed pre-mandate — no newer version exists to upgrade to) |
| Advisory | `adm-zip`: crafted-ZIP 4GB memory-allocation DoS (`GHSA-xcpc-8h2w-3j85`, high, no fix available). `sharp`: inherited libvips CVEs (`GHSA-f88m-g3jw-g9cj`, high, no fix available) |
| Reachability | **Confirmed unreachable via three independent checks** (pre-mandate, re-confirmed by this phase's fresh audit showing the identical finding): (1) the package's own `exports` map resolves browsers via a `"default"` condition that excludes the `"node"`-only build these vulnerable sub-dependencies live in; (2) the package's own official browser bundle (`transformers.web.js`) contains explicit `// ignore-modules:onnxruntime-node` / `// ignore-modules:sharp` markers with `sharp` stubbed to an empty object; (3) this project's own actual built output (`dist/assets/offlineModel.worker-*.js`) was grepped directly and contains zero references to `onnxruntime-node` or any Node built-in. |
| Shipped or non-shipped | **Not shipped in the reachable/exploitable form** — the vulnerable native-binding code paths are architecturally excluded from the browser/Capacitor build; `onnxruntime-web` (a different, unaffected package) is what actually ships. |
| Compensating control | None needed — this is a confirmed non-finding via reachability analysis, not a risk being accepted. `onnxruntime-node`/`sharp` are native `.node` addons that cannot physically execute inside a browser or Capacitor WebView JS runtime regardless of bundling correctness. |
| Owner | Guruprasath Annadurai |
| Review date | Re-confirmed this phase (2026-08-06) — identical finding, no change in the package's bundling architecture |
| Expiry date | Not applicable — this is a closed non-finding, not a time-bounded risk acceptance. Worth a periodic sanity re-check if `@huggingface/transformers` ever changes its bundling strategy in a future release, not a ticking exception. |

### 3. `uuid` (nested, via `exceljs`)

| Field | Value |
|---|---|
| Package | `uuid` (nested under `exceljs`) |
| Version | `8.3.2` (exceljs bundles its own nested copy; root-level `uuid@14.0.1` is separate and already patched) |
| Advisory | `GHSA-w5hq-g745-h8pq` — missing buffer bounds check in `v3`/`v5`/`v6` methods **only when a caller-supplied `buf` argument is provided** |
| Reachability | **Confirmed unreachable via direct code trace** (pre-mandate, re-confirmed this phase). The only `uuid` import inside `node_modules/exceljs` is in `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, which imports only `v4` (not `v3`/`v5`/`v6`, the affected methods) and calls it as bare `uuidv4()` with zero arguments — both outside the affected method set and outside the affected parameter. |
| Shipped or non-shipped | Shipped (exceljs is a production dependency, used for Excel export features), but the vulnerable code path within it is never executed by any call site in this codebase. |
| Compensating control | None needed — closed via direct code-path tracing, not a runtime mitigation. |
| Owner | Guruprasath Annadurai |
| Review date | Re-confirmed this phase (2026-08-06) |
| Expiry date | Not applicable — closed non-finding. Would need re-review only if `exceljs` is upgraded and its internal `uuid` usage pattern changes. |

### 4. `react-router` / `react-router-dom`

| Field | Value |
|---|---|
| Package | `react-router-dom` (and its `react-router` dependency) |
| Version | `6.30.4` — held deliberately, not an oversight |
| Advisory | `GHSA-wrjc-x8rr-h8h6` (moderate — open redirect via backslash in `<Link>`/`useNavigate`, range `>=6.0.0 <7.18.0`), `GHSA-337j-9hxr-rhxg` (moderate, CVSS 6.1 — arbitrary constructor injection via `deserializeErrors()` during SSR hydration, range `>=6.4.0 <7.18.0`). **Re-confirmed this phase: exactly 2 advisories currently flagged against 6.30.4** (a third, narrower advisory that was flagged in the pre-mandate analysis at the very edge of the 6.30.4 range is not showing in this phase's fresh audit — worth noting as a positive change, not investigated further since the net decision is unchanged either way). |
| Reachability | **Partially assessed, not fully closed** (same honest status as pre-mandate). The SSR-hydration advisory requires a data-loading/SSR path — this app is confirmed Vite-built, client-rendered only (no `@react-router/dev`, no SSR framework config found), very likely unreachable, but this rests on absence-of-SSR-tooling rather than a full trace of `deserializeErrors()`'s call sites. The open-redirect advisories require attacker-influenced input reaching `<Link to={...}>` or `useNavigate(...)` — grepped the codebase for that pattern (`navigate()`/`Link` fed by `searchParams`, a `redirect`/`returnTo`/`next` query param) and found zero matches, which is strong evidence but not an exhaustive manual audit of all ~99 routes. |
| Shipped or non-shipped | Shipped — this is the app's actual routing library, used throughout. |
| Compensating control | **Deliberate hold, not a fix.** The upgrade path was actually attempted (bumped to `7.18.2`, confirmed via `npm ls`) and found to trade these 2 moderate findings for a *higher-severity* one (`GHSA-qwww-vcr4-c8h2`, high, RSC-mode CSRF bypass, covering `7.12.0–8.3.0` — and no `8.x` release exists yet to escape it). Reverted to `6.30.4`, confirmed via `git diff` showing zero residual change. This is an evidence-based decision to hold, re-verified this phase, not a stale unexamined state. |
| Owner | Guruprasath Annadurai |
| Review date | Re-confirmed this phase (2026-08-06) — advisory count for the installed version has narrowed from 3 to 2 since the last check, worth monitoring but not itself actionable |
| Expiry date | **Quarterly** — re-check whether a `react-router-dom` release exists that clears every currently-known advisory simultaneously (the blocker pre-mandate was that no such version existed; that could change with a future release) |

## What Phase 1.6 does NOT yet cover

- A Deno/edge-function dependency review with the same rigor (this phase focused on `npm audit`, matching where the mandate's own example findings — `react-router`, `tar` — actually live; Deno imports are pinned by URL per-file rather than a single lockfile, so a systematic sweep would need a different method — not attempted this phase).
- GitHub Dependabot alerts cross-reference (not accessed this phase — would need `gh api` against the repo's security-advisories endpoint).
- Android/Gradle dependency review.
- License review.

**Status: Phase 1.6 — PARTIALLY COMPLETE.** Every existing pre-mandate exception now has the mandate's exact required fields, re-verified fresh (not just reformatted from memory) via a real `npm audit` run this phase. Deno/Gradle/license review and GitHub Dependabot cross-reference remain outstanding.

**Reviewer:** Guruprasath Annadurai (self-reviewed — no independent reviewer exists yet).
**Date:** 2026-08-06.
