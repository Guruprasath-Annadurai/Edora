// ─────────────────────────────────────────────────────────────────────────────
// novo-subscription — Razorpay-powered Novo Pro subscription
//
// Actions:
//   create_order    — create Razorpay order, return order_id + key_id
//   verify_payment  — verify HMAC-SHA256 signature, activate Pro
//   get_status      — return current subscription + Pro status
//   cancel          — mark subscription as cancelled (expires at period end)
//
// Pricing (INR, student-friendly):
//   monthly: ₹99   (9900 paise)
//   annual:  ₹699  (69900 paise)  ← saves ₹489 vs monthly = ~41% off
//
// Requires Supabase secrets:
//   RAZORPAY_KEY_ID      — your Razorpay Key ID    (rzp_live_xxx or rzp_test_xxx)
//   RAZORPAY_KEY_SECRET  — your Razorpay Key Secret
//   REVENUECAT_SECRET_KEY — RevenueCat secret key (sk_...) for server-side verification
//                          Set via: supabase secrets set REVENUECAT_SECRET_KEY=sk_...
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors } from '../_shared/cors.ts';


import { withSentry } from '../_shared/sentry.ts';
import { pickActiveEntitlement } from '../_shared/rcEntitlement.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { logAdminAction } from '../_shared/auditLog.ts';
// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS: Record<string, { amount_paise: number; label: string; months: number }> = {
  monthly: { amount_paise: 9900,  label: '₹99/month',  months: 1  },
  annual:  { amount_paise: 69900, label: '₹699/year',  months: 12 },
};

// ── HMAC-SHA256 for Razorpay signature verification ───────────────────────────
async function hmacSHA256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── RevenueCat server-side entitlement verification ──────────────────────────
// Returns the active 'pro' entitlement object from RC, or null if not active.
// Calls https://api.revenuecat.com/v1/subscribers/{userId} with the SECRET key.
// REVENUECAT_SECRET_KEY must be set in Supabase secrets (starts with sk_).
interface RCEntitlement {
  expires_date:         string | null;  // ISO-8601 or null for lifetime
  product_identifier:   string;
  store:                string;         // 'app_store' | 'play_store' | 'stripe'
}

async function verifyRevenueCatEntitlement(
  userId: string,
): Promise<RCEntitlement | null> {
  const rcSecretKey = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!rcSecretKey) {
    console.error('[RC] REVENUECAT_SECRET_KEY not set — cannot verify entitlement');
    return null;
  }

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: {
      'Authorization': `Bearer ${rcSecretKey}`,
      'Content-Type':  'application/json',
      'X-Platform':    'android',
    },
  });

  if (!res.ok) {
    console.error(`[RC] Subscriber lookup failed: ${res.status}`);
    return null;
  }

  const body = await res.json();
  return pickActiveEntitlement(body);
}

