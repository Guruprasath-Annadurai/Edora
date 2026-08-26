import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateCorrectedQuestion, VALID_VERDICTS, hashQuestionText } from './validate.ts';

Deno.test('validateCorrectedQuestion accepts null (no correction proposed)', () => {
  assertEquals(validateCorrectedQuestion(null), null);
});

Deno.test('validateCorrectedQuestion accepts undefined', () => {
  assertEquals(validateCorrectedQuestion(undefined), null);
});

Deno.test('validateCorrectedQuestion accepts a fully well-formed correction', () => {
  const cq = {
    question_text: 'What is the SI unit of force?',
    options: ['Newton', 'Joule', 'Watt', 'Pascal'],
    correct_index: 0,
    explanation: 'Force is measured in Newtons.',
  };
  assertEquals(validateCorrectedQuestion(cq), null);
});

Deno.test('validateCorrectedQuestion rejects a too-short question_text', () => {
  const cq = { question_text: 'Hi', options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'x' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

Deno.test('validateCorrectedQuestion rejects fewer than 4 options', () => {
  const cq = { question_text: 'A valid question here', options: ['A', 'B', 'C'], correct_index: 0, explanation: 'x' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

Deno.test('validateCorrectedQuestion rejects an empty-string option', () => {
  const cq = { question_text: 'A valid question here', options: ['A', '', 'C', 'D'], correct_index: 0, explanation: 'x' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

Deno.test('validateCorrectedQuestion rejects correct_index out of range', () => {
  const cq = { question_text: 'A valid question here', options: ['A', 'B', 'C', 'D'], correct_index: 4, explanation: 'x' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

Deno.test('validateCorrectedQuestion rejects a non-integer correct_index', () => {
  const cq = { question_text: 'A valid question here', options: ['A', 'B', 'C', 'D'], correct_index: 1.2, explanation: 'x' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

Deno.test('validateCorrectedQuestion rejects an empty explanation', () => {
  const cq = { question_text: 'A valid question here', options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: '   ' };
  const err = validateCorrectedQuestion(cq);
  assertEquals(typeof err, 'string');
});

// Corrected 2026-08-25: these must match public.question_quality_flags's
// real, live CHECK constraint on `verdict`
// (20260704101715_ai_quality_and_anomaly_flags.sql), not an invented
// 3-value scheme that would have been rejected by the database on every
// single insert.
Deno.test('VALID_VERDICTS contains exactly the 5 allowed enum values', () => {
  assertEquals(VALID_VERDICTS.has('genuinely_hard'), true);
  assertEquals(VALID_VERDICTS.has('miscalibrated'), true);
  assertEquals(VALID_VERDICTS.has('wrong_answer_key'), true);
  assertEquals(VALID_VERDICTS.has('ambiguous'), true);
  assertEquals(VALID_VERDICTS.has('needs_review'), true);
  assertEquals(VALID_VERDICTS.has('confirmed_bad'), false);
  assertEquals(VALID_VERDICTS.has('inconclusive'), false);
  assertEquals(VALID_VERDICTS.has('made_up_verdict'), false);
  assertEquals(VALID_VERDICTS.size, 5);
});

Deno.test('hashQuestionText is deterministic for the same input', async () => {
  const a = await hashQuestionText('What is the SI unit of force?');
  const b = await hashQuestionText('What is the SI unit of force?');
  assertEquals(a, b);
});

Deno.test('hashQuestionText produces a 64-char lowercase hex SHA-256 digest', async () => {
  const h = await hashQuestionText('any question text');
  assertEquals(h.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(h), true);
});

Deno.test('hashQuestionText differs for different input', async () => {
  const a = await hashQuestionText('Question A?');
  const b = await hashQuestionText('Question B?');
  assertNotEquals(a, b);
});

Deno.test('hashQuestionText trims surrounding whitespace before hashing (same question, different padding, same hash)', async () => {
  const a = await hashQuestionText('  What is 2+2?  ');
  const b = await hashQuestionText('What is 2+2?');
  assertEquals(a, b);
});
