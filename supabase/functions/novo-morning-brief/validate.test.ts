import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { isValidBriefText } from './validate.ts';

Deno.test('isValidBriefText accepts a normal brief', () => {
  assertEquals(isValidBriefText('Riya gained 40 XP overnight. Catch up on Thermodynamics before she pulls further ahead.'), true);
});

Deno.test('isValidBriefText rejects an empty string', () => {
  assertEquals(isValidBriefText(''), false);
});

Deno.test('isValidBriefText rejects a whitespace-only string', () => {
  assertEquals(isValidBriefText('   \n\t  '), false);
});

Deno.test('isValidBriefText accepts a string right at the 400-char boundary', () => {
  assertEquals(isValidBriefText('a'.repeat(400)), true);
});

Deno.test('isValidBriefText rejects a string over the 400-char boundary', () => {
  assertEquals(isValidBriefText('a'.repeat(401)), false);
});
