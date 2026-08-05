import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateInsight, type NovoInsightPayload } from './validate.ts';

function validPayload(): NovoInsightPayload {
  return {
    headline: 'Great progress this week!',
    weakest_subjects: [{ subject: 'Physics', score_pct: 40, reason: 'low accuracy', study_tip: 'revise mechanics' }],
    strongest_subjects: [{ subject: 'Chemistry', score_pct: 90, reason: 'consistent scores' }],
    streak_insight: 'You kept a 5-day streak going.',
    recovery_plan: [
      { day: 'Monday', focus: 'Mechanics', tasks: ['Solve 10 problems'] },
      { day: 'Tuesday', focus: 'Thermodynamics', tasks: ['Review notes'] },
      { day: 'Wednesday', focus: 'Optics', tasks: ['Practice quiz'] },
    ],
    motivation: 'Keep pushing, you are improving fast.',
  };
}

Deno.test('validateInsight accepts a fully valid payload', () => {
  assertEquals(validateInsight(validPayload()), null);
});

Deno.test('validateInsight rejects null', () => {
  assertEquals(typeof validateInsight(null), 'string');
});

Deno.test('validateInsight rejects missing headline', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  delete p.headline;
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects an empty-string headline', () => {
  const p = validPayload();
  p.headline = '   ';
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects non-array weakest_subjects', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  p.weakest_subjects = 'not an array';
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects non-array strongest_subjects', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  p.strongest_subjects = null;
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects missing streak_insight', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  delete p.streak_insight;
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects recovery_plan with wrong length', () => {
  const p = validPayload();
  p.recovery_plan = p.recovery_plan.slice(0, 2);
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects a recovery_plan day missing "day"', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  delete p.recovery_plan[0].day;
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects a recovery_plan day missing "focus"', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  delete p.recovery_plan[1].focus;
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects a recovery_plan day with empty tasks array', () => {
  const p = validPayload();
  p.recovery_plan[2].tasks = [];
  assertEquals(typeof validateInsight(p), 'string');
});

Deno.test('validateInsight rejects missing motivation', () => {
  const p = validPayload();
  // @ts-expect-error testing malformed input
  delete p.motivation;
  assertEquals(typeof validateInsight(p), 'string');
});
