import { describe, it, expect, beforeEach, vi } from 'vitest';

const QUEUE_KEY = 'edora_sync_queue';
const DLQ_KEY   = 'edora_sync_dlq';
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

import { SyncQueue, classifyError } from './syncQueue';

const SESSION = { access_token: 'tok', user: { id: 'user-1' } };

describe('SyncQueue.flush and Error Handling', () => {
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
      if (call === 1) return chainable({ data: {}, error: null });
      throw new Error('network dropped again');
    });

    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-08' } });

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(1);

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

  it('xp_grant is moved to DLQ if user_id does not match the live session', async () => {
    fromMock.mockImplementation(() => chainable({ data: {}, error: null }));

    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'someone-else', amount: 500, reason: 'quiz' } });
    const flushed = await SyncQueue.flush();

    expect(flushed).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(await SyncQueue.size()).toBe(0); // removed from active queue
    const dlq = await SyncQueue.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].error.permanent).toBe(true);
    expect(dlq[0].error.message).toContain('discarding');
  });

  it('moves an entry to dead-letter queue after 5 failed attempts instead of silently deleting it', async () => {
    fromMock.mockImplementation(() => { throw new Error('network timeout'); });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });

    for (let i = 0; i < 5; i++) {
      await SyncQueue.flush();
    }

    expect(await SyncQueue.size()).toBe(0);
    const dlq = await SyncQueue.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].attempts).toBe(5);
    expect(dlq[0].error.message).toContain('timeout');
  });

  it('does nothing when there is no active session (stays queued for the next real online flush)', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await SyncQueue.enqueue({ type: 'streak_tick', payload: { user_id: 'user-1', date: '2026-08-07' } });

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(0);
    expect(await SyncQueue.size()).toBe(1);
  });

  // ── Day 4 SyncQueue V2 Requirements ────────────────────────────────────────

  it('migrates legacy quiz_session to complete_quiz_session RPC without score_pct column', async () => {
    rpcMock.mockImplementation(() => chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null }));

    const legacyPayload = {
      user_id: 'user-1',
      subject: 'Thermodynamics',
      topic: 'Entropy',
      questions: [{ id: 1 }, { id: 2 }, { id: 3 }],
      user_answers: [1, 2, 3],
      score: 3,
      score_pct: 100, // legacy field — must be safely transformed without causing column errors
      completed_at: '2026-09-25T12:00:00.000Z',
    };

    await SyncQueue.enqueue({ type: 'quiz_session', payload: legacyPayload });
    expect(await SyncQueue.size()).toBe(1);

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(1);
    expect(await SyncQueue.size()).toBe(0);

    // Verify complete_quiz_session was called with canonical parameters
    expect(rpcMock).toHaveBeenCalledWith('complete_quiz_session', expect.objectContaining({
      p_subject: 'Thermodynamics',
      p_topic: 'Entropy',
      p_score: 3,
      p_questions_count: 3,
      p_completed_at: '2026-09-25T12:00:00.000Z',
    }));

    // Verify score_pct was NOT passed to the RPC
    const callArgs = rpcMock.mock.calls.find(c => c[0] === 'complete_quiz_session')?.[1];
    expect(callArgs).not.toHaveProperty('score_pct');
    expect(callArgs).not.toHaveProperty('p_score_pct');
    // Verify direct from('quiz_sessions').insert was NOT called
    expect(fromMock).not.toHaveBeenCalledWith('quiz_sessions');
  });

  it('prunes paired legacy xp_grant and topic_perf when migrating quiz_session to prevent double XP', async () => {
    rpcMock.mockImplementation(() => chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null }));

    // Simulate old client queue which enqueued quiz_session, xp_grant, topic_perf sequentially
    await SyncQueue.enqueue({
      type: 'quiz_session',
      payload: {
        user_id: 'user-1',
        subject: 'Physics',
        topic: 'Optics',
        questions: [{ id: 1 }, { id: 2 }, { id: 3 }],
        user_answers: [0, 1, 2],
        score: 3,
        score_pct: 100,
        completed_at: '2026-09-25T12:00:00.000Z',
      },
    });

    await SyncQueue.enqueue({
      type: 'xp_grant',
      payload: { user_id: 'user-1', amount: 30, reason: 'quiz:Optics' },
    });

    await SyncQueue.enqueue({
      type: 'topic_perf',
      payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 3, total: 3 },
    });

    expect(await SyncQueue.size()).toBe(3);

    const flushed = await SyncQueue.flush();
    // Only the single canonical quiz_session was processed; paired entries were consumed
    expect(flushed).toBe(1);
    expect(await SyncQueue.size()).toBe(0);

    // increment_xp was NOT called via xp_grant (preventing double XP)
    expect(rpcMock).not.toHaveBeenCalledWith('increment_xp', expect.anything());
    // complete_quiz_session was called once
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('complete_quiz_session', expect.anything());
  });

  it('immediately moves permanent database/RLS errors to DLQ without wasting 5 retries', async () => {
    rpcMock.mockImplementation(() => chainable({
      data: null,
      error: { message: 'permission denied for table', code: '42501' },
    }));

    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 25, reason: 'test' } });

    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(0);
    expect(await SyncQueue.size()).toBe(0); // Immediately removed from active queue

    const dlq = await SyncQueue.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].error.permanent).toBe(true);
    expect(dlq[0].error.code).toBe('42501');
  });

  it('classifies error codes correctly into permanent vs. retryable', () => {
    expect(classifyError({ code: '42501' }).permanent).toBe(true); // RLS
    expect(classifyError({ code: '23505' }).permanent).toBe(true); // Unique violation
    expect(classifyError({ code: 'PGRST204' }).permanent).toBe(true); // Column missing
    expect(classifyError({ message: 'quiz_session user_id mismatch — discarding' }).permanent).toBe(true);

    expect(classifyError({ message: 'Failed to fetch' }).permanent).toBe(false);
    expect(classifyError({ message: 'network timeout' }).permanent).toBe(false);
    expect(classifyError({ code: 'PGRST301' }).permanent).toBe(false);
    expect(classifyError({ status: 503 }).permanent).toBe(false);
  });
});
