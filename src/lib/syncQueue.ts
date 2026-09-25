// ─────────────────────────────────────────────────────────────────────────────
// Sync Queue V2 — persists XP gains, quiz answers, streak updates while offline.
// Processes the queue automatically when the device comes back online.
//
// Storage: @capacitor/preferences (survives app restarts, works on native)
// DLQ: @capacitor/preferences (edora_sync_dlq) for unrecoverable/exhausted items
// ─────────────────────────────────────────────────────────────────────────────

import { Preferences } from '@capacitor/preferences';
import { supabase }    from '@/lib/supabase';
import { withRetry }   from '@/lib/withRetry';

const QUEUE_KEY = 'edora_sync_queue';
const DLQ_KEY   = 'edora_sync_dlq';
export const MAX_QUEUE_RETRIES = 5;

export interface QuizCompletePayload {
  user_id:         string;
  session_id:      string;
  subject:         string;
  topic:           string;
  questions:       unknown[];
  user_answers:    number[];
  score:           number;
  questions_count: number;
  completed_at:    string;
}

export interface QuizCompleteResult { duplicate: boolean; xp_awarded: number }

export interface DeadLetterEntry {
  id:             string;
  action:         SyncAction;
  queued_at:      number;
  failed_at:      number;
  attempts:       number;
  error: {
    message:      string;
    code?:        string;
    details?:     string;
    permanent:    boolean;
  };
}

/**
 * Deliver a completed quiz to the server's single, idempotent persistence authority.
 * Throws on ANY error (network, auth, validation) so the caller keeps the entry queued —
 * the {error} response is inspected here, never assumed successful. A duplicate response
 * (same session_id already recorded) is success and awards nothing.
 */
