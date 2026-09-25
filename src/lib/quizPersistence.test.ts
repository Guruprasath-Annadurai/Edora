import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rpc = vi.fn();
const from = vi.fn(() => { throw new Error('quizPersistence must never write tables directly'); });
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => (from as (...x: unknown[]) => unknown)(...a),
    auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }) },
  },
}));

import { persistCompletedQuiz, buildQuizCompletePayload, newQuizSessionId } from '@/lib/quizPersistence';
import { SyncQueue } from '@/lib/syncQueue';

const base = () => ({
  sessionId: newQuizSessionId(), userId: 'u1', subject: 'Physics', topic: 'Physics',
  questions: [{ q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }, { q: 5 }], userAnswers: [0, 0, 0, 1, 1], score: 3,
  completedAt: '2026-09-26T00:00:00.000Z',
});

beforeEach(async () => {
  rpc.mockReset(); from.mockClear(); localStorage.clear();
  await SyncQueue.flush().catch(() => {});
});

describe('persistCompletedQuiz — one persistence authority', () => {
  it('saves through the single RPC exactly once and never touches tables or increment_xp directly', async () => {
    rpc.mockResolvedValue({ data: { duplicate: false, xp_awarded: 30 }, error: null });
    const r = await persistCompletedQuiz(base());
    expect(r).toEqual({ status: 'saved', xpAwarded: 30 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('complete_quiz_session');
    expect(rpc.mock.calls.some(c => c[0] === 'increment_xp')).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(await SyncQueue.size()).toBe(0);            // delivered => entry removed, nothing left to replay
  });

  it('does not send score_pct (the nonexistent column) or a client-supplied XP amount', () => {
    const p = buildQuizCompletePayload(base());
    expect(Object.keys(p)).not.toContain('score_pct');
    expect(Object.keys(p)).not.toContain('amount');
    expect(Object.keys(p)).not.toContain('xp');
    expect(p.questions_count).toBe(5);
  });

  it('reports a server-side duplicate as duplicate with zero XP (no double award on replay)', async () => {
    rpc.mockResolvedValue({ data: { duplicate: true, xp_awarded: 0 }, error: null });
    expect(await persistCompletedQuiz(base())).toEqual({ status: 'duplicate', xpAwarded: 0 });
    expect(await SyncQueue.size()).toBe(0);
  });

  it('keeps the entry queued (NOT a silent success) when the server errors, then delivers once on reconnect with the SAME session id', async () => {
    const q = base();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    const first = await persistCompletedQuiz(q);
    expect(first.status).toBe('queued');
    expect(await SyncQueue.size()).toBe(1);

    rpc.mockResolvedValueOnce({ data: { duplicate: false, xp_awarded: 30 }, error: null });
    expect(await SyncQueue.flush()).toBe(1);           // reconnect flush
    expect(await SyncQueue.size()).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_session_id).toBe(q.sessionId);
    expect(rpc.mock.calls[1][1].p_session_id).toBe(q.sessionId);
  });

  it('an error RESPONSE is never treated as success (entry survives a failing flush)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await persistCompletedQuiz(base());
    expect(await SyncQueue.flush()).toBe(0);
    expect(await SyncQueue.size()).toBe(1);
  });

  it('a repeated finish in the same run (double tap) reuses the session id so the server can dedupe', async () => {
    rpc.mockResolvedValue({ data: { duplicate: false, xp_awarded: 30 }, error: null });
    const q = base();
    await Promise.all([persistCompletedQuiz(q), persistCompletedQuiz(q)]);
    const ids = rpc.mock.calls.map(c => c[1].p_session_id);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('static regression guards on the legacy duplicate path', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

  it('QuizPage has a single persistence path: no live quiz_sessions insert, no direct increment_xp, no score_pct, no legacy enqueue', () => {
    const src = read('src/pages/QuizPage.tsx');
    expect(src).toContain('persistCompletedQuiz');
    expect(src).not.toMatch(/from\(\s*['"]quiz_sessions['"]\s*\)/);
    expect(src).not.toMatch(/increment_xp/);
    expect(src).not.toMatch(/score_pct/);
    expect(src).not.toMatch(/type:\s*['"](quiz_session|xp_grant|topic_perf)['"]/);
    expect(src).not.toMatch(/SyncQueue\.flush\(\)/);
  });

  it('no source file other than the queue itself enqueues the legacy quiz_session action', () => {
    const files = ['src/pages/QuizPage.tsx', 'src/pages/CoursePage.tsx', 'src/lib/offlineStudy.ts'];
    for (const f of files) expect(read(f)).not.toMatch(/type:\s*['"]quiz_session['"]/);
  });
});
