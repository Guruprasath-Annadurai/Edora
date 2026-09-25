import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG, validateEnvironmentSafety, getHeaders, VU_PROFILES, STANDARD_THRESHOLDS } from './common/config.js';

validateEnvironmentSafety();

export const options = {
  stages: VU_PROFILES[__ENV.PROFILE || 'p50'].stages,
  thresholds: STANDARD_THRESHOLDS,
};

export default function () {
  const headers = getHeaders(false);
  
  // 1. Health / Auth Gateway ping
  const res = http.get(`${CONFIG.SUPABASE_URL}/auth/v1/health`, { headers });
  
  check(res, {
    'status is 200 or 404 (endpoint responsive)': (r) => r.status === 200 || r.status === 404,
    'latency < 400ms': (r) => r.timings.duration < 400,
  });

  sleep(1);
}
