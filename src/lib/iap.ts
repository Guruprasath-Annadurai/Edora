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

async function purchaseNative(planId: PlanId): Promise<{ success: boolean }> {
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

    // Server-side verification — server calls RevenueCat REST API using the user's
    // JWT to look up the entitlement. No sensitive data passed from client.
    const { data: { session } } = await supabase.auth.getSession();
    const { data: verifyResult, error: verifyErr } = await supabase.functions.invoke('novo-subscription', {
      body:    { action: 'verify_revenuecat' },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (verifyErr || !(verifyResult as { pro_active?: boolean })?.pro_active) {
      // RC entitlement check failed — may be propagation delay (RC can take ~5s after purchase).
      // The RC webhook will activate Pro when it arrives. Log for reconciliation.
      console.error('[IAP] Server verification did not confirm Pro:', verifyErr?.message ?? verifyResult);
    }

    track('pro_subscribed', { plan: planId, price: product.price_inr, platform: Capacitor.getPlatform() });
    return { success: true };

  } catch (err: unknown) {
    // User-cancelled — not an error
    if (
      (err as { userCancelled?: boolean }).userCancelled ||
      (err as Error)?.message?.includes('cancel')
    ) {
      return { success: false };
    }
    throw err;
  }
}

// ── Restore purchases (both platforms) ───────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  if (getIAPPlatform() === 'web') return false;
  if (!revenueCatReady) return false;
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { customerInfo } = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active['pro'];
  } catch {
    return false;
  }
}

// ── Unified public API ────────────────────────────────────────────────────────

export const IAP = {
  platform: getIAPPlatform(),
  products: PRODUCTS,

  async purchase(planId: PlanId): Promise<{ success: boolean }> {
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
