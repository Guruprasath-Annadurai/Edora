import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateNarrative } from './validate.ts';

const LONG_ENOUGH =
  'This student has shown consistent improvement across Physics and Chemistry over the past month, with particular strength in mechanics.';

Deno.test('validateNarrative accepts a real 3-paragraph-length narrative', () => {
  assertEquals(validateNarrative(LONG_ENOUGH), null);
});

Deno.test('validateNarrative rejects undefined — regression test for the buildExportHTML crash bug', () => {
  // Previously an undefined narrative reached buildExportHTML() and crashed
  // on narrative.split('\n\n') — this is the exact case that must be caught.
  const err = validateNarrative(undefined);
  assertEquals(typeof err, 'string');
});

Deno.test('validateNarrative rejects an empty object (malformed Gemini response)', () => {
  const err = validateNarrative({});
  assertEquals(typeof err, 'string');
});

Deno.test('validateNarrative rejects a too-short string', () => {
  const err = validateNarrative('Too short.');
  assertEquals(typeof err, 'string');
});

Deno.test('validateNarrative rejects an empty string', () => {
  const err = validateNarrative('');
  assertEquals(typeof err, 'string');
});

Deno.test('validateNarrative rejects a non-string value', () => {
  const err = validateNarrative(12345);
  assertEquals(typeof err, 'string');
});

Deno.test('validateNarrative accepts exactly at the 50-character boundary', () => {
  const exactly50 = 'x'.repeat(50);
  assertEquals(validateNarrative(exactly50), null);
});

Deno.test('validateNarrative rejects 49 characters (just under the boundary)', () => {
  const under50 = 'x'.repeat(49);
  const err = validateNarrative(under50);
  assertEquals(typeof err, 'string');
});
