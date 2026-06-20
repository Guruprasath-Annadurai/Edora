// ─────────────────────────────────────────────────────────────────────────────
// auth-guard — JWT validation middleware for all Edora edge functions
//
// Usage:
//   const result = await requireAuth(req, serviceClient);
//   if (result instanceof Response) return result; // 401
//   const { user, token } = result;
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  user:   User;
  token:  string;
}

export async function requireAuth(
  req: Request,
  supabaseUrl: string,
  anonKey:     string,
): Promise<AuthResult | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.split('.').length !== 3) {
    return new Response(
      JSON.stringify({ error: 'Malformed JWT' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const client: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return { user, token };
}

// ── Rate limiting helper (per user, per endpoint, per window) ────────────────
export async function checkRateLimit(
  serviceClient: SupabaseClient,
  userId:        string,
  endpoint:      string,
  maxPerHour:    number = 60,
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await serviceClient
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart);

    if ((count ?? 0) >= maxPerHour) return false;

    serviceClient
      .from('api_rate_limits')
      .insert({ user_id: userId, endpoint })
      .then(() => {}).catch(() => {});

    return true;
  } catch (err) {
    console.error('[rate-limit] table unavailable — failing closed:', (err as Error).message);
    return false; // fail-closed: protect Gemini quotas during DB outages
  }
}

// ── Input sanitization ────────────────────────────────────────────────────────
export function sanitizeText(input: unknown, maxLength = 4000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/\x00/g, '')      // strip null bytes
    .slice(0, maxLength)
    .trim();
}

export function sanitizeArray(input: unknown, maxItems = 20, itemMaxLen = 500): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, maxItems)
    .filter((x): x is string => typeof x === 'string')
    .map(s => sanitizeText(s, itemMaxLen));
}
