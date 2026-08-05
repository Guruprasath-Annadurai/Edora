import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateExtraction, VALID_TYPES, type ExtractionResult } from './validate.ts';

function validExtraction(): ExtractionResult {
  return {
    memories: [
      { memory_type: 'struggle', content: 'Struggles with integration by parts', subject: 'Maths', topic: 'Calculus', importance: 7 },
    ],
    session_summary: {
      summary: 'Covered integration techniques',
      struggles: ['Integration by parts'],
      wins: ['u-substitution'],
      explanation_style: 'balanced',
    },
  };
}

Deno.test('validateExtraction accepts a fully valid extraction', () => {
  assertEquals(validateExtraction(validExtraction()), null);
});

Deno.test('validateExtraction rejects null', () => {
  assertEquals(typeof validateExtraction(null), 'string');
});

Deno.test('validateExtraction rejects a non-array "memories"', () => {
  const v = validExtraction();
  // @ts-expect-error testing malformed input
  v.memories = 'not an array';
  assertEquals(typeof validateExtraction(v), 'string');
});

Deno.test('validateExtraction accepts an empty memories array', () => {
  const v = validExtraction();
  v.memories = [];
  assertEquals(validateExtraction(v), null);
});

Deno.test('validateExtraction rejects a memory with empty "content"', () => {
  const v = validExtraction();
  v.memories[0].content = '';
  assertEquals(typeof validateExtraction(v), 'string');
});

Deno.test('validateExtraction rejects a memory with an invalid "memory_type"', () => {
  const v = validExtraction();
  v.memories[0].memory_type = 'bogus_type';
  assertEquals(typeof validateExtraction(v), 'string');
});

Deno.test('validateExtraction accepts every VALID_TYPES value', () => {
  for (const t of VALID_TYPES) {
    const v = validExtraction();
    v.memories[0].memory_type = t;
    assertEquals(validateExtraction(v), null);
  }
});

Deno.test('validateExtraction rejects a missing "session_summary"', () => {
  const v = validExtraction();
  // @ts-expect-error testing malformed input
  delete v.session_summary;
  assertEquals(typeof validateExtraction(v), 'string');
});

Deno.test('validateExtraction rejects an empty "session_summary.summary"', () => {
  const v = validExtraction();
  v.session_summary.summary = '   ';
  assertEquals(typeof validateExtraction(v), 'string');
});
