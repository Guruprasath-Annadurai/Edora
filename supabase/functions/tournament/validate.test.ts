import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateTournamentGen } from './validate.ts';

function validGen() {
  return {
    name: 'Weekly Physics Sprint',
    questions: [
      {
        question: 'What is Newton\'s second law?',
        options: ['F=ma', 'E=mc^2', 'V=IR', 'PV=nRT'],
        correct_idx: 0,
        explanation: 'Force equals mass times acceleration.',
        points: 10,
      },
    ],
  };
}

Deno.test('validateTournamentGen accepts a valid shape', () => {
  assertEquals(validateTournamentGen(validGen()), true);
});

Deno.test('validateTournamentGen rejects null', () => {
  assertEquals(validateTournamentGen(null), false);
});

Deno.test('validateTournamentGen rejects undefined', () => {
  assertEquals(validateTournamentGen(undefined), false);
});

Deno.test('validateTournamentGen rejects missing name', () => {
  const v = validGen();
  // @ts-expect-error testing malformed input
  delete v.name;
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects empty-string name', () => {
  const v = validGen();
  v.name = '';
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects empty questions array', () => {
  const v = validGen();
  v.questions = [];
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects non-array questions', () => {
  const v = validGen();
  // @ts-expect-error testing malformed input
  v.questions = 'not an array';
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects a question missing question text', () => {
  const v = validGen();
  // @ts-expect-error testing malformed input
  delete v.questions[0].question;
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects too few options', () => {
  const v = validGen();
  v.questions[0].options = ['F=ma', 'E=mc^2', 'V=IR'];
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects too many options', () => {
  const v = validGen();
  v.questions[0].options = ['F=ma', 'E=mc^2', 'V=IR', 'PV=nRT', 'extra'];
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects an empty-string option', () => {
  const v = validGen();
  v.questions[0].options = ['F=ma', '', 'V=IR', 'PV=nRT'];
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects correct_idx below range', () => {
  const v = validGen();
  v.questions[0].correct_idx = -1;
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects correct_idx above range', () => {
  const v = validGen();
  v.questions[0].correct_idx = 4;
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen accepts correct_idx at boundary 0', () => {
  const v = validGen();
  v.questions[0].correct_idx = 0;
  assertEquals(validateTournamentGen(v), true);
});

Deno.test('validateTournamentGen accepts correct_idx at boundary 3', () => {
  const v = validGen();
  v.questions[0].correct_idx = 3;
  assertEquals(validateTournamentGen(v), true);
});

Deno.test('validateTournamentGen rejects non-numeric correct_idx', () => {
  const v = validGen();
  // @ts-expect-error testing malformed input
  v.questions[0].correct_idx = '2';
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects missing explanation', () => {
  const v = validGen();
  // @ts-expect-error testing malformed input
  delete v.questions[0].explanation;
  assertEquals(validateTournamentGen(v), false);
});

Deno.test('validateTournamentGen rejects empty-string explanation', () => {
  const v = validGen();
  v.questions[0].explanation = '   ';
  assertEquals(validateTournamentGen(v), false);
});
