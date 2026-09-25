import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { geminiCall, GeminiBusyError } from '@/lib/gemini';

const busyResponse = () => new Response(JSON.stringify({ error: 'novo_busy', message: 'Novo is busy right now — your practice and review still work. Please try again in a moment.', retry_after_secs: 30 }), { status: 503 });

beforeEach(() => invoke.mockReset());

describe('all AI providers failed (server chain exhausted)', () => {
  it('surfaces the friendly server message as GeminiBusyError and does NOT retry client-side', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: busyResponse() } });
    const err = await geminiCall('hi').catch(e => e);
    expect(err).toBeInstanceOf(GeminiBusyError);
    expect(err.message).toMatch(/Novo is busy/);
    expect(err.message).not.toMatch(/non-2xx|stack|undefined/i);
    expect(invoke).toHaveBeenCalledTimes(1);   // a retry would walk the whole provider chain again
  });

  it('control: an unrelated edge error is still a generic (retried) error, not GeminiBusyError', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockResolvedValue({ data: null, error: { message: 'boom', context: new Response(JSON.stringify({ error: 'other' }), { status: 500 }) } });
      const p = geminiCall('hi', { maxRetries: 2 }).catch(e => e);
      await vi.runAllTimersAsync();
      const err = await p;
      expect(err).not.toBeInstanceOf(GeminiBusyError);
      expect(invoke).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
