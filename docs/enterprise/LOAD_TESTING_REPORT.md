# Load, Scale and Resilience Testing Report

Phase 11 of the enterprise remediation mandate (RISK-011, High). Last
verified 2026-08-07.

## Where this starts from

Zero load testing had ever been performed against this system before
this phase — the tracker's own pre-mandate note says so, and a search
for any existing load-test tooling, script, or report in the repo
confirmed it: nothing existed. The safe concurrent-user ceiling was
genuinely unknown going in.

## The real constraint this phase has to work inside

The mandate's acceptance criteria is explicit: **"Load-test reports at
100/500/1,000/3,000/peak stages with measured p95 latency and error
rate."** That scale was not run this phase, and running it — against
either environment available — would not have been a responsible way to
get there:

- **Production** is real, revenue-generating infrastructure with real
  paying students. Deliberately generating 500–3,000 concurrent synthetic
  requests against it, without monitoring, a rollback plan, and explicit
  founder sign-off on the risk of a self-inflicted outage during a real
  student's exam-prep session, is not a decision to make unilaterally
  inside a docs-and-code remediation pass.
- **`edora-staging`** is a Supabase **free-tier** project
  (`get_connection_stats()`: `max_connections: 60`). Free-tier Postgres
  connection ceilings are far below what 500–3,000 concurrent virtual
  users would need even for PostgREST's own connection pooling to stay
  healthy. Running the mandate's literal stages against it wouldn't
  reveal anything about how the *application* behaves under real load —
  it would just demonstrate that a free-tier project has a free-tier
  ceiling, which is already known, and risks tripping Supabase's own
  abuse detection on a project that isn't provisioned for this.

Reaching the mandate's literal acceptance criteria requires a decision
this pass didn't have standing to make alone: provision a paid,
load-test-capable Supabase project (matching or exceeding production's
actual tier), or get explicit authorization for a carefully-monitored,
off-peak production run with a kill switch and someone watching
dashboards live. Flagging this honestly rather than either skipping load
testing entirely or quietly running an unauthorized, unsafe-scale test to
check the acceptance-criteria box.

## What was actually built and run this phase

**Tooling**: `docs/enterprise/load-testing/k6-baseline.js` — a real k6
script (the industry-standard load-testing tool; installed via
`brew install k6` for this pass), not a hand-rolled approximation. It
contains the mandate's full staged ramp profile
(`MANDATE_STAGES`: 100 → 500 → 1,000 → 3,000 → peak) as real, runnable
k6 config — so the moment a suitable environment exists, this script
runs against it unmodified; only the target URL/credentials and which
`stages` array is active need to change.

**What was actually executed**: a small, safe smoke-scale run
(`SAFE_SMOKE_STAGES`: ramping 5 → 20 virtual users over ~90 seconds)
against `edora-staging`, hitting a real authenticated read
(`GET /rest/v1/pyq_content?select=id,subject&limit=5`) — a representative
cheap, indexed, real-content-table read, not a synthetic no-op endpoint.
Deliberately did **not** hit an AI-calling edge function (would burn real
provider spend per iteration, and is now gated by Phase 7's cost ceiling
regardless) or repeatedly hit the auth token endpoint (Supabase
rate-limits Auth aggressively; hammering it would measure Auth's rate
limit, not the app).

### Results (20 VUs peak, ~90s total, edora-staging)

| Metric | Value |
|---|---|
| Total requests | 992 |
| Success rate | **100.00%** (0 failures) |
| p95 latency | **194.68ms** |
| p90 latency | 188ms |
| avg latency | 175.66ms |
| max latency | 687.42ms |
| Sustained throughput | ~10.9 req/s |
| DB connections before → after | 11 → 13 (of 60 max) — negligible, self-resolved |

No errors, no threshold breaches (`p(95)<1500ms` and `error rate <5%`
both passed comfortably), and DB connection count barely moved and
returned to baseline immediately after — this smoke scale caused no
observable strain on the free-tier project.

**What this does and doesn't prove**: it proves the read path
(PostgREST → RLS → indexed table scan → response) is fast and stable at
this small scale, and that the k6 tooling itself works correctly against
real infrastructure. It does **not** establish a safe concurrent-user
ceiling anywhere near the mandate's 100/500/1,000/3,000 stages — 20 VUs
is far below even the first mandate stage (100), and a free-tier
project's behavior at its own ceiling says nothing about production's
actual capacity on its own (different) tier.

## What genuinely wasn't tested (stated honestly, not glossed over)

- **The mandate's full 100/500/1,000/3,000/peak staged profile** — not
  run, for the infrastructure reasons above. This is the primary open
  item.
- **Edge functions under load** — only a direct PostgREST read was
  tested. Edge function cold-start behavior, the AI gateway's
  cost-ceiling check under concurrent load (Phase 7), and the sync
  queue's flush behavior (Phase 6) under real concurrent traffic are all
  unverified at any scale.
- **Write-path load** (mock exam submission, offline sync flush,
  payment webhooks) — only a read was load-tested. Writes have different
  contention characteristics (row locks, unique-constraint races — see
  Phase 5's and Phase 10's idempotency work, which exists specifically
  because concurrent writes to the same rows are a real failure mode
  here) and were not exercised under load.
- **Sustained/soak testing** — this was a 90-second smoke run, not a
  sustained-load test (the mandate's own stages run each level for
  multiple minutes). Memory leaks, connection-pool exhaustion over time,
  and gradual degradation are unverified.
- **Real multi-user simulation** — all 20 VUs shared one pre-fetched auth
  token rather than each authenticating independently, to avoid hammering
  Supabase Auth's own rate limiter. A real user population authenticating
  concurrently (the actual 10,000-user rollout scenario) has different
  characteristics this didn't exercise.

## Verdict

RISK-011 remains **NOT STARTED → PARTIALLY COMPLETE**, not resolved.
What changed this phase: real tooling now exists (ready to run the
mandate's actual scale the moment an environment decision is made), and
one real, honest data point exists (a small-scale read-path baseline)
where zero existed before. The core question the mandate asks — "what is
the safe concurrent-user ceiling for the 10,000-user goal" — is still
genuinely unanswered, and answering it is now blocked on an
infrastructure/budget decision, not on missing tooling or missing intent.
