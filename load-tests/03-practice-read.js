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

  // Fetch formulas and flashcards
  const resFormulas = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/formulas?select=id,title,subject,latex_formula&limit=25`,
    { headers }
  );

  check(resFormulas, {
    'formulas status 200': (r) => r.status === 200,
    'formulas latency < 350ms': (r) => r.timings.duration < 350,
  });

  const resFlashcards = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/flashcards?select=id,front,back,subject,topic&limit=25`,
    { headers }
  );

  check(resFlashcards, {
    'flashcards status 200': (r) => r.status === 200,
    'flashcards latency < 350ms': (r) => r.timings.duration < 350,
  });

  sleep(1);
}
