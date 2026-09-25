// Entitlement writes against production's REAL subscriptions/profiles definitions (mirror),
// executed through PostgREST exactly as novo-subscription (service role) does.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { mintJwt, rewriteFetch, resetDb, seedUser, sql, reloadSchemaCache } from './mirror';
import { grantProEntitlement, revokeProEntitlement } from '../../../supabase/functions/_shared/entitlement';

const svc = () => createClient('http://mirror.local', mintJwt('00000000-0000-0000-0000-000000000000', 'service_role'), {
  auth: { persistSession: false }, global: { fetch: rewriteFetch() },
});
const isPro = (uid: string) => sql(`select is_pro from public.profiles where id='${uid}'`);
const subs = (uid: string) => Number(sql(`select count(*) from public.subscriptions where user_id='${uid}'`));
const P = (uid: string) => ({ userId: uid, plan: 'annual' as const, store: 'PLAY_STORE', expiresAt: new Date(Date.now() + 365 * 864e5), rcEventId: 'evt' });

describe('novo-subscription entitlement writes — real schema', () => {
  it('REPRODUCTION: the OLD code path fails on the real schema (builder .catch TypeError, NOT NULL amount_paise, partial unique index)', async () => {
    resetDb(false); reloadSchemaCache();
    const uid = seedUser(0); const db = svc();
    // (1) old: `.upsert(...).catch(...)` on a query builder
    const q = db.from('subscriptions').upsert({ user_id: uid, plan: 'annual', status: 'active', store: 'PLAY_STORE', expires_at: new Date().toISOString() }, { onConflict: 'user_id,store' });
    expect(typeof (q as unknown as { catch?: unknown }).catch).toBe('undefined');           // -> TypeError in the old function
    // (2) even if it had been sent, production rejects it:
    const { error } = await q;
    console.log('[OLD upsert against real schema] error:', error?.code, '-', error?.message);
    expect(error).not.toBeNull();
    expect(subs(uid)).toBe(0);
    expect(isPro(uid)).toBe('f');
  });

  it('NEW grant: profile flagged Pro AND subscription recorded, using only schema-valid writes', async () => {
    resetDb(false);
    const uid = seedUser(0); const db = svc();
    const r = await grantProEntitlement(db, P(uid));
    console.log('[NEW grant]', JSON.stringify(r), 'is_pro', isPro(uid), 'subscription rows', subs(uid));
    expect(r.entitlementGranted).toBe(true); expect(r.subscriptionRecorded).toBe(true); expect(r.errors).toEqual([]);
    expect(isPro(uid)).toBe('t'); expect(subs(uid)).toBe(1);
  });

  it('renewal / repeat restore is idempotent: still exactly one active subscription row', async () => {
    resetDb(false);
    const uid = seedUser(0); const db = svc();
    await grantProEntitlement(db, P(uid)); await grantProEntitlement(db, P(uid)); await grantProEntitlement(db, P(uid));
    expect(subs(uid)).toBe(1); expect(isPro(uid)).toBe('t');
  });

  it('a profile that does not exist is reported as NOT granted (no false success)', async () => {
    resetDb(false);
    const r = await grantProEntitlement(svc(), P('11111111-1111-1111-1111-111111111111'));
    expect(r.entitlementGranted).toBe(false);
    expect(r.errors.join(' ')).toMatch(/no matching profile row|violates foreign key|profile/);
  });

  it('revoke clears is_pro and expires the active subscription', async () => {
    resetDb(false);
    const uid = seedUser(0); const db = svc();
    await grantProEntitlement(db, P(uid));
    const r = await revokeProEntitlement(db, uid);
    expect(r.entitlementGranted).toBe(true);
    expect(isPro(uid)).toBe('f');
    expect(sql(`select status from public.subscriptions where user_id='${uid}'`)).toBe('expired');
  });
});
