// ─────────────────────────────────────────────────────────────────────────────
// Offline Cache — IndexedDB-backed structured storage for offline-first UX
//
// Stores: quiz questions, flashcard decks, study plan, sprint tasks
// Falls back gracefully when IDB unavailable (old WebViews)
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME    = 'edora_offline';
const DB_VERSION = 3;  // bumped: added notes_cache store

type StoreName = 'quiz_cache' | 'flashcard_cache' | 'study_plan_cache' | 'sprint_cache' | 'pending_reviews' | 'notes_cache';

interface CachedQuizQuestion {
  id: string;
  topic: string;
  subject: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: number;
  cached_at: number;
}

interface CachedFlashcardDeck {
  id: string;
  subject: string;
  topic: string;
  cards: Array<{ front: string; back: string; due_at: string }>;
  cached_at: number;
}

interface CachedNote {
  id: string;          // userId (one entry per user)
  user_id: string;
  notes: Array<{ id: string; subject: string; topic: string; content: string; created_at: string }>;
  cached_at: number;
}

interface CachedStudyPlan {
  user_id: string;
  plan: unknown;
  cached_at: number;
}

interface CachedSprint {
  session_id: string;
  tasks: unknown[];
  cached_at: number;
}

// ── IDB helper ────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const stores: StoreName[] = ['quiz_cache', 'flashcard_cache', 'study_plan_cache', 'sprint_cache', 'pending_reviews', 'notes_cache'];
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess  = () => { _db = req.result; resolve(req.result); };
    req.onerror    = () => reject(req.error);
  });
}

async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db  = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(value);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // silently fail — offline cache is best-effort
  }
}

async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// ── TTL: 24h for questions, 7d for decks/notes ───────────────────────────────
const TTL_QUIZ      = 24 * 60 * 60 * 1000;
const TTL_FLASHCARD = 7 * 24 * 60 * 60 * 1000;
const TTL_NOTES     = 7 * 24 * 60 * 60 * 1000;

// ── Public API ────────────────────────────────────────────────────────────────

export const OfflineCache = {
  // Quiz questions ─────────────────────────────────────────────────────────────
  async cacheQuizQuestions(topic: string, questions: Omit<CachedQuizQuestion, 'cached_at'>[]): Promise<void> {
    for (const q of questions) {
      await idbPut('quiz_cache', { ...q, cached_at: Date.now() });
    }
  },

  async getQuizQuestions(topic: string, limit = 10): Promise<CachedQuizQuestion[]> {
    const all = await idbGetAll<CachedQuizQuestion>('quiz_cache');
    const fresh = all.filter(q =>
      q.topic === topic && Date.now() - q.cached_at < TTL_QUIZ
    );
    // Shuffle and return up to limit
    return fresh.sort(() => Math.random() - 0.5).slice(0, limit);
  },

  // Flashcard decks ─────────────────────────────────────────────────────────────
  async cacheFlashcardDeck(deck: Omit<CachedFlashcardDeck, 'cached_at'>): Promise<void> {
    await idbPut('flashcard_cache', { ...deck, cached_at: Date.now() });
  },

  async getFlashcardDeck(subject: string): Promise<CachedFlashcardDeck | null> {
    const all = await idbGetAll<CachedFlashcardDeck>('flashcard_cache');
    const match = all.find(d => d.subject === subject && Date.now() - d.cached_at < TTL_FLASHCARD);
    return match ?? null;
  },

  async getAllFlashcardDecks(): Promise<CachedFlashcardDeck[]> {
    const all = await idbGetAll<CachedFlashcardDeck>('flashcard_cache');
    return all.filter(d => Date.now() - d.cached_at < TTL_FLASHCARD);
  },

  // Study plan ─────────────────────────────────────────────────────────────────
  async cacheStudyPlan(userId: string, plan: unknown): Promise<void> {
    await idbPut('study_plan_cache', { id: userId, user_id: userId, plan, cached_at: Date.now() });
  },

  async getStudyPlan(userId: string): Promise<CachedStudyPlan | null> {
    return idbGet<CachedStudyPlan>('study_plan_cache', userId);
  },

  // Sprint tasks ────────────────────────────────────────────────────────────────
  async cacheSprintTasks(sessionId: string, tasks: unknown[]): Promise<void> {
    await idbPut('sprint_cache', { id: sessionId, session_id: sessionId, tasks, cached_at: Date.now() });
  },

  async getSprintTasks(sessionId: string): Promise<CachedSprint | null> {
    return idbGet<CachedSprint>('sprint_cache', sessionId);
  },

  // Pending flashcard reviews (offline → sync on reconnect) ────────────────────
  async enqueuePendingReview(cardId: string, quality: number): Promise<void> {
    await idbPut('pending_reviews', {
      id: `${cardId}_${Date.now()}`, cardId, quality, queued_at: Date.now(),
    });
  },

  async getPendingReviews(): Promise<{ id: string; cardId: string; quality: number; queued_at: number }[]> {
    return idbGetAll('pending_reviews');
  },

  async deletePendingReview(id: string): Promise<void> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction('pending_reviews', 'readwrite');
        const req = tx.objectStore('pending_reviews').delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch { /* silently fail */ }
  },

  // Study notes ─────────────────────────────────────────────────────────────────
  async cacheNotes(userId: string, notes: CachedNote['notes']): Promise<void> {
    await idbPut('notes_cache', { id: userId, user_id: userId, notes, cached_at: Date.now() });
  },

  async getCachedNotes(userId: string): Promise<CachedNote | null> {
    const entry = await idbGet<CachedNote>('notes_cache', userId);
    if (!entry || Date.now() - entry.cached_at > TTL_NOTES) return null;
    return entry;
  },

  // Housekeeping ────────────────────────────────────────────────────────────────
  async clearExpired(): Promise<void> {
    const now = Date.now();
    const quizItems = await idbGetAll<CachedQuizQuestion>('quiz_cache');
    const db = await openDB();
    const tx = db.transaction(['quiz_cache', 'flashcard_cache'], 'readwrite');
    for (const q of quizItems) {
      if (now - q.cached_at > TTL_QUIZ) tx.objectStore('quiz_cache').delete(q.id);
    }
    const decks = await idbGetAll<CachedFlashcardDeck>('flashcard_cache');
    for (const d of decks) {
      if (now - d.cached_at > TTL_FLASHCARD) tx.objectStore('flashcard_cache').delete(d.id);
    }
  },
};
