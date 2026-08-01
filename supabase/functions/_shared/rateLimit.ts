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

// ── Global (cross-user) admission control for external LLM calls ────────────
// Every AI-facing function only rate-limits per-user — there is no shared
// cap across all users, so at real concurrent load (10k users) a burst hits
// Groq's account-wide TPM/RPM ceiling and each request finds out reactively,
// one 429 at a time, after already paying the latency of a failed Groq round
// trip. This is a proactive admission check: it tracks total calls to a
// given LLM endpoint across ALL users in a rolling window using a sentinel
// user_id, and lets the caller skip Groq entirely (going straight to its
// existing fallback, e.g. Gemini) once the shared budget for that window is
// already spent — instead of discovering that the slow way.
//
// This is NOT a distributed queue — there's no request holding/reordering,
// just an admission gate. A literal queue would need persistent infra this
// stateless edge-function architecture doesn't have; this is the honest,
// buildable version of "backpressure" at this layer. GROQ_GLOBAL_RPM_BUDGET
// should be tuned to your actual Groq plan's requests-per-minute ceiling
// (check the Groq console — it varies by model and plan tier); the default
// here is deliberately conservative.
const GLOBAL_BUDGET_SENTINEL_USER = '00000000-0000-0000-0000-00000000b00b';

export async function checkGlobalLLMBudget(
  supabase: any,
  llmEndpoint: string,
  maxRequestsPerWindow: number,
  windowMinutes: number,
): Promise<{ withinBudget: boolean }> {
  const globalEndpoint = `${llmEndpoint}:global_budget`;
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', GLOBAL_BUDGET_SENTINEL_USER)
      .eq('endpoint', globalEndpoint)
      .gte('created_at', windowStart);

    // Fails OPEN here (unlike per-user checkRateLimit above) — this is an
    // optimization to skip a doomed Groq call sooner, not a security or cost
    // control by itself (per-user checkRateLimit is still the real cap). If
    // the budget table is unreachable, falling back to "try Groq normally"
    // is strictly no worse than before this feature existed.
    if (error) return { withinBudget: true };

    if ((count ?? 0) >= maxRequestsPerWindow) return { withinBudget: false };

    supabase.from('api_rate_limits')
      .insert({ user_id: GLOBAL_BUDGET_SENTINEL_USER, endpoint: globalEndpoint })
      .then(() => {});
    return { withinBudget: true };
  } catch {
    return { withinBudget: true };
  }
}
