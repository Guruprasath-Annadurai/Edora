// Provider chain for Novo chat (V5 Day 2, plan §8.3).
//
//   Groq primary -> Groq small -> Claude (text fallback) -> graceful message
//
// Every non-success outcome routes to the NEXT tier: HTTP 429, 500, 502, 503 (any
// non-2xx), timeout, fetch exception and AI-gateway blocks. Before this, only a
// 429 fell through; a Groq 5xx was returned to the student and a fetch exception
// became "Groq unreachable" (F21).
//
// This is *tier routing*, not retrying the same endpoint: interactive chat makes at
// most one attempt per tier (plan cost lever 5 — no repeated AI retries). Permanent
// 4xx (400/401/403/404) are attempted once and logged distinctly via retryPolicy.
//
// Pure module: no Deno.serve, no network of its own — tiers are injected, so the
// whole matrix is testable with a fake-provider harness.

import { classifyStatus } from '../_shared/retryPolicy.ts';

export interface ChainTier {
  name: string;                       // e.g. 'groq-primary'
  provider: 'groq' | 'anthropic' | 'gemini';
  model: string;
  timeoutMs: number;                  // time to first byte (headers); streaming bodies are not aborted afterwards
  enabled?: boolean;                  // false => skipped (e.g. global budget exhausted, no API key)
  call: (signal: AbortSignal) => Promise<Response>;
}

export type TierOutcome = 'ok' | 'http_error' | 'timeout' | 'exception' | 'skipped';

export interface TierAttempt {
  tier: string;
  provider: ChainTier['provider'];
  model: string;
  outcome: TierOutcome;
  status?: number;
  failureClass?: 'permanent' | 'retryable';
  message?: string;
  ms: number;
}

export interface ChainResult {
  response: Response | null;
  tier: ChainTier | null;
  attempts: TierAttempt[];
  allFailed: boolean;
}

export interface ChainOptions {
  log?: (line: string) => void;
  /** Aborts the whole chain (e.g. client disconnected). */
  parentSignal?: AbortSignal;
  now?: () => number;
}

export async function runProviderChain(tiers: ChainTier[], opts: ChainOptions = {}): Promise<ChainResult> {
  const log = opts.log ?? ((l: string) => console.warn(l));
  const now = opts.now ?? (() => Date.now());
  const attempts: TierAttempt[] = [];

  for (const tier of tiers) {
    const base = { tier: tier.name, provider: tier.provider, model: tier.model };
    if (tier.enabled === false) {
      attempts.push({ ...base, outcome: 'skipped', ms: 0 });
      continue;
    }
    if (opts.parentSignal?.aborted) break;

    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    opts.parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, tier.timeoutMs);
    const started = now();

    try {
      const res = await tier.call(controller.signal);
      const ms = now() - started;
      if (res.ok) {
        attempts.push({ ...base, outcome: 'ok', status: res.status, ms });
        return { response: res, tier, attempts, allFailed: false };
      }
      const cls = classifyStatus(res.status) === 'permanent' ? 'permanent' : 'retryable';
      attempts.push({ ...base, outcome: 'http_error', status: res.status, failureClass: cls, ms });
      log(cls === 'permanent'
        ? `[chain][permanent] ${tier.name} HTTP ${res.status} — not retried, trying next tier`
        : `[chain] ${tier.name} HTTP ${res.status} — trying next tier`);
      try { await res.body?.cancel(); } catch { /* already consumed */ }
    } catch (e) {
      const ms = now() - started;
      const message = (e as Error)?.message ?? String(e);
      if (timedOut) {
        attempts.push({ ...base, outcome: 'timeout', failureClass: 'retryable', message: `no response within ${tier.timeoutMs}ms`, ms });
        log(`[chain] ${tier.name} timed out after ${tier.timeoutMs}ms — trying next tier`);
      } else {
        attempts.push({ ...base, outcome: 'exception', failureClass: 'retryable', message, ms });
        log(`[chain] ${tier.name} threw: ${message} — trying next tier`);
      }
    } finally {
      clearTimeout(timer);
      opts.parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }
  return { response: null, tier: null, attempts, allFailed: true };
}

/** Body returned to the client when EVERY tier failed. Friendly, non-technical, never a stack trace. */
export const ALL_TIERS_FAILED_BODY = {
  error: 'novo_busy',
  message: 'Novo is busy right now — your practice and review still work. Please try again in a moment.',
  retry_after_secs: 30,
} as const;

/** Compact one-line summary of the attempts for logs / ai health evidence. */
export function summarizeAttempts(attempts: TierAttempt[]): string {
  return attempts.map(a => `${a.tier}:${a.outcome}${a.status ? `(${a.status})` : ''}`).join(' > ');
}
