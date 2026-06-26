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
  async flush(): Promise<number> {
    const queue = await loadQueue();
    if (queue.length === 0) return 0;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 0;

    const remaining: QueueEntry[] = [];
    let flushed = 0;

    for (const entry of queue) {
      try {
        await processAction(entry.action, session.access_token, session.user.id);
        flushed++;
      } catch {
        entry.attempts++;
        // Discard after 5 failed attempts (e.g. data is too old or invalid)
        if (entry.attempts < 5) remaining.push(entry);
      }
    }

    await saveQueue(remaining);
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

      // Read current XP then write incremented value (queue is sequential, no race)
      const { data: profile } = await withRetry(() =>
        supabase.from('profiles').select('xp').eq('id', user_id).single()
      );
      await withRetry(() =>
        supabase.from('profiles')
          .update({ xp: (profile?.xp ?? 0) + safeAmount })
          .eq('id', user_id)
      );
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
