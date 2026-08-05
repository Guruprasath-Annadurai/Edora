import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateCorrectedQuestion, VALID_VERDICTS } from './validate.ts';

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

Deno.test('VALID_VERDICTS contains exactly the 3 allowed enum values', () => {
  assertEquals(VALID_VERDICTS.has('confirmed_bad'), true);
  assertEquals(VALID_VERDICTS.has('genuinely_hard'), true);
  assertEquals(VALID_VERDICTS.has('inconclusive'), true);
  assertEquals(VALID_VERDICTS.has('made_up_verdict'), false);
  assertEquals(VALID_VERDICTS.size, 3);
});
