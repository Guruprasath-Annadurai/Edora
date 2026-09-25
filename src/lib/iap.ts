// ─────────────────────────────────────────────────────────────────────────────
// In-App Purchase abstraction — Google Play Billing compliant
//
// BOTH iOS and Android go through RevenueCat, which wraps:
//   iOS     → StoreKit 2
//   Android → Google Play Billing API (required by Play policies)
//
// Web path: redirects to Stripe-hosted checkout (not IAP, not a digital good
//           purchased inside the app — exempted from Play policy)
//
// Setup checklist:
//   1. npm install @revenuecat/purchases-capacitor && npx cap sync
//   2. Set VITE_REVENUECAT_IOS_KEY in .env (RevenueCat iOS app key)
//   3. Set VITE_REVENUECAT_ANDROID_KEY in .env (RevenueCat Android app key)
//   4. Configure products in RevenueCat dashboard — link to both stores
//   5. Deploy supabase/functions/novo-subscription with verify_revenuecat action
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor }  from '@capacitor/core';
import { supabase }   from '@/lib/supabase';
import { track }      from '@/lib/analytics';

export type PlanId = 'pro_monthly' | 'pro_annual';

export interface IAPProduct {
  id:          PlanId;
  title:       string;
  description: string;
  price:       string;        // formatted display price
  price_inr:   number;        // paise for Stripe web fallback
  store_id:    string;        // App Store / Play Store product ID
  rc_package:  string;        // RevenueCat package identifier
}

export const PRODUCTS: Record<PlanId, IAPProduct> = {
  pro_monthly: {
    id:          'pro_monthly',
    title:       'Edora Pro Monthly',
    description: 'Full Novo AI access · cancel anytime',
    price:       '₹99/month',
    price_inr:   9900,
    store_id:    'com.edora.app.pro_monthly',
    rc_package:  '$rc_monthly',
  },
  pro_annual: {
    id:          'pro_annual',
    title:       'Edora Pro Annual',
    description: 'Best value — save 41%',
    price:       '₹699/year',
    price_inr:   69900,
    store_id:    'com.edora.app.pro_annual',
    rc_package:  '$rc_annual',
  },
};

// ── Platform detection ────────────────────────────────────────────────────────

export function getIAPPlatform(): 'ios' | 'android' | 'web' {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

// ── RevenueCat init — call once at app start with the authenticated user id ──

let revenueCatReady = false;

export async function initRevenueCat(userId?: string): Promise<void> {
  const platform = getIAPPlatform();
  if (platform === 'web' || revenueCatReady) return;

  const iosKey     = import.meta.env.VITE_REVENUECAT_IOS_KEY     as string | undefined;
  const androidKey = import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;
  const apiKey     = platform === 'ios' ? iosKey : androidKey;
  if (!apiKey) {
    console.warn('[IAP] RevenueCat key not configured for', platform);
    return;
  }

  try {
    const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey, appUserID: userId });
    revenueCatReady = true;
  } catch (err) {
    console.error('[IAP] RevenueCat init failed:', (err as Error)?.message ?? err);
  }
}

// ── Core purchase via RevenueCat (iOS + Android) ──────────────────────────────

export type PurchaseState = 'confirmed' | 'pending_activation' | 'cancelled';
export interface PurchaseResult {
  /** true ONLY when the backend confirmed profiles.is_pro (state === 'confirmed'). */
  success: boolean;
  state: PurchaseState;
}

/** Bounded reconciliation: gaps (ms) between verify attempts after the first one. */
export const VERIFY_RETRY_DELAYS_MS = [3000, 4000, 5000];

