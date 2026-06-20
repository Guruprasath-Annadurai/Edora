// AES-256-GCM encryption for OAuth tokens stored at rest in classroom_connections.
// Key: OAUTH_TOKEN_ENCRYPTION_KEY secret — 32 raw bytes, base64-encoded.
// Wire: supabase secrets set OAUTH_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
//
// Storage format:  enc:v1:<base64-IV>:<base64-ciphertext+auth-tag>
// Graceful fallback: if stored value lacks the enc:v1: prefix it is treated as
// plaintext — enabling zero-downtime migration of existing rows; tokens are
// re-written encrypted on the next OAuth refresh cycle.

const PREFIX = 'enc:v1:';

async function importKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get('OAUTH_TOKEN_ENCRYPTION_KEY');
  if (!b64) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY secret is not set');
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const b64enc = (buf: Uint8Array): string => btoa(String.fromCharCode(...buf));
const b64dec = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${PREFIX}${b64enc(iv)}:${b64enc(new Uint8Array(ct))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored; // plaintext fallback during migration window
  const key   = await importKey();
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 2) throw new Error('Malformed encrypted token');
  const iv = b64dec(parts[0]);
  const ct = b64dec(parts[1]);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
