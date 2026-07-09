// Pure logic for picking the active "pro" entitlement out of a RevenueCat
// subscriber response. Extracted from novo-subscription/index.ts so the
// expiry/active-check logic can be unit tested without a live RC API call.

export interface RCEntitlement {
  expires_date?: string | null;
  [key: string]: unknown;
}

export interface RCSubscriberBody {
  subscriber?: { entitlements?: { active?: Record<string, RCEntitlement> } };
}

export function pickActiveEntitlement(
  body: RCSubscriberBody,
  now: Date = new Date(),
): RCEntitlement | null {
  const proEntitlement = body?.subscriber?.entitlements?.active?.['pro'] ?? null;
  if (!proEntitlement) return null;

  // expires_date null/absent = lifetime entitlement, never expires
  if (proEntitlement.expires_date) {
    const expiresAt = new Date(proEntitlement.expires_date);
    if (expiresAt <= now) return null;
  }

  return proEntitlement;
}
