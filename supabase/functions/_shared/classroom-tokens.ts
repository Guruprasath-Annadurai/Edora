// Shared OAuth token accessor for all Google service edge functions.
// Reads from classroom_connections, decrypts with AES-GCM, auto-refreshes
// expired tokens and re-encrypts before writing back to the DB.
//
// All Google service functions (google-calendar, google-gmail, google-drive,
// classroom-auth) import getValidAccessToken from here instead of duplicating it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken, decryptToken } from './token-crypto.ts';

export interface ClassroomToken {
  token: string;  // decrypted access token, ready to use in Authorization header
  email: string;  // teacher's google_email
}

export async function getValidAccessToken(
  teacherId: string,
  serviceDb: ReturnType<typeof createClient>,
): Promise<ClassroomToken | null> {
  const clientId     = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

  const { data: conn } = await serviceDb
    .from('classroom_connections')
    .select('access_token, refresh_token, expires_at, google_email')
    .eq('teacher_id', teacherId)
    .single();

  if (!conn) return null;

  let accessToken: string;
  try {
    accessToken = await decryptToken(conn.access_token as string);
  } catch {
    console.error('[classroom-tokens] access_token decryption failed for teacher', teacherId);
    return null;
  }

  // Token still valid with 60s buffer — return immediately
  if (new Date(conn.expires_at as string).getTime() > Date.now() + 60_000) {
    return { token: accessToken, email: conn.google_email as string };
  }

  // Access token expired — use refresh token to get a new one
  let refreshToken: string;
  try {
    refreshToken = await decryptToken(conn.refresh_token as string);
  } catch {
    console.error('[classroom-tokens] refresh_token decryption failed for teacher', teacherId);
    return null;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    console.error('[classroom-tokens] token refresh failed:', res.status);
    return null;
  }

  const data      = await res.json() as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Encrypt the new access token before persisting
  let encAccess: string;
  try {
    encAccess = await encryptToken(data.access_token);
  } catch (e) {
    // If encryption key is missing (misconfigured env), log loudly but don't fail the request.
    // The token will be stored plaintext — ops team must fix the secret.
    console.error('[classroom-tokens] encryptToken failed, storing plaintext:', (e as Error).message);
    encAccess = data.access_token;
  }

  await serviceDb.from('classroom_connections').update({
    access_token: encAccess,
    expires_at:   newExpiry,
    updated_at:   new Date().toISOString(),
  }).eq('teacher_id', teacherId)
    .catch(err => console.error('[classroom-tokens] token update failed:', err?.message));

  return { token: data.access_token, email: conn.google_email as string };
}
