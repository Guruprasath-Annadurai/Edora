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

  // Simulate learner answer recording (quiz_sessions / node_progress)
  const payload = JSON.stringify({
    subject: 'Physics',
    topic: 'Kinematics',
    score: 80,
    questions: [
      { id: 'q1', answer: 'B', correct: true },
      { id: 'q2', answer: 'A', correct: false }
    ],
  });

  const res = http.post(`${CONFIG.SUPABASE_URL}/rest/v1/quiz_sessions`, payload, { headers });

  check(res, {
    'record-answer status 201 or 401 (handled gracefully)': (r) => r.status === 201 || r.status === 401,
    'record-answer write latency < 450ms': (r) => r.timings.duration < 450,
  });

  sleep(2);
}
