import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { grantProEntitlement, revokeProEntitlement, logDbError } from './entitlement.ts';

// Minimal thenable query-builder fake. Records every operation; results are scripted per "table.op".
type Res = { data?: unknown; error?: { message: string; code?: string } | null };
function fakeDb(script: Record<string, Res | Res[]>) {
  const ops: Array<{ table: string; op: string; payload?: unknown; filters: Record<string, unknown> }> = [];
  const nextFor = (key: string): Res => {
    const s = script[key];
    if (Array.isArray(s)) return s.shift() ?? { data: null, error: null };
    return s ?? { data: null, error: null };
  };
  const db = {
    from(table: string) {
      const state = { table, op: 'select', payload: undefined as unknown, filters: {} as Record<string, unknown> };
      const b: any = {
        select() { return b; },
        insert(p: unknown) { state.op = 'insert'; state.payload = p; return b; },
        update(p: unknown) { state.op = 'update'; state.payload = p; return b; },
        eq(k: string, v: unknown) { state.filters[k] = v; return b; },
        limit() { return b; },
        maybeSingle() { state.op = state.op === 'select' ? 'select' : state.op; return b; },
        then(res: (r: Res) => unknown) { ops.push({ ...state, filters: { ...state.filters } }); return Promise.resolve(nextFor(`${table}.${state.op}`)).then(res); },
      };
      return b;
    },
  };
  return { db, ops };
}

const P = { userId: 'u1', plan: 'annual' as const, store: 'PLAY_STORE', expiresAt: new Date('2027-01-01T00:00:00Z'), rcEventId: 'evt1' };

Deno.test('grant: sets profiles.is_pro FIRST and inserts a schema-valid subscription (amount_paise supplied, no ON CONFLICT)', async () => {
  const { db, ops } = fakeDb({ 'profiles.update': { data: [{ id: 'u1' }], error: null }, 'subscriptions.select': { data: null, error: null }, 'subscriptions.insert': { data: null, error: null } });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.entitlementGranted, true); assertEquals(r.subscriptionRecorded, true); assertEquals(r.errors, []);
  assertEquals(ops[0].table, 'profiles'); assertEquals((ops[0].payload as any).is_pro, true);
  const ins = ops.find(o => o.table === 'subscriptions' && o.op === 'insert')!;
  assertEquals((ins.payload as any).amount_paise, 0);
  assertEquals((ins.payload as any).status, 'active');
  assert(!ops.some(o => o.op === 'upsert'));
});

Deno.test('grant: renewal updates the existing active row instead of inserting a duplicate', async () => {
  const { db, ops } = fakeDb({ 'profiles.update': { data: [{ id: 'u1' }] }, 'subscriptions.select': { data: { id: 's1' } }, 'subscriptions.update': { error: null } });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.entitlementGranted, true);
  assert(!ops.some(o => o.table === 'subscriptions' && o.op === 'insert'));
  assertEquals(ops.find(o => o.table === 'subscriptions' && o.op === 'update')!.filters['id'], 's1');
});

Deno.test('grant: a profile-update ERROR means the entitlement is NOT granted and is reported (never assumed)', async () => {
  const { db } = fakeDb({ 'profiles.update': { data: null, error: { message: 'permission denied' } } });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.entitlementGranted, false);
  assert(r.errors.some(e => e.includes('profile update: permission denied')));
});

Deno.test('grant: zero matched profile rows is a failure, not a silent success', async () => {
  const { db } = fakeDb({ 'profiles.update': { data: [], error: null } });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.entitlementGranted, false);
  assert(r.errors.some(e => e.includes('no matching profile row')));
});

Deno.test('grant: subscription bookkeeping failure is reported but does not undo a granted entitlement', async () => {
  const { db } = fakeDb({ 'profiles.update': { data: [{ id: 'u1' }] }, 'subscriptions.select': { data: null }, 'subscriptions.insert': { error: { message: 'boom', code: '23502' } } });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.entitlementGranted, true); assertEquals(r.subscriptionRecorded, false);
  assert(r.errors.some(e => e.includes('subscription insert: boom')));
});

Deno.test('grant: losing the race on the partial unique index (23505) falls back to updating the winner', async () => {
  const { db, ops } = fakeDb({
    'profiles.update': { data: [{ id: 'u1' }] },
    'subscriptions.select': [{ data: null }, { data: { id: 'sWin' } }],
    'subscriptions.insert': { error: { message: 'duplicate', code: '23505' } },
    'subscriptions.update': { error: null },
  });
  const r = await grantProEntitlement(db, P);
  assertEquals(r.subscriptionRecorded, true);
  assertEquals(ops.find(o => o.table === 'subscriptions' && o.op === 'update')!.filters['id'], 'sWin');
});

Deno.test('revoke: clears is_pro and expires the active subscription; errors are reported', async () => {
  const { db, ops } = fakeDb({ 'profiles.update': { data: [{ id: 'u1' }] }, 'subscriptions.update': { error: null } });
  const r = await revokeProEntitlement(db, 'u1');
  assertEquals(r.entitlementGranted, true);
  assertEquals((ops[0].payload as any).is_pro, false);
  const { db: db2 } = fakeDb({ 'profiles.update': { error: { message: 'nope' } } });
  assertEquals((await revokeProEntitlement(db2, 'u1')).entitlementGranted, false);
});

Deno.test('logDbError never throws and passes the result through', () => {
  assertEquals(logDbError('[x]')({ error: { message: 'e' } }).error?.message, 'e');
  assertEquals(logDbError('[x]')({ error: null }).error, null);
});
