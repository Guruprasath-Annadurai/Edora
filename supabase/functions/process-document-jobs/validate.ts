// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export type StudyPack = {
  summary: string;
  flashcards: Array<{ front: string; back: string }>;
  quiz: Array<{ question: string; options: string[]; correct_answer: number; explanation: string }>;
  key_terms: Array<{ term: string; definition: string }>;
};

// Validates the exact counts and per-item required fields the prompt
// mandates (10 flashcards / 5 quiz questions / 10 key terms) — previously
// only Array.isArray() was checked, so a truncated or short-changed
// response (e.g. 6 flashcards, or a flashcard with an empty "back") passed
// straight through to study_packs.
export function isValidStudyPack(v: Partial<StudyPack> | null | undefined): v is StudyPack {
  if (!v) return false;
  if (typeof v.summary !== 'string' || v.summary.trim().length === 0) return false;

  if (!Array.isArray(v.flashcards) || v.flashcards.length !== 10) return false;
  if (!v.flashcards.every(f =>
    typeof f?.front === 'string' && f.front.trim().length > 0 &&
    typeof f?.back === 'string' && f.back.trim().length > 0
  )) return false;

  if (!Array.isArray(v.quiz) || v.quiz.length !== 5) return false;
  if (!v.quiz.every(q =>
    typeof q?.question === 'string' && q.question.trim().length > 0 &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every(o => typeof o === 'string' && o.trim().length > 0) &&
    typeof q.correct_answer === 'number' && Number.isInteger(q.correct_answer) &&
    q.correct_answer >= 0 && q.correct_answer <= 3 &&
    typeof q.explanation === 'string' && q.explanation.trim().length > 0
  )) return false;

  if (!Array.isArray(v.key_terms) || v.key_terms.length !== 10) return false;
  if (!v.key_terms.every(t =>
    typeof t?.term === 'string' && t.term.trim().length > 0 &&
    typeof t?.definition === 'string' && t.definition.trim().length > 0
  )) return false;

  return true;
}
