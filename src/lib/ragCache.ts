// ═══════════════════════════════════════════════════════════════════════════════
// ragCache — client-side offline RAG fallback
//
// Three-tier strategy when server is unreachable:
//   1. Supabase rag_query_cache (edge, 24 h TTL) — handled server-side
//   2. IndexedDB session cache  — exact-match on normalized query
//   3. Keyword fallback QA      — pre-seeded popular JEE/NEET answers
//
// Usage:
//   await seedRagCache()                       — call once on app boot
//   const hit = await getOfflineFallback(q)    — returns string | null
//   await writeSessionCache(q, answer)         — called after every LLM response
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME    = 'edora_rag';
const DB_VERSION = 1;
const STORE_SESSION = 'session_cache';   // per-session LRU cache of real answers
const STORE_SEED    = 'seed_qa';         // pre-seeded popular Q&A pairs

interface CacheEntry {
  key: string;
  query: string;
  answer: string;
  ts: number;
}

// ── IndexedDB open ────────────────────────────────────────────────────────────
let _db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSION))
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_SEED))
        db.createObjectStore(STORE_SEED, { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror   = () => reject(req.error);
  });
}

// FNV-1a 32-bit hash — matches server-side algorithm
function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + s.length.toString(16).padStart(8, '0');
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Session cache (real answers from this session + prior sessions) ───────────
export async function writeSessionCache(query: string, answer: string): Promise<void> {
  try {
    const db  = await openDB();
    const key = fnvHash(normalizeQuery(query));
    const tx  = db.transaction(STORE_SESSION, 'readwrite');
    tx.objectStore(STORE_SESSION).put({ key, query, answer, ts: Date.now() } satisfies CacheEntry);

    // Evict oldest entries when store exceeds 200 items (rough LRU)
    const countReq = tx.objectStore(STORE_SESSION).count();
    countReq.onsuccess = () => {
      if (countReq.result > 200) {
        const cursorReq = tx.objectStore(STORE_SESSION).openCursor();
        let deleted = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < 50) { cursor.delete(); deleted++; cursor.continue(); }
        };
      }
    };
  } catch { /* never throw — offline write is best-effort */ }
}

async function getFromStore(store: string, key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry) ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

// ── Offline fallback — exact then keyword match ───────────────────────────────
export async function getOfflineFallback(query: string): Promise<string | null> {
  const key = fnvHash(normalizeQuery(query));

  // 1. Exact match in session cache
  const session = await getFromStore(STORE_SESSION, key);
  if (session) return session.answer;

  // 2. Exact match in seed QA
  const seed = await getFromStore(STORE_SEED, key);
  if (seed) return seed.answer;

  // 3. Keyword scan of seed store (top-3 token overlap)
  try {
    const db    = await openDB();
    const words = new Set(normalizeQuery(query).split(' ').filter(w => w.length > 3));
    if (words.size === 0) return null;

    const candidates: Array<{ score: number; answer: string }> = [];
    await new Promise<void>(resolve => {
      const cur = db.transaction(STORE_SEED, 'readonly').objectStore(STORE_SEED).openCursor();
      cur.onsuccess = () => {
        const cursor = cur.result;
        if (!cursor) { resolve(); return; }
        const entry = cursor.value as CacheEntry;
        const qWords = normalizeQuery(entry.query).split(' ');
        const score  = qWords.filter(w => words.has(w)).length;
        if (score >= 2) candidates.push({ score, answer: entry.answer });
        cursor.continue();
      };
      cur.onerror = () => resolve();
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].answer + '\n\n_Note: This answer was served from offline cache. Reconnect for a fresh response._';
    }
  } catch { /* fall through */ }

  return null;
}

// ── Seed popular JEE/NEET QA pairs ────────────────────────────────────────────
// Runs once on app boot. Fetches top-cached entries from Supabase and stores
// them in IndexedDB for offline access.
const SEED_DONE_KEY = 'edora_rag_seed_v1';

export async function seedRagCache(
  fetchFn: () => Promise<Array<{ query_text: string; response_text: string }>>
): Promise<void> {
  if (localStorage.getItem(SEED_DONE_KEY)) return;
  try {
    const rows = await fetchFn();
    if (!rows.length) return;
    const db = await openDB();
    const tx = db.transaction(STORE_SEED, 'readwrite');
    for (const row of rows.slice(0, 300)) {
      const key = fnvHash(normalizeQuery(row.query_text));
      tx.objectStore(STORE_SEED).put({ key, query: row.query_text, answer: row.response_text, ts: Date.now() } satisfies CacheEntry);
    }
    localStorage.setItem(SEED_DONE_KEY, '1');
  } catch { /* best-effort — don't break app boot */ }
}

// Reset seed flag (call when user logs out or app updates)
export function resetRagCacheSeed(): void {
  localStorage.removeItem(SEED_DONE_KEY);
}
