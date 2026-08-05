import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateVideoAnalysis, type VideoAnalysis } from './validate.ts';

function validAnalysis(): VideoAnalysis {
  return {
    summary: 'This video covers Newtonian mechanics, focusing on force, mass, and acceleration relationships.',
    key_concepts: Array.from({ length: 5 }, (_, i) => ({ concept: `Concept ${i}`, explanation: `Explanation ${i}` })),
    flashcards: Array.from({ length: 8 }, (_, i) => ({ front: `Front ${i}`, back: `Back ${i}` })),
    topic_tags: ['physics', 'mechanics', 'forces'],
    difficulty: 'intermediate',
  };
}

Deno.test('validateVideoAnalysis accepts a fully valid analysis', () => {
  assertEquals(validateVideoAnalysis(validAnalysis()), null);
});

Deno.test('validateVideoAnalysis rejects null', () => {
  assertEquals(typeof validateVideoAnalysis(null), 'string');
});

Deno.test('validateVideoAnalysis rejects undefined', () => {
  assertEquals(typeof validateVideoAnalysis(undefined), 'string');
});

Deno.test('validateVideoAnalysis rejects missing summary', () => {
  const v = validAnalysis();
  // @ts-expect-error testing malformed input
  delete v.summary;
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects fewer than 5 key_concepts', () => {
  const v = validAnalysis();
  v.key_concepts = v.key_concepts.slice(0, 4);
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects more than 10 key_concepts', () => {
  const v = validAnalysis();
  v.key_concepts = Array.from({ length: 11 }, (_, i) => ({ concept: `C${i}`, explanation: `E${i}` }));
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects a key_concepts item missing "explanation"', () => {
  const v = validAnalysis();
  // @ts-expect-error testing malformed input
  delete v.key_concepts[0].explanation;
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects fewer than 8 flashcards', () => {
  const v = validAnalysis();
  v.flashcards = v.flashcards.slice(0, 7);
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects more than 12 flashcards', () => {
  const v = validAnalysis();
  v.flashcards = Array.from({ length: 13 }, (_, i) => ({ front: `F${i}`, back: `B${i}` }));
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis rejects a flashcard missing "back"', () => {
  const v = validAnalysis();
  // @ts-expect-error testing malformed input
  delete v.flashcards[0].back;
  assertEquals(typeof validateVideoAnalysis(v), 'string');
});

Deno.test('validateVideoAnalysis accepts key_concepts/flashcards at boundary counts (5, 8)', () => {
  const v = validAnalysis();
  v.key_concepts = v.key_concepts.slice(0, 5);
  v.flashcards = v.flashcards.slice(0, 8);
  assertEquals(validateVideoAnalysis(v), null);
});

Deno.test('validateVideoAnalysis accepts key_concepts/flashcards at boundary counts (10, 12)', () => {
  const v = validAnalysis();
  v.key_concepts = Array.from({ length: 10 }, (_, i) => ({ concept: `C${i}`, explanation: `E${i}` }));
  v.flashcards = Array.from({ length: 12 }, (_, i) => ({ front: `F${i}`, back: `B${i}` }));
  assertEquals(validateVideoAnalysis(v), null);
});
