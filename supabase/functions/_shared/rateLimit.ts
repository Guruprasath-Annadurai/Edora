// deno-lint-ignore-file no-explicit-any
// Shared rate limiter backed by public.api_rate_limits (user_id, endpoint, created_at).
// Fails CLOSED on DB error — an audit found this used to fail open here while
// _shared/auth-guard.ts's checkRateLimit failed closed, an inconsistency with
// no intentional reasoning behind it. Fail-closed matches auth-guard.ts's
// documented rationale: a transient rate-limit-table outage should cause
// brief unavailability, not an unmetered stampede on paid Groq/Gemini calls.
export async function checkRateLimit(
  supabase: any,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; retryAfterSecs: number }> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart);

    if (error) return { allowed: false, retryAfterSecs: 60 };
    if ((count ?? 0) >= maxRequests) {
      return { allowed: false, retryAfterSecs: windowMinutes * 60 };
    }

    supabase.from('api_rate_limits').insert({ user_id: userId, endpoint }).then(() => {});
    return { allowed: true, retryAfterSecs: 0 };
  } catch {
    return { allowed: false, retryAfterSecs: 60 };
  }
}
