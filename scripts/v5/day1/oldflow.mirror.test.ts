// REPRODUCTION of the pre-fix behaviour (baseline eaf42ab). This file transcribes
// the persistence portion of QuizPage.finishQuiz (src/pages/QuizPage.tsx ~505-540)
// and drives the REAL, unmodified SyncQueue against a REAL PostgREST + Postgres mirror
// of production's quiz objects. It documents defects; it is not a spec for desired behaviour.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientFor, resetDb, seedUser, dbCount, dbXp, dbTopicTotal, QUESTIONS } from './mirror';

let current: SupabaseClient;
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_t, p) => (current as unknown as Record<string | symbol, unknown>)[p] }),
}));

import { SyncQueue } from '@/lib/syncQueue';
import { scoreQuiz } from '@/lib/quizScoring';

async function oldQuizFlow(uid: string, finalAnswers: number[]) {
  const { score, pct } = scoreQuiz(finalAnswers, QUESTIONS);
  const completedAt = new Date().toISOString();
  const xpGain = score * 10;
  const topic = 'Mirror Topic';
  await SyncQueue.enqueue({ type: 'quiz_session', payload: { user_id: uid, subject: topic, topic, questions: QUESTIONS as unknown[], user_answers: finalAnswers, score, score_pct: pct, completed_at: completedAt } });
  await SyncQueue.enqueue({ type: 'xp_grant', payload: { user_id: uid, amount: xpGain, reason: `quiz:${topic}` } });
  await SyncQueue.enqueue({ type: 'topic_perf', payload: { user_id: uid, subject: topic, topic, correct: score, total: QUESTIONS.length } });
  const { error: insertError } = await current.from('quiz_sessions').insert({
    user_id: uid, subject: topic, topic, questions: QUESTIONS, user_answers: finalAnswers, score, score_pct: pct, completed_at: completedAt,
  });
  if (!insertError) {
    await SyncQueue.flush();
    await current.rpc('increment_xp', { user_id: uid, amount: xpGain });
  }
  return { insertError, score, xpGain };
}

beforeEach(async () => { localStorage.clear(); await SyncQueue.flush().catch(() => {}); });

describe('OLD quiz persistence flow (baseline) — defect reproduction', () => {
  it('S0  production schema today (no score_pct): quiz row is NEVER saved; XP arrives once via the queue', async () => {
    resetDb(false);
    const uid = seedUser(0); current = clientFor(uid);
    const r = await oldQuizFlow(uid, [0, 0, 0, 1, 1]);            // score 3
    expect(r.insertError?.code).toBe('PGRST204');                   // column score_pct not in schema
    await SyncQueue.flush();                                        // next reconnect/launch
    console.log('[S0] rows', dbCount(uid), 'xp', dbXp(uid), 'topic_total', dbTopicTotal(uid));
    expect(dbCount(uid)).toBe(0);                                   // F17: silently lost
    expect(dbXp(uid)).toBe(30);                                     // XP once
  });

  it('S1  after adding score_pct: PREDICTED defect — two session rows and double XP', async () => {
    resetDb(true);
    const uid = seedUser(0); current = clientFor(uid);
    const r = await oldQuizFlow(uid, [0, 0, 0, 1, 1]);            // score 3
    expect(r.insertError).toBeNull();
    console.log('[S1] rows', dbCount(uid), 'xp', dbXp(uid), 'topic_total', dbTopicTotal(uid));
    expect(dbCount(uid)).toBe(2);                                   // duplicate session
    expect(dbXp(uid)).toBe(60);                                     // 2 x 30 — double XP
  });
});
