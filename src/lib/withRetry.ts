// ─────────────────────────────────────────────────────────────────────────────
// withRetry — exponential backoff wrapper for Supabase calls on flaky networks
//
// Use on any critical read/write that should survive a dropped connection
// (train wifi, tunnel, lift) rather than failing silently on the first try.
//
// Usage:
//   const { data, error } = await withRetry(() =>
//     supabase.from('profiles').select('*').eq('id', userId).single()
//   );
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max retry attempts after the first try (default 3) */
  maxRetries?: number;
  /** Base delay in ms before the first retry; doubles each attempt (default 400) */
  baseDelayMs?: number;
  /** Called before each retry with the attempt number (1-indexed) and the error that triggered it */
  onRetry?: (attempt: number, error: unknown) => void;
}

// Supabase/Postgrest network errors don't have a stable shape, so we check
// for the patterns that actually show up: fetch TypeErrors, timeouts, and
// Postgrest's own connection-failure codes.
function isRetryable(result: { error?: { message?: string; code?: string } | null } | unknown): boolean {
  if (result instanceof TypeError) {
    return /fetch|network/i.test(result.message);
  }
  if (result && typeof result === 'object' && 'error' in result) {
    const err = (result as { error?: { message?: string; code?: string } | null }).error;
    if (!err) return false;
    const msg = err.message ?? '';
    return /network|timeout|fetch|ECONNRESET|ETIMEDOUT/i.test(msg) || err.code === 'PGRST301';
  }
  return false;
}

export async function withRetry<T>(
  // PromiseLike, not Promise — Postgrest query builders are thenables but
  // not full Promises (no .catch/.finally), so this must accept either.
  fn: () => PromiseLike<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 400, onRetry } = options;

  let lastResult: T | undefined;
  let lastError: unknown;
  let hasResult = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (!isRetryable(result)) return result;
      lastResult = result;
      hasResult = true;
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastError = err;
      hasResult = false;
    }

    if (attempt < maxRetries) {
      onRetry?.(attempt + 1, lastError ?? lastResult);
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }

  if (hasResult) return lastResult as T;
  throw lastError;
}
