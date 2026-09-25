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

  // Progress metrics: profiles and streak_rewards
  const resProfile = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/profiles?select=id,full_name,xp,streak_days,current_grade&limit=1`,
    { headers }
  );

  check(resProfile, {
    'profile stats status 200': (r) => r.status === 200,
    'profile latency < 300ms': (r) => r.timings.duration < 300,
  });

  const resRewards = http.get(
    `${CONFIG.SUPABASE_URL}/rest/v1/streak_rewards?select=id,reward_type,xp_bonus,unlocked&limit=10`,
    { headers }
  );

  check(resRewards, {
    'rewards status 200': (r) => r.status === 200,
    'rewards latency < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(2);
}
