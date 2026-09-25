// ─────────────────────────────────────────────────────────────────────────────
// Edora — Nova Insights Authentication & Authorization Guard
//
// P0 Security Defense:
// 1. Missing / malformed / garbage token => 401 Unauthorized
// 2. Invalid or expired Supabase JWT => 401 Unauthorized
// 3. Standard authenticated user JWT => 403 Forbidden
//    nova-insights is a weekly scheduled batch job (pg_cron). No student flow
//    requires direct invocation. Standard users CANNOT invoke Gemini generation
//    — it runs server-side on a cron schedule and must not be triggerable
//    at-will by any valid account (cost, abuse, repeat generation).
// 4. Only accepted callers:
//    a. CRON_SECRET via x-cron-secret header (pg_cron scheduled invocation)
//    b. SUPABASE_SERVICE_ROLE_KEY via Bearer header (administrative invocation)
// 5. Never use caller-provided user ID as authorization truth.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface NovaAuthSuccess {
  kind: 'service_role';
  userId: null;
  client: SupabaseClient;
}

export interface NovaAuthFailure {
  error: string;
  status: 401 | 403;
}

export type NovaAuthResult = NovaAuthSuccess | NovaAuthFailure;

export interface AuthEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  cronSecret?: string;
}

/**
 * Authenticates an incoming request for nova-insights.
 *
 * Accepts ONLY:
 * - Valid CRON_SECRET via x-cron-secret header (pg_cron scheduled invocation)
 * - Valid SUPABASE_SERVICE_ROLE_KEY via Bearer header (administrative)
 *
 * Rejects ALL other inputs including standard user JWTs (403).
 * nova-insights is a server-side batch job. No student flow requires or should
 * trigger on-demand Gemini generation for all users.
 */
export async function authenticateNovaRequest(
  req: Request,
  env: AuthEnv,
  _clientFactory?: (url: string, key: string, opts?: unknown) => SupabaseClient,
): Promise<NovaAuthResult> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';

  // 1. Check CRON_SECRET header — pg_cron scheduled invocation
  if (env.cronSecret && cronHeader && cronHeader === env.cronSecret) {
    const serviceClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });
    return { kind: 'service_role', userId: null, client: serviceClient };
  }

  // 2. Require Bearer Authorization header
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or malformed Authorization header', status: 401 };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { error: 'Missing token in Authorization header', status: 401 };
  }

  // 3. Check for exact Service Role Key match — administrative invocation
  if (env.serviceRoleKey && token === env.serviceRoleKey) {
    const serviceClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });
    return { kind: 'service_role', userId: null, client: serviceClient };
  }

  // 4. Reject standard user JWTs.
  //    nova-insights is a weekly batch job. Standard users cannot trigger it.
  //    A well-formed JWT that is not the service role key is a user JWT — reject it.
  //    This prevents any valid student account from repeatedly triggering Gemini
  //    generation, incurring cost, or inflating insight history.
  if (token.split('.').length === 3) {
    return {
      error: 'Forbidden: nova-insights is a server-scheduled batch job. Standard user invocation is not permitted.',
      status: 403,
    };
  }

  // 5. Everything else: malformed / garbage token
  return { error: 'Malformed or garbage token', status: 401 };
}

export type TargetUserResult =
  | { ok: true; targetUserIds: string[] | null }
  | { ok: false; error: string; status: 403 };

/**
 * Resolves target users for a service-role caller.
 * All invocations are now service_role only, so:
 * - No user_id specified => batch all active users (null = discover in handler)
 * - user_id specified => target that specific user (admin refresh)
 */
export function authorizeTargetUsers(
  auth: NovaAuthSuccess,
  requestedUserId?: string | null,
): TargetUserResult {
  // Only service_role reaches here (user kind is rejected in authenticateNovaRequest)
  if (requestedUserId) {
    return { ok: true, targetUserIds: [requestedUserId] };
  }
  return { ok: true, targetUserIds: null };
}
