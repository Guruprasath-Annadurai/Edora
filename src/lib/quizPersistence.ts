// ─────────────────────────────────────────────────────────────────────────────
// quizPersistence — the single entry point for saving a completed quiz.
//
// ONE authority: the server RPC complete_quiz_session, keyed by a session id the
// client mints ONCE per quiz run. Everything on the client is just delivery:
//   1. write-ahead into the durable SyncQueue (so an offline/killed app still delivers),
//   2. try to deliver immediately,
//   3. on success remove the entry; on failure leave it queued for the next flush.
// Because the RPC is idempotent on session id, every combination of retry, replay,
// concurrent flush and "delivered but response lost" yields exactly one row and one
// XP grant. The old QuizPage wrote the same quiz through a live insert AND a queued
// replay and granted XP twice; that duplicate path no longer exists.
// ─────────────────────────────────────────────────────────────────────────────

import { SyncQueue, submitQuizComplete, type QuizCompletePayload } from '@/lib/syncQueue';

export interface CompletedQuizInput {
  sessionId:    string;
  userId:       string;
  subject:      string;
  topic:        string;
  questions:    unknown[];
  userAnswers:  number[];
  score:        number;
  completedAt:  string;
}

export type QuizPersistStatus =
  | 'saved'       // recorded now; xpAwarded granted by the server
  | 'duplicate'   // this session was already recorded earlier; nothing awarded again
  | 'queued';     // could not reach the server; durably queued, will deliver on reconnect

export interface QuizPersistResult { status: QuizPersistStatus; xpAwarded: number }

/** Mint the per-run session id. Call once when a quiz run starts/finishes, reuse for that run. */
export function newQuizSessionId(): string {
  return crypto.randomUUID();
}

export function buildQuizCompletePayload(q: CompletedQuizInput): QuizCompletePayload {
  return {
    user_id:         q.userId,
    session_id:      q.sessionId,
    subject:         q.subject,
    topic:           q.topic,
    questions:       q.questions,
    user_answers:    q.userAnswers,
    score:           q.score,
    questions_count: q.questions.length,
    completed_at:    q.completedAt,
  };
}

export async function persistCompletedQuiz(q: CompletedQuizInput): Promise<QuizPersistResult> {
  const payload = buildQuizCompletePayload(q);
  const entryId = await SyncQueue.enqueue({ type: 'quiz_complete', payload });
  try {
    const r = await submitQuizComplete(payload);
    await SyncQueue.remove(entryId);
    return r.duplicate
      ? { status: 'duplicate', xpAwarded: 0 }
      : { status: 'saved', xpAwarded: r.xp_awarded };
  } catch (err) {
    // Stay queued. NOT a silent success: the caller is told it is only queued.
    console.warn('[quizPersistence] delivery failed, kept queued:', (err as Error)?.message);
    return { status: 'queued', xpAwarded: 0 };
  }
}
