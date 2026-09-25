import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { authenticateNovaRequest, authorizeTargetUsers, AuthEnv } from './auth.ts';

const MOCK_ENV: AuthEnv = {
  supabaseUrl: 'https://mock.supabase.co',
  anonKey: 'mock-anon-key',
  serviceRoleKey: 'secret-service-role-key-12345678',
  cronSecret: 'secret-cron-token-87654321',
};

// ── Rejection tests ───────────────────────────────────────────────────────────

Deno.test('P0: rejects request with no Authorization header (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
    assertEquals(res.error, 'Missing or malformed Authorization header');
  }
});

Deno.test('P0: rejects non-Bearer authorization scheme (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
  }
});

Deno.test('P0: rejects Bearer with empty token (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer   ' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
  }
});

Deno.test('P0: rejects arbitrary garbage Bearer token — not a JWT (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer arbitrary-non-bearer-string' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
    assertEquals(res.error, 'Malformed or garbage token');
  }
});

Deno.test('P0: rejects standard user JWT (well-formed 3-segment token) with 403 — user invocation not permitted', async () => {
  // A well-formed JWT (3 dot-separated segments) that is NOT the service role key
  // must be rejected as a standard user JWT — nova-insights is a batch cron job,
  // not a student-facing endpoint.
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer header.payload.signature' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 403);
    assertEquals(res.error.includes('server-scheduled batch job'), true);
  }
});

Deno.test('P0: rejects a valid-looking user JWT — even a real Supabase JWT is forbidden (403)', async () => {
  // Even a fully valid, well-signed user JWT must be rejected.
  // The endpoint is not callable by students at all.
  const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.abc123';
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: `Bearer ${fakeJwt}` },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 403);
  }
});

Deno.test('P0: invalid cron secret without Authorization is rejected (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { 'x-cron-secret': 'wrong-cron-secret' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
  }
});

// ── Acceptance tests ──────────────────────────────────────────────────────────

Deno.test('P0: service role key via Bearer header is accepted (kind=service_role)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_ENV.serviceRoleKey}` },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    assertEquals(res.kind, 'service_role');
    assertEquals(res.userId, null);
  }
});

Deno.test('P0: cron secret header authorizes scheduled batch execution (kind=service_role)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { 'x-cron-secret': MOCK_ENV.cronSecret! },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    assertEquals(res.kind, 'service_role');
    assertEquals(res.userId, null);
  }
});

// ── authorizeTargetUsers tests ────────────────────────────────────────────────

Deno.test('P0: service role with no user_id targets all active users (batch mode)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_ENV.serviceRoleKey}` },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    const batchTarget = authorizeTargetUsers(res, null);
    assertEquals(batchTarget.ok, true);
    if (batchTarget.ok) {
      assertEquals(batchTarget.targetUserIds, null); // null = discover active users in handler
    }
  }
});

Deno.test('P0: service role with explicit user_id targets only that user (admin refresh)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_ENV.serviceRoleKey}` },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    const userTarget = authorizeTargetUsers(res, 'target-user-3333');
    assertEquals(userTarget.ok, true);
    if (userTarget.ok) {
      assertEquals(userTarget.targetUserIds, ['target-user-3333']);
    }
  }
});

Deno.test('P0: cron-authorized service role can also target a specific user', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { 'x-cron-secret': MOCK_ENV.cronSecret! },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    const userTarget = authorizeTargetUsers(res, 'user-uuid-999');
    assertEquals(userTarget.ok, true);
    if (userTarget.ok) {
      assertEquals(userTarget.targetUserIds, ['user-uuid-999']);
    }
  }
});
