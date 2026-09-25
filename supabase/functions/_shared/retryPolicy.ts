// Shared retry classification for AI/provider calls (V5 Day 2, plan §8.3).
//
// Why: 34 edge functions had retry loops that treated every failure alike.
// novo-morning-brief retried a permanent HTTP 403 three times per user per day
// for 12 days (1,512 wasted calls). Permanent client errors can never succeed
// on a retry; only transient conditions should be retried, with backoff that
// honours the provider's Retry-After.
//
//   permanent  400 401 403 404 (and other non-408/429 4xx) -> never retried, logged distinctly
//   retryable  408 425 429 500 502 503 504 (any 5xx), network error, timeout -> retry with backoff
//   ok         2xx/3xx

export type FailureClass = 'ok' | 'permanent' | 'retryable';

export function classifyStatus(status: number): FailureClass {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 408 || status === 425 || status === 429) return 'retryable';
  if (status >= 500) return 'retryable';
  return 'permanent'; // 400, 401, 403, 404, 410, 422 ...
}

export const isPermanentStatus = (status: number): boolean => classifyStatus(status) === 'permanent';
export const isRetryableStatus = (status: number): boolean => classifyStatus(status) === 'retryable';

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. Returns null when absent/invalid. */
export function parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value == null) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - now);
}

export interface BackoffOptions {
  baseMs?: number;       // default 500
  maxMs?: number;        // default 8000
  retryAfterMs?: number | null;
}

/** Exponential backoff (base * 2^attempt) capped at maxMs; a larger Retry-After wins but is also capped at maxMs. attempt is 0-based (the attempt that just failed). */
export function backoffDelayMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 8000;
  const exp = Math.min(max, base * Math.pow(2, attempt));
  if (opts.retryAfterMs != null && opts.retryAfterMs > exp) return Math.min(max, opts.retryAfterMs);
  return exp;
}

export interface AttemptLog {
  attempt: number;
  kind: 'status' | 'exception';
  status?: number;
  class: FailureClass;
  message?: string;
}

export interface RetryOptions extends BackoffOptions {
  maxAttempts?: number;                       // total attempts including the first; default 3
  sleep?: (ms: number) => Promise<void>;      // injectable for tests
  label?: string;                             // for logs
  log?: (line: string) => void;
}

export interface RetryResult {
  response: Response | null;                  // last response received (may be non-ok)
  error: unknown;                             // last exception if no response
  attempts: AttemptLog[];
  stoppedBecause: 'success' | 'permanent' | 'exhausted';
}

/**
 * Run `fn` (a fetch-returning call) with classified retries.
 * - success            -> returns immediately
 * - permanent 4xx      -> ONE attempt only, logged as "[retry][permanent]" (distinct from transient noise)
 * - retryable/exception-> retried with backoff honouring Retry-After, up to maxAttempts
 */
export async function withRetry(fn: (attempt: number) => Promise<Response>, opts: RetryOptions = {}): Promise<RetryResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const log = opts.log ?? ((l: string) => console.warn(l));
  const label = opts.label ?? 'ai';
  const attempts: AttemptLog[] = [];
  let response: Response | null = null;
  let error: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let retryAfterMs: number | null = null;
    try {
      const res = await fn(attempt);
      response = res; error = null;
      const cls = classifyStatus(res.status);
      attempts.push({ attempt, kind: 'status', status: res.status, class: cls });
      if (cls === 'ok') return { response, error, attempts, stoppedBecause: 'success' };
      if (cls === 'permanent') {
        log(`[retry][permanent] ${label} HTTP ${res.status} — not retrying`);
        return { response, error, attempts, stoppedBecause: 'permanent' };
      }
      retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
      try { await res.body?.cancel(); } catch { /* body already consumed */ }
    } catch (e) {
      error = e; response = null;
      attempts.push({ attempt, kind: 'exception', class: 'retryable', message: (e as Error)?.message });
    }
    if (attempt < maxAttempts - 1) await sleep(backoffDelayMs(attempt, { baseMs: opts.baseMs, maxMs: opts.maxMs, retryAfterMs }));
  }
  return { response, error, attempts, stoppedBecause: 'exhausted' };
}

/** Thrown for a provider response that can never succeed on retry (400/401/403/404 ...). Outer retry loops must not retry it. */
export class PermanentProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PermanentProviderError';
    this.status = status;
  }
}

/** Build the error for a non-ok provider response: permanent statuses become PermanentProviderError (logged distinctly); others stay plain Errors so existing retry loops still retry them. */
export function providerHttpError(status: number, message: string, label = 'ai'): Error {
  if (isPermanentStatus(status)) {
    console.error(`[retry][permanent] ${label} HTTP ${status} — will not be retried`);
    return new PermanentProviderError(status, message);
  }
  return new Error(message);
}

export const isPermanentError = (e: unknown): boolean => e instanceof PermanentProviderError;
