import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG, validateEnvironmentSafety, getHeaders, VU_PROFILES, STANDARD_THRESHOLDS } from './common/config.js';

validateEnvironmentSafety();

export const options = {
  stages: VU_PROFILES[__ENV.PROFILE || 'p50'].stages,
  thresholds: STANDARD_THRESHOLDS,
};

export default function () {
  const headers = getHeaders(true);

  // Home Screen plan data fetch: subjects_master, revision_plans, profiles
  const resSubjects = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/subjects_master?select=id,name,icon,color,order_index&order=order_index.asc&limit=20`,
    { headers }
  );

  check(resSubjects, {
    'subjects_master status 200': (r) => r.status === 200,
    'subjects latency < 350ms': (r) => r.timings.duration < 350,
  });

  const resRevisions = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/revision_plans?select=id,subject,topic,scheduled_date,completed&limit=10`,
    { headers }
  );

  check(resRevisions, {
    'revision_plans status 200': (r) => r.status === 200,
    'revisions latency < 350ms': (r) => r.timings.duration < 350,
  });

  sleep(1.5);
}
