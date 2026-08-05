// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call (which would start a
// real HTTP listener on import — the reason none of this repo's edge
// function tests import an index.ts directly, only _shared/*.ts modules).

export interface GeneratedQuestion {
  subject: string;
  chapter: string;
  concept: string;
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
  difficulty: string;
  confidence?: number;
  verify_in_textbook?: boolean;
  ncert_reference?: string;
  flags?: string[];
}

// Structural validation for a single generated question — checks every
// required field is present and well-formed, not just the couple of fields
// the previous inline filter happened to check.
export function isValidQuestion(q: Partial<GeneratedQuestion>): boolean {
  return (
    typeof q.subject === 'string' && q.subject.trim().length > 0 &&
    typeof q.chapter === 'string' && q.chapter.trim().length > 0 &&
    typeof q.concept === 'string' && q.concept.trim().length > 0 &&
    typeof q.question === 'string' && q.question.trim().length > 0 &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every(o => typeof o === 'string' && o.trim().length > 0) &&
    typeof q.correct_idx === 'number' && Number.isInteger(q.correct_idx) &&
    q.correct_idx >= 0 && q.correct_idx <= 3 &&
    typeof q.explanation === 'string' && q.explanation.trim().length > 0 &&
    typeof q.difficulty === 'string' && q.difficulty.trim().length > 0
  );
}
