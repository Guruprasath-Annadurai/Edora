import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isValidQuestion, type GeneratedQuestion } from './validate.ts';

function validQuestion(): GeneratedQuestion {
  return {
    subject: 'Physics',
    chapter: 'Kinematics',
    concept: 'Relative velocity',
    question: 'A boat crosses a river...',
    options: ['A', 'B', 'C', 'D'],
    correct_idx: 2,
    explanation: 'Because relative velocity...',
    difficulty: 'medium',
  };
}

Deno.test('isValidQuestion accepts a fully well-formed question', () => {
  assertEquals(isValidQuestion(validQuestion()), true);
});

Deno.test('isValidQuestion rejects missing subject', () => {
  const q = validQuestion();
  // deno-lint-ignore no-explicit-any
  (q as any).subject = undefined;
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects a blank (whitespace-only) question text', () => {
  const q = validQuestion();
  q.question = '   ';
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects fewer than 4 options', () => {
  const q = validQuestion();
  q.options = ['A', 'B', 'C'];
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects more than 4 options', () => {
  const q = validQuestion();
  q.options = ['A', 'B', 'C', 'D', 'E'];
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects an empty-string option', () => {
  const q = validQuestion();
  q.options = ['A', '', 'C', 'D'];
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects correct_idx out of range (negative)', () => {
  const q = validQuestion();
  q.correct_idx = -1;
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects correct_idx out of range (too high)', () => {
  const q = validQuestion();
  q.correct_idx = 4;
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects a non-integer correct_idx', () => {
  const q = validQuestion();
  q.correct_idx = 1.5;
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion rejects a missing explanation', () => {
  const q = validQuestion();
  // deno-lint-ignore no-explicit-any
  (q as any).explanation = undefined;
  assertEquals(isValidQuestion(q), false);
});

Deno.test('isValidQuestion accepts correct_idx at the boundary values 0 and 3', () => {
  const q0 = validQuestion();
  q0.correct_idx = 0;
  assertEquals(isValidQuestion(q0), true);

  const q3 = validQuestion();
  q3.correct_idx = 3;
  assertEquals(isValidQuestion(q3), true);
});
