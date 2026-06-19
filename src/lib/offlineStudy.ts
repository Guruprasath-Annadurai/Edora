// ─────────────────────────────────────────────────────────────────────────────
// offlineStudy — WiFi-triggered background content pre-download
//
// Runs on app foreground when:
//   - Device is on WiFi (or fast connection)
//   - User is authenticated
//   - Last pre-download was >6h ago
//
// Downloads:
//   - User's due flashcard decks (all subjects)
//   - 50 PYQs across user's subjects
//   - Tomorrow's lesson plan
//   - Queued offline review sessions
// ─────────────────────────────────────────────────────────────────────────────

import { Network }      from '@capacitor/network';
import { Preferences }  from '@capacitor/preferences';
import { supabase }     from '@/lib/supabase';
import { OfflineCache } from '@/lib/offlineCache';
import { SyncQueue }    from '@/lib/syncQueue';
import { withRetry }    from '@/lib/withRetry';

const LAST_PREFETCH_KEY     = 'edora_last_prefetch';
const PREFETCH_INTERVAL_MS  = 6 * 60 * 60 * 1000; // 6h
const OFFLINE_SESSION_KEY   = 'edora_offline_quiz_session';
const PENDING_REVIEWS_KEY   = 'edora_pending_fc_reviews';

// ── Network quality check ─────────────────────────────────────────────────────

async function isOnWifi(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    return status.connected && status.connectionType === 'wifi';
  } catch {
    // @capacitor/network not available on web — assume connected
    return navigator.onLine;
  }
}

async function shouldPrefetch(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: LAST_PREFETCH_KEY });
    if (!value) return true;
    return Date.now() - parseInt(value, 10) > PREFETCH_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function markPrefetchDone(): Promise<void> {
  await Preferences.set({ key: LAST_PREFETCH_KEY, value: String(Date.now()) })
    .catch(() => { localStorage.setItem(LAST_PREFETCH_KEY, String(Date.now())); });
}

// ── Download flashcard decks ──────────────────────────────────────────────────

