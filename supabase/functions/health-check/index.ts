// ─────────────────────────────────────────────────────────────────────────────
// health-check — public liveness/readiness endpoint for external uptime monitors
//
// No auth required (verify_jwt: false) — external pingers (UptimeRobot,
// Better Uptime, etc.) can't supply a Supabase JWT. Checks real DB
// connectivity, not just "the function runtime is up."
//
// Wire an external monitor to: https://<project-ref>.supabase.co/functions/v1/health-check
// Expect: 200 + {"status":"ok"} when healthy, 503 + {"status":"degraded"} when DB unreachable.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const CORS = getCors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const startedAt = performance.now();
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let dbOk = false;
  let dbError: string | null = null;
  try {
    const { error } = await db.rpc('get_connection_stats');
    dbOk = !error;
    dbError = error?.message ?? null;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const body = {
    status: dbOk ? 'ok' : 'degraded',
    db_reachable: dbOk,
    db_error: dbError,
    duration_ms: durationMs,
    checked_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: dbOk ? 200 : 503,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
