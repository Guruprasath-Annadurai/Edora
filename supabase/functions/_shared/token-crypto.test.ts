import { assertEquals, assertNotEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { encryptToken, decryptToken } from './token-crypto.ts';

// A valid 32-byte AES-256 key, base64-encoded, generated once for tests only —
// never used against real data. Matches the format the real secret must have
// (`openssl rand -base64 32`), so tests exercise the actual validation path.
const TEST_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

async function withKey(key: string | undefined, fn: () => void | Promise<void>) {
  const prev = Deno.env.get('OAUTH_TOKEN_ENCRYPTION_KEY');
  if (key === undefined) Deno.env.delete('OAUTH_TOKEN_ENCRYPTION_KEY');
  else Deno.env.set('OAUTH_TOKEN_ENCRYPTION_KEY', key);
  try {
    await fn();
  } finally {
    if (prev === undefined) Deno.env.delete('OAUTH_TOKEN_ENCRYPTION_KEY');
    else Deno.env.set('OAUTH_TOKEN_ENCRYPTION_KEY', prev);
  }
}

Deno.test('encryptToken → decryptToken round-trips the original plaintext', async () => {
  await withKey(TEST_KEY, async () => {
    const plaintext = 'ya29.a0AfH6SMC_real_looking_oauth_token_value';
    const encrypted = await encryptToken(plaintext);
    assertEquals(await decryptToken(encrypted), plaintext);
  });
});

Deno.test('encryptToken output carries the enc:v1: prefix and is not the plaintext', async () => {
  await withKey(TEST_KEY, async () => {
    const plaintext = 'some-refresh-token';
    const encrypted = await encryptToken(plaintext);
    assertEquals(encrypted.startsWith('enc:v1:'), true);
    assertNotEquals(encrypted, plaintext);
  });
});

Deno.test('encryptToken produces a different ciphertext each time (random IV, no ECB-style determinism)', async () => {
  await withKey(TEST_KEY, async () => {
    const plaintext = 'same-token-twice';
    const a = await encryptToken(plaintext);
    const b = await encryptToken(plaintext);
    assertNotEquals(a, b);
    // ...but both still decrypt back to the same plaintext.
    assertEquals(await decryptToken(a), plaintext);
    assertEquals(await decryptToken(b), plaintext);
  });
});

Deno.test('decryptToken returns unmodified input for legacy plaintext rows (migration fallback)', async () => {
  await withKey(TEST_KEY, async () => {
    const legacyPlaintext = 'this-row-predates-encryption';
    assertEquals(await decryptToken(legacyPlaintext), legacyPlaintext);
  });
});

Deno.test('decryptToken rejects a tampered ciphertext (AES-GCM auth tag must fail, not silently return garbage)', async () => {
  await withKey(TEST_KEY, async () => {
    const encrypted = await encryptToken('sensitive-value');
    const [prefix, ver, iv, ct] = encrypted.split(':');
    // Flip one character in the ciphertext — GCM's auth tag must reject this,
    // not decrypt to corrupted-but-accepted plaintext.
    const tamperedChar = ct[0] === 'A' ? 'B' : 'A';
    const tampered = [prefix, ver, iv, tamperedChar + ct.slice(1)].join(':');
    await assertRejects(() => decryptToken(tampered));
  });
});

Deno.test('decryptToken rejects a malformed enc:v1: value (wrong segment count)', async () => {
  await withKey(TEST_KEY, async () => {
    await assertRejects(() => decryptToken('enc:v1:onlyoneseg'), Error, 'Malformed encrypted token');
  });
});

Deno.test('encryptToken throws a clear error when the encryption key secret is unset', async () => {
  await withKey(undefined, async () => {
    await assertRejects(() => encryptToken('x'), Error, 'OAUTH_TOKEN_ENCRYPTION_KEY secret is not set');
  });
});

Deno.test('encryptToken throws a clear error when the key is not exactly 32 bytes', async () => {
  // 16 bytes, base64-encoded — wrong length, valid base64.
  await withKey('MDEyMzQ1Njc4OTAxMjM0NQ==', async () => {
    await assertRejects(() => encryptToken('x'), Error, 'must be exactly 32 bytes');
  });
});

Deno.test('encryptToken → decryptToken round-trips unicode content correctly', async () => {
  await withKey(TEST_KEY, async () => {
    const plaintext = 'टोकन-🔒-emoji-and-हिन्दी-text';
    const encrypted = await encryptToken(plaintext);
    assertEquals(await decryptToken(encrypted), plaintext);
  });
});
