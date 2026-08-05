import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isValidStudyPack, type StudyPack } from './validate.ts';

function validPack(): StudyPack {
  return {
    summary: 'This document covers the essentials of cell biology, including organelles and metabolism.',
    flashcards: Array.from({ length: 10 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` })),
    quiz: Array.from({ length: 5 }, (_, i) => ({
      question: `Quiz ${i}`,
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 0,
      explanation: `Because ${i}`,
    })),
    key_terms: Array.from({ length: 10 }, (_, i) => ({ term: `Term ${i}`, definition: `Def ${i}` })),
  };
}

Deno.test('isValidStudyPack accepts a fully valid pack', () => {
  assertEquals(isValidStudyPack(validPack()), true);
});

Deno.test('isValidStudyPack rejects null', () => {
  assertEquals(isValidStudyPack(null), false);
});

Deno.test('isValidStudyPack rejects undefined', () => {
  assertEquals(isValidStudyPack(undefined), false);
});

Deno.test('isValidStudyPack rejects an empty-string summary', () => {
  const p = validPack();
  p.summary = '   ';
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects fewer than 10 flashcards', () => {
  const p = validPack();
  p.flashcards = p.flashcards.slice(0, 9);
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects a flashcard with empty "front"', () => {
  const p = validPack();
  p.flashcards[0].front = '';
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects fewer than 5 quiz questions', () => {
  const p = validPack();
  p.quiz = p.quiz.slice(0, 4);
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects a quiz question with 3 options', () => {
  const p = validPack();
  p.quiz[0].options = ['A', 'B', 'C'];
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects a non-integer correct_answer', () => {
  const p = validPack();
  p.quiz[0].correct_answer = 1.5;
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects correct_answer out of range', () => {
  const p = validPack();
  p.quiz[0].correct_answer = 4;
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects fewer than 10 key_terms', () => {
  const p = validPack();
  p.key_terms = p.key_terms.slice(0, 9);
  assertEquals(isValidStudyPack(p), false);
});

Deno.test('isValidStudyPack rejects a key term with empty "definition"', () => {
  const p = validPack();
  p.key_terms[0].definition = '';
  assertEquals(isValidStudyPack(p), false);
});
