# Secret Incident Runbook — Phase 1.5

**Status: first version, unrehearsed.** Built to reference only real, already-built tooling — no fictional on-call system or paging described. Cross-references `docs/incident-response.md` (the general incident runbook, pre-mandate) rather than duplicating it — this document is specifically about secret leaks/compromise.

## When this runbook applies

- A `gitleaks` CI finding (new: this phase's `secret-scan` job) that isn't a confirmed false positive.
- A secret found hardcoded in client-shippable code (already happened once — `EVAL_SECRET`, see `docs/security/SECRET_INVENTORY.md`).
- A third-party breach notification naming this project or one of its providers.
- Any suspicious usage pattern noticed for an API key (unexpected cost spike, unfamiliar request origin — though no such monitoring currently exists, see residual gaps below).

## Immediate steps (first 15 minutes)

1. **Identify exactly which secret, and its tier** — check `SECRET_INVENTORY.md`. Tier 1 (financial/highest-blast-radius) gets everything below done immediately; lower tiers can be handled same-day rather than instantly, but should not be deferred past 24 hours.
2. **Rotate the secret at the provider console immediately** — do not wait to fully understand the scope of exposure first. A rotated secret stops working for an attacker regardless of how much of the story you've reconstructed.
3. **`supabase secrets set KEY=<new-value>`** and redeploy any Edge Function that needs to pick it up immediately rather than waiting for a natural cold start (see `SECRET_ROTATION_POLICY.md`'s special cases for `OAUTH_TOKEN_ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY` specifically — these have real rotation-breaks-things caveats, but in an active-compromise scenario, breaking functionality temporarily is the correct tradeoff over leaving a live compromised credential active).
4. **If the secret was ever committed to git** (not just referenced by name, the actual value): rotation neutralizes it going forward, but the value remains in git history permanently unless history is rewritten (`git filter-repo`/BFG) — which is disruptive to every collaborator's clone and should not be done reflexively. For a rotated secret, history-rewriting is usually **not** necessary (the old value is dead once rotated); only consider it if the leaked value itself (not just its access) causes ongoing harm.

## Investigation (same day)

5. **Determine exposure window**: when was the secret committed, and for how long was it live in that state? `git log -p -- <file>` or `gitleaks git --log-opts="--all"` (already run once pre-mandate, see `docs/secrets-inventory.md`) to find the exact commit.
6. **Determine blast radius**: what could the secret have been used for during the exposure window? Check the provider's own access/usage logs if available (e.g., Gemini/Groq API usage dashboards, Razorpay transaction logs, RevenueCat webhook delivery logs) — **no centralized logging currently aggregates this across providers**, so this step currently means checking each provider's own console individually, one at a time.
7. **Check for actual misuse**, not just theoretical exposure — unexpected charges, unfamiliar IP patterns, unexpected data access. Document findings even if the answer is "no evidence of misuse found" — that's a real, useful finding, not nothing.

## Communication

8. **If user data was actually accessed** (not just a secret being exposed, but confirmed misuse reaching real user data): this triggers DPDP breach-notification obligations. **No legal contact or formal breach-notification process exists yet** (same gap `docs/incident-response.md` already states plainly) — this is the point where that gap becomes acute, not theoretical. Flagged here explicitly rather than pretending a process exists.
9. **If no evidence of misuse**: document the incident (this file's "Incident log" section below), rotate, close. No external notification obligation in that case.

## Post-incident

10. Update `SECRET_INVENTORY.md`'s "Last rotation" date for the affected secret.
11. Add a line to the incident log below — every real incident, not just ones that "count" as severe, so the log stays honest about frequency.
12. If the root cause was a process gap (e.g., a secret hardcoded because there was no established pattern for reading it from env), fix the pattern, not just the instance — this is what happened with `EVAL_SECRET`: the fix wasn't just "stop hardcoding this one string," it was "add a real role check so no hardcoded bypass string could ever have worked in the first place."

## Incident log

| Date | Secret | What happened | Rotated? | Evidence of misuse found? | Root cause fix |
|---|---|---|---|---|---|
| Pre-mandate (exact date not recorded in prior session output) | `EVAL_SECRET` (as a hardcoded literal, `'novo-eval-secret-2026'`) | Found via `gitleaks` git-history scan: hardcoded in 3 places including client-shippable `EvalDashboardPage.tsx`. `novo-eval-run`'s auth accepted this literal via an `x-eval-secret` header, and the eval dashboard route had no role gating at all. | **No** — the authorization-bypass code path was fixed (real `has_role(auth.uid(),'admin')` check added, verified live), but the `EVAL_SECRET` value itself was never rotated. **This is the runbook's own first, currently-open action item.** | Not investigated as part of that pass (no provider-usage-log review was performed) | Yes — added a real server-side role check so no hardcoded string can ever bypass auth again, regardless of the specific secret's value |

**This incident is not closed.** Per this runbook's own step 3, the immediate next action for whoever has Supabase dashboard access is: `supabase secrets set EVAL_SECRET=<new-random-value>`.

## Residual gaps in this runbook, stated honestly

- No automated provider-usage-anomaly monitoring exists — step 6 currently means manually checking each provider's console, not an automated alert.
- No legal/breach-notification contact or process exists (step 8) — this is the same gap `docs/incident-response.md` already flags, repeated here because it's directly relevant to secret incidents specifically.
- This runbook has never been rehearsed under real or simulated conditions.

**Status: Phase 1.5 (runbook portion) — VERIFIED COMPLETE as a first version, unrehearsed.**

**Reviewer:** Guruprasath Annadurai (self-reviewed).
**Date:** 2026-08-06.
