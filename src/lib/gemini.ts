// ── Gemini via Supabase Edge Function ────────────────────────────────────────
// VITE_GEMINI_API_KEY is NO LONGER used — the key lives server-side only.
// All requests are proxied through /functions/v1/gemini-chat which verifies
// the user's session before forwarding to the Gemini API.

import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';

// Adaptive timeout based on network quality (navigator.connection is non-standard but widely available on Android)
function getRequestTimeoutMs(): number {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  const type = conn?.effectiveType;
  if (type === '2g' || type === 'slow-2g') return 90_000;
  if (type === '3g') return 60_000;
  return 35_000; // 4g / wifi / unknown — edge function timeout is 30s, add buffer
}
const REQUEST_TIMEOUT_MS = getRequestTimeoutMs();
// Report to Sentry if a Gemini call exceeds this
const SLOW_CALL_THRESHOLD_MS = 3_000;

// Strips auth tokens / keys from objects before sending to Sentry or console
const SENSITIVE_KEYS = /token|authorization|apikey|api_key|secret|password|bearer/i;
function sanitizeForLog(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE_KEYS.test(k) ? [k, '[REDACTED]'] : [k, sanitizeForLog(v, depth + 1)]
    )
  );
}

// Custom error types for user-facing messages
export class GeminiRateLimitError extends Error {
  constructor() { super('You\'ve sent too many requests. Please wait a moment and try again.'); this.name = 'GeminiRateLimitError'; }
}
export class GeminiTimeoutError extends Error {
  constructor() { super('The AI is taking too long to respond. Please try again.'); this.name = 'GeminiTimeoutError'; }
}
export class GeminiNetworkError extends Error {
  constructor() { super('No internet connection. Please check your network and try again.'); this.name = 'GeminiNetworkError'; }
}

// ── Rate limiter: max 30 requests/minute (Gemini 1.5 Flash paid tier) ────────
class TokenBucketLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {
    this.tokens = capacity;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
    await new Promise(r => setTimeout(r, waitMs));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

// 30 requests/minute = 1 token per 2000ms, burst capacity of 10
const limiter = new TokenBucketLimiter(10, 1 / 2000);

// ── Request body shape ───────────────────────────────────────────────────────
export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

interface GeminiOptions {
  /** Prepend a system instruction */
  systemInstruction?: string;
  /** Prior conversation turns */
  history?: GeminiMessage[];
  /** Number of retry attempts for rate-limit / timeout (default 3) */
  maxRetries?: number;
}

// ── Core call — proxied through Edge Function ─────────────────────────────────
export async function geminiCall(prompt: string, options: GeminiOptions = {}): Promise<string> {
  const { systemInstruction, history = [], maxRetries = 3 } = options;

  await limiter.acquire();

  let lastError: Error = new Error('Gemini call failed');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let data: { text?: string; error?: string; message?: string } | null = null;
      let error: { message?: string } | null = null;

      try {
        // supabase.functions.invoke adds the auth header automatically
        const result = await supabase.functions.invoke('gemini-chat', {
          body: { prompt, systemInstruction, history },
          signal: controller.signal,
        });
        data  = result.data;
        error = result.error;
      } finally {
        clearTimeout(timeoutId);
        const elapsed = Date.now() - t0;
        if (elapsed > SLOW_CALL_THRESHOLD_MS) {
          Sentry.captureMessage('Slow Gemini call', {
            level: 'warning',
            extra: { elapsed_ms: elapsed, attempt, prompt_length: prompt.length },
          });
        }
      }

      // Rate limit — throw immediately, no retries (retrying burns quota and keeps triggering 429)
      if (error?.message?.includes('rate_limit') || (data as { error?: string } | null)?.error === 'rate_limit') {
        throw new GeminiRateLimitError();
      }

      if (error) {
        const debugInfo = (data as { _debug?: string } | null)?._debug;
        // Strip any auth headers / tokens from the data object before logging
        const safeData = data ? sanitizeForLog(data) : undefined;
        console.error('[geminiCall] edge error:', error.message, debugInfo ?? safeData);
        throw new Error(debugInfo ?? error.message ?? 'Edge function error');
      }
      if (!data)  throw new Error('No response from AI service');

      // The edge function returns { text: "..." }
      return (data as { text: string }).text ?? '';

    } catch (err) {
      // Re-throw typed errors — no retry
      if (err instanceof GeminiRateLimitError) throw err;
      // Timeout
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError')) {
        throw new GeminiTimeoutError();
      }
      // Network error
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        throw new GeminiNetworkError();
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1_000));
      }
    }
  }

  throw lastError;
}

// ── JSON helper — strips markdown fences before parsing ──────────────────────
export async function geminiJSON<T>(prompt: string, options: GeminiOptions = {}): Promise<T> {
  const text = await geminiCall(prompt, options);
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned) as T;
}

// ── Chat helper — passes full conversation history ───────────────────────────
export async function geminiChat(
  messages: GeminiMessage[],
  systemPrompt?: string,
): Promise<string> {
  const history = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  return geminiCall(last.text, { systemInstruction: systemPrompt, history });
}
