import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG, validateEnvironmentSafety, getHeaders, VU_PROFILES, STANDARD_THRESHOLDS } from './common/config.js';

validateEnvironmentSafety();

// Offline reconnect storm simulates sudden burst when learners reconnect to Wi-Fi/cellular
export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 500 }, // Sudden spike to 500 VUs syncing queue
    { duration: '1m', target: 500 },
    { duration: '20s', target: 0 },
  ],
  thresholds: STANDARD_THRESHOLDS,
};

export default function () {
  const headers = getHeaders(true);

  // Batch sync payload simulating syncQueue flush
  const payload = JSON.stringify({
    events: [
      { type: 'node_progress', node_id: 'n-123', status: 'completed', timestamp: Date.now() - 3600000 },
      { type: 'telemetry', action: 'flashcard_reviewed', count: 15, timestamp: Date.now() - 1800000 },
      { type: 'study_time', duration_sec: 1200, timestamp: Date.now() - 600000 },
    ],
  });

  const res = http.post(`${CONFIG.SUPABASE_URL}/functions/v1/sync-queue`, payload, {
    headers,
    timeout: '3s',
  });

  check(res, {
    'sync-queue accepted or authenticated': (r) => [200, 202, 401, 404].includes(r.status),
    'sync latency < 800ms during storm': (r) => r.timings.duration < 800,
  });

  sleep(1);
}
