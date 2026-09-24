import { describe, it, expect, beforeEach, vi } from 'vitest';

// Phase 6 (enterprise remediation mandate, RISK-009, High): offline
// conflict/duplication safety for the sync queue. The scenario under test
// is specific and real: flush() runs right after reconnecting, exactly
// when the network is likeliest to drop again mid-flush, or the app to be
// backgrounded and killed by the OS partway through a multi-entry queue.
// Before this fix, the on-disk queue was only rewritten once, after the
// entire loop finished — so an interruption after entry 1 of 2 succeeded
// left BOTH entries on disk, and the next flush replayed entry 1 a second
// time. These tests assert the queue is persisted incrementally, so an
// interruption can only ever leave genuinely-unprocessed entries behind.

const QUEUE_KEY = 'edora_sync_queue';
const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { store.set(key, value); }),
    remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key); }),
  },
}));

const fromMock = vi.fn();
const rpcMock = vi.fn();
const getSessionMock = vi.fn();

function chainable(result: unknown): unknown {
  const target: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      return () => chainable(result);
    },
  });
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSessionMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { SyncQueue } from './syncQueue';

const SESSION = { access_token: 'tok', user: { id: 'user-1' } };

describe('SyncQueue.flush', () => {
  beforeEach(() => {
    store.clear();
    fromMock.mockReset();
    rpcMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: SESSION } });
  });

  it('removes an entry from the persisted queue immediately after it succeeds, not at the end of the batch', async () => {
    fromMock.mockImplementation(() => chainable({ data: {}, error: null }));

    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-08' } });
    expect(await SyncQueue.size()).toBe(2);

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(2);
    expect(await SyncQueue.size()).toBe(0);
  });

  it('a failure partway through the batch leaves only the failed entry queued — the already-succeeded entry is not replayed', async () => {
    let call = 0;
    fromMock.mockImplementation(() => {
      call++;
      // First action (streak_tick) succeeds; second (streak_tick too, but
      // simulate the network dropping again right on this one) fails.
      if (call === 1) return chainable({ data: {}, error: null });
      throw new Error('network dropped again');
    });

    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-08' } });

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(1);

    // The critical assertion: exactly ONE entry remains (the one that
    // actually failed), not two. Before this fix, an interruption here
    // would have left both on disk, replaying the already-successful one.
    expect(await SyncQueue.size()).toBe(1);
    const raw = store.get(QUEUE_KEY)!;
    const remaining = JSON.parse(raw) as { action: { payload: { date: string } } }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].action.payload.date).toBe('2026-08-08');
  });

  it('xp_grant calls the atomic increment_xp RPC rather than a non-atomic read-then-write', async () => {
    rpcMock.mockImplementation(() => chainable({ data: null, error: null }));
    fromMock.mockImplementation(() => chainable({ data: {}, error: null })); // xp_history insert

    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 50, reason: 'quiz' } });
    await SyncQueue.flush();

    expect(rpcMock).toHaveBeenCalledWith('increment_xp', { user_id: 'user-1', amount: 50 });
  });

  it('xp_grant is dropped without ever reaching the network if the queued user_id does not match the live session', async () => {
    fromMock.mockImplementation(() => chainable({ data: {}, error: null }));

    // Simulates a manipulated/stale queue entry — e.g. leftover from a
    // different account that signed in on the same device.
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'someone-else', amount: 500, reason: 'quiz' } });
    const flushed = await SyncQueue.flush();

    expect(flushed).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('discards an entry after 5 failed attempts instead of retrying it forever', async () => {
    fromMock.mockImplementation(() => { throw new Error('permanently broken'); });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });

    for (let i = 0; i < 5; i++) await SyncQueue.flush();

    expect(await SyncQueue.size()).toBe(0);
  });

  it('does nothing when there is no active session (stays queued for the next real online flush)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(0);
    expect(await SyncQueue.size()).toBe(1);
  });
});
