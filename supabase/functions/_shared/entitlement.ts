// deno-lint-ignore-file no-explicit-any
// ─────────────────────────────────────────────────────────────────────────────
// Entitlement writes for novo-subscription (RevenueCat webhook, verify_revenuecat,
// restore_purchases). Extracted so the behaviour is unit-testable and so every DB
// result is INSPECTED instead of assumed.
//
// Why this exists (V5 Day 1, verified against production 2026-09-25):
//  1. The old code chained `.catch()` onto Supabase query builders. Builders are
//     thenables with no `.catch`, so the expression threw TypeError BEFORE the query
//     was sent: no native purchase, restore or webhook could ever set profiles.is_pro.
//  2. `subscriptions.amount_paise` is NOT NULL (no default) and the old upserts never
//     supplied it, and production only has a PARTIAL unique index on (user_id, store)
//     WHERE status='active', which PostgREST's on_conflict=user_id,store cannot target.
//     So the subscription upsert could not succeed either.
// The entitlement flag on `profiles` is what the app gates on, so it is written FIRST
// and reported separately from best-effort subscription bookkeeping.
// ─────────────────────────────────────────────────────────────────────────────

type Db = any;

export type ProPlan = 'monthly' | 'annual';

export interface GrantParams {
  userId:     string;
  plan:       ProPlan;
  store:      string | null;
  expiresAt:  Date;
  rcEventId?: string | null;
}

export interface EntitlementOutcome {
  /** profiles.is_pro was really set (a row was matched and updated). The app gates on this. */
  entitlementGranted: boolean;
  /** subscriptions bookkeeping succeeded (informational; never blocks the entitlement). */
  subscriptionRecorded: boolean;
  errors: string[];
}

/** For builder chains: `await db.from(..).update(..).eq(..).then(logDbError('[label]'))`. Never throws. */
export function logDbError(label: string) {
  return (r: { error?: { message?: string } | null }) => {
    if (r?.error) console.error(label, r.error.message);
    return r;
  };
}

const msg = (e: unknown) => (e as { message?: string })?.message ?? String(e);

/** Insert-or-update the active subscription row for (user, store) without ON CONFLICT (the unique index is partial). */
async function recordNativeSubscription(db: Db, p: GrantParams): Promise<string | null> {
  const expires = p.expiresAt.toISOString();
  const store = p.store ?? 'UNKNOWN';

  const findActive = () => db.from('subscriptions').select('id')
    .eq('user_id', p.userId).eq('store', store).eq('status', 'active').limit(1).maybeSingle();
  const updateRow = (id: string) => db.from('subscriptions')
    .update({ plan: p.plan, expires_at: expires, rc_event_id: p.rcEventId ?? null }).eq('id', id);

  const found = await findActive();
  if (found.error) return `subscription lookup: ${msg(found.error)}`;

  if (found.data?.id) {
    const upd = await updateRow(found.data.id);
    return upd.error ? `subscription update: ${msg(upd.error)}` : null;
  }

  const ins = await db.from('subscriptions').insert({
    user_id: p.userId, plan: p.plan, status: 'active', store,
    expires_at: expires, rc_event_id: p.rcEventId ?? null,
    amount_paise: 0,            // NOT NULL column; store purchases are billed by the store, amount unknown here
    currency: 'INR',
  });
  if (!ins.error) return null;

  // Lost a race against the partial unique index (user_id, store) WHERE status='active': update the winner.
  if ((ins.error as { code?: string }).code === '23505') {
    const again = await findActive();
    if (again.data?.id) {
      const upd = await updateRow(again.data.id);
      return upd.error ? `subscription update: ${msg(upd.error)}` : null;
    }
  }
  return `subscription insert: ${msg(ins.error)}`;
}

export async function grantProEntitlement(db: Db, p: GrantParams): Promise<EntitlementOutcome> {
  const errors: string[] = [];

  // 1) The entitlement the app actually gates on. .select('id') so "0 rows matched" is detectable.
  const prof = await db.from('profiles')
    .update({ is_pro: true, pro_expires_at: p.expiresAt.toISOString() })
    .eq('id', p.userId).select('id');
  let entitlementGranted = true;
  if (prof.error) { entitlementGranted = false; errors.push(`profile update: ${msg(prof.error)}`); }
  else if (!prof.data || prof.data.length === 0) { entitlementGranted = false; errors.push('profile update: no matching profile row'); }

  // 2) Bookkeeping — reported, never silent, but does not undo a granted entitlement.
  const subErr = await recordNativeSubscription(db, p);
  if (subErr) errors.push(subErr);

  return { entitlementGranted, subscriptionRecorded: !subErr, errors };
}

export async function revokeProEntitlement(db: Db, userId: string): Promise<EntitlementOutcome> {
  const errors: string[] = [];
  const prof = await db.from('profiles').update({ is_pro: false, pro_expires_at: null }).eq('id', userId).select('id');
  let ok = true;
  if (prof.error) { ok = false; errors.push(`profile revoke: ${msg(prof.error)}`); }
  else if (!prof.data || prof.data.length === 0) { ok = false; errors.push('profile revoke: no matching profile row'); }

  const sub = await db.from('subscriptions').update({ status: 'expired' }).eq('user_id', userId).eq('status', 'active');
  if (sub.error) errors.push(`subscription expire: ${msg(sub.error)}`);

  return { entitlementGranted: ok, subscriptionRecorded: !sub.error, errors };
}
