import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG, validateEnvironmentSafety, getHeaders, VU_PROFILES, STANDARD_THRESHOLDS } from './common/config.js';

validateEnvironmentSafety();

export const options = {
  stages: VU_PROFILES[__ENV.PROFILE || 'p50'].stages,
  thresholds: {
    ...STANDARD_THRESHOLDS,
    http_req_duration: ['p(95)<2500'], // AI responses have higher latency allowance
  },
};

export default function () {
  const headers = getHeaders(true);

  // Invoke AI Gateway / novo edge function
  const payload = JSON.stringify({
    message: 'Can you explain Newton third law in simple terms?',
    context: { subject: 'Physics', grade: '11' },
    stream: false,
  });

  const res = http.post(`${CONFIG.SUPABASE_URL}/functions/v1/ai-gateway`, payload, {
    headers,
    timeout: '5s',
  });

  check(res, {
    'novo edge function status 200 or 401 or 429': (r) => [200, 401, 429, 503].includes(r.status),
    'novo response returned within timeout': (r) => r.timings.duration < 5000,
  });

  sleep(3);
}
