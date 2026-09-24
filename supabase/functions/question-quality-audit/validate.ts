// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.
//
// Verdict values corrected 2026-08-25: this file previously used
// ('confirmed_bad','genuinely_hard','inconclusive'), which does not match
// the real, live production CHECK constraint on
// public.question_quality_flags.verdict -- ('genuinely_hard','miscalibrated',
// 'wrong_answer_key','ambiguous','needs_review'), from
// 20260704101715_ai_quality_and_anomaly_flags.sql. The mismatch meant every
// insert into the real table would have been rejected (had the code even
// been pointed at the real table, which it also wasn't -- see index.ts).
// Now matches the real constraint exactly, and is arguably a richer
// categorization than the 3-bucket scheme it replaces.

export interface VerifyResult {
  verdict: 'genuinely_hard' | 'miscalibrated' | 'wrong_answer_key' | 'ambiguous' | 'needs_review';
  reasoning: string;
  corrected_question: { question_text: string; options: string[]; correct_index: number; explanation: string } | null;
}

export const VALID_VERDICTS = new Set(['genuinely_hard', 'miscalibrated', 'wrong_answer_key', 'ambiguous', 'needs_review']);

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

/** SHA-256 hex digest of the question text -- question_quality_flags.question_hash is NOT NULL + UNIQUE in production, so every insert needs a stable, deterministic hash to dedupe against. */
export async function hashQuestionText(questionText: string): Promise<string> {
  const bytes = new TextEncoder().encode(questionText.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
