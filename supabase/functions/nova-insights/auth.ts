// ─────────────────────────────────────────────────────────────────────────────
// Edora — Nova Insights Authentication & Authorization Guard
//
// P0 Security Defense:
// 1. Missing / malformed / garbage token => 401 Unauthorized
// 2. Invalid or expired Supabase JWT => 401 Unauthorized
// 3. Authenticated user attempting cross-user access => 403 Forbidden
// 4. Never use caller-provided user ID as authorization truth
// 5. Service-role key or cron secret required for cross-user batch operations
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';

export interface NovaAuthSuccess {
  kind: 'service_role' | 'user';
  userId: string | null;
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
 * Accepts:
 * - Valid SUPABASE_SERVICE_ROLE_KEY via Bearer header
 * - Valid CRON_SECRET via x-cron-secret header
 * - Valid Supabase User JWT via Bearer header (strictly scoped to auth.uid)
 *
 * Rejects all other inputs with 401 Unauthorized.
 */
export async function authenticateNovaRequest(
  req: Request,
  env: AuthEnv,
  clientFactory?: (url: string, key: string, opts?: any) => SupabaseClient,
): Promise<NovaAuthResult> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';

  // 1. Check CRON_SECRET header
  if (env.cronSecret && cronHeader && cronHeader === env.cronSecret) {
    const serviceClient = (clientFactory || createClient)(env.supabaseUrl, env.serviceRoleKey, {
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

  // 3. Check for exact Service Role Key match
  if (env.serviceRoleKey && token === env.serviceRoleKey) {
    const serviceClient = (clientFactory || createClient)(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });
    return { kind: 'service_role', userId: null, client: serviceClient };
  }

  // 4. Validate JWT structure (must have 3 dot-separated segments)
  if (token.split('.').length !== 3) {
    return { error: 'Malformed or garbage JWT', status: 401 };
  }

  // 5. Verify User JWT against Supabase Auth
  try {
    const userClient = (clientFactory || createClient)(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user?.id) {
      return { error: 'Invalid or expired token', status: 401 };
    }

    return {
      kind: 'user',
      userId: data.user.id,
      client: userClient,
    };
  } catch (err) {
    return {
      error: `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 401,
    };
  }
}

export type TargetUserResult =
  | { ok: true; targetUserIds: string[] | null }
  | { ok: false; error: string; status: 403 };

/**
 * Validates cross-user authorization.
 * If caller is authenticated as a standard user:
 * - Calling without user_id defaults strictly to auth.uid.
 * - Calling with user_id === auth.uid is permitted.
 * - Calling with user_id !== auth.uid is strictly rejected with 403 Forbidden.
 * Caller-provided user ID is NEVER trusted as authorization truth.
 */
export function authorizeTargetUsers(
  auth: NovaAuthSuccess,
  requestedUserId?: string | null,
): TargetUserResult {
  if (auth.kind === 'user') {
    if (!auth.userId) {
      return { ok: false, error: 'User session has no valid user identifier', status: 403 };
    }

    if (requestedUserId && requestedUserId !== auth.userId) {
      return {
        ok: false,
        error: 'Forbidden: cross-user access denied. Caller cannot access or trigger insights for other users.',
        status: 403,
      };
    }

    // Standard user can only ever target themselves
    return { ok: true, targetUserIds: [auth.userId] };
  }

  // Service role or cron: can target a single user if specified, or batch all active users
  if (requestedUserId) {
    return { ok: true, targetUserIds: [requestedUserId] };
  }

  return { ok: true, targetUserIds: null };
}
