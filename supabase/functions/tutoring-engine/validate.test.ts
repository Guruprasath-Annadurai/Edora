import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateStructure, type SessionStructure, validateCheckpoint, type CheckpointQ } from './validate.ts';

// ── validateStructure ──────────────────────────────────────────────────
function validStructure(): SessionStructure {
  return {
    objectives: ['Understand Newton\'s laws', 'Apply F=ma'],
    concepts: [{ title: 'Force' }, { title: 'Acceleration' }],
    intro_message: 'Welcome! Today we will learn about forces.',
    first_teaching: 'Let\'s start with the concept of force.',
  };
}

Deno.test('validateStructure accepts a fully valid structure', () => {
  assertEquals(validateStructure(validStructure()), true);
});

Deno.test('validateStructure rejects null/undefined', () => {
  // @ts-expect-error testing malformed input
  assertEquals(validateStructure(null), false);
});

Deno.test('validateStructure rejects a non-array "objectives"', () => {
  const v = validStructure();
  // @ts-expect-error testing malformed input
  v.objectives = 'not an array';
  assertEquals(validateStructure(v), false);
});

Deno.test('validateStructure rejects a non-array "concepts"', () => {
  const v = validStructure();
  // @ts-expect-error testing malformed input
  v.concepts = null;
  assertEquals(validateStructure(v), false);
});

Deno.test('validateStructure rejects a missing "intro_message"', () => {
  const v = validStructure();
  // @ts-expect-error testing malformed input
  delete v.intro_message;
  assertEquals(validateStructure(v), false);
});

Deno.test('validateStructure rejects a missing "first_teaching"', () => {
  const v = validStructure();
  // @ts-expect-error testing malformed input
  delete v.first_teaching;
  assertEquals(validateStructure(v), false);
});

// ── validateCheckpoint ─────────────────────────────────────────────────
function validCheckpoint(): CheckpointQ {
  return {
    question: 'What is F=ma?',
    options: ['Force law', 'Energy law', 'Momentum law', 'Gravity law'],
    correct_idx: 0,
    explanation: 'F=ma is Newton\'s second law.',
  };
}

Deno.test('validateCheckpoint accepts a fully valid checkpoint', () => {
  assertEquals(validateCheckpoint(validCheckpoint()), true);
});

Deno.test('validateCheckpoint rejects null', () => {
  // @ts-expect-error testing malformed input
  assertEquals(validateCheckpoint(null), false);
});

Deno.test('validateCheckpoint rejects a missing "question"', () => {
  const v = validCheckpoint();
  // @ts-expect-error testing malformed input
  delete v.question;
  assertEquals(validateCheckpoint(v), false);
});

Deno.test('validateCheckpoint rejects wrong option count', () => {
  const v = validCheckpoint();
  v.options = ['A', 'B', 'C'];
  assertEquals(validateCheckpoint(v), false);
});

Deno.test('validateCheckpoint rejects a non-numeric correct_idx', () => {
  const v = validCheckpoint();
  // @ts-expect-error testing malformed input
  v.correct_idx = '0';
  assertEquals(validateCheckpoint(v), false);
});

Deno.test('validateCheckpoint rejects correct_idx out of range (below)', () => {
  const v = validCheckpoint();
  v.correct_idx = -1;
  assertEquals(validateCheckpoint(v), false);
});

Deno.test('validateCheckpoint rejects correct_idx out of range (above)', () => {
  const v = validCheckpoint();
  v.correct_idx = 4;
  assertEquals(validateCheckpoint(v), false);
});

Deno.test('validateCheckpoint accepts correct_idx at boundaries 0 and 3', () => {
  const v1 = validCheckpoint(); v1.correct_idx = 0;
  const v2 = validCheckpoint(); v2.correct_idx = 3;
  assertEquals(validateCheckpoint(v1), true);
  assertEquals(validateCheckpoint(v2), true);
});