async function prefetchFlashcards(userId: string): Promise<void> {
  // Runs on WiFi but the connection check can race with the actual download
  // (toggling networks, weak hotel/campus wifi) — retry rather than skip silently.
  const { data: cards } = await withRetry(() => supabase
    .from('flashcards')
    .select('id, subject, topic, front, back, due_at')
    .eq('user_id', userId)
    .lte('due_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    .limit(200)
    .order('due_at'));

  if (!cards?.length) return;

  // Group by subject
  const bySubject = cards.reduce<Record<string, typeof cards>>((acc, c) => {
    (acc[c.subject] = acc[c.subject] ?? []).push(c);
    return acc;
  }, {});

  for (const [subject, deckCards] of Object.entries(bySubject)) {
    await OfflineCache.cacheFlashcardDeck({
      id: `deck_${subject}_${userId}`,
      subject,
      topic: subject,
      cards: deckCards.map(c => ({ front: c.front, back: c.back, due_at: c.due_at })),
    });
  }
}

// ── Download PYQs ─────────────────────────────────────────────────────────────

async function prefetchPYQs(subjects: string[]): Promise<void> {
  const { data: questions } = await withRetry(() => supabase
    .from('pyq_questions')
    .select('id, subject, topic, question, options, correct_idx, explanation, difficulty')
    .in('subject', subjects.length ? subjects : ['Physics', 'Chemistry', 'Mathematics', 'Biology'])
    .limit(50)
    .order('created_at', { ascending: false }));

  if (!questions?.length) return;

  await OfflineCache.cacheQuizQuestions(
    'prefetch',
    questions.map(q => ({
      id:          q.id,
      topic:       q.topic,
      subject:     q.subject,
      question:    q.question,
      options:     q.options ?? [],
      correct_idx: q.correct_idx ?? 0,
      explanation: q.explanation ?? '',
      difficulty:  q.difficulty ?? 1,
    })),
  );
}

// ── Offline quiz session persistence ────────────────────────────────────────

export interface OfflineQuizAnswer {
  questionId: string;
  selected:   number;
  correct:    boolean;
  topic:      string;
  subject:    string;
  ts:         number;
}

export const OfflineQuiz = {
  async startSession(sessionId: string, questions: unknown[]): Promise<void> {
    const session = { sessionId, questions, answers: [] as OfflineQuizAnswer[], startedAt: Date.now() };
    const key = `${OFFLINE_SESSION_KEY}_${sessionId}`;
    try {
      await Preferences.set({ key, value: JSON.stringify(session) });
    } catch {
      localStorage.setItem(key, JSON.stringify(session));
    }
  },

  async recordAnswer(sessionId: string, answer: OfflineQuizAnswer): Promise<void> {
    const key = `${OFFLINE_SESSION_KEY}_${sessionId}`;
    try {
      const { value } = await Preferences.get({ key });
      const session = value ? JSON.parse(value) : { answers: [] };
      session.answers.push(answer);
      await Preferences.set({ key, value: JSON.stringify(session) });
    } catch {
      const raw = localStorage.getItem(key);
      const session = raw ? JSON.parse(raw) : { answers: [] };
      session.answers.push(answer);
      localStorage.setItem(key, JSON.stringify(session));
    }
    // Also queue for sync
    await SyncQueue.enqueue({
      type: 'quiz_answer',
      payload: {
        user_id:     '',  // filled in during flush
        session_id:  sessionId,
        question_id: answer.questionId,
        correct:     answer.correct,
        topic:       answer.topic,
        subject:     answer.subject,
      },
    });
  },
};

// ── Offline flashcard review persistence ────────────────────────────────────

export interface PendingFlashcardReview {
  cardId:   string;
  quality:  number; // SM-2: 0-5
  ts:       number;
}

export const OfflineFlashcards = {
  async queueReview(cardId: string, quality: number): Promise<void> {
    const review: PendingFlashcardReview = { cardId, quality, ts: Date.now() };
    try {
      const { value } = await Preferences.get({ key: PENDING_REVIEWS_KEY });
      const pending: PendingFlashcardReview[] = value ? JSON.parse(value) : [];
      pending.push(review);
      await Preferences.set({ key: PENDING_REVIEWS_KEY, value: JSON.stringify(pending) });
    } catch {
      const raw = localStorage.getItem(PENDING_REVIEWS_KEY);
      const pending: PendingFlashcardReview[] = raw ? JSON.parse(raw) : [];
      pending.push(review);
      localStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify(pending));
    }
    await SyncQueue.enqueue({ type: 'flashcard_review', payload: { user_id: '', card_id: cardId, quality } });
  },

  async getPendingCount(): Promise<number> {
    try {
      const { value } = await Preferences.get({ key: PENDING_REVIEWS_KEY });
      return value ? (JSON.parse(value) as PendingFlashcardReview[]).length : 0;
    } catch {
      const raw = localStorage.getItem(PENDING_REVIEWS_KEY);
      return raw ? (JSON.parse(raw) as PendingFlashcardReview[]).length : 0;
    }
  },

  async clearPending(): Promise<void> {
    await Preferences.remove({ key: PENDING_REVIEWS_KEY }).catch(() => {});
    localStorage.removeItem(PENDING_REVIEWS_KEY);
  },
};

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runOfflinePrefetch(): Promise<void> {
  try {
    const online = await isOnWifi();
    if (!online) return;

    const due = await shouldPrefetch();
    if (!due) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const userId = session.user.id;

    // Get user's subjects from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('subjects')
      .eq('id', userId)
      .single();

    const subjects: string[] = (profile as { subjects?: string[] } | null)?.subjects ?? [];

    await Promise.allSettled([
      prefetchFlashcards(userId),
      prefetchPYQs(subjects),
    ]);

    // Flush any queued offline actions now that we're online
    await SyncQueue.flush();

    await markPrefetchDone();
  } catch {
    // Prefetch is best-effort — never crash the app
  }
}

// ── Connectivity listener — auto-flush queue when back online ─────────────────

export function startConnectivityListener(): () => void {
  let removeListener: (() => void) | null = null;

  Network.addListener('networkStatusChange', async (status) => {
    if (status.connected) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await SyncQueue.flush().catch(() => {});
    }
  }).then(handle => {
    removeListener = () => handle.remove();
  }).catch(() => {
    // Capacitor not available — use browser online event
    const handler = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await SyncQueue.flush().catch(() => {});
    };
    window.addEventListener('online', handler);
    removeListener = () => window.removeEventListener('online', handler);
  });

  return () => removeListener?.();
}
