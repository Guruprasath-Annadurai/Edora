import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { authenticateNovaRequest, authorizeTargetUsers, AuthEnv } from './auth.ts';

const MOCK_ENV: AuthEnv = {
  supabaseUrl: 'https://mock.supabase.co',
  anonKey: 'mock-anon-key',
  serviceRoleKey: 'secret-service-role-key-12345678',
  cronSecret: 'secret-cron-token-87654321',
};

// Mock factory to avoid live network requests and never expose production user records
function createMockClient(authUserMap: Record<string, { id: string } | null>) {
  return (url: string, key: string, opts?: any) => {
    const authHeader = opts?.global?.headers?.Authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '');

    return {
      auth: {
        getUser: async () => {
          if (!token || !authUserMap[token]) {
            return { data: { user: null }, error: { message: 'Invalid token' } };
          }
          return { data: { user: authUserMap[token] }, error: null };
        },
      },
    } as any;
  };
}

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

Deno.test('P0: rejects arbitrary garbage Bearer token (401)', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer arbitrary-non-empty-bearer-string' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
    assertEquals(res.error, 'Malformed or garbage JWT');
  }
});

Deno.test('P0: rejects forged 3-segment token that fails Supabase verification (401)', async () => {
  const mockFactory = createMockClient({}); // No token matches
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer header.payload.signature' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV, mockFactory);
  assertEquals('error' in res, true);
  if ('error' in res) {
    assertEquals(res.status, 401);
    assertEquals(res.error, 'Invalid or expired token');
  }
});

Deno.test('P0: accepts valid Supabase JWT and identifies auth.uid', async () => {
  const mockFactory = createMockClient({
    'valid.user.token': { id: 'user-uuid-1111' },
  });
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid.user.token' },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV, mockFactory);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    assertEquals(res.kind, 'user');
    assertEquals(res.userId, 'user-uuid-1111');
  }
});

Deno.test('P0: cross-user access attack is strictly rejected (403 Forbidden)', () => {
  const authContext = {
    kind: 'user' as const,
    userId: 'attacker-uuid-1111',
    client: {} as any,
  };

  // Attacker tries to trigger/read insights for victim-uuid-2222
  const targetCheck = authorizeTargetUsers(authContext, 'victim-uuid-2222');
  assertEquals(targetCheck.ok, false);
  if (!targetCheck.ok) {
    assertEquals(targetCheck.status, 403);
    assertEquals(targetCheck.error.includes('cross-user access denied'), true);
  }
});

Deno.test('P0: user querying self is authorized and scoped only to own ID', () => {
  const authContext = {
    kind: 'user' as const,
    userId: 'user-uuid-1111',
    client: {} as any,
  };

  const targetCheckExplicit = authorizeTargetUsers(authContext, 'user-uuid-1111');
  assertEquals(targetCheckExplicit.ok, true);
  if (targetCheckExplicit.ok) {
    assertEquals(targetCheckExplicit.targetUserIds, ['user-uuid-1111']);
  }

  const targetCheckImplicit = authorizeTargetUsers(authContext, null);
  assertEquals(targetCheckImplicit.ok, true);
  if (targetCheckImplicit.ok) {
    assertEquals(targetCheckImplicit.targetUserIds, ['user-uuid-1111']);
  }
});

Deno.test('P0: service role key authorizes batch or targeted execution', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_ENV.serviceRoleKey}` },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    assertEquals(res.kind, 'service_role');
    assertEquals(res.userId, null);

    // Can run batch
    const batchTarget = authorizeTargetUsers(res, null);
    assertEquals(batchTarget.ok, true);
    if (batchTarget.ok) {
      assertEquals(batchTarget.targetUserIds, null); // null indicates batch
    }

    // Can target a specific user for admin reprocessing
    const userTarget = authorizeTargetUsers(res, 'target-user-3333');
    assertEquals(userTarget.ok, true);
    if (userTarget.ok) {
      assertEquals(userTarget.targetUserIds, ['target-user-3333']);
    }
  }
});

Deno.test('P0: cron secret header authorizes scheduled batch execution', async () => {
  const req = new Request('https://mock.supabase.co/functions/v1/nova-insights', {
    method: 'POST',
    headers: { 'x-cron-secret': MOCK_ENV.cronSecret! },
  });
  const res = await authenticateNovaRequest(req, MOCK_ENV);
  assertEquals('kind' in res, true);
  if ('kind' in res) {
    assertEquals(res.kind, 'service_role');
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
