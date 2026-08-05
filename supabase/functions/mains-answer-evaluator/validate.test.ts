import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isValidEvaluation, VALID_BANDS } from './validate.ts';

function validEvaluation() {
  return {
    band: 'good',
    covered_points: ['Point A', 'Point B'],
    missed_points: ['Point C'],
    structure_feedback: 'Well-structured with a clear intro and conclusion.',
    suggestions: ['Add a diagram'],
  };
}

Deno.test('isValidEvaluation accepts a fully well-formed evaluation', () => {
  assertEquals(isValidEvaluation(validEvaluation()), true);
});

Deno.test('isValidEvaluation accepts empty covered_points/missed_points/suggestions arrays', () => {
  const e = validEvaluation();
  e.covered_points = [];
  e.missed_points = [];
  e.suggestions = [];
  assertEquals(isValidEvaluation(e), true);
});

Deno.test('isValidEvaluation rejects an out-of-enum band', () => {
  const e = validEvaluation();
  // deno-lint-ignore no-explicit-any
  (e as any).band = 'perfect';
  assertEquals(isValidEvaluation(e), false);
});

Deno.test('isValidEvaluation rejects a missing band', () => {
  const e = validEvaluation();
  // deno-lint-ignore no-explicit-any
  (e as any).band = undefined;
  assertEquals(isValidEvaluation(e), false);
});

Deno.test('isValidEvaluation rejects covered_points not being an array', () => {
  const e = validEvaluation();
  // deno-lint-ignore no-explicit-any
  (e as any).covered_points = 'not an array';
  assertEquals(isValidEvaluation(e), false);
});

Deno.test('isValidEvaluation rejects an empty structure_feedback', () => {
  const e = validEvaluation();
  e.structure_feedback = '   ';
  assertEquals(isValidEvaluation(e), false);
});

Deno.test('isValidEvaluation rejects null', () => {
  assertEquals(isValidEvaluation(null), false);
});

Deno.test('isValidEvaluation rejects undefined', () => {
  assertEquals(isValidEvaluation(undefined), false);
});

Deno.test('VALID_BANDS contains exactly the 4 allowed bands in order', () => {
  assertEquals(VALID_BANDS, ['needs_work', 'developing', 'good', 'excellent']);
});
