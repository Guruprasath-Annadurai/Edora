import { describe, it, expect, vi, beforeEach } from 'vitest';

const cap = vi.hoisted(() => ({ native: true, platform: 'android' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => cap.platform } }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { getSession: () => getSession() } } }));

const rc = vi.hoisted(() => ({ restorePurchases: vi.fn(), configure: vi.fn(), setLogLevel: vi.fn(), getOfferings: vi.fn(), purchasePackage: vi.fn() }));
vi.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: rc, LOG_LEVEL: { WARN: 'WARN' } }));

import { restorePurchases, initRevenueCat, assertWebCheckoutAllowed } from '@/lib/iap';

beforeEach(async () => {
  invoke.mockReset(); getSession.mockReset(); Object.values(rc).forEach(f => f.mockReset());
  cap.native = true; cap.platform = 'android';
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } });
  rc.restorePurchases.mockResolvedValue({ customerInfo: { entitlements: { active: { pro: {} } } } });
  vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', 'test_key');
  await initRevenueCat('u1');
});

describe('restorePurchases — backend entitlement synchronisation', () => {
  it('asks the SERVER to restore and returns true only when the server confirms pro_active', async () => {
    invoke.mockResolvedValue({ data: { pro_active: true, source: 'revenuecat_restore' }, error: null });
    expect(await restorePurchases()).toBe(true);
    expect(rc.restorePurchases).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('novo-subscription', expect.objectContaining({ body: { action: 'restore_purchases' }, headers: { Authorization: 'Bearer jwt' } }));
  });

  it('REGRESSION: RevenueCat saying "active" is NOT enough — if the server says not active, restore is false', async () => {
    invoke.mockResolvedValue({ data: { pro_active: false }, error: null });
    expect(await restorePurchases()).toBe(false);          // old code returned true here (customerInfo flag) and skipped the backend
  });

  it('a server error is thrown (never presented as "no subscription found")', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx' } });
    await expect(restorePurchases()).rejects.toThrow(/could not confirm your subscription/i);
  });

  it('a failing store restore does not block the server-side check (DB-backed fallback)', async () => {
    rc.restorePurchases.mockRejectedValue(new Error('store unavailable'));
    invoke.mockResolvedValue({ data: { pro_active: true, source: 'db_fallback' }, error: null });
    expect(await restorePurchases()).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('requires a signed-in session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(restorePurchases()).rejects.toThrow(/sign in/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('web never calls the store or the restore action', async () => {
    cap.native = false; cap.platform = 'web';
    expect(await restorePurchases()).toBe(false);
    expect(rc.restorePurchases).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('Razorpay web checkout isolation', () => {
  it('assertWebCheckoutAllowed throws on Android and iOS, passes on web', () => {
    cap.native = true; cap.platform = 'android'; expect(() => assertWebCheckoutAllowed()).toThrow(/not available in the app/i);
    cap.platform = 'ios';                        expect(() => assertWebCheckoutAllowed()).toThrow();
    cap.native = false; cap.platform = 'web';    expect(() => assertWebCheckoutAllowed()).not.toThrow();
  });
});
