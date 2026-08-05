// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export interface TournamentQuestionGen {
  question:    string;
  options:     string[];
  correct_idx: number;
  explanation: string;
  points:      number;
}

export interface TournamentGenShape {
  name:      string;
  questions: TournamentQuestionGen[];
}

export function validateTournamentGen(v: Partial<TournamentGenShape> | null | undefined): boolean {
  if (!v?.name || typeof v.name !== 'string') return false;
  if (!Array.isArray(v.questions) || v.questions.length === 0) return false;
  for (const q of v.questions as Partial<TournamentQuestionGen>[]) {
    if (!q.question || typeof q.question !== 'string') return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (q.options.some(o => typeof o !== 'string' || o.trim().length === 0)) return false;
    if (typeof q.correct_idx !== 'number' || q.correct_idx < 0 || q.correct_idx > 3) return false;
    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length === 0) return false;
  }
  return true;
}
