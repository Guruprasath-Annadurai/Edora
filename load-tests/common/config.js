/**
 * Edora k6 Load Testing Shared Configuration & Hard Safety Guards
 * Enforces staging-only isolation and defines standard metric thresholds.
 */

export const CONFIG = {
  SUPABASE_URL: __ENV.TARGET_URL || __ENV.VITE_SUPABASE_URL || 'http://localhost:54321',
  ANON_KEY: __ENV.TARGET_ANON_KEY || __ENV.VITE_SUPABASE_ANON_KEY || 'mock-anon-key',
  AUTH_TOKEN: __ENV.TARGET_USER_TOKEN || '',
  ALLOW_PROD: __ENV.ALLOW_PRODUCTION_LOAD_TEST === 'true',
};

// Hard safety guard: refuse execution against production environments
export function validateEnvironmentSafety() {
  const target = (CONFIG.SUPABASE_URL || '').toLowerCase();
  
  const isProduction = 
    target.includes('app.edora') ||
    target.includes('edora.app') ||
    (target.includes('supabase.co') && !target.includes('staging') && !target.includes('dev'));

  if (isProduction && !CONFIG.ALLOW_PROD) {
    throw new Error(
      `CRITICAL SAFETY ABORT: Target URL '${CONFIG.SUPABASE_URL}' appears to be a production environment. ` +
      `Load testing production without explicit emergency override is strictly prohibited. ` +
      `Set ALLOW_PRODUCTION_LOAD_TEST=true to override if authorized.`
    );
  }
}

export function getHeaders(authenticated = false) {
  const headers = {
    'apikey': CONFIG.ANON_KEY,
    'Content-Type': 'application/json',
    'User-Agent': 'Edora-LoadTest-k6/1.0',
  };

  if (authenticated && CONFIG.AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${CONFIG.AUTH_TOKEN}`;
  } else {
    headers['Authorization'] = `Bearer ${CONFIG.ANON_KEY}`;
  }

  return headers;
}

// Reusable VU profiles
export const VU_PROFILES = {
  p50: {
    stages: [
      { duration: '30s', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '15s', target: 0 },
    ],
  },
  p100: {
    stages: [
      { duration: '30s', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 },
    ],
  },
  p500: {
    stages: [
      { duration: '1m', target: 100 },
      { duration: '2m', target: 500 },
      { duration: '2m', target: 500 },
      { duration: '1m', target: 0 },
    ],
  },
  p1000: {
    stages: [
      { duration: '1m', target: 200 },
      { duration: '3m', target: 1000 },
      { duration: '3m', target: 1000 },
      { duration: '1m', target: 0 },
    ],
  },
};

// Standard metric thresholds
export const STANDARD_THRESHOLDS = {
  http_req_failed: ['rate<0.01'], // < 1% errors
  http_req_duration: ['p(95)<500', 'p(99)<1200'], // 95% under 500ms, 99% under 1200ms
};
