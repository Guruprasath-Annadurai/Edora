import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
const flagState = vi.hoisted(() => ({ flags: { novo_enabled: true, pyq_enabled: true } as Record<string, boolean> }));
vi.mock('@/hooks/useAppFlags', () => ({ useAppFlags: () => flagState.flags }));

import { useTodayPlan } from '@/hooks/useTodayPlan';

const base = { title: 'T', reason: {}, subject: null, chapter: null, topic: null };
const R = {
  review: { ...base, kind: 'review_due', priority: 1, duration_minutes: 10, target_path: '/spaced-review', target_params: { due_count: 4 } },
  weak: { ...base, kind: 'fix_weak', priority: 2, duration_minutes: 15, target_path: '/practice', target_params: { mode: 'weak_topic', subject: 'Physics', subtopic: 'Torque' } },
  diag: { ...base, kind: 'diagnostic', priority: 3, duration_minutes: 10, target_path: '/practice', target_params: { mode: 'diagnostic', questions_count: 5 } },
  learn: { ...base, kind: 'learn_next', priority: 4, duration_minutes: 20, target_path: '/practice', target_params: { mode: 'learn_next' } },
  exam: { ...base, kind: 'exam_push', priority: 5, duration_minutes: 25, target_path: '/pyq-bank', target_params: { exam: 'NEET', days_remaining: 9 } },
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
const ok = (data: unknown) => rpc.mockResolvedValue({ data, error: null });

beforeEach(() => {
  rpc.mockReset(); invoke.mockReset(); fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy);
  auth.user = { id: 'u1' }; flagState.flags = { novo_enabled: true, pyq_enabled: true };
});

describe('RPC success', () => {
  it('calls get_today_plan exactly once (no args), keeps canonical order, max 3, not a fallback', async () => {
    ok([R.review, R.weak, R.diag, R.learn, R.exam]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTodayPlan(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_today_plan');
    expect(result.current.items.map(i => i.kind)).toEqual(['review_due', 'fix_weak', 'diagnostic']);
    expect(result.current.isFallback).toBe(false);
    expect(result.current.error).toBeNull();
  });
  it('fewer than 3 valid rows survive as-is', async () => {
    ok([R.diag]);
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map(i => i.kind)).toEqual(['diagnostic']);
  });
});

describe('RPC failure -> deterministic fallback, no AI', () => {
  it('error response', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42501' } });
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFallback).toBe(true);
    expect(result.current.items.map(i => i.target_path)).toEqual(['/practice', '/chat']);
    expect(result.current.error).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('network exception', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(invoke).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('timeout', async () => {
    vi.useFakeTimers();
    try {
      rpc.mockReturnValue(new Promise(() => {}));                    // never resolves
      const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
      await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
      expect(result.current.isFallback).toBe(true);
      expect(String(result.current.error?.message)).toMatch(/timed out/);
    } finally { vi.useRealTimers(); }
  });
  it('zero valid rows (empty list) -> fallback', async () => {
    ok([]);
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFallback).toBe(true);
  });
});

describe('malformed backend data', () => {
  it('unknown kind / arbitrary path / invalid duration are rejected; valid neighbours survive', async () => {
    ok([{ ...R.weak, kind: 'buy_pro' }, { ...R.weak, target_path: 'https://evil.example' }, { ...R.weak, duration_minutes: 0 }, R.diag]);
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map(i => i.kind)).toEqual(['diagnostic']);
    expect(result.current.items.some(i => JSON.stringify(i).includes('evil'))).toBe(false);
  });
  it('a wholly malformed payload -> fallback', async () => {
    ok({ not: 'an array' });
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isFallback).toBe(true));
  });
});

describe('flags', () => {
  it('pyq_enabled=false removes the exam_push /pyq-bank item (server result not mutated)', async () => {
    ok([R.review, R.exam]);
    flagState.flags = { novo_enabled: true, pyq_enabled: false };
    const { client, wrapper } = makeWrapper();
    const { result } = renderHook(() => useTodayPlan(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map(i => i.kind)).toEqual(['review_due']);
    expect((client.getQueryData(['today-plan', 'u1']) as unknown[]).length).toBe(2);   // cache untouched
  });
  it('novo_enabled=false removes Ask Novo from the fallback', async () => {
    rpc.mockRejectedValue(new Error('down'));
    flagState.flags = { novo_enabled: false, pyq_enabled: true };
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(result.current.items.map(i => i.target_path)).toEqual(['/practice']);
  });
  it('all items filtered away -> Practice fallback', async () => {
    ok([R.exam]);
    flagState.flags = { novo_enabled: false, pyq_enabled: false };
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFallback).toBe(true);
    expect(result.current.items.map(i => i.target_path)).toEqual(['/practice']);
  });
  it('toggling a flag does not refetch (filtering is client-side)', async () => {
    ok([R.review, R.exam]);
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(() => useTodayPlan(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    flagState.flags = { novo_enabled: true, pyq_enabled: false };
    rerender();
    expect(result.current.items.map(i => i.kind)).toEqual(['review_due']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('cache', () => {
  it('rerenders do not call the RPC again', async () => {
    ok([R.review]);
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(() => useTodayPlan(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    for (let i = 0; i < 5; i++) rerender();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('multiple consumers sharing the key cause ONE call', async () => {
    ok([R.review]);
    const { wrapper } = makeWrapper();
    const a = renderHook(() => useTodayPlan(), { wrapper });
    const b = renderHook(() => useTodayPlan(), { wrapper });
    await waitFor(() => { expect(a.result.current.isLoading).toBe(false); expect(b.result.current.isLoading).toBe(false); });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('a remount within the stale window uses the cache', async () => {
    ok([R.review]);
    const { wrapper } = makeWrapper();
    const first = renderHook(() => useTodayPlan(), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    const second = renderHook(() => useTodayPlan(), { wrapper });
    expect(second.result.current.isLoading).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('explicit refetch() calls the RPC again (one call per refresh)', async () => {
    ok([R.review]);
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.refetch(); });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('no polling: no calls after a long idle time', async () => {
    vi.useFakeTimers();
    try {
      ok([R.review]);
      const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(result.current.isLoading).toBe(false);
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('signed out: no RPC call, safe fallback', () => {
    auth.user = null;
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.isFallback).toBe(true);
  });
});

describe('zero AI', () => {
  it('a full success + failure cycle makes no functions.invoke and no direct /functions/v1 fetch', async () => {
    ok([R.review]);
    const { result } = renderHook(() => useTodayPlan(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('source: the hook and helper import no AI/edge modules and reference no functions', () => {
    for (const f of ['src/hooks/useTodayPlan.ts', 'src/lib/todayPlan.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/functions\.invoke|\/functions\/v1|@\/lib\/gemini|useGeminiStream/);
    }
    expect(readFileSync('src/hooks/useTodayPlan.ts', 'utf8')).toMatch(/supabase\.rpc\('get_today_plan'\)/);
  });
});
