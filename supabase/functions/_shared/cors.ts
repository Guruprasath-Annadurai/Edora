const ALLOWED_ORIGINS = new Set([
  'https://edora-bb02e.web.app',
  'https://app.edora.in',
  'http://localhost:5173',
  'http://localhost:8100',  // Capacitor CLI dev server
  'capacitor://localhost',  // Capacitor iOS WebView
  'https://app.edora',      // Capacitor Android WebView (hostname from capacitor.config.ts)
  'https://localhost',      // Fallback for local dev / older Capacitor
]);

// Use this in edge functions that receive a Request:
// const CORS = getCors(req); return new Response(null, { headers: CORS });
export function getCors(req: Request, extra?: Record<string, string>) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.edora.in',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...extra,
  };
}

// Legacy export — kept so older functions continue to compile without changes.
// New functions should use getCors(req) instead.
export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