// ── Razorpay API call helper ──────────────────────────────────────────────────
async function razorpay(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<Response> {
  const keyId     = Deno.env.get('RAZORPAY_KEY_ID')!;
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;
  const auth      = btoa(`${keyId}:${keySecret}`);

  return fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

serve(withSentry('novo-subscription', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ── Razorpay Webhook handler (no user JWT — Razorpay server calls this) ────
  // Must be checked BEFORE the auth gate since Razorpay doesn't send a JWT.
  const webhookSignature = req.headers.get('x-razorpay-signature');
  if (webhookSignature) {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('[webhook] RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook');
      return json({ error: 'Webhook not configured' }, 500);
    }

    // Read raw body for signature verification (must not parse JSON first)
    const rawBody = await req.text();

    // Verify HMAC-SHA256 signature: Razorpay signs the raw JSON body
    const expectedSig = await hmacSHA256(webhookSecret, rawBody);
    if (expectedSig !== webhookSignature) {
      console.error('[webhook] Signature mismatch — possible spoofed webhook');
      return json({ error: 'Invalid webhook signature' }, 400);
    }

    // Signature valid — parse and handle the event
    let event: { event: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
    try { event = JSON.parse(rawBody); }
    catch { return json({ error: 'Invalid webhook JSON' }, 400); }

    const eventType = event.event ?? '';
    console.log(`[webhook] Received event: ${eventType}`);

    // payment.captured — secondary confirmation (primary is verify_payment from client)
    if (eventType === 'payment.captured') {
      const payment   = event.payload?.payment?.entity ?? {};
      const paymentId = payment.id as string | undefined;
      const orderId   = payment.order_id as string | undefined;

      if (paymentId && orderId) {
        // Look up user_id from OUR database using the order_id.
        // NEVER trust notes.user_id from the Razorpay payload — it can be forged
        // by anyone who knows a valid Razorpay order_id.
        const { data: pendingSub } = await supabase
          .from('subscriptions')
          .select('user_id, plan')
          .eq('razorpay_order_id', orderId)
          .eq('status', 'pending_payment')
          .maybeSingle();

        if (!pendingSub) {
          console.warn(`[webhook] No pending subscription for order ${orderId} — ignoring payment.captured`);
          return json({ received: true, event: eventType });
        }

        const userId = pendingSub.user_id;
        const plan   = pendingSub.plan as string;

        // Ensure Pro is activated even if the client-side verify_payment call failed
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('razorpay_payment_id', paymentId)
          .maybeSingle();

        const planDetails = PLANS[plan];
        if (!planDetails) {
          console.error(`[webhook] Unknown plan "${plan}" for order ${orderId}`);
          return json({ received: true, event: eventType });
        }

        // Determine expiry — use stored value on retry (sub exists), calculate fresh otherwise
        let expiresAt: Date;
        if (existingSub) {
          // Razorpay retry path: subscription row already exists, just ensure profile is active
          expiresAt = new Date(existingSub.expires_at);
        } else {
          const now = new Date();
          expiresAt = new Date(now);
          expiresAt.setMonth(expiresAt.getMonth() + planDetails.months);

          const { error: insertErr } = await supabase.from('subscriptions').insert({
            user_id:             userId,
            plan,
            status:              'active',
            razorpay_order_id:   orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature:  'webhook',
            amount_paise:        planDetails.amount_paise,
            currency:            'INR',
            starts_at:           now.toISOString(),
            expires_at:          expiresAt.toISOString(),
          });

          if (insertErr) {
            // Log for ops — the next get_status call will self-heal via the activation_pending check
            console.error('[webhook] CRITICAL: subscription insert failed for paying user', userId, insertErr.message);
            // Still return 200: Razorpay has confirmed payment, retrying won't help a DB constraint error.
            // get_status self-heals profile mismatches; support can query pending_payment rows.
            return json({ received: true, event: eventType, note: 'subscription insert failed — manual review needed' });
          }
        }

        // Always (re)apply profile update — idempotent, handles retry path too
        const { error: profileErr } = await supabase.from('profiles').update({
          is_pro:         true,
          pro_expires_at: expiresAt.toISOString(),
        }).eq('id', userId);

        if (profileErr) {
          // Subscription row is committed; get_status will detect the mismatch and self-heal on next open.
          console.error('[webhook] CRITICAL: profile update failed for paying user', userId, profileErr.message);
          // Return 200 — sub record exists; self-healing in get_status will fix the profile gap.
          return json({ received: true, event: eventType, note: 'profile update failed — self-heal pending' });
        }

        console.log(`[webhook] Pro activated for user ${userId} (payment ${paymentId}, expires ${expiresAt.toISOString()})`);
        await logAdminAction(supabase, {
          actorId: userId, actorRole: 'service',
          action: 'subscription_activated', source: 'novo-subscription:razorpay_webhook',
          targetId: paymentId, metadata: { order_id: orderId, plan, expires_at: expiresAt.toISOString() },
        });
      }
    }

    // payment.failed — log for support team, no DB changes needed
    if (eventType === 'payment.failed') {
      const payment = event.payload?.payment?.entity ?? {};
      console.warn(`[webhook] Payment failed: order=${payment.order_id}, error=${(payment.error_description as string) ?? 'unknown'}`);
    }

    // Always return 200 to Razorpay to prevent retries
    return json({ received: true, event: eventType });
  }

  // ── RevenueCat Webhook handler (iOS/Android native IAP via StoreKit/Play) ───
  // RC sends: Authorization: Bearer <RC_WEBHOOK_SECRET>
  // Events: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE,
  //         PRODUCT_CHANGE, TRANSFER, UNCANCELLATION
  // app_user_id must equal the Supabase user.id (set via RC.logIn(userId) on client)
  const rcAuthHeader = req.headers.get('Authorization') ?? '';
  const rcSecret     = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  if (rcSecret && rcAuthHeader === `Bearer ${rcSecret}`) {
    let rcBody: Record<string, unknown>;
    try { rcBody = await req.json(); }
    catch { return json({ error: 'Invalid RC webhook JSON' }, 400); }

    const rcEvent   = rcBody.event as Record<string, unknown> | undefined;
    const eventType = (rcEvent?.type ?? '') as string;
    const userId    = rcEvent?.app_user_id as string | undefined;  // == supabase user.id

    console.log(`[rc_webhook] ${eventType} user=${userId}`);

    if (!userId) return json({ received: true, note: 'no app_user_id — skipped' });

    // Map RC product_id → plan
    const productId = (rcEvent?.product_id ?? '') as string;
    const plan      = productId.includes('annual') ? 'annual' : 'monthly';
    const planDays  = plan === 'annual' ? 365 : 31;

    // expiration_at_ms from RC (milliseconds UTC). Fallback: now + plan days.
    const expiresAt = rcEvent?.expiration_at_ms
      ? new Date(rcEvent.expiration_at_ms as number)
      : (() => { const d = new Date(); d.setDate(d.getDate() + planDays); return d; })();

    if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL' || eventType === 'UNCANCELLATION') {
      // Upsert subscription row keyed on (user_id, store) to handle renewals idempotently
      const store = (rcEvent?.store ?? 'PLAY_STORE') as string;
      await supabase.from('subscriptions').upsert({
        user_id:      userId,
        plan,
        status:       'active',
        store,
        expires_at:   expiresAt.toISOString(),
        rc_event_id:  rcEvent?.id as string ?? null,
      }, { onConflict: 'user_id,store' }).catch(e =>
        console.error('[rc_webhook] sub upsert failed:', e?.message)
      );

      await supabase.from('profiles').update({
        is_pro:         true,
        pro_expires_at: expiresAt.toISOString(),
      }).eq('id', userId).catch(e =>
        console.error('[rc_webhook] profile update failed:', e?.message)
      );

      if (eventType === 'INITIAL_PURCHASE') {
        await supabase.from('novo_memories').insert({
          user_id:     userId,
          memory_type: 'milestone',
          content:     `Upgraded to Novo Pro (${plan}) via ${store} — now has unlimited AI, voice mode, and advanced analytics`,
          importance:  8,
          source:      'system',
        }).catch(e => console.error('[rc_webhook] milestone memory insert failed:', e?.message));
      }
    }

    if (eventType === 'CANCELLATION') {
      // Mark cancelled but keep Pro until expiry — do NOT revoke is_pro yet
      await supabase.from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'active')
        .catch(e => console.error('[rc_webhook] cancel update failed:', e?.message));
      await logAdminAction(supabase, {
        actorId: userId, actorRole: 'service',
        action: 'subscription_cancelled', source: 'novo-subscription:rc_webhook',
      });
    }

    if (eventType === 'EXPIRATION') {
      // Subscription fully expired — revoke Pro access
      await supabase.from('subscriptions')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('status', 'active')
        .catch(e => console.error('[rc_webhook] expire update failed:', e?.message));
      await logAdminAction(supabase, {
        actorId: userId, actorRole: 'service',
        action: 'subscription_expired', source: 'novo-subscription:rc_webhook',
      });

      await supabase.from('profiles').update({
        is_pro:         false,
        pro_expires_at: null,
      }).eq('id', userId).catch(e =>
        console.error('[rc_webhook] profile revoke failed:', e?.message)
      );
    }

    if (eventType === 'BILLING_ISSUE') {
      // Grace period: keep Pro active, log for support. RevenueCat retries billing.
      console.warn(`[rc_webhook] BILLING_ISSUE for user ${userId} — grace period active`);
      // Keep is_pro true — RevenueCat will send EXPIRATION if billing never resolves
    }

    if (eventType === 'PRODUCT_CHANGE') {
      // Plan change (monthly → annual or vice versa) — update plan on active sub
      await supabase.from('subscriptions')
        .update({ plan, expires_at: expiresAt.toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active')
        .catch(e => console.error('[rc_webhook] product_change update failed:', e?.message));

      await supabase.from('profiles').update({
        pro_expires_at: expiresAt.toISOString(),
      }).eq('id', userId).catch(e =>
        console.error('[rc_webhook] product_change profile update failed:', e?.message)
      );
    }

    if (eventType === 'TRANSFER') {
      // Subscription transferred (e.g. user logged into different account on same device)
      // transferred_to is the new app_user_id
      const newUserId = rcEvent?.transferred_to as string | undefined;
      if (newUserId) {
        await supabase.from('profiles').update({ is_pro: false, pro_expires_at: null })
          .eq('id', userId).catch(e =>
            console.error('[rc_webhook] transfer revoke (old user) failed:', e?.message)
          );
        await supabase.from('profiles').update({ is_pro: true, pro_expires_at: expiresAt.toISOString() })
          .eq('id', newUserId).catch(e =>
            console.error('[rc_webhook] transfer grant (new user) failed:', e?.message)
          );
        console.log(`[rc_webhook] TRANSFER from ${userId} to ${newUserId}`);
      }
    }

    return json({ received: true, event: eventType });
  }

  // ── All other actions require an authenticated Supabase user ────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  if (!keyId) return json({ error: 'Razorpay not configured. Contact support.' }, 500);

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // Money-path abuse guard — tight cap on order creation, looser on read-only actions
  const rlMax = action === 'create_order' ? 10 : action === 'verify_payment' ? 20 : 60;
  const rl = await checkRateLimit(supabase, user.id, `novo_subscription_${action}`, rlMax, 60);
  if (!rl.allowed) {
    return json({ error: 'Too many requests. Try again later.', retry_after_secs: rl.retryAfterSecs }, 429);
  }

  // ── create_order ──────────────────────────────────────────────────────────
  if (action === 'create_order') {
    const { plan } = body;
    const planDetails = PLANS[plan as string];
    if (!planDetails) return json({ error: 'plan must be "monthly" or "annual"' }, 400);

    // Check if already Pro
    const { data: profile } = await supabase
      .from('profiles').select('is_pro, pro_expires_at, full_name').eq('id', user.id).single();

    const isPro = profile?.is_pro && (
      !profile.pro_expires_at || new Date(profile.pro_expires_at) > new Date()
    );
    if (isPro) return json({ error: 'You already have an active Pro subscription' }, 400);

    const receipt = `novo_${plan}_${user.id.slice(0, 8)}_${Date.now()}`;

    const rzRes = await razorpay('/orders', 'POST', {
      amount:   planDetails.amount_paise,
      currency: 'INR',
      receipt,
      notes: {
        user_id: user.id,
        plan,
        app: 'edora',
      },
    });

    if (!rzRes.ok) {
      const err = await rzRes.json().catch(() => ({}));
      return json({ error: `Razorpay error: ${JSON.stringify(err)}` }, 500);
    }

    const order = await rzRes.json();

    // Store pending order so the webhook can look up user_id without trusting payload notes
    await supabase.from('subscriptions').upsert({
      user_id:           user.id,
      plan,
      status:            'pending_payment',
      razorpay_order_id: order.id,
      amount_paise:      planDetails.amount_paise,
      currency:          'INR',
    }, { onConflict: 'razorpay_order_id' })
      .catch(err => console.error('[create_order] pending record failed:', err?.message));

    return json({
      order_id:    order.id,
      amount:      planDetails.amount_paise,
      currency:    'INR',
      key_id:      keyId,     // Safe to expose — this is the public key
      plan,
      plan_label:  planDetails.label,
      prefill: {
        name:  profile?.full_name ?? '',
        email: user.email ?? '',
      },
    });
  }

  // ── verify_payment ────────────────────────────────────────────────────────
  if (action === 'verify_payment') {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan) {
      return json({ error: 'razorpay_order_id, razorpay_payment_id, razorpay_signature and plan required' }, 400);
    }

    const planDetails = PLANS[plan as string];
    if (!planDetails) return json({ error: 'Invalid plan' }, 400);

    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // Verify Razorpay HMAC-SHA256 signature
    const expectedSig = await hmacSHA256(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expectedSig !== razorpay_signature) {
      return json({ error: 'Invalid payment signature. Do not retry — contact support.' }, 400);
    }

    // ── Idempotency guard — prevent duplicate subscriptions ──────────────────
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, expires_at, status')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();

    if (existing) {
      // Already processed — return success without inserting duplicate
      return json({
        subscription:    existing,
        pro_active:      true,
        expires_at:      existing.expires_at,
        already_verified: true,
      });
    }

    // Signature valid → activate Pro
    const now       = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + planDetails.months);

    // Insert subscription record
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .insert({
        user_id:              user.id,
        plan,
        status:               'active',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount_paise:         planDetails.amount_paise,
        currency:             'INR',
        starts_at:            now.toISOString(),
        expires_at:           expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (subErr) return json({ error: subErr.message }, 500);

    // Activate Pro on profile
    await supabase.from('profiles').update({
      is_pro:         true,
      pro_expires_at: expiresAt.toISOString(),
    }).eq('id', user.id);

    // Save milestone memory (non-fatal)
    await supabase.from('novo_memories').insert({
      user_id:     user.id,
      memory_type: 'milestone',
      content:     `Upgraded to Novo Pro (${planDetails.label}) — now has access to voice mode, advanced analytics, and unlimited certifications`,
      importance:  8,
      source:      'system',
    }).catch(e => console.error('[verify_payment] milestone memory insert failed:', e?.message));

    return json({ subscription: sub, pro_active: true, expires_at: expiresAt.toISOString() });
  }

  // ── get_status ────────────────────────────────────────────────────────────
  if (action === 'get_status') {
    const [{ data: profile }, { data: subs }] = await Promise.all([
      supabase.from('profiles').select('is_pro, pro_expires_at').eq('id', user.id).single(),
      supabase.from('subscriptions')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(5),
    ]);

    const now    = new Date();
    const isPro  = profile?.is_pro && (!profile.pro_expires_at || new Date(profile.pro_expires_at) > now);
    const active = (subs ?? []).find(s => s.status === 'active' && new Date(s.expires_at) > now);

    // Self-healing: subscription says active but profile was never flagged Pro (webhook profile-update failure).
    // Fix it silently so the student gets their access without contacting support.
    if (active && !isPro) {
      console.log(`[get_status] Self-healing Pro for user ${user.id} — sub active but profile not flagged`);
      await supabase.from('profiles').update({
        is_pro:         true,
        pro_expires_at: active.expires_at,
      }).eq('id', user.id).catch(err =>
        console.error('[get_status] self-heal failed:', err?.message)
      );
    }

    return json({
      is_pro:         isPro || !!active,
      pro_expires_at: active?.expires_at ?? profile?.pro_expires_at ?? null,
      active_plan:    active?.plan ?? null,
      subscriptions:  subs ?? [],
    });
  }

  // ── cancel ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    // Mark the active subscription as cancelled (expires at period end, Pro remains until then)
    const { data: activeSub } = await supabase
      .from('subscriptions')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeSub) return json({ error: 'No active subscription found' }, 404);

    await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', activeSub.id);
    await logAdminAction(supabase, {
      actorId: user.id, actorRole: 'user',
      action: 'subscription_cancelled', source: 'novo-subscription:cancel', targetId: activeSub.id,
    });

    return json({
      cancelled: true,
      pro_until: activeSub.expires_at,
      message:   `Your Pro access continues until ${new Date(activeSub.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    });
  }

  // ── verify_revenuecat — client calls after native IAP completes ─────────────
  // Server verifies the purchase with RevenueCat REST API before granting Pro.
  // REVENUECAT_SECRET_KEY must be set in Supabase secrets.
  if (action === 'verify_revenuecat') {
    const entitlement = await verifyRevenueCatEntitlement(user.id);
    if (!entitlement) {
      console.warn(`[verify_revenuecat] No active RC entitlement for user ${user.id}`);
      return json({ error: 'No active Pro entitlement found. Purchase may still be processing — try again in a few seconds.' }, 402);
    }

    const plan      = entitlement.product_identifier.includes('annual') ? 'annual' : 'monthly';
    const expiresAt = entitlement.expires_date
      ? new Date(entitlement.expires_date)
      : (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 99); return d; })(); // lifetime

    await supabase.from('subscriptions').upsert({
      user_id:    user.id,
      plan,
      status:     'active',
      store:      entitlement.store,
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'user_id,store' }).catch(e =>
      console.error('[verify_revenuecat] subscription upsert failed:', e?.message)
    );

    await supabase.from('profiles').update({
      is_pro:         true,
      pro_expires_at: expiresAt.toISOString(),
    }).eq('id', user.id);

    return json({ pro_active: true, expires_at: expiresAt.toISOString(), plan });
  }

  // ── restore_purchases — called on reinstall to re-sync Pro status ──────────
  // Verifies with RevenueCat REST API before restoring. Falls back to DB if RC
  // shows no entitlement (covers Razorpay/web subscribers not in RC).
  if (action === 'restore_purchases') {
    const entitlement = await verifyRevenueCatEntitlement(user.id);

    if (!entitlement) {
      // RC shows no active entitlement — check DB (covers Razorpay/web subscribers)
      const { data: activeSub } = await supabase
        .from('subscriptions')
        .select('expires_at, plan, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const stillActive = activeSub && new Date(activeSub.expires_at as string) > new Date();
      return json({
        pro_active: stillActive,
        expires_at: activeSub?.expires_at ?? null,
        source:     'db_fallback',
      });
    }

    // RC confirmed active — restore Pro
    const plan      = entitlement.product_identifier.includes('annual') ? 'annual' : 'monthly';
    const expiresAt = entitlement.expires_date
      ? new Date(entitlement.expires_date)
      : (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 99); return d; })();

    await supabase.from('profiles').update({
      is_pro:         true,
      pro_expires_at: expiresAt.toISOString(),
    }).eq('id', user.id).catch(e =>
      console.error('[restore_purchases] profile update failed:', e?.message)
    );

    await supabase.from('subscriptions').upsert({
      user_id:    user.id,
      plan,
      status:     'active',
      store:      entitlement.store,
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'user_id,store' }).catch(e =>
      console.error('[restore_purchases] subscription upsert failed:', e?.message)
    );

    return json({ pro_active: true, expires_at: expiresAt.toISOString(), plan, source: 'revenuecat_restore' });
  }

  return json({ error: 'Unknown action' }, 400);
}));
