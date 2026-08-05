import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateWeeks } from './validate.ts';

function chapter(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    subject: 'Physics',
    chapter: 'Mechanics',
    hours: 2,
    priority: 'high',
    done: false,
    ...overrides,
  };
}

function validWeeks() {
  return [
    { week: 1, chapters: [chapter('c1'), chapter('c2')] },
    { week: 2, chapters: [chapter('c3')] },
  ];
}

Deno.test('validateWeeks accepts a valid plan matching expected chapter count', () => {
  assertEquals(validateWeeks(validWeeks(), 3), null);
});

Deno.test('validateWeeks rejects a non-array', () => {
  assertEquals(typeof validateWeeks('not an array', 3), 'string');
});

Deno.test('validateWeeks rejects an empty array', () => {
  assertEquals(typeof validateWeeks([], 3), 'string');
});

Deno.test('validateWeeks rejects a week missing "week" number', () => {
  const weeks = validWeeks();
  // @ts-expect-error testing malformed input
  delete weeks[0].week;
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a week with empty chapters array', () => {
  const weeks = validWeeks();
  weeks[1].chapters = [];
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a chapter missing "id"', () => {
  const weeks = validWeeks();
  // @ts-expect-error testing malformed input
  delete weeks[0].chapters[0].id;
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a chapter missing "subject"', () => {
  const weeks = validWeeks();
  // @ts-expect-error testing malformed input
  delete weeks[0].chapters[0].subject;
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a chapter with non-positive "hours"', () => {
  const weeks = validWeeks();
  weeks[0].chapters[0].hours = 0;
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects an invalid "priority" value', () => {
  const weeks = validWeeks();
  weeks[0].chapters[0].priority = 'urgent';
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a non-boolean "done"', () => {
  const weeks = validWeeks();
  // @ts-expect-error testing malformed input
  weeks[0].chapters[0].done = 'false';
  assertEquals(typeof validateWeeks(weeks, 3), 'string');
});

Deno.test('validateWeeks rejects a total chapter count mismatch', () => {
  assertEquals(typeof validateWeeks(validWeeks(), 5), 'string');
});
