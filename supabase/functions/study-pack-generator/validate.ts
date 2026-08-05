// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

// Exact counts mandated by buildPrompt() in index.ts — kept as named constants
// so the prompt and the validator can't silently drift apart.
export const FLASHCARD_COUNT = 10;
export const QUIZ_COUNT      = 5;
export const KEY_TERM_COUNT  = 10;

export type StudyPack = {
  summary: string;
  flashcards: Array<{ front: string; back: string }>;
  quiz: Array<{ question: string; options: string[]; correct_answer: number; explanation: string }>;
  key_terms: Array<{ term: string; definition: string }>;
};

// ── Structural validator ──────────────────────────────────────────────────
// Checks exact per-section counts (as mandated by buildPrompt) and required
// per-item fields, not just top-level array presence. Returns null if valid,
// else a description of what's wrong (used for the retry's lastErr).
export function validateStudyPack(v: Partial<StudyPack> | null | undefined): string | null {
  if (!v?.summary || typeof v.summary !== 'string') {
    return 'Missing or invalid "summary"';
  }
  if (!Array.isArray(v.flashcards) || v.flashcards.length !== FLASHCARD_COUNT) {
    return `Expected ${FLASHCARD_COUNT} flashcards, got ${Array.isArray(v.flashcards) ? v.flashcards.length : 'non-array'}`;
  }
  if (v.flashcards.some(f => !f?.front || !f?.back)) {
    return 'Every flashcard must have non-empty "front" and "back"';
  }
  if (!Array.isArray(v.quiz) || v.quiz.length !== QUIZ_COUNT) {
    return `Expected ${QUIZ_COUNT} quiz questions, got ${Array.isArray(v.quiz) ? v.quiz.length : 'non-array'}`;
  }
  for (const q of v.quiz) {
    if (!q?.question || typeof q.question !== 'string') return 'Quiz question missing "question" text';
    if (!Array.isArray(q.options) || q.options.length !== 4) return 'Quiz question must have exactly 4 "options"';
    if (q.options.some(o => typeof o !== 'string' || !o.trim())) return 'Quiz options must be non-empty strings';
    if (typeof q.correct_answer !== 'number' || q.correct_answer < 0 || q.correct_answer > 3) {
      return 'Quiz "correct_answer" must be 0-3';
    }
    if (!q.explanation || typeof q.explanation !== 'string') return 'Quiz question missing "explanation"';
  }
  if (!Array.isArray(v.key_terms) || v.key_terms.length !== KEY_TERM_COUNT) {
    return `Expected ${KEY_TERM_COUNT} key terms, got ${Array.isArray(v.key_terms) ? v.key_terms.length : 'non-array'}`;
  }
  if (v.key_terms.some(t => !t?.term || !t?.definition)) {
    return 'Every key term must have non-empty "term" and "definition"';
  }
  return null;
}
