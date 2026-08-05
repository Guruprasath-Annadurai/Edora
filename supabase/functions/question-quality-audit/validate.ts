// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export interface VerifyResult {
  verdict: 'confirmed_bad' | 'genuinely_hard' | 'inconclusive';
  reasoning: string;
  corrected_question: { question_text: string; options: string[]; correct_index: number; explanation: string } | null;
}

export const VALID_VERDICTS = new Set(['confirmed_bad', 'genuinely_hard', 'inconclusive']);

export function validateCorrectedQuestion(cq: unknown): string | null {
  if (cq === null || cq === undefined) return null; // absent is valid
  const c = cq as Partial<NonNullable<VerifyResult['corrected_question']>>;
  if (typeof c.question_text !== 'string' || c.question_text.trim().length < 5) {
    return 'corrected_question.question_text missing or too short';
  }
  if (!Array.isArray(c.options) || c.options.length !== 4 || c.options.some(o => typeof o !== 'string' || o.trim().length === 0)) {
    return 'corrected_question.options must be exactly 4 non-empty strings';
  }
  if (typeof c.correct_index !== 'number' || !Number.isInteger(c.correct_index) || c.correct_index < 0 || c.correct_index > 3) {
    return 'corrected_question.correct_index must be an integer 0-3';
  }
  if (typeof c.explanation !== 'string' || c.explanation.trim().length === 0) {
    return 'corrected_question.explanation missing or empty';
  }
  return null;
}
