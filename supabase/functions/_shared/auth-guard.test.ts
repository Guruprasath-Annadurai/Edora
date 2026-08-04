import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { requireAuth, sanitizeText, sanitizeArray } from './auth-guard.ts';

// ── requireAuth: header-shape validation happens before any network call,
// so these paths are testable without a real Supabase client. ──────────────

Deno.test('requireAuth rejects a request with no Authorization header', async () => {
  const req = new Request('https://x.test/fn');
  const result = await requireAuth(req, 'https://x.supabase.co', 'anon-key');
  if (!(result instanceof Response)) throw new Error('expected a Response');
  assertEquals(result.status, 401);
  const body = await result.json();
  assertEquals(body.error, 'Missing Authorization header');
});

Deno.test('requireAuth rejects an Authorization header without the Bearer scheme', async () => {
  const req = new Request('https://x.test/fn', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
  const result = await requireAuth(req, 'https://x.supabase.co', 'anon-key');
  if (!(result instanceof Response)) throw new Error('expected a Response');
  assertEquals(result.status, 401);
});

Deno.test('requireAuth rejects a single-character token (not empty, but not a JWT shape either)', async () => {
  // Not testing a truly empty "Bearer " token: the Fetch API's Headers class
  // trims trailing OWS from header values per spec, so `Authorization: 'Bearer '`
  // arrives as `'Bearer'` (no space) by the time req.headers.get() sees it —
  // that hits the "Missing Authorization header" branch instead, not
  // "Malformed JWT". This exercises the actually-reachable malformed case.
  const req = new Request('https://x.test/fn', { headers: { Authorization: 'Bearer x' } });
  const result = await requireAuth(req, 'https://x.supabase.co', 'anon-key');
  if (!(result instanceof Response)) throw new Error('expected a Response');
  assertEquals(result.status, 401);
  const body = await result.json();
  assertEquals(body.error, 'Malformed JWT');
});

Deno.test('requireAuth rejects a token that is not 3 dot-separated segments (not a JWT shape)', async () => {
  const req = new Request('https://x.test/fn', { headers: { Authorization: 'Bearer not-a-jwt' } });
  const result = await requireAuth(req, 'https://x.supabase.co', 'anon-key');
  if (!(result instanceof Response)) throw new Error('expected a Response');
  assertEquals(result.status, 401);
  const body = await result.json();
  assertEquals(body.error, 'Malformed JWT');
});

// ── sanitizeText ───────────────────────────────────────────────────────────

Deno.test('sanitizeText strips HTML tags', () => {
  assertEquals(sanitizeText('<script>alert(1)</script>hello'), 'alert(1)hello');
});

Deno.test('sanitizeText strips null bytes', () => {
  assertEquals(sanitizeText('a\x00b\x00c'), 'abc');
});

Deno.test('sanitizeText truncates to maxLength', () => {
  assertEquals(sanitizeText('a'.repeat(10), 5), 'aaaaa');
});

Deno.test('sanitizeText trims surrounding whitespace', () => {
  assertEquals(sanitizeText('   hello world   '), 'hello world');
});

Deno.test('sanitizeText returns empty string for non-string input (e.g. an object smuggled in JSON)', () => {
  assertEquals(sanitizeText({ malicious: true }), '');
  assertEquals(sanitizeText(null), '');
  assertEquals(sanitizeText(undefined), '');
  assertEquals(sanitizeText(12345), '');
});

Deno.test('sanitizeText applies default maxLength of 4000', () => {
  const result = sanitizeText('x'.repeat(5000));
  assertEquals(result.length, 4000);
});

// ── sanitizeArray ──────────────────────────────────────────────────────────

Deno.test('sanitizeArray returns empty array for non-array input', () => {
  assertEquals(sanitizeArray('not an array'), []);
  assertEquals(sanitizeArray(null), []);
  assertEquals(sanitizeArray({ 0: 'a', 1: 'b' }), []); // array-like object, not a real array
});

Deno.test('sanitizeArray caps at maxItems', () => {
  const input = Array.from({ length: 30 }, (_, i) => `item-${i}`);
  const result = sanitizeArray(input, 20);
  assertEquals(result.length, 20);
});

Deno.test('sanitizeArray drops non-string items rather than coercing them', () => {
  const result = sanitizeArray(['ok', 42, null, { x: 1 }, 'also ok']);
  assertEquals(result, ['ok', 'also ok']);
});

Deno.test('sanitizeArray sanitizes each remaining item (tags, length)', () => {
  const result = sanitizeArray(['<b>bold</b>', 'x'.repeat(600)], 20, 500);
  assertEquals(result[0], 'bold');
  assertEquals(result[1].length, 500);
});