async function verifyBackendPro(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  try {
    const { data, error } = await supabase.functions.invoke('novo-subscription', {
      body:    { action: 'verify_revenuecat' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    return !error && (data as { pro_active?: boolean } | null)?.pro_active === true;
  } catch {
    return false;
  }
}

/**
 * Re-check the backend entitlement WITHOUT touching the store (no repurchase, no double billing).
 * Used by the "Check status" action after a purchase that is still pending activation.
 */
export async function confirmProActivation(): Promise<boolean> {
  return verifyBackendPro();
}

async function purchaseNative(planId: PlanId): Promise<PurchaseResult> {
  if (!revenueCatReady) throw new Error('Payment service is not ready. Please restart the app and try again.');

  const product = PRODUCTS[planId];
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');

    const offerings = await Purchases.getOfferings();
    // Try matching by package identifier first, then by product store_id
    const allPackages = [
      ...(offerings.current?.availablePackages ?? []),
      ...Object.values(offerings.all ?? {}).flatMap(o => o.availablePackages ?? []),
    ];
    const pkg = allPackages.find(
      p => p.identifier === product.rc_package || p.product.identifier === product.store_id
    );
    if (!pkg) throw new Error(`Plan "${product.title}" is not available right now. Please try again later.`);

    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const activeEntitlement = customerInfo.entitlements.active['pro'];
    if (!activeEntitlement) throw new Error('Purchase completed but access was not granted. Contact support if this persists.');

    // Server-side verification (idempotent; the store purchase is already complete, so this
    // never re-purchases). RevenueCat can take several seconds to expose a fresh purchase,
    // so reconcile for a bounded time before reporting "pending".
    let confirmed = await verifyBackendPro();
    for (const delay of VERIFY_RETRY_DELAYS_MS) {
      if (confirmed) break;
      await new Promise(r => setTimeout(r, delay));
      confirmed = await verifyBackendPro();
    }
    if (!confirmed) {
      // Store purchase is real; the RC webhook / a later status check will activate Pro.
      console.error('[IAP] Store purchase completed but backend Pro not yet confirmed');
    }

    track('pro_subscribed', { plan: planId, price: product.price_inr, platform: Capacitor.getPlatform(), confirmed });
    return confirmed
      ? { success: true, state: 'confirmed' }
      : { success: false, state: 'pending_activation' };

  } catch (err: unknown) {
    // User-cancelled — not an error
    if (
      (err as { userCancelled?: boolean }).userCancelled ||
      (err as Error)?.message?.includes('cancel')
    ) {
      return { success: false, state: 'cancelled' };
    }
    throw err;
  }
}

// ── Restore purchases (both platforms) ───────────────────────────────────────

/**
 * Restore purchases and CONFIRM the entitlement with the backend.
 *
 * The backend (novo-subscription `restore_purchases`) is the source of truth: it verifies
 * with RevenueCat's REST API and writes profiles.is_pro. Returning RevenueCat's local
 * "entitlement active" flag here — as this function used to — lets the UI say "restored"
 * while the backend flag (which gates every Pro feature) is unchanged.
 *
 * Resolves true ONLY when the server confirms pro_active. Throws (rather than returning
 * false) when the server could not be reached or refused, so callers never present a sync
 * failure as "no subscription found".
 */
export async function restorePurchases(): Promise<boolean> {
  if (getIAPPlatform() === 'web') return false;

  // 1) Ask the store/RevenueCat to re-associate purchases with this account. Best-effort:
  //    a failure here must not prevent the server-side (DB-backed) check below.
  if (revenueCatReady) {
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      await Purchases.restorePurchases();
    } catch (err) {
      console.warn('[IAP] store restore failed, continuing with server check:', (err as Error)?.message);
    }
  }

  // 2) Server-side entitlement sync.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again to restore your purchases.');
  const { data, error } = await supabase.functions.invoke('novo-subscription', {
    body:    { action: 'restore_purchases' },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    console.error('[IAP] restore_purchases server error:', error.message);
    throw new Error('We could not confirm your subscription with the server. Check your connection and try again.');
  }
  return (data as { pro_active?: boolean } | null)?.pro_active === true;
}

/** Web checkout (Razorpay) must never run inside the native Android/iOS app: digital content there is sold through the store. */
export function assertWebCheckoutAllowed(): void {
  if (getIAPPlatform() !== 'web') {
    throw new Error('Web checkout is not available in the app. Please use the in-app purchase.');
  }
}

// ── Unified public API ────────────────────────────────────────────────────────

export const IAP = {
  platform: getIAPPlatform(),
  products: PRODUCTS,

  async purchase(planId: PlanId): Promise<PurchaseResult> {
    const platform = getIAPPlatform();
    track('pro_checkout_started', { plan: planId, price: PRODUCTS[planId].price_inr });

    if (platform === 'ios' || platform === 'android') {
      return purchaseNative(planId);
    }

    // Web — payment handled by ProSubscriptionPage directly (not in-app purchase)
    throw new Error('Use the web checkout flow for browser purchases');
  },

  restorePurchases,
};
