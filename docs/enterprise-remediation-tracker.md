# Edora Enterprise Remediation Tracker

Source: Enterprise Remediation Mandate (this document tracks every numbered section of that mandate).
Status values: **VERIFIED COMPLETE** / **PARTIAL** / **NOT STARTED** / **BLOCKED** / **N/A**.
No status was assigned from memory of prior session claims — every "VERIFIED COMPLETE" below has a command, file, or commit backing it, listed inline. Everything else defaults to NOT STARTED even if a prior session summary implied otherwise, per the mandate's rule not to trust previous task status without re-verifying.

Last updated: 2026-08-04. Owner: unassigned (no named owners exist yet for anything in this repo — see Section 45).

---

## 5.1 Dependency vulnerability remediation — PARTIAL

- Traced `tar` dependency chain via `npm ls tar` / `npm explain tar`: two chains found — root `@capacitor/cli@8.4.2 → tar@7.5.20` (in the vulnerable range `<=7.5.20`), and `@capacitor/assets@3.0.5 → @capacitor/cli@5.7.8 → tar@6.2.1`.
- **VERIFIED COMPLETE (partial scope):** root chain fixed via `npm update tar` (in-range bump to 7.5.22, confirmed via `npm view tar version` to be past the vulnerable ceiling). `npm audit fix` (no `--force`) additionally resolved the `undici` finding. Total: 20 → 17 vulnerabilities. Commit `70e39d0`.
- **BLOCKED:** the nested `@capacitor/assets → @capacitor/cli@5.7.8 → tar@6.2.1` chain has no available fix — `@capacitor/assets@3.0.5` is the latest published version (confirmed via `npm view @capacitor/assets versions`) and pins `@capacitor/cli@^5.3.0` internally; there is no newer release to upgrade to. This requires upstream action (an Ionic/Capacitor team release) or replacing `@capacitor/assets` with an alternative tool — not something resolvable from within this repo alone.
  - **Exposure analysis (evidence-based, not assumed):** `@capacitor/assets` is invoked only by one script, `npm run assets:generate` (confirmed via `grep` across `package.json` and `.github/workflows/*.yml` — zero CI references). It is never run automatically, only manually by a developer regenerating app icons/splash images from local PNG/SVG source files. It never processes user uploads, exports, or any untrusted archive.
  - **Decision record:** Package: `tar@6.2.1` (nested). Advisories: GHSA-34x7-hfp2-rc4v and 10 related CVEs (full list captured in commit `70e39d0`'s message). Exposure: dev-only, manual-invocation-only, no untrusted input path. Compensating control: not run in CI; developer machines only. Owner: unassigned. Review date: unset. Expiry: unset — **this is itself a gap**; per mandate rule 5.1.9 this exception needs an actual owner and expiry date, not just an analysis.
- **NOT STARTED:** the `uuid <11.1.1` (via `exceljs`/`xcode`) moderate finding — fix requires `npm audit fix --force`, which downgrades `exceljs` to `3.4.0`, a breaking change to this session's Word/Excel export feature. Per the mandate's explicit rule, this needs full export-regression testing (xlsx generation, formulas, multiple worksheets, Unicode/Indian-language text, large exports, mobile save/share, Microsoft Excel compatibility, Google Sheets compatibility, independent-library parse verification) before any downgrade is applied. None of that testing infrastructure exists yet.
- **NOT STARTED:** items 1-2 (full dependency chain documentation for every high/critical finding beyond `tar`), item 8 (written vulnerability decision record — partially exists above but not in the mandate's exact required format), items 9-10 (formal exception governance with owner/expiry).
- **NEW FINDING while wiring CI (§16 below):** `npm audit --omit=dev` (production-scope only) shows **8 vulnerabilities (4 moderate, 4 high), 0 critical** — the critical `tar` finding is confirmed entirely dev-scoped, consistent with the analysis above. Production scope surfaced two further findings, one now fully triaged (below) and one still open:

### `@huggingface/transformers` / `onnxruntime-node` / `adm-zip` / `sharp` — TRIAGED, confirmed unreachable, no fix needed

**Classification: unreachable dependency** (one of the mandate's own valid classifications, §5.1 item 2) — verified with direct evidence, not assumed, across three independent checks:

1. **Package export map.** `node_modules/@huggingface/transformers/package.json`'s `exports` field defines a `"node"` condition (resolving to `transformers.node.cjs`, which requires `onnxruntime-node`/`sharp`) and a separate `"default"` condition (resolving to `transformers.web.js`). Vite/browser bundling resolves via `"default"`, never `"node"`.
2. **The browser bundle itself.** `transformers.web.js` contains the bundler's own markers — `// ignore-modules:onnxruntime-node` and `// ignore-modules:sharp`, with `sharp` replaced by an empty stub (`var sharp_default = {}`) and `onnxruntime-node` excluded entirely. This is the package's own official browser-safe build, not an assumption about how bundlers *might* treat it.
3. **This project's actual built output.** `dist/assets/offlineModel.worker-*.js` (the real chunk shipped to users, confirmed via `find dist -iname "*offlineModel*"`) contains zero references to `onnxruntime-node` or any Node built-in (`node:fs`, `node:path`, `require('fs')` — all greps returned 0), and one reference to `onnxruntime-web` (the correct, browser-safe ONNX runtime).

`adm-zip`'s vulnerability (a crafted-ZIP 4GB memory-allocation DoS) is itself only reachable through `onnxruntime-node`'s own model-loading code — since `onnxruntime-node` is confirmed absent from the shipped bundle, `adm-zip` is transitively unreachable too. `sharp`'s libvips CVEs require actually invoking the stubbed `sharp_default({})` object, which ships empty in the browser build.

Additionally: `onnxruntime-node` and `sharp` are native-binding Node.js packages (compiled `.node` addons, `fs`/`process` API dependent) that **cannot physically execute inside a browser or Capacitor WebView JS runtime** regardless of bundling — even a hypothetical bundling mistake couldn't make this exploitable in the shipped app.

Checked for a version-based fix regardless: `4.2.0` (currently installed) is the latest published version (`npm view @huggingface/transformers versions`), and it still declares the same `onnxruntime-node`/`sharp` pins as required (not optional) `dependencies` — this is the package's stable architectural choice (it always ships both variants), not a bug awaiting a patch. There is nothing to upgrade to.

**Decision: accepted, no action needed, not a risk exception (the risk doesn't exist in the first place).** No owner/expiry assigned because this isn't a residual-risk exception under mandate rule 5.1.9 — it's a fully-closed non-finding. Documented here so the reasoning is auditable if a future package version changes this bundling behavior (worth a periodic sanity re-check, not a ticking exception).

### `react-router` / `react-router-dom` — TRIAGED, staying on 6.30.4 by deliberate decision (not an oversight)

Three distinct advisories apply to the installed `6.30.4`:
1. **GHSA-wrjc-x8rr-h8h6** (moderate) — open redirect via backslash in `<Link>`/`useNavigate`, range `>=6.0.0 <7.18.0`.
2. **GHSA-337j-9hxr-rhxg** (moderate, CVSS 6.1) — arbitrary constructor injection via `deserializeErrors()` during SSR hydration, range `>=6.4.0 <7.18.0`.
3. **GHSA-jjmj-jmhj-qwj2** (moderate, CVSS 6.9) — open redirect leading to XSS, range `>=6.30.2 <=6.30.4` (the installed version is right at the edge of this range).

**Attempted the upgrade rather than assuming it was safe or unsafe.** Bumped `react-router-dom` to `^7.18.2` (past all three ranges above) in an isolated, revertible change: `npm install` under Node 22, confirmed the resolved version was genuinely `7.18.2` via `npm ls`. This is where it got interesting — **re-running `npm audit` after the upgrade showed the vulnerability count unchanged (still 17), because a fourth, newer, HIGHER-severity advisory took its place:**

4. **GHSA-qwww-vcr4-c8h2** (high) — "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response," range `>=7.12.0 <8.3.0` — which covers `7.18.2` too. Checked whether a clean version exists at all: `npm view react-router-dom versions` confirms **no 8.x release exists yet** (`dist-tags.latest` is `7.18.2`). There is currently no published version of `react-router-dom` that sits outside all four advisories' ranges simultaneously.

**Decision: reverted to `6.30.4`, verified via `git status`/`git diff` showing zero diff after `npm install` restored the exact previously-committed lockfile state.** Reasoning: upgrading would trade two moderate/one-narrow-moderate finding for one *higher-severity* finding, with zero net reduction in audit-reported risk, plus real unverified migration risk across this app's ~99 routes (v6→v7 is a major version with documented breaking changes) for no actual security gain. This is a deliberate, evidence-based decision to hold, not an unexamined "leave it broken."

**Real-world exploitability of the advisories affecting the version actually installed (6.30.4):**
- The SSR-hydration constructor-injection advisory (#2) requires React Router's SSR/data-loading hydration path. This app is confirmed Vite-built, client-rendered only (no `@react-router/dev`, no SSR framework config found in the repo) — very likely unreachable, though this rests on absence-of-SSR-tooling rather than a line-by-line trace of `deserializeErrors()`'s call sites, so it is not claimed as fully closed the way the huggingface finding above is.
- The open-redirect advisories (#1, #3) require the app itself to pass attacker-influenced input into `<Link to={...}>` or `useNavigate(...)`'s target. Grepped the codebase for the pattern that would create this (`navigate()`/`Link` fed by `searchParams`, a `redirect`/`returnTo`/`next` query param, etc.) — **zero matches** across `src/`. This is strong evidence, not an exhaustive manual audit of all ~99 routes' navigation call sites, so it's marked **PARTIAL**, not fully closed.

**Residual risk, honestly stated:** three moderate-severity advisories remain active against the installed version, with a real (if not yet found) possibility that some navigation call site does pass through user-influenced data. No owner or expiry date assigned to this exception yet — that gap is itself noted, matching the same honesty gap already flagged for the `tar` exception above.

## 5.2 Privacy-policy deployment fix — BLOCKED (human action required)

- **Confirmed via `gh run list --workflow="Deploy Privacy Policy"`:** last 3 runs are all failures, dating to at least July 18 — predates this session.
- **Root cause confirmed via `gh run view --log-failed`:** `Error: You defined "--token", but it's missing a value` — the `VERCEL_TOKEN` GitHub Actions secret is unset or expired.
- **BLOCKED:** generating/rotating a Vercel deploy token and adding it as a GitHub secret requires a human with access to both accounts. I cannot do this.
- **NOT STARTED:** failure alerting for this workflow, a synthetic reachability/staleness check for the deployed policy URL, displaying a policy version/last-updated indicator, adding this to a release-readiness checklist (no such checklist exists yet — see 16).

## 5.3 Protect current users — NOT STARTED

No backup/recovery process has been documented in this repo. Supabase's own point-in-time-recovery status has not been checked this session (requires dashboard/plan-level verification, not just a query). No documented rollback procedure exists for migrations, edge functions, or mobile releases. No in-app build/version identifier has been confirmed to exist (not verified either way — needs a repo check). No formal "data loss / subscription issue / academic error" support path exists beyond the general `support@edora.app` email already in the privacy policy.

## 6. Testing foundation — NOT STARTED (numbers only, no new tests written)

Current state (verified by direct count, not estimate):
- Frontend: 9 test files, 64 tests (`npm run test` output), against 98 page components (`find src/pages -name "*.tsx" | wc -l`).
- Edge functions: 2 test files (`_shared/memoryExtraction.test.ts`, `_shared/rcEntitlement.test.ts`) against 68 functions (`ls supabase/functions | wc -l`).
- Zero E2E tooling of any kind in the repo (no Playwright, Cypress, Maestro, Appium, Detox config found).
- Zero visual regression tooling found.

None of Layers 1-5, the 74 required E2E journeys, or visual regression testing (section 6.3) have been started. This is the single largest gap in the mandate by volume of unstarted work.

## 7. Mobile build integrity — PARTIAL

- **VERIFIED COMPLETE (this session, as part of the dependency fix above):** ran `npx cap sync android` + a real `./gradlew clean assembleDebug` after the tar/undici update — confirmed BUILD SUCCESSFUL, 631 tasks, to verify the devDependency bump didn't break native tooling. This is a one-off verification, not the standing CI check the mandate requires.
- **NOT STARTED:** build-time commit/bundle-hash/build-number linking, a hidden diagnostics screen displaying them, a CI check that fails on stale bundles, environment separation (local/test/staging/production) with visible non-production indicators. Notably, this exact class of bug (a stale native build serving old UI) already happened once this session and was fixed by a manual clean rebuild — there is still no automated guardrail preventing recurrence.

## 8. Mock-test reliability — NOT STARTED beyond incidental fixes

Earlier this session, a question-navigation palette was added to `MockTestPage.tsx` and mock-test results were wired into weak-topic tracking (`topic_stats`) for the first time for any exam. Neither of those addressed exam-configuration versioning, idempotent submission, autosave-during-interruption, server-trusted timestamps, or any of the other items in this section. All of section 8's 30 items remain NOT STARTED except general negative-marking logic, which already existed in `src/lib/mockScoring.ts` prior to this session (not re-verified against this mandate's specific test requirements).

## 9. Authentication, authorisation, RBAC — NOT STARTED

No role-permission matrix exists. RLS policies exist per-table (confirmed throughout this session for specific tables — `topic_stats`, `cat_syllabus_progress`, `classroom_connections`, etc. — each individually reviewed when touched) but no consolidated cross-table RLS audit has been performed. No privilege-escalation, IDOR, tampered-JWT, or session-lifecycle testing has been done this session.

## 10. Secrets and credential management — NOT STARTED (as a formal inventory)

Individual secrets have been touched ad hoc this session (confirmed `GOOGLE_OAUTH_CLIENT_ID/SECRET`, Supabase service-role key usage patterns in edge functions, OAuth token encryption via `token-crypto.ts`). No formal secrets inventory, rotation policy, or leaked-secret Git-history scan has been performed.

## 11. Edge-function audit — NOT STARTED (stale task, now explicitly surfaced)

The pre-existing task "Audit all edge functions for retry+validate pattern" has been sitting in-progress for the entire session with no record of how many of the 68 functions were actually reviewed before work moved to other priorities. No matrix exists. This task should be either resumed to completion or explicitly closed as deprioritized — leaving it silently stale is itself a process failure the mandate calls out.

## 12. AI correctness and safety — NOT STARTED

No central AI gateway exists — each page/edge function calls its AI provider (Gemini/Groq/NVIDIA) directly. No prompt versioning, no golden evaluation sets beyond one existing eval harness pattern (`novo-eval-run`, referenced in earlier session work for `ai-question-gen` only — not the full per-subject golden sets this mandate requires). No academic-validation-state labeling exists on generated content.

## 13. Novo memory safety — PARTIAL

Memory system exists (`novo_memories`, decay/consolidation logic, confirmed earlier this session). Users cannot currently view, correct, or disable their own memories from any UI I've found — this needs verification via a dedicated repo search, which hasn't been done as part of this mandate response.

## 14. Privacy, minors, DPDP operations — PARTIAL

Privacy policy content was substantially rewritten this session for accuracy (DPDP language, real third-party disclosure, real OAuth scopes). Operational verification (does deletion actually remove data from every listed system — memories, analytics, exports, third-party processors) has not been tested end-to-end.

## 15. Incident response — NOT STARTED

No incident-response runbook exists anywhere in this repo.

## 16. CI/CD and release governance — PARTIAL (staged vulnerability enforcement only)

**VERIFIED COMPLETE (narrow scope):** added a `security-audit` job to `.github/workflows/ci.yml` implementing the mandate's own staged approach — "start with: fail CI on critical vulnerabilities, report high and moderate, produce a machine-readable artifact, create alerts":
- Blocking step: `npm audit --omit=dev --audit-level=critical` — scoped to production dependencies only, so the known unfixable dev-only critical (§5.1) can't permanently block every future PR with no resolution path. Verified locally to exit 0 today (0 critical in production scope).
- Non-blocking steps (`continue-on-error: true`): full-tree `npm audit --json` uploaded as a 90-day-retained artifact (`npm-audit-report`), plus a human-readable summary in job logs — both include the dev-scope critical for visibility, they just don't fail the build.
- Validated: YAML parses correctly, both audit commands tested locally with the exact flags used in the workflow, matching exit-code expectations.
- **This surfaced new findings** requiring separate triage (see §5.1 above): `@huggingface/transformers`/`onnxruntime-node`/`adm-zip`/`sharp` (high, real shipped-client code in `offlineModel.worker.ts`) and `react-router`/`react-router-dom` (moderate). Not fixed — out of scope for "wire audit into CI."
- **NOT STARTED:** every other §16 item — the full 22-stage pipeline (secret scanning, migration/RLS validation, mobile build/smoke tests, artifact signing/provenance, staged rollout), branch protection requiring this new job (branch protection currently requires "3 of 3" checks — type-check/lint/test/build are the 3; this 5th job exists but isn't yet a required check, which needs a repo-admin action I can't perform), release channels, and rollback documentation for every deploy surface.

## 16-45. CI/CD governance, observability, offline/sync, performance/load, content depth, educational measurement, UI/UX redesign, IA, splash/onboarding screens, payments, push, analytics governance, data model, code quality, feature flags, documentation, support/ops, product scope, CEO/CFO/COO/Education-Officer requirements

**NOT STARTED**, with two narrow exceptions:
- Content depth (§20): CAT QA expanded 12 → 77 questions this session (commit history shows the inserts; hand-verified, not AI-generated-and-hoped-for). DILR (11) and VARC (10) remain thin — explicitly flagged as in-progress, not complete.
- UI/UX (§22-31): a subset of pages were brought to a "v2" design spec in earlier session work, but this predates the mandate's specific IA/navigation requirements (§23's 5-tab structure, §31's separate admin design language) and has not been re-verified against them.

Everything else in this range — CI staged vulnerability enforcement, observability dashboards, offline conflict-resolution testing, actual load testing, mastery/readiness measurement definitions, feature flags, the full documentation set, support tooling, and every CEO/CFO/COO/Education-Officer structural requirement (named owners, councils, unit economics tracking) — is NOT STARTED.

## 47. Remediation sequence — Phase 1 status

Of Phase 1's 10 items: item 3 ("trace critical vulnerabilities") is VERIFIED COMPLETE, item 4 ("add CI vulnerability visibility") is NOT STARTED, item 2 ("fix the privacy-policy deployment") is BLOCKED on a human credential action, and items 1, 5-10 are NOT STARTED.

---

## Honest summary

Of this mandate's roughly 50 sections, **1 is verified complete within its actual scope (the fixable half of the dependency vulnerabilities), 4 are partial, 2 are blocked on actions outside this repo/session's ability to perform, and the remaining ~43 are not started.** This is not a discouraging result to report — it is the accurate one, and the mandate is explicit that inflating it would itself be a violation. The two P0 items with the most leverage per the mandate's own framing (§48's severity/impact structure) — dependency vulnerabilities and test coverage — have real, if partial, movement on the first and zero movement on the second.
