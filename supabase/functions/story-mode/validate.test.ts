import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateConcept, type ConceptExtract } from './validate.ts';

Deno.test('validateConcept accepts a well-formed concept', () => {
  const c: ConceptExtract = { concept: 'Newtons second law' };
  assertEquals(validateConcept(c), null);
});

Deno.test('validateConcept rejects null', () => {
  assertEquals(typeof validateConcept(null), 'string');
});

Deno.test('validateConcept rejects a missing "concept"', () => {
  // @ts-expect-error testing malformed input
  const c: ConceptExtract = {};
  assertEquals(typeof validateConcept(c), 'string');
});

Deno.test('validateConcept rejects an empty-string "concept"', () => {
  const c: ConceptExtract = { concept: '' };
  assertEquals(typeof validateConcept(c), 'string');
});

Deno.test('validateConcept rejects a whitespace-only "concept"', () => {
  const c: ConceptExtract = { concept: '   ' };
  assertEquals(typeof validateConcept(c), 'string');
});

Deno.test('validateConcept rejects a non-string "concept"', () => {
  // @ts-expect-error testing malformed input
  const c: ConceptExtract = { concept: 123 };
  assertEquals(typeof validateConcept(c), 'string');
});
