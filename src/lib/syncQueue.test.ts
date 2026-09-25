import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

// ─────────────────────────────────────────────────────────────────────────────
// SyncQueue Legacy Pruning Safety Tests
//
// These tests prove the pruning logic ONLY removes entries that belong to the
// same offline quiz batch (within ±2000ms), and NEVER cross-contaminates
// entries from different quizzes, different users, or unrelated events.
//
// Requirement: "Prefer preserving an ambiguous entry over silently deleting
// earned progress."
// ─────────────────────────────────────────────────────────────────────────────

describe('SyncQueue Legacy Pruning Safety', () => {
  // Each test gets a fresh store and fresh mocks
  beforeEach(() => {
    store.clear();
    fromMock.mockReset();
    rpcMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: SESSION } });
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Baseline: Quiz A + xp_grant A + topic_perf A all enqueued together.
   * After flush: all three consumed, queue empty.
   */
  it('prunes xp_grant and topic_perf that belong to the same quiz batch (baseline)', async () => {
    rpcMock.mockImplementation(() => chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null }));

    vi.useFakeTimers();
    vi.setSystemTime(1000);

    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
    }});
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 30, reason: 'quiz:Optics' } });
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 1, total: 1 } });

    expect(await SyncQueue.size()).toBe(3);
    const flushed = await SyncQueue.flush();
    expect(flushed).toBe(1);
    expect(await SyncQueue.size()).toBe(0);
  });

  /**
   * KEY SAFETY TEST:
   * Quiz A (topic=Optics, t=1000ms) + Quiz B (topic=Optics, t=10000ms).
   * Both have associated xp_grant and topic_perf.
   * After processing ONLY Quiz A: Quiz B's xp_grant AND topic_perf must survive.
   */
  it('does NOT prune xp_grant/topic_perf from Quiz B when flushing Quiz A (same topic, different time)', async () => {
    let rpcCallCount = 0;
    rpcMock.mockImplementation((_name: string) => {
      rpcCallCount++;
      if (rpcCallCount === 1) {
        // Quiz A succeeds
        return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      }
      // Quiz B should not be processed yet — but if it is, return success
      return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
    });

    vi.useFakeTimers();

    // Enqueue Quiz A batch at t=1000
    vi.setSystemTime(1000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
    }});
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 30, reason: 'quiz:Optics' } });
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 1, total: 1 } });

    // Enqueue Quiz B batch at t=10000 (9 seconds later — well outside 2000ms window)
    vi.setSystemTime(10000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 2 }], user_answers: [1], score: 0, completed_at: '2026-09-25T12:05:00.000Z',
    }});
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 0, reason: 'quiz:Optics' } });
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 0, total: 1 } });

    expect(await SyncQueue.size()).toBe(6);

    // Only process Quiz A's batch — make Quiz B's quiz_session fail with retryable error so it stays queued
    // Override: make only first call succeed, rest fail with retryable network error
    rpcCallCount = 0;
    rpcMock.mockImplementation(() => {
      rpcCallCount++;
      if (rpcCallCount === 1) {
        return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      }
      // Quiz B's quiz_session returns retryable error — stops batch here
      throw new Error('network timeout');
    });

    await SyncQueue.flush();

    // After processing Quiz A: Quiz A's quiz_session, xp_grant, and topic_perf pruned (3 gone).
    // Quiz B's quiz_session failed retryably — its batch preserved (3 remain).
    const remaining = await SyncQueue.size();
    expect(remaining).toBe(3);

    // Verify the 3 remaining entries all belong to Quiz B (queued_at=10000)
    const raw = store.get(QUEUE_KEY)!;
    const entries = JSON.parse(raw) as { queued_at: number; action: { type: string } }[];
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.queued_at).toBe(10000);
    }

    // Specifically: Quiz B's topic_perf must still be present
    const topicPerfB = entries.find(e => e.action.type === 'topic_perf');
    expect(topicPerfB).toBeDefined();
    const xpGrantB = entries.find(e => e.action.type === 'xp_grant');
    expect(xpGrantB).toBeDefined();
  });

  /**
   * Unrelated XP event (not from a quiz) must never be pruned.
   * After quiz_session flushes, the daily_streak xp_grant must survive in the queue
   * (here we make it fail retryably so it stays queued — proving pruning didn't eat it).
   */
  it('does NOT prune unrelated xp_grant entries (reason does not start with quiz:topic)', async () => {
    let rpcCallCount = 0;
    rpcMock.mockImplementation(() => {
      rpcCallCount++;
      if (rpcCallCount === 1) {
        // First call: complete_quiz_session — succeeds
        return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      }
      // Second call: increment_xp for the xp_grant — retryable failure to keep it queued
      throw new Error('network timeout');
    });
    fromMock.mockImplementation(() => chainable({ data: {}, error: null }));

    vi.useFakeTimers();
    vi.setSystemTime(1000);

    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
    }});
    // Unrelated XP: enqueued at same time but reason is 'daily_streak', not 'quiz:Optics'
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 10, reason: 'daily_streak' } });

    expect(await SyncQueue.size()).toBe(2);
    await SyncQueue.flush();

    // quiz_session consumed (pruning logic ran but must NOT have touched daily_streak xp_grant).
    // xp_grant then encountered retryable network error — stays queued.
    expect(await SyncQueue.size()).toBe(1);
    const raw = store.get(QUEUE_KEY)!;
    const remaining = JSON.parse(raw) as { action: { type: string; payload: { reason?: string } } }[];
    expect(remaining[0].action.type).toBe('xp_grant');
    expect(remaining[0].action.payload.reason).toBe('daily_streak');
  });

  /**
   * Same topic, different score — ensure both topic_perf entries survive independently.
   * Quiz A: score=3/3; Quiz B: score=1/3 (different result, same topic).
   * Quiz B's topic_perf must not be pruned when Quiz A is flushed.
   */
  it('does NOT prune topic_perf with same topic but different score from a later quiz', async () => {
    vi.useFakeTimers();

    // Quiz A batch at t=1000
    vi.setSystemTime(1000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }, { id: 2 }, { id: 3 }], user_answers: [0, 1, 2],
      score: 3, completed_at: '2026-09-25T12:00:00.000Z',
    }});
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 3, total: 3 } });

    // Quiz B batch at t=20000 — same topic, different score
    vi.setSystemTime(20000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 4 }, { id: 5 }, { id: 6 }], user_answers: [0, 0, 0],
      score: 1, completed_at: '2026-09-25T12:10:00.000Z',
    }});
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 1, total: 3 } });

    // Process Quiz A only (Quiz B retryable)
    let callCount = 0;
    rpcMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      throw new Error('network timeout');
    });

    await SyncQueue.flush();

    const remaining = await SyncQueue.size();
    expect(remaining).toBe(2); // Quiz B quiz_session + Quiz B topic_perf

    const raw = store.get(QUEUE_KEY)!;
    const entries = JSON.parse(raw) as { queued_at: number; action: { type: string; payload: { correct?: number } } }[];
    const tp = entries.find(e => e.action.type === 'topic_perf');
    expect(tp).toBeDefined();
    expect(tp!.action.payload.correct).toBe(1); // Quiz B's topic_perf (correct=1), not A's (correct=3)
  });

  /**
   * Interleaved queue ordering:
   * queue = [quiz_session_A, quiz_session_B, xp_A, topic_A, xp_B, topic_B]
   * Processing quiz_session_A must only prune xp_A and topic_A (within 2000ms window).
   * xp_B and topic_B (at a later timestamp) must survive.
   */
  it('handles interleaved queue ordering — only prunes entries from the same time window', async () => {
    vi.useFakeTimers();

    // Quiz A at t=500
    vi.setSystemTime(500);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
    }});

    // Quiz B at t=15000 (far apart)
    vi.setSystemTime(15000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Chemistry', topic: 'Optics',
      questions: [{ id: 2 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:05:00.000Z',
    }});

    // xp_A enqueued at t=600 (within window of quiz_session_A)
    vi.setSystemTime(600);
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 30, reason: 'quiz:Optics' } });

    // topic_perf_A enqueued at t=700
    vi.setSystemTime(700);
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Physics', topic: 'Optics', correct: 1, total: 1 } });

    // xp_B enqueued at t=15100 (within window of quiz_session_B)
    vi.setSystemTime(15100);
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 30, reason: 'quiz:Optics' } });

    // topic_perf_B enqueued at t=15200
    vi.setSystemTime(15200);
    await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: 'user-1', subject: 'Chemistry', topic: 'Optics', correct: 1, total: 1 } });

    expect(await SyncQueue.size()).toBe(6);

    // Only Quiz A succeeds; Quiz B fails retryably
    let callCount = 0;
    rpcMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      throw new Error('network timeout');
    });

    await SyncQueue.flush();

    // Quiz A's batch (quiz_session_A + xp_A + topic_perf_A) pruned = 3 removed
    // Quiz B's batch (quiz_session_B + xp_B + topic_perf_B) must all remain
    expect(await SyncQueue.size()).toBe(3);

    const raw = store.get(QUEUE_KEY)!;
    const entries = JSON.parse(raw) as { queued_at: number }[];
    // All remaining entries are from t >= 15000
    for (const e of entries) {
      expect(e.queued_at).toBeGreaterThanOrEqual(15000);
    }
  });

  /**
   * Duplicate legacy quiz scenario: same quiz_session enqueued twice
   * (e.g., app crash/replay, response-lost scenario).
   * The second quiz_session must stay in queue after the first is flushed,
   * so the server's idempotency (via session_id) handles the duplicate.
   * We must NOT silently eat it.
   */
  it('preserves duplicate legacy quiz_session entries for server-side idempotency deduplication', async () => {
    let rpcCallCount = 0;
    rpcMock.mockImplementation(() => {
      rpcCallCount++;
      if (rpcCallCount === 1) return chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null });
      // Second call reports duplicate (server idempotency)
      return chainable({ data: { duplicate: true, xp_awarded: 0 }, error: null });
    });

    vi.useFakeTimers();

    // Same session submitted twice (response-lost/replay)
    vi.setSystemTime(1000);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
      session_id: 'session-abc',
    }});
    // Replay: second copy queued a little later (within window)
    vi.setSystemTime(1500);
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-1', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
      session_id: 'session-abc',
    }});

    expect(await SyncQueue.size()).toBe(2);

    await SyncQueue.flush();

    // Both quiz_sessions should be processed (server handles idempotency)
    // No silent pruning of the second one
    expect(rpcCallCount).toBe(2);
    expect(await SyncQueue.size()).toBe(0);
  });

  /**
   * Cross-user safety: user-1's xp_grant must NEVER be silently pruned when
   * user-2's quiz_session is processed. The xp_grant has the same topic in its
   * reason but belongs to a different user — pruning must use user_id check,
   * not just reason/topic.
   *
   * Expected outcome: quiz_session for user-2 flushes normally. xp_grant for user-1
   * then fails the auth check (user_id !== sessionUserId) → permanent → DLQ'd.
   * Neither silently deleted by pruning NOR silently discarded.
   */
  it('does NOT silently prune xp_grant belonging to a different user — auth-rejected entries go to DLQ', async () => {
    rpcMock.mockImplementation(() => chainable({ data: { duplicate: false, xp_awarded: 30 }, error: null }));
    fromMock.mockImplementation(() => chainable({ data: {}, error: null }));

    vi.useFakeTimers();
    vi.setSystemTime(1000);

    // user-2 quiz_session
    await SyncQueue.enqueue({ type: 'quiz_session', payload: {
      user_id: 'user-2', subject: 'Physics', topic: 'Optics',
      questions: [{ id: 1 }], user_answers: [0], score: 1, completed_at: '2026-09-25T12:00:00.000Z',
    }});

    // user-1 xp_grant (different user!) enqueued at same time, same topic in reason
    // This must NOT be pruned by quiz_session's pruning logic (user_id mismatch)
    await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: 'user-1', amount: 50, reason: 'quiz:Optics' } });

    // Authenticate as user-2 so quiz_session passes; xp_grant for user-1 then fails auth
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok', user: { id: 'user-2' } } } });

    await SyncQueue.flush();

    // Quiz session flushed. xp_grant for user-1 was NOT silently pruned by the
    // quiz_session pruning logic (pruning checks user_id — user-1 ≠ user-2).
    // It was instead auth-rejected (permanent error) and moved to DLQ.
    // Either queued or DLQ'd — never silently dropped.
    const activeSize = await SyncQueue.size();
    const dlq = await SyncQueue.getDeadLetterQueue();
    // The entry must be accounted for: either still active OR in DLQ
    expect(activeSize + dlq.length).toBeGreaterThanOrEqual(1);
    // Specifically: it must be in the DLQ as a permanent auth failure
    expect(dlq).toHaveLength(1);
    expect(dlq[0].error.permanent).toBe(true);
    expect(dlq[0].action.payload).toMatchObject({ user_id: 'user-1', reason: 'quiz:Optics' });
  });
});

