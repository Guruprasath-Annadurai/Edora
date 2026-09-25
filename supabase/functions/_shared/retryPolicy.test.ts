import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { classifyStatus, parseRetryAfterMs, backoffDelayMs, withRetry } from './retryPolicy.ts';

const res = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 ? null : 'x', { status, headers });
const noSleep = () => Promise.resolve();

Deno.test('classifyStatus: matrix', () => {
  for (const s of [200, 201, 302]) assertEquals(classifyStatus(s), 'ok');
  for (const s of [400, 401, 403, 404, 410, 422]) assertEquals(classifyStatus(s), 'permanent');
  for (const s of [408, 425, 429, 500, 502, 503, 504, 529]) assertEquals(classifyStatus(s), 'retryable');
});

Deno.test('parseRetryAfterMs: seconds, http-date, invalid', () => {
  assertEquals(parseRetryAfterMs('2'), 2000);
  assertEquals(parseRetryAfterMs('1.5'), 1500);
  assertEquals(parseRetryAfterMs(null), null);
  assertEquals(parseRetryAfterMs('garbage'), null);
  const now = Date.parse('2026-01-01T00:00:00Z');
  assertEquals(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:05 GMT', now), 5000);
  assertEquals(parseRetryAfterMs('Wed, 31 Dec 2025 23:59:00 GMT', now), 0);
});

Deno.test('backoffDelayMs: exponential, capped, Retry-After honoured and capped', () => {
  assertEquals(backoffDelayMs(0), 500);
  assertEquals(backoffDelayMs(1), 1000);
  assertEquals(backoffDelayMs(10), 8000);
  assertEquals(backoffDelayMs(0, { retryAfterMs: 3000 }), 3000);
  assertEquals(backoffDelayMs(0, { retryAfterMs: 60000 }), 8000);
  assertEquals(backoffDelayMs(2, { retryAfterMs: 100 }), 2000);
});

Deno.test('withRetry: permanent 403 is attempted exactly ONCE and logged distinctly (the morning-brief bug)', async () => {
  let calls = 0; const logs: string[] = [];
  const r = await withRetry(() => { calls++; return Promise.resolve(res(403)); }, { sleep: noSleep, log: l => logs.push(l), label: 'morning-brief' });
  assertEquals(calls, 1);
  assertEquals(r.stoppedBecause, 'permanent');
  assertEquals(r.response?.status, 403);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].includes('[retry][permanent]'), true);
});

Deno.test('withRetry: 400/401/404 are never retried', async () => {
  for (const s of [400, 401, 404]) {
    let calls = 0;
    await withRetry(() => { calls++; return Promise.resolve(res(s)); }, { sleep: noSleep, log: () => {} });
    assertEquals(calls, 1);
  }
});

Deno.test('withRetry: 503 then 200 retries once and succeeds', async () => {
  const seq = [503, 200]; let i = 0; const sleeps: number[] = [];
  const r = await withRetry(() => Promise.resolve(res(seq[i++])), { sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
  assertEquals(r.stoppedBecause, 'success');
  assertEquals(r.attempts.length, 2);
  assertEquals(sleeps, [500]);
});

Deno.test('withRetry: 429 honours Retry-After for the backoff', async () => {
  const seq = [res(429, { 'retry-after': '3' }), res(200)]; let i = 0; const sleeps: number[] = [];
  await withRetry(() => Promise.resolve(seq[i++]), { sleep: ms => { sleeps.push(ms); return Promise.resolve(); } });
  assertEquals(sleeps, [3000]);
});

Deno.test('withRetry: network exceptions are retried then exhausted (bounded by maxAttempts)', async () => {
  let calls = 0;
  const r = await withRetry(() => { calls++; return Promise.reject(new Error('ECONNRESET')); }, { maxAttempts: 3, sleep: noSleep });
  assertEquals(calls, 3);
  assertEquals(r.stoppedBecause, 'exhausted');
  assertEquals(r.response, null);
  assertEquals((r.error as Error).message, 'ECONNRESET');
});

Deno.test('withRetry: maxAttempts=1 never retries even transient failures', async () => {
  let calls = 0;
  const r = await withRetry(() => { calls++; return Promise.resolve(res(500)); }, { maxAttempts: 1, sleep: noSleep });
  assertEquals(calls, 1);
  assertEquals(r.stoppedBecause, 'exhausted');
});

import { providerHttpError, PermanentProviderError, isPermanentError } from './retryPolicy.ts';

Deno.test('providerHttpError: permanent statuses -> PermanentProviderError; transient -> plain Error', () => {
  for (const s of [400, 401, 403, 404]) {
    const e = providerHttpError(s, `HTTP ${s}`, 'test');
    assertEquals(e instanceof PermanentProviderError, true);
    assertEquals(isPermanentError(e), true);
    assertEquals((e as PermanentProviderError).status, s);
  }
  for (const s of [429, 500, 502, 503]) {
    const e = providerHttpError(s, `HTTP ${s}`, 'test');
    assertEquals(isPermanentError(e), false);
    assertEquals(e instanceof Error, true);
  }
});
