import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateStudyPack, FLASHCARD_COUNT, QUIZ_COUNT, KEY_TERM_COUNT, type StudyPack } from './validate.ts';

function validPack(): StudyPack {
  return {
    summary: 'This chapter covers the fundamentals of thermodynamics, including the laws of energy conservation.',
    flashcards: Array.from({ length: FLASHCARD_COUNT }, (_, i) => ({
      front: `Question ${i}`,
      back: `Answer ${i}`,
    })),
    quiz: Array.from({ length: QUIZ_COUNT }, (_, i) => ({
      question: `Quiz question ${i}`,
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: `Explanation ${i}`,
    })),
    key_terms: Array.from({ length: KEY_TERM_COUNT }, (_, i) => ({
      term: `Term ${i}`,
      definition: `Definition ${i}`,
    })),
  };
}

Deno.test('validateStudyPack accepts a fully valid pack', () => {
  assertEquals(validateStudyPack(validPack()), null);
});

Deno.test('validateStudyPack rejects null', () => {
  assertEquals(typeof validateStudyPack(null), 'string');
});

Deno.test('validateStudyPack rejects undefined', () => {
  assertEquals(typeof validateStudyPack(undefined), 'string');
});

Deno.test('validateStudyPack rejects missing summary', () => {
  const p = validPack();
  // @ts-expect-error testing malformed input
  delete p.summary;
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects wrong flashcard count', () => {
  const p = validPack();
  p.flashcards = p.flashcards.slice(0, FLASHCARD_COUNT - 1);
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects a flashcard missing "back"', () => {
  const p = validPack();
  // @ts-expect-error testing malformed input
  delete p.flashcards[0].back;
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects wrong quiz count', () => {
  const p = validPack();
  p.quiz = p.quiz.slice(0, QUIZ_COUNT - 1);
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects a quiz question with wrong option count', () => {
  const p = validPack();
  p.quiz[0].options = ['A', 'B', 'C'];
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects a quiz question with an empty-string option', () => {
  const p = validPack();
  p.quiz[0].options = ['A', '', 'C', 'D'];
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects correct_answer out of range (below)', () => {
  const p = validPack();
  p.quiz[0].correct_answer = -1;
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects correct_answer out of range (above)', () => {
  const p = validPack();
  p.quiz[0].correct_answer = 4;
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack accepts correct_answer at boundary 0 and 3', () => {
  const p = validPack();
  p.quiz[0].correct_answer = 0;
  p.quiz[1].correct_answer = 3;
  assertEquals(validateStudyPack(p), null);
});

Deno.test('validateStudyPack rejects a quiz question missing explanation', () => {
  const p = validPack();
  // @ts-expect-error testing malformed input
  delete p.quiz[0].explanation;
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects wrong key_terms count', () => {
  const p = validPack();
  p.key_terms = p.key_terms.slice(0, KEY_TERM_COUNT - 1);
  assertEquals(typeof validateStudyPack(p), 'string');
});

Deno.test('validateStudyPack rejects a key term missing "definition"', () => {
  const p = validPack();
  // @ts-expect-error testing malformed input
  delete p.key_terms[0].definition;
  assertEquals(typeof validateStudyPack(p), 'string');
});
