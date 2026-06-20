// ─────────────────────────────────────────────────────────────────────────────
// GCP Service Account → OAuth2 Bearer Token
// Uses Web Crypto (built-in to Deno) — zero external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceAccount {
  project_id:   string;
  client_email: string;
  private_key:  string;
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signRS256(input: string, privateKeyPem: string): Promise<string> {
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(input),
  );

  return b64url(sig);
}

// Exchange a service-account JWT for a short-lived GCP access token.
export async function getGCPToken(
  sa: ServiceAccount,
  scopes: string[],
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    scope: scopes.join(' '),
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));

  const signingInput = `${header}.${payload}`;
  const signature    = await signRS256(signingInput, sa.private_key);
  const jwt          = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GCP token exchange failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.access_token as string;
}
