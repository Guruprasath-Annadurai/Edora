// Pure validation logic extracted out of index.ts so it can be unit tested
// without triggering index.ts's top-level serve() call.

export interface Evaluation {
  band: 'needs_work' | 'developing' | 'good' | 'excellent';
  covered_points: string[];
  missed_points: string[];
  structure_feedback: string;
  suggestions: string[];
}

export const VALID_BANDS: Evaluation['band'][] = ['needs_work', 'developing', 'good', 'excellent'];

// Structural/semantic validation of a graded response — an invalid band or
// missing covered_points/suggestions used to be silently papered over with
// defaults ('developing' / []) instead of triggering a retry, which meant a
// malformed grading response was indistinguishable from a genuine "developing,
// nothing covered" evaluation.
export function isValidEvaluation(v: unknown): v is Evaluation {
  const e = v as Partial<Evaluation> | null;
  return !!e &&
    VALID_BANDS.includes(e.band as Evaluation['band']) &&
    Array.isArray(e.covered_points) &&
    Array.isArray(e.missed_points) &&
    typeof e.structure_feedback === 'string' && e.structure_feedback.trim().length > 0 &&
    Array.isArray(e.suggestions);
}
