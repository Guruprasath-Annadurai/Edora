# Incident Runbook: In-App Purchase & Payment Outage

**Classification:** Operational Incident Response  
**Applies to:** RevenueCat SDK & Webhook Ingestion, Google Play Billing  

---

## 1. Detection
* **Symptom:** Learner purchases Pro subscription in Android app, but status remains Free, or checkout throws billing errors.
* **Telemetry:** RevenueCat dashboard alerts; Edge Function logs for `novo-subscription` webhook returning 4xx/5xx.

## 2. User Impact
* Learners unable to upgrade to Pro, or newly purchased Pro status is delayed in syncing.

## 3. What Should Fail Gracefully
* Client displays "Purchase Pending Verification" rather than charging multiple times.
* "Restore Purchases" button remains available.

## 4. What Feature Flag Can Be Used
* Temporary grace period: grant active learners temporary Pro access in `profiles.pro_until` while billing gateway resolves.

## 5. What Must NOT Be Changed
* **DO NOT** execute unvalidated manual SQL updates granting permanent Pro access without receipt validation.
* **DO NOT** disable webhook signature verification.

## 6. Recovery Procedure
1. Check vendor status:
   - RevenueCat: `status.revenuecat.com`
   - Google Play Console / Payments status
2. If webhook failed to deliver:
   - Replay failed webhooks from the RevenueCat Dashboard > Customer History > Events.
3. For individual affected learners:
   - Instruct learner to tap "Restore Purchases" in the app.
   - If receipt is validated on Google Play, entitlement updates immediately.

## 7. Evidence Proving Recovery
* RevenueCat webhook delivery success rate $\ge 99\%$.
* Learner profile in `profiles` reflects active `is_pro = true`.
