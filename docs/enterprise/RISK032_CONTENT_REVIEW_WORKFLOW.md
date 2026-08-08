# RISK-032 — Content Review Workflow

Enterprise production-hardening pass, 2026-08-08. Scope: "build the content
review enforcement workflow infrastructure — do not unilaterally review
the 233 unreviewed CAT/BOARDS/UPSC questions yourself."

## What was actually found (not what was assumed going in)

The plan going in was to build a new admin UI for reviewing flagged
content. That plan was wrong within the first few queries — real
infrastructure for exactly this already exists and is more sophisticated
than anything that would have been built from scratch. The real work
turned out to be: find out why it's not working, fix that, and leave the
content-quality decision itself untouched.

### 1. The local git repo's `pyq-content-audit` was not what's running in production

`supabase/functions/pyq-content-audit/index.ts` in this repo, before this
pass, implemented a Groq-only audit against a `pyq_content.reviewed`
column and a `pyq_content_flags` table — both defined in
`20260801000000_admin_qa_pipelines.sql`. Querying production directly
showed **that migration was never applied there**: no `reviewed` column,
no `pyq_content_flags` table (`column "reviewed" does not exist` on a
direct query).

Production's actual, live, deployed `pyq-content-audit` is a **different,
more advanced implementation** that was never committed back to git: it's
NVIDIA Nemotron-primary with a Gemini fallback, operates directly on
`pyq_content`'s original `is_reviewed`/`flagged_for_review`/`review_notes`/
`reviewed_by` columns, is triggered by both an admin action and a nightly
cron job, and reports every run to a `cron_health` table (also missing
from the local repo — `_shared/cronHealth.ts` didn't exist here either).

**Fixed**: pulled production's real code for `pyq-content-audit/index.ts`
and `_shared/cronHealth.ts` back into git, so the repo reflects what
actually runs. The local repo's previous version, if ever deployed, would
have been a regression — it would have discarded the working Nemotron/
Gemini pipeline, the cron trigger, and cron_health reporting in favor of a
version that was never live-tested and depended on schema that doesn't
exist in production.

### 2. The real root cause of the 233-row backlog

`cron_health` showed the nightly audit **is running** — last run
2026-08-08 03:45 UTC — and it **did** pick up candidates from the backlog
(20 of the 233, its per-run batch limit). But the result was
`{"audited":0,"flagged":0,"inconclusive":20,"candidates_seen":20}`: every
single row came back inconclusive, meaning both the Nemotron and Gemini
calls failed for all 20 candidates. Given the code's own logic
(`if (!key) throw new Error('NVIDIA_API_KEY not configured')`), this
strongly suggests a missing or invalid provider API key in production —
though this pass cannot read secret values directly to confirm which key,
only that both providers failed for 100% of a 20-row sample, which is not
explainable by ordinary transient rate-limiting alone.

**This has been happening silently.** `cron_health` existed specifically
to catch this ("closes the silent failure blind spot found this session"
per the deployed function's own header comment) — but nothing ever read
that table. `monitoring-check` (the Slack-alerting cron) had five checks,
none of them cron_health.

### 3. Fixed: `monitoring-check` now watches `cron_health`

Added check #6: any `cron_health` row with `last_status = 'error'` fires a
critical alert; `'inconclusive'` fires a warning. `cron_health` only
stores each job's single latest run (no history), so this pass could not
build a "only alert after N consecutive failures" refinement the data
doesn't support — alerting on every non-success run is the honest choice
given that limitation. Verified the logic is correct by directly querying
production's real `cron_health` row and confirming it matches the new
check's exact trigger condition. Deployed to production; not deployed to
staging (staging never had `monitoring-check` or `pyq-content-audit`
running at all — these are admin/ops tooling, out of scope for the
staging E2E environment this session has otherwise used).

### 4. Fixed: a real gap in `reject` — but it turned out to already be fixed in production

While comparing the stale local file against production, this pass
initially found and fixed a genuine bug: the local file's `reject` action
only relabelled a flag row's status, never touching the underlying content
— meaning a human-confirmed-bad question would keep being served
indefinitely. **This fix is moot for production**: production's real
`reject` action already does the right thing
(`update({ is_active: false, flagged_for_review: false, reviewed_by })`
directly on `pyq_content`). The fix only mattered for the stale local
file, which has now been discarded in favor of syncing the real code.
Documented here so the finding isn't silently dropped, even though no
production change was needed for it.

### 5. Left alone, deliberately: the `pyq_content_flags` schema

This pass's migration (`risk032_pyq_content_flags_production_deploy`)
already applied `pyq_content.reviewed` + `pyq_content_flags` to production
**before** the discovery above — at that point it looked like the missing
piece the real audit tool needed. It doesn't: production's real
`pyq-content-audit` never references either. This is now a harmless,
empty, unused, RLS-locked table and column sitting in production —
flagged here as technical debt for a future cleanup pass to either wire up
a second use case or drop, not dropped unilaterally in this pass (dropping
schema is exactly the kind of action that deserves its own deliberate
review, not a same-pass reversal of a same-pass mistake).

## What was deliberately NOT done

**No content was marked reviewed.** The 233 unreviewed CAT/BOARDS/UPSC
rows remain exactly as Phase 12 found them. This pass did not run
`run_audit` manually, did not approve/reject any flagged item, and did not
touch `is_reviewed`/`flagged_for_review` on any real content row. The
founder decision Phase 12 already framed (commission a real review pass /
bulk-accept existing content / accept the documented gap) remains exactly
that — a decision for the founder, not something resolved by fixing the
tooling that would eventually carry out whichever option is chosen.

**`is_reviewed` RLS enforcement remains off**, as Phase 12 also concluded
— flipping it would zero out CAT/BOARDS/UPSC content immediately, a
product-breaking change requiring explicit sign-off, unrelated to whether
the audit tooling itself works.

## What this pass changed, concretely

1. `supabase/functions/pyq-content-audit/index.ts` — synced from
   production's real, live code (previously a stale, never-deployed draft).
2. `supabase/functions/_shared/cronHealth.ts` — added to the repo (existed
   in production, missing from git).
3. `supabase/functions/monitoring-check/index.ts` — added cron_health
   check (#6), deployed to production.
4. `supabase/migrations/20260808_risk032_pyq_content_flags_production_deploy.sql`
   — applied `pyq_content.reviewed` + `pyq_content_flags` (from
   `20260801000000_admin_qa_pipelines.sql`, previously unapplied to
   production) plus the missing `service_role` grant (same class of gap as
   every other RLS-without-grant finding this session). Currently unused
   by any live code path — flagged as cleanup debt above, not reverted.

## Recommendation for the founder

The actual blocker on the 233-row backlog is very likely a provider API
key issue in production (NVIDIA and/or Gemini), not a policy question.
Checking and fixing that key would let the existing, real, working
Nemotron/Gemini audit pipeline actually start clearing the backlog on its
own nightly cadence — a very different, much smaller ask than
"commission a manual review of 233 questions." Once the key issue is
confirmed and fixed, `monitoring-check`'s new cron_health alert will
surface immediately if it happens again.

**Status: RISK-032 — PARTIALLY COMPLETE.** The tooling gap (a broken,
silently-failing review pipeline, un-monitored) is fixed. The content
gap (233 unreviewed questions) is unchanged, correctly left to a founder
decision.
