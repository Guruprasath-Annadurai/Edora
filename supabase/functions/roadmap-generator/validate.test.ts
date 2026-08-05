import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateDay, validateWeeks, type RoadmapDay, type RoadmapWeek } from './validate.ts';

function validDay(overrides: Partial<RoadmapDay> = {}): RoadmapDay {
  return {
    day: 1,
    subject: 'Physics',
    topic: 'Kinematics',
    description: 'Study motion in a straight line',
    duration_minutes: 45,
    ...overrides,
  };
}

function validWeeks(daysPerWeek = 2): RoadmapWeek[] {
  return [
    { week_number: 1, theme: 'Foundations', days: [validDay({ day: 1 }), validDay({ day: 2 })] },
    { week_number: 2, theme: 'Advanced', days: [validDay({ day: 3 }), validDay({ day: 4 })] },
  ].map(w => ({ ...w, days: w.days.slice(0, daysPerWeek) }));
}

Deno.test('validateDay accepts a fully valid day', () => {
  assertEquals(validateDay(validDay(), 'ctx'), null);
});

Deno.test('validateDay rejects a non-numeric "day"', () => {
  const d = validDay();
  // @ts-expect-error testing malformed input
  d.day = '1';
  assertEquals(typeof validateDay(d, 'ctx'), 'string');
});

Deno.test('validateDay rejects missing "subject"', () => {
  const d = validDay();
  // @ts-expect-error testing malformed input
  delete d.subject;
  assertEquals(typeof validateDay(d, 'ctx'), 'string');
});

Deno.test('validateDay rejects missing "topic"', () => {
  const d = validDay();
  // @ts-expect-error testing malformed input
  delete d.topic;
  assertEquals(typeof validateDay(d, 'ctx'), 'string');
});

Deno.test('validateDay rejects missing "description"', () => {
  const d = validDay();
  // @ts-expect-error testing malformed input
  delete d.description;
  assertEquals(typeof validateDay(d, 'ctx'), 'string');
});

Deno.test('validateDay rejects non-positive "duration_minutes"', () => {
  const d = validDay({ duration_minutes: 0 });
  assertEquals(typeof validateDay(d, 'ctx'), 'string');
});

Deno.test('validateWeeks accepts a valid plan', () => {
  assertEquals(validateWeeks(validWeeks(2), 2, 2), null);
});

Deno.test('validateWeeks rejects undefined', () => {
  assertEquals(typeof validateWeeks(undefined, 2, 2), 'string');
});

Deno.test('validateWeeks rejects an empty array', () => {
  assertEquals(typeof validateWeeks([], 2, 2), 'string');
});

Deno.test('validateWeeks rejects fewer weeks than expected', () => {
  assertEquals(typeof validateWeeks(validWeeks(2), 3, 2), 'string');
});

Deno.test('validateWeeks rejects a week missing "week_number"', () => {
  const weeks = validWeeks(2);
  // @ts-expect-error testing malformed input
  delete weeks[0].week_number;
  assertEquals(typeof validateWeeks(weeks, 2, 2), 'string');
});

Deno.test('validateWeeks rejects a week with empty "days"', () => {
  const weeks = validWeeks(2);
  weeks[0].days = [];
  assertEquals(typeof validateWeeks(weeks, 2, 2), 'string');
});

Deno.test('validateWeeks rejects fewer days than daysPerWeek', () => {
  assertEquals(typeof validateWeeks(validWeeks(1), 2, 2), 'string');
});

Deno.test('validateWeeks propagates a per-day validation error', () => {
  const weeks = validWeeks(2);
  weeks[0].days[0].duration_minutes = -5;
  assertEquals(typeof validateWeeks(weeks, 2, 2), 'string');
});
