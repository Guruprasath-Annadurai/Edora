import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { isValidMergedSummary } from './validate.ts';

Deno.test('isValidMergedSummary accepts a normal merged sentence', () => {
  assertEquals(isValidMergedSummary('Struggles with quadratic equations, especially factoring.'), true);
});

Deno.test('isValidMergedSummary rejects null', () => {
  assertEquals(isValidMergedSummary(null), false);
});

Deno.test('isValidMergedSummary rejects undefined', () => {
  assertEquals(isValidMergedSummary(undefined), false);
});

Deno.test('isValidMergedSummary rejects empty string', () => {
  assertEquals(isValidMergedSummary(''), false);
});

Deno.test('isValidMergedSummary rejects whitespace-only string', () => {
  assertEquals(isValidMergedSummary('   \n\t  '), false);
});

Deno.test('isValidMergedSummary accepts a string right at the 400-char boundary', () => {
  assertEquals(isValidMergedSummary('a'.repeat(400)), true);
});

Deno.test('isValidMergedSummary rejects a string over the 400-char boundary', () => {
  assertEquals(isValidMergedSummary('a'.repeat(401)), false);
});
