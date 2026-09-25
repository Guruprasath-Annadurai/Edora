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

  // Review screen: mistake_journal and study_notes
  const resMistakes = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/mistake_journal?select=id,subject,topic,question_text,user_answer,correct_answer&limit=20`,
    { headers }
  );

  check(resMistakes, {
    'mistake_journal status 200': (r) => r.status === 200,
    'mistakes latency < 350ms': (r) => r.timings.duration < 350,
  });

  const resNotes = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/study_notes?select=id,subject,topic,title&limit=20`,
    { headers }
  );

  check(resNotes, {
    'study_notes status 200': (r) => r.status === 200,
    'notes latency < 350ms': (r) => r.timings.duration < 350,
  });

  sleep(1.5);
}
