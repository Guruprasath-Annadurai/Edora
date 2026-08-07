// ─────────────────────────────────────────────────────────────────────────────
// Phase 11 (enterprise remediation mandate, RISK-011, High) — load/scale
// baseline script. Written for k6 (https://k6.io), the industry-standard
// tool, so results are real p95/error-rate numbers, not hand-rolled
// approximations, and so a future run against a proper environment can
// reuse this exact script unmodified — only STAGE_TARGET_URL and the
// `stages` ramp profile need to change.
//
// SCOPE, STATED HONESTLY: this script is written to support the mandate's
// full staged profile (100/500/1,000/3,000/peak virtual users), but it has
// only ever been RUN at a small, safe scale (see SAFE_SMOKE_STAGES below)
// against edora-staging, a Supabase FREE-TIER project. Supabase's free tier
// caps concurrent Postgres connections around 60 — running the mandate's
// literal 500-3,000 VU stages against it would not produce a meaningful
// production-capacity signal (it would just hit the free tier's own
// ceiling, not reveal anything about how the app itself behaves under
// load), and risks tripping Supabase's abuse detection on a project that
// isn't provisioned for this. Running any of this against PRODUCTION, or
// at the mandate's full scale against any environment, needs an explicit
// decision — provision a paid/load-test-capable project, or authorize a
// carefully-monitored, off-peak production run — see
// docs/enterprise/LOAD_TESTING_REPORT.md for what was actually run and
// why the rest is a founder decision, not something to run unilaterally.
//
// Usage:
//   STAGE_TARGET_URL=https://uldgosisjidydqstabvl.supabase.co \
//   STAGE_ANON_KEY=<anon key> \
//   k6 run docs/enterprise/load-testing/k6-baseline.js
// ─────────────────────────────────────────────────────────────────────────────

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL   = __ENV.STAGE_TARGET_URL || 'https://uldgosisjidydqstabvl.supabase.co';
const ANON_KEY   = __ENV.STAGE_ANON_KEY;
// A real user access token — pyq_content (and most real app content tables)
// requires authentication; anon has no SELECT grant on it by design (this
// app doesn't expose exam content to unauthenticated requests). One
// pre-fetched token shared across all VUs is a deliberate simplification
// for this smoke-scale run: it measures server-side read capacity under
// concurrent load, not realistic per-user login churn. A true multi-user
// simulation would need per-VU login, which would itself hammer Supabase
// Auth's own rate limiting and measure auth capacity, not app capacity —
// out of scope for this pass, noted in the report.
const AUTH_TOKEN = __ENV.STAGE_AUTH_TOKEN;

if (!ANON_KEY || !AUTH_TOKEN) {
  throw new Error('STAGE_ANON_KEY and STAGE_AUTH_TOKEN env vars are both required — refusing to run without explicit target credentials (never hardcode a key that could accidentally point at production).');
}

// The mandate's full staged profile — 100 → 500 → 1,000 → 3,000 → peak.
// NOT what was actually executed this phase (see SAFE_SMOKE_STAGES below
// and docs/enterprise/LOAD_TESTING_REPORT.md). Kept here, real and
// runnable, so the next environment this points at doesn't need this
// script rewritten — just re-point STAGE_TARGET_URL/STAGE_ANON_KEY at a
// provisioned load-test environment and swap which `stages` array is used.
export const MANDATE_STAGES = [
  { duration: '1m', target: 100 },
  { duration: '2m', target: 100 },
  { duration: '1m', target: 500 },
  { duration: '2m', target: 500 },
  { duration: '1m', target: 1000 },
  { duration: '2m', target: 1000 },
  { duration: '1m', target: 3000 },
  { duration: '2m', target: 3000 },
  { duration: '1m', target: 0 },
];

// What was ACTUALLY run this phase — a small, safe smoke scale against the
// free-tier edora-staging project. Real numbers, honestly scoped.
const SAFE_SMOKE_STAGES = [
  { duration: '15s', target: 5 },
  { duration: '30s', target: 20 },
  { duration: '30s', target: 20 },
  { duration: '15s', target: 0 },
];

export const options = {
  stages: SAFE_SMOKE_STAGES,
  thresholds: {
    http_req_duration: ['p(95)<1500'],  // p95 under 1.5s
    http_req_failed:   ['rate<0.05'],   // <5% error rate
  },
};

const errorRate = new Rate('custom_error_rate');
const readLatency = new Trend('profiles_read_latency', true);

export default function () {
  // A cheap, representative authenticated-read pattern: fetching a small,
  // indexed slice of a real content table. Deliberately NOT hitting an
  // AI-calling edge function (would cost real provider $ per VU per
  // iteration and is gated by Phase 7's cost ceiling anyway) and NOT
  // hitting the auth token endpoint repeatedly (Supabase rate-limits auth
  // aggressively; hammering it doesn't test the app, it just demonstrates
  // that rate limit exists).
  const res = http.get(`${BASE_URL}/rest/v1/pyq_content?select=id,subject&limit=5`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has a body': (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!ok);
  readLatency.add(res.timings.duration);

  sleep(1);
}
