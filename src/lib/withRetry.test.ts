import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './withRetry';

describe('withRetry', () => {
  it('returns immediately on a successful, non-retryable result', async () => {
    const fn = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null });
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toEqual({ data: [1, 2, 3], error: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on a non-network error', async () => {
    const fn = vi.fn<() => Promise<{ data: null; error: { message: string; code: string } }>>()
      .mockResolvedValue({ data: null, error: { message: 'duplicate key violation', code: '23505' } });
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe('23505');
  });

  it('retries on a network error result and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'network timeout' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'network timeout' } })
      .mockResolvedValueOnce({ data: 'ok', error: null });

    const result = await withRetry(fn, { baseDelayMs: 1, maxRetries: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: 'ok', error: null });
  });

  it('retries on a thrown TypeError (fetch failure) and rethrows after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(withRetry(fn, { baseDelayMs: 1, maxRetries: 2 })).rejects.toThrow('Failed to fetch');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry a thrown error that is not network-related', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Unexpected token in JSON'));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('Unexpected token in JSON');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the last retryable result if retries are exhausted without success', async () => {
    const fn = vi.fn<() => Promise<{ data: null; error: { message: string } }>>()
      .mockResolvedValue({ data: null, error: { message: 'network error' } });
    const result = await withRetry(fn, { baseDelayMs: 1, maxRetries: 2 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.error?.message).toBe('network error');
  });

  it('calls onRetry with the attempt number on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'network timeout' } })
      .mockResolvedValueOnce({ data: 'ok', error: null });

    await withRetry(fn, { baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.anything());
  });
});
