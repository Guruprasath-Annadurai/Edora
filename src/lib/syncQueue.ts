// ─────────────────────────────────────────────────────────────────────────────
// Sync Queue — persists XP gains, quiz answers, streak updates while offline.
// Processes the queue automatically when the device comes back online.
//
// Storage: @capacitor/preferences (survives app restarts, works on native)
// ─────────────────────────────────────────────────────────────────────────────

import { Preferences } from '@capacitor/preferences';
import { supabase }    from '@/lib/supabase';
import { withRetry }   from '@/lib/withRetry';

const QUEUE_KEY = 'edora_sync_queue';

export type SyncAction =
  | { type: 'xp_grant';    payload: { user_id: string; amount: number; reason: string } }
  | { type: 'quiz_answer'; payload: { user_id: string; session_id: string; question_id: string; correct: boolean; topic: string; subject: string } }
  | { type: 'quiz_session'; payload: {
      user_id: string; subject: string; topic: string;
      questions: unknown[]; user_answers: number[];
      score: number; score_pct: number; completed_at: string;
    }
  }
  | { type: 'streak_tick'; payload: { user_id: string; date: string } }
  | { type: 'topic_perf';  payload: { user_id: string; subject: string; topic: string; correct: number; total: number } }
  | { type: 'lesson_complete'; payload: { user_id: string; lesson_id: string; xp_earned: number; completed_at: string } }
  | { type: 'flashcard_review'; payload: { user_id: string; card_id: string; quality: number } };

