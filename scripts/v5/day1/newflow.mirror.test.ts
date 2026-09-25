// NEW flow (V5 Day 1) end to end: the real SyncQueue + real persistCompletedQuiz +
// real supabase-js -> PostgREST -> Postgres mirror with production's quiz objects and
// the complete_quiz_session migration applied. Runs against BOTH schema states:
//   (a) production today (no quiz_sessions.score_pct)   (b) with score_pct added.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientFor, resetDb, seedUser, dbCount, dbXp, dbTopicTotal, sql, QUESTIONS } from './mirror';

let current: SupabaseClient;
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_t, p) => (current as unknown as Record<string | symbol, unknown>)[p] }),
}));

import { SyncQueue, submitQuizComplete, type QuizCompletePayload } from '@/lib/syncQueue';
import { persistCompletedQuiz, newQuizSessionId, buildQuizCompletePayload } from '@/lib/quizPersistence';

const quiz = (uid: string, sessionId = newQuizSessionId(), score = 3) => ({
  sessionId, userId: uid, subject: 'Mirror Topic', topic: 'Mirror Topic',
  questions: QUESTIONS as unknown[], userAnswers: [0, 0, 0, 1, 1], score, completedAt: new Date().toISOString(),
});

beforeEach(() => { localStorage.clear(); });

for (const withScorePct of [false, true]) {
  const label = withScorePct ? 'schema WITH score_pct' : 'schema = production today (NO score_pct)';
  describe(`NEW quiz persistence — ${label}`, () => {
    it('one completed quiz => exactly ONE row, XP exactly ONCE, topic stats once', async () => {
      resetDb(withScorePct);
      const uid = seedUser(0); current = clientFor(uid);
      const r = await persistCompletedQuiz(quiz(uid));
      console.log(`[NEW/${withScorePct ? 'with' : 'without'} score_pct] status`, r.status, 'rows', dbCount(uid), 'xp', dbXp(uid), 'topic_total', dbTopicTotal(uid), 'queue', await SyncQueue.size());
      expect(r).toEqual({ status: 'saved', xpAwarded: 30 });
      expect(dbCount(uid)).toBe(1);
      expect(dbXp(uid)).toBe(30);
      expect(dbTopicTotal(uid)).toBe(5);
      expect(await SyncQueue.size()).toBe(0);
    });

    it('retry/reconnect: network drop => queued (nothing saved), reconnect flush => exactly one row and one XP', async () => {
      resetDb(withScorePct);
      const uid = seedUser(0); const failNext = { n: 1 }; current = clientFor(uid, failNext);
      const r = await persistCompletedQuiz(quiz(uid));
      expect(r.status).toBe('queued');
      expect(dbCount(uid)).toBe(0); expect(dbXp(uid)).toBe(0);
      expect(await SyncQueue.size()).toBe(1);
      const flushed = await SyncQueue.flush();                       // reconnect
      console.log(`[NEW retry ${withScorePct ? 'with' : 'without'}] flushed`, flushed, 'rows', dbCount(uid), 'xp', dbXp(uid));
      expect(flushed).toBe(1);
      expect(dbCount(uid)).toBe(1); expect(dbXp(uid)).toBe(30); expect(dbTopicTotal(uid)).toBe(5);
      expect(await SyncQueue.size()).toBe(0);
    });
  });
}

describe('NEW quiz persistence — idempotency, concurrency, replay, security, validation', () => {
  it('delivered-but-response-lost: server already has the session, replay is a no-op (no second row, no second XP)', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    const q = quiz(uid);
    await submitQuizComplete(buildQuizCompletePayload(q));           // server recorded it; imagine the response was lost
    const r = await persistCompletedQuiz(q);                          // client retries the same run
    expect(r).toEqual({ status: 'duplicate', xpAwarded: 0 });
    expect(dbCount(uid)).toBe(1); expect(dbXp(uid)).toBe(30); expect(dbTopicTotal(uid)).toBe(5);
  });

  it('concurrent delivery (double tap + a reconnect flush racing) => still one row, one XP', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    const q = quiz(uid);
    const results = await Promise.all([persistCompletedQuiz(q), persistCompletedQuiz(q), SyncQueue.flush()]);
    console.log('[NEW concurrency] rows', dbCount(uid), 'xp', dbXp(uid), 'statuses', JSON.stringify(results.slice(0, 2)));
    expect(dbCount(uid)).toBe(1); expect(dbXp(uid)).toBe(30); expect(dbTopicTotal(uid)).toBe(5);
    expect(results.filter(r => typeof r === 'object' && (r as { status: string }).status === 'saved').length).toBe(1);
  });

  it('a stale queue entry replayed after success changes nothing', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    const q = quiz(uid);
    await persistCompletedQuiz(q);
    await SyncQueue.enqueue({ type: 'quiz_complete', payload: buildQuizCompletePayload(q) });
    await SyncQueue.flush();
    expect(dbCount(uid)).toBe(1); expect(dbXp(uid)).toBe(30); expect(dbTopicTotal(uid)).toBe(5);
  });

  it('two DIFFERENT quizzes are both recorded (dedupe is per session, not over-eager)', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    await persistCompletedQuiz(quiz(uid, newQuizSessionId(), 3));
    await persistCompletedQuiz(quiz(uid, newQuizSessionId(), 5));
    expect(dbCount(uid)).toBe(2); expect(dbXp(uid)).toBe(30 + 50); expect(dbTopicTotal(uid)).toBe(10);
  });

  it('security: another user cannot claim, overwrite or award XP through someone else\'s session id', async () => {
    resetDb(false);
    const a = seedUser(0); const b = seedUser(0);
    const q = quiz(a); current = clientFor(a); await persistCompletedQuiz(q);
    current = clientFor(b);
    await expect(submitQuizComplete({ ...buildQuizCompletePayload(q), user_id: b })).rejects.toThrow(/belongs to another user/);
    expect(dbCount(a)).toBe(1); expect(dbCount(b)).toBe(0); expect(dbXp(a)).toBe(30); expect(dbXp(b)).toBe(0);
  });

  it('security: an unauthenticated (anon) caller cannot execute the RPC', async () => {
    resetDb(false);
    const uid = seedUser(0);
    const { createClient } = await import('@supabase/supabase-js');
    const { mintJwt, rewriteFetch } = await import('./mirror');
    const anon = createClient('http://mirror.local', mintJwt('00000000-0000-0000-0000-000000000000', 'anon'), { auth: { persistSession: false }, global: { fetch: rewriteFetch() } });
    const { error } = await anon.rpc('complete_quiz_session', { ...Object.fromEntries(Object.entries(buildQuizCompletePayload(quiz(uid))).map(([k, v]) => [`p_${k}`, v])), p_questions_count: 5 });
    expect(error).not.toBeNull();
    expect(dbCount(uid)).toBe(0); expect(dbXp(uid)).toBe(0);
  });

  it('validation: impossible scores/counts are rejected and award nothing', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    const bad: QuizCompletePayload[] = [
      { ...buildQuizCompletePayload(quiz(uid)), score: 6 },            // score > count
      { ...buildQuizCompletePayload(quiz(uid)), score: -1 },
      { ...buildQuizCompletePayload(quiz(uid)), questions: [], questions_count: 0 },
      { ...buildQuizCompletePayload(quiz(uid)), questions_count: 101 },
    ];
    for (const p of bad) await expect(submitQuizComplete(p)).rejects.toThrow();
    expect(dbCount(uid)).toBe(0); expect(dbXp(uid)).toBe(0); expect(dbTopicTotal(uid)).toBe(0);
    void sql; // (kept for debugging)
  });
});
