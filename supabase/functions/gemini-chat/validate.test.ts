import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validatePrereqGen, type PrereqGen } from './validate.ts';

Deno.test('validatePrereqGen accepts a well-formed prereqs array', () => {
  const parsed: PrereqGen = {
    prereqs: [
      { topic: 'Algebra basics', why: 'Needed for equations', class_level: '9' },
      { topic: 'Trigonometry', why: 'Used in wave equations' },
    ],
    difficulty: 6,
  };
  assertEquals(validatePrereqGen(parsed), true);
});

Deno.test('validatePrereqGen accepts an empty prereqs array', () => {
  assertEquals(validatePrereqGen({ prereqs: [] }), true);
});

Deno.test('validatePrereqGen rejects a missing prereqs field', () => {
  assertEquals(validatePrereqGen({}), false);
});

Deno.test('validatePrereqGen rejects a non-array prereqs', () => {
  // @ts-expect-error testing malformed input
  assertEquals(validatePrereqGen({ prereqs: 'not an array' }), false);
});

Deno.test('validatePrereqGen rejects a prereq missing "topic"', () => {
  const parsed = { prereqs: [{ why: 'some reason' }] };
  // @ts-expect-error testing malformed input
  assertEquals(validatePrereqGen(parsed), false);
});

Deno.test('validatePrereqGen rejects a prereq missing "why"', () => {
  const parsed = { prereqs: [{ topic: 'Something' }] };
  // @ts-expect-error testing malformed input
  assertEquals(validatePrereqGen(parsed), false);
});

Deno.test('validatePrereqGen rejects a prereq with empty-string "topic"', () => {
  const parsed: PrereqGen = { prereqs: [{ topic: '   ', why: 'a reason' }] };
  assertEquals(validatePrereqGen(parsed), false);
});

Deno.test('validatePrereqGen rejects a prereq with empty-string "why"', () => {
  const parsed: PrereqGen = { prereqs: [{ topic: 'Something', why: '' }] };
  assertEquals(validatePrereqGen(parsed), false);
});

Deno.test('validatePrereqGen rejects if any single prereq in the array is malformed', () => {
  const parsed: PrereqGen = {
    prereqs: [
      { topic: 'Valid one', why: 'valid reason' },
      { topic: '', why: 'invalid' },
    ],
  };
  assertEquals(validatePrereqGen(parsed), false);
});