interface QueueEntry {
  id:         string;
  action:     SyncAction;
  queued_at:  number;
  attempts:   number;
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
    // Preferences unavailable (web without Capacitor) — use localStorage fallback
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* both storages unavailable — drop silently */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Wipe the queue for a specific user on sign-out so it doesn't persist to the next session. */
export async function clearUserQueue(_userId?: string): Promise<void> {
  try {
    await Preferences.remove({ key: QUEUE_KEY });
  } catch {
    try { localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
  }
}

export const SyncQueue = {
  async enqueue(action: SyncAction): Promise<void> {
    const queue = await loadQueue();
    queue.push({
      id:        `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      queued_at: Date.now(),
      attempts:  0,
    });
    await saveQueue(queue);
  },

  async size(): Promise<number> {
    const queue = await loadQueue();
    return queue.length;
  },

  // Process all queued actions against Supabase. Returns number flushed.
  //
  // Persists the queue after EVERY entry, not once at the end. This runs
  // right after reconnecting — exactly when the network is most likely to
  // drop again mid-flush (one bar of signal on a train), and it's just as
  // exposed to the app being backgrounded and reclaimed by the OS partway
  // through (routine on mid-range Android). With a single end-of-loop save,
  // either of those interrupting flush() after entry 3 of 5 had already
  // succeeded meant the WHOLE original 5-entry queue — including the 3
  // already-written entries — was still sitting on disk and got replayed
  // in full on the next flush. Several actions aren't idempotent against
  // that replay (xp_grant was a non-atomic read-then-write increment;
  // quiz_answer/quiz_session/topic_perf have no dedup key), so this
  // silently duplicated XP and quiz history rather than losing it — the
  // inverse but equally real version of RISK-009's "progress lost on flaky
  // networks." Saving after each entry makes the on-disk queue always
  // reflect exactly what's actually left to do, so an interruption at any
  // point can only ever re-attempt work that genuinely never completed.
  async flush(): Promise<number> {
    const queue = await loadQueue();
    if (queue.length === 0) return 0;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 0;

    let remaining = queue.slice();
    let flushed = 0;

    for (const entry of queue) {
      try {
        await processAction(entry.action, session.access_token, session.user.id);
        flushed++;
        remaining = remaining.filter(e => e.id !== entry.id);
      } catch {
        entry.attempts++;
        // Discard after 5 failed attempts (e.g. data is too old or invalid)
        if (entry.attempts >= 5) remaining = remaining.filter(e => e.id !== entry.id);
      }
      await saveQueue(remaining);
    }

    return flushed;
  },
};

// ── Action processors ─────────────────────────────────────────────────────────

async function processAction(action: SyncAction, accessToken: string, sessionUserId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Wrapped in withRetry: this runs right after reconnecting from offline,
  // exactly when the network is most likely to still be flaky (one bar of
  // signal on a train). A single dropped request here means losing XP,
  // quiz answers, or streak ticks the student already earned offline.
  switch (action.type) {
    case 'xp_grant': {
      const { user_id, amount, reason } = action.payload;

      // Cap per-action XP to prevent offline queue manipulation
      const MAX_XP_PER_ACTION = 500;
      const safeAmount = Math.min(Math.max(0, Math.floor(amount)), MAX_XP_PER_ACTION);
      if (safeAmount === 0) break;

      // user_id must match the authenticated session — prevents cross-user XP injection
      // from a manipulated offline queue in localStorage
      if (user_id !== sessionUserId) {
        throw new Error('xp_grant user_id does not match authenticated session — discarding');
      }

      // Atomic server-side increment (public.increment_xp — same RPC every
      // other XP-granting path in the app already uses, see
      // 20260804193659_fix_increment_xp_missing_auth_check.sql) instead of
      // this queue's old read-then-write: reading xp then writing xp+amount
      // as two separate round trips raced any concurrent XP write to the
      // same row (a second device's queue flushing at the same moment, or
      // any other path awarding XP mid-flush) — a classic lost-update, and
      // the read-then-write version also never recalculated `level`, so a
      // user's level silently drifted out of sync with their xp whenever
      // XP arrived through this offline path specifically. increment_xp
      // does both in one statement.
      await withRetry(() => supabase.rpc('increment_xp', { user_id, amount: safeAmount }));
      await withRetry(() => supabase.from('xp_history').insert({ user_id, amount: safeAmount, reason }));
      break;
    }

    case 'quiz_answer': {
      const { user_id, session_id, question_id, correct, topic, subject } = action.payload;
      await withRetry(() => supabase.from('quiz_user_answers').insert({
        user_id, session_id, question_id, correct, topic, subject,
        answered_at: new Date().toISOString(),
      }));
      break;
    }

    case 'streak_tick': {
      const { user_id, date } = action.payload;
      await withRetry(() => supabase.from('study_streaks').upsert(
        { user_id, date, synced_offline: true },
        { onConflict: 'user_id,date' }
      ));
      break;
    }

    case 'topic_perf': {
      const { user_id, subject, topic, correct, total } = action.payload;
      await withRetry(() => supabase.rpc('upsert_topic_performance', {
        p_user_id: user_id,
        p_subject:  subject,
        p_topic:    topic,
        p_correct:  correct,
        p_total:    total,
      }));
      break;
    }

    case 'quiz_session': {
      const { user_id, subject, topic, questions, user_answers, score, score_pct, completed_at } = action.payload;
      // Guard: user_id must match authenticated session
      if (user_id !== sessionUserId) throw new Error('quiz_session user_id mismatch — discarding');
      await withRetry(() =>
        supabase.from('quiz_sessions').insert({
          user_id, subject, topic, questions, user_answers, score, score_pct, completed_at,
        })
      );
      break;
    }

    case 'lesson_complete': {
      const { user_id, lesson_id, xp_earned, completed_at } = action.payload;
      if (user_id !== sessionUserId) throw new Error('lesson_complete user_id mismatch — discarding');
      await withRetry(() =>
        supabase.from('lesson_progress').upsert(
          { user_id, lesson_id, completed: true, xp_earned, completed_at },
          { onConflict: 'user_id,lesson_id' }
        )
      );
      break;
    }

    case 'flashcard_review': {
      const { user_id, card_id, quality } = action.payload;
      // Update spaced repetition schedule
      await withRetry(() => supabase.functions.invoke('novo-insights', {
        body: { action: 'update_sr', user_id, card_id, quality },
        headers,
      }));
      break;
    }
  }
}