export async function submitQuizComplete(p: QuizCompletePayload): Promise<QuizCompleteResult> {
  const { data, error } = await supabase.rpc('complete_quiz_session', {
    p_session_id:      p.session_id,
    p_subject:         p.subject,
    p_topic:           p.topic,
    p_questions:       p.questions,
    p_user_answers:    p.user_answers,
    p_score:           p.score,
    p_questions_count: p.questions_count,
    p_completed_at:    p.completed_at,
  });
  if (error) {
    const err = new Error(`complete_quiz_session failed: ${error.message}`) as Error & { code?: string; details?: string };
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  const r = (data ?? {}) as Partial<QuizCompleteResult>;
  return { duplicate: !!r.duplicate, xp_awarded: Number(r.xp_awarded ?? 0) };
}

export type SyncAction =
  | { type: 'xp_grant';    payload: { user_id: string; amount: number; reason: string } }
  | { type: 'quiz_answer'; payload: { user_id: string; session_id: string; question_id: string; correct: boolean; topic: string; subject: string } }
  | { type: 'quiz_session'; payload: {
      user_id: string; subject: string; topic: string;
      questions: unknown[]; user_answers: number[];
      score: number; score_pct?: number; completed_at: string;
      session_id?: string;
    }
  }
  // V5 Day 1: the ONE way a completed quiz is persisted. Delivered to the idempotent
  // server RPC complete_quiz_session, keyed by session_id, so retries/replays/reconnects
  // can never duplicate the row or the XP.
  | { type: 'quiz_complete'; payload: QuizCompletePayload }
  | { type: 'streak_tick'; payload: { user_id: string; date: string } }
  | { type: 'topic_perf';  payload: { user_id: string; subject: string; topic: string; correct: number; total: number } }
  | { type: 'lesson_complete'; payload: { user_id: string; lesson_id: string; xp_earned: number; completed_at: string } }
  | { type: 'flashcard_review'; payload: { user_id: string; card_id: string; quality: number } };

export interface QueueEntry {
  id:         string;
  action:     SyncAction;
  queued_at:  number;
  attempts:   number;
  last_error?: string;
}

// ── Error Classification ──────────────────────────────────────────────────────

export interface ClassifiedError {
  permanent: boolean;
  message:   string;
  code?:     string;
  details?:  string;
}

export function classifyError(err: unknown): ClassifiedError {
  if (!err) {
    return { permanent: false, message: 'Unknown error' };
  }

  const e = err as {
    message?: string;
    code?: string | number;
    status?: number;
    details?: string;
    hint?: string;
  };

  const message = String(e.message || (err instanceof Error ? err.message : err));
  const codeStr = e.code !== undefined ? String(e.code) : undefined;
  const status  = typeof e.status === 'number' ? e.status : undefined;
  const details = e.details || e.hint;

  // 1. Explicit application-level security / validation rejections (permanent)
  if (
    message.includes('discarding') ||
    message.includes('mismatch') ||
    message.includes('not authenticated') ||
    message.includes('session id belongs to another user') ||
    message.includes('payload too large') ||
    message.includes('invalid') ||
    message.includes('session id required') ||
    message.includes('topic required')
  ) {
    return { permanent: true, message, code: codeStr, details };
  }

  // 2. PostgREST & PostgreSQL SQLSTATE code checks
  if (codeStr) {
    // PostgREST client/schema errors (never resolve without code change)
    if (['PGRST116', 'PGRST200', 'PGRST204', 'PGRST300'].includes(codeStr)) {
      return { permanent: true, message, code: codeStr, details };
    }
    // PostgreSQL SQLSTATE classifications:
    // 22xxx - Data Exception (invalid data types, invalid UUIDs, out-of-range numbers)
    // 23xxx - Integrity Constraint Violation (unique, foreign key, check constraint)
    // 28xxx - Invalid Authorization Specification (invalid credentials/roles)
    // 42xxx - Syntax Error or Access Rule Violation (RLS 42501, missing column 42703)
    // 54xxx - Program Limit Exceeded
    if (/^(22|23|28|42|54)/.test(codeStr)) {
      return { permanent: true, message, code: codeStr, details };
    }
    // PostgREST connection errors or gateway timeouts
    if (codeStr === 'PGRST301' || codeStr === 'PGRST000') {
      return { permanent: false, message, code: codeStr, details };
    }
  }

  // 3. HTTP status codes
  if (status) {
    if (status >= 400 && status < 500 && status !== 429) {
      return { permanent: true, message, code: codeStr, details };
    }
    if (status === 429 || status >= 500) {
      return { permanent: false, message, code: codeStr, details };
    }
  }

  // 4. Network failures / timeouts (retryable)
  if (
    /network|timeout|fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|ERR_CONNECTION_REFUSED|failed to fetch/i.test(message) ||
    err instanceof TypeError
  ) {
    return { permanent: false, message, code: codeStr, details };
  }

  // Default: treat unknown exceptions without permanent indicators as retryable
  return { permanent: false, message, code: codeStr, details };
}

/** Helper to inspect Supabase query results and throw on error so withRetry or classifyError can see it */
function checkSupabaseResult<T>(res: { data?: T | null; error?: { message: string; code?: string; details?: string; hint?: string } | null }): T {
  if (res && res.error) {
    const err = new Error(res.error.message || 'Supabase operation failed') as Error & { code?: string; details?: string };
    err.code = res.error.code;
    err.details = res.error.details || res.error.hint;
    throw err;
  }
  return res?.data as T;
}

/** Mint a deterministic RFC4122 v4-formatted UUID from a seed string for replay/idempotency safety */
export function deterministicUuid(seed: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d, h3 = 0x12345678, h4 = 0x87654321;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3812015801);
    h4 = Math.imul(h4 ^ ch, 2718281829);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const hex = toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ── Persistence helpers ───────────────────────────────────────────────────────

async function loadQueue(): Promise<QueueEntry[]> {
  try {
    const { value } = await Preferences.get({ key: QUEUE_KEY });
    return value ? (JSON.parse(value) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueEntry[]): Promise<void> {
  try {
    await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
  } catch {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* drop silently */ }
  }
}

async function loadDlq(): Promise<DeadLetterEntry[]> {
  try {
    const { value } = await Preferences.get({ key: DLQ_KEY });
    return value ? (JSON.parse(value) as DeadLetterEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveDlq(dlq: DeadLetterEntry[]): Promise<void> {
  try {
    await Preferences.set({ key: DLQ_KEY, value: JSON.stringify(dlq) });
  } catch {
    try { localStorage.setItem(DLQ_KEY, JSON.stringify(dlq)); } catch { /* drop silently */ }
  }
}

async function addToDeadLetterQueue(entry: QueueEntry, err: unknown, permanent: boolean): Promise<void> {
  try {
    const dlq = await loadDlq();
    const classified = classifyError(err);
    dlq.push({
      id: entry.id,
      action: entry.action,
      queued_at: entry.queued_at,
      failed_at: Date.now(),
      attempts: entry.attempts,
      error: {
        message: classified.message,
        code: classified.code,
        details: classified.details,
        permanent,
      },
    });
    // Retain maximum 100 dead-letter items to cap storage
    const trimmed = dlq.slice(-100);
    await saveDlq(trimmed);
  } catch {
    // Non-fatal logging
    console.error('[SyncQueue] Failed to record dead-letter entry:', entry.id);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Wipe the queue and DLQ on sign-out so it doesn't persist across users. */
export async function clearUserQueue(_userId?: string): Promise<void> {
  try {
    await Preferences.remove({ key: QUEUE_KEY });
    await Preferences.remove({ key: DLQ_KEY });
  } catch {
    try {
      localStorage.removeItem(QUEUE_KEY);
      localStorage.removeItem(DLQ_KEY);
    } catch { /* ignore */ }
  }
}

export const SyncQueue = {
  /** Returns the queue entry id (callers that deliver immediately use it to remove the entry on success). */
  async enqueue(action: SyncAction): Promise<string> {
    const queue = await loadQueue();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    queue.push({
      id,
      action,
      queued_at: Date.now(),
      attempts:  0,
    });
    await saveQueue(queue);
    return id;
  },

  /** Remove one entry (e.g. after it was delivered immediately). Idempotent: unknown ids are ignored. */
  async remove(id: string): Promise<void> {
    const queue = await loadQueue();
    const next = queue.filter(e => e.id !== id);
    if (next.length !== queue.length) await saveQueue(next);
  },

  async size(): Promise<number> {
    const queue = await loadQueue();
    return queue.length;
  },

  /** Retrieve dead-letter items for inspection, auditing, or operational diagnostics */
  async getDeadLetterQueue(): Promise<DeadLetterEntry[]> {
    return loadDlq();
  },

  /** Clear dead-letter queue */
  async clearDeadLetterQueue(): Promise<void> {
    try {
      await Preferences.remove({ key: DLQ_KEY });
    } catch {
      try { localStorage.removeItem(DLQ_KEY); } catch { /* ignore */ }
    }
  },

  /**
   * Process all queued actions against Supabase.
   *
   * Durability & Safety:
   * 1. Inspects Supabase { error } responses on all actions.
   * 2. Classifies errors into permanent vs. retryable.
   * 3. Moves permanent errors directly to the Dead-Letter Queue (no wasted retries).
   * 4. For retryable errors, stops batch immediately on first failure to preserve retry budget while offline.
   * 5. Exceeded retries (>= MAX_QUEUE_RETRIES) move to DLQ instead of silent deletion.
   * 6. Transforms legacy quiz_session to complete_quiz_session and prunes paired legacy xp_grant/topic_perf.
   * 7. Persists state to storage after EVERY item transition.
   */
  async flush(): Promise<number> {
    const queue = await loadQueue();
    if (queue.length === 0) return 0;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 0;

    let remaining = queue.slice();
    let flushed = 0;

    for (const entry of queue) {
      if (!remaining.some(e => e.id === entry.id)) {
        // Entry was already processed or pruned (e.g. redundant paired legacy xp_grant/topic_perf)
        continue;
      }

      try {
        await processAction(entry.action, session.access_token, session.user.id);
        flushed++;

        // If action was legacy quiz_session, also prune any paired legacy xp_grant and topic_perf
        // to prevent double-awarding XP or topic stats when transforming to complete_quiz_session.
        if (entry.action.type === 'quiz_session') {
          const p = entry.action.payload;
          remaining = remaining.filter(e => {
            if (e.id === entry.id) return false;
            if (
              e.action.type === 'xp_grant' &&
              e.action.payload.user_id === p.user_id &&
              (e.action.payload.reason === `quiz:${p.topic}` || e.action.payload.reason.startsWith('quiz:'))
            ) {
              return false;
            }
            if (
              e.action.type === 'topic_perf' &&
              e.action.payload.user_id === p.user_id &&
              e.action.payload.topic === p.topic
            ) {
              return false;
            }
            return true;
          });
        } else {
          remaining = remaining.filter(e => e.id !== entry.id);
        }

        await saveQueue(remaining);
      } catch (err: unknown) {
        const classified = classifyError(err);
        entry.attempts++;
        entry.last_error = classified.message;

        if (classified.permanent || entry.attempts >= MAX_QUEUE_RETRIES) {
          // Move to dead-letter queue (no silent deletion)
          await addToDeadLetterQueue(entry, err, classified.permanent);
          remaining = remaining.filter(e => e.id !== entry.id);
          await saveQueue(remaining);
        } else {
          // Retryable error: update attempt count and pause batch to preserve retries
          await saveQueue(remaining);
          break;
        }
      }
    }

    return flushed;
  },
};

// ── Action processors ─────────────────────────────────────────────────────────

async function processAction(action: SyncAction, accessToken: string, sessionUserId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  switch (action.type) {
    case 'xp_grant': {
      const { user_id, amount, reason } = action.payload;

      // Cap per-action XP to prevent offline queue manipulation
      const MAX_XP_PER_ACTION = 500;
      const safeAmount = Math.min(Math.max(0, Math.floor(amount)), MAX_XP_PER_ACTION);
      if (safeAmount === 0) break;

      // user_id must match the authenticated session — prevents cross-user XP injection
      if (user_id !== sessionUserId) {
        throw new Error('xp_grant user_id does not match authenticated session — discarding');
      }

      await withRetry(async () => {
        const res = await supabase.rpc('increment_xp', { user_id, amount: safeAmount });
        return checkSupabaseResult(res as any);
      });

      await withRetry(async () => {
        const res = await supabase.from('xp_history').insert({ user_id, amount: safeAmount, reason });
        return checkSupabaseResult(res);
      });
      break;
    }

    case 'quiz_answer': {
      const { user_id, session_id, question_id, correct, topic, subject } = action.payload;
      if (user_id !== sessionUserId) {
        throw new Error('quiz_answer user_id mismatch — discarding');
      }
      await withRetry(async () => {
        const res = await supabase.from('quiz_user_answers').insert({
          user_id, session_id, question_id, correct, topic, subject,
          answered_at: new Date().toISOString(),
        });
        return checkSupabaseResult(res);
      });
      break;
    }

    case 'streak_tick': {
      const { user_id, date } = action.payload;
      if (user_id !== sessionUserId) {
        throw new Error('streak_tick user_id mismatch — discarding');
      }
      await withRetry(async () => {
        const res = await supabase.from('study_streaks').upsert(
          { user_id, date, synced_offline: true },
          { onConflict: 'user_id,date' }
        );
        return checkSupabaseResult(res);
      });
      break;
    }

    case 'topic_perf': {
      const { user_id, subject, topic, correct, total } = action.payload;
      if (user_id !== sessionUserId) {
        throw new Error('topic_perf user_id mismatch — discarding');
      }
      await withRetry(async () => {
        const res = await supabase.rpc('upsert_topic_performance', {
          p_user_id: user_id,
          p_subject:  subject,
          p_topic:    topic,
          p_correct:  correct,
          p_total:    total,
        });
        return checkSupabaseResult(res as any);
      });
      break;
    }

    case 'quiz_complete': {
      if (action.payload.user_id !== sessionUserId) {
        throw new Error('quiz_complete user_id mismatch — discarding');
      }
      await submitQuizComplete(action.payload);
      break;
    }

    case 'quiz_session': {
      // ── Day 4 SyncQueue V2 Migration: Legacy quiz_session transformation ──
      // Migrates legacy queued quiz sessions directly to the canonical idempotent
      // complete_quiz_session RPC.
      // - Eliminates direct inserts into public.quiz_sessions with nonexistent score_pct.
      // - Prevents double XP awarding by pruning paired legacy xp_grant and topic_perf entries upon success.
      // - Guarantees idempotency via deterministic session ID generation.
      const { user_id, subject, topic, questions, user_answers, score, completed_at } = action.payload;
      if (user_id !== sessionUserId) {
        throw new Error('quiz_session user_id mismatch — discarding');
      }

      const qArray = Array.isArray(questions) ? questions : [];
      const aArray = Array.isArray(user_answers) ? user_answers : [];
      const questionsCount = qArray.length > 0 ? qArray.length : (aArray.length > 0 ? aArray.length : 1);
      const safeScore = Math.min(Math.max(0, Math.floor(Number(score) || 0)), questionsCount);
      const cleanCompletedAt = completed_at || new Date().toISOString();

      const sessionId = (action.payload as { session_id?: string }).session_id ||
        deterministicUuid(`${user_id}:${cleanCompletedAt}:${topic || 'general'}`);

      await submitQuizComplete({
        user_id,
        session_id:      sessionId,
        subject:         subject || topic || 'General',
        topic:           topic || 'General',
        questions:       qArray,
        user_answers:    aArray,
        score:           safeScore,
        questions_count: questionsCount,
        completed_at:    cleanCompletedAt,
      });
      break;
    }

    case 'lesson_complete': {
      const { user_id, lesson_id, xp_earned, completed_at } = action.payload;
      if (user_id !== sessionUserId) {
        throw new Error('lesson_complete user_id mismatch — discarding');
      }
      await withRetry(async () => {
        const res = await supabase.from('lesson_progress').upsert(
          { user_id, lesson_id, completed: true, xp_earned, completed_at },
          { onConflict: 'user_id,lesson_id' }
        );
        return checkSupabaseResult(res);
      });
      break;
    }

    case 'flashcard_review': {
      const { user_id, card_id, quality } = action.payload;
      if (user_id && user_id !== sessionUserId) {
        throw new Error('flashcard_review user_id mismatch — discarding');
      }
      await withRetry(async () => {
        const res = await supabase.functions.invoke('novo-insights', {
          body: { action: 'update_sr', user_id: sessionUserId, card_id, quality },
          headers,
        });
        return checkSupabaseResult(res as any);
      });
      break;
    }
  }
}
