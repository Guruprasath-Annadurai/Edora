# Secret Rotation Policy — Phase 1.5

**Status: first version. No secret in this codebase has ever been rotated on a schedule before this document existed — stated honestly, this is a policy for going forward, not a description of past practice.**

## Rotation cadence

| Secret tier | Examples | Rotation cadence | Rationale |
|---|---|---|---|
| **Tier 1 — Financial / highest blast radius** | `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GCP_SERVICE_ACCOUNT_JSON` | Every 90 days, or immediately on any suspected compromise | Direct financial or full-database-bypass impact |
| **Tier 2 — Auth/crypto-critical** | `OAUTH_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `EVAL_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET` | Every 180 days, or immediately on suspected compromise | Rotating breaks something specific and needs a plan each time (see below) — cannot be fully automated without extra engineering, so a longer cadence with explicit process is more realistic than pretending a 30-day auto-rotation exists |
| **Tier 3 — AI provider keys** | `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `ELEVENLABS_API_KEY`, `CLOUD_VISION_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `YOUTUBE_API_KEY` | Every 180 days | Lower blast radius (API cost/abuse, not data breach), but still real |
| **Tier 4 — Low-sensitivity / public-by-design** | Every `VITE_*` client variable | No rotation required by default (public keys); rotate only if the underlying provider account itself needs a security response | These are meant to be public |

**Immediate rotation (no schedule, drop everything) triggers for any tier:**
- The secret appears in a `gitleaks` finding (CI job added in this phase) that isn't a confirmed false positive.
- The secret was ever hardcoded in client-shippable code (this already happened once — `EVAL_SECRET` — see `SECRET_INVENTORY.md`).
- Any team member (currently: the founder) leaves or loses device access.
- A provider's own breach notification names this project.

## Rotation procedure (general)

1. Generate the new secret value at the provider's console.
2. `supabase secrets set KEY=<new-value>` — Edge Functions pick up new secrets on next cold start, not instantly; for anything urgent, redeploy the affected functions to force a restart.
3. For secrets referenced by scheduled jobs via `vault.decrypted_secrets` (the pattern this codebase already uses for newer cron migrations, per `docs/enterprise-remediation-tracker.md` §10) — update the vault entry, not a hardcoded value.
4. Confirm the old value no longer works (attempt a call with it, expect rejection) before considering rotation complete.
5. Update `SECRET_INVENTORY.md`'s "Last rotation" column with the real date.

## Special cases needing more than the general procedure

- **`OAUTH_TOKEN_ENCRYPTION_KEY`**: rotating this without a plan makes every currently-stored encrypted OAuth token unreadable (users would need to reconnect Google Classroom/Calendar/Gmail/Drive). Requires either (a) a re-encryption migration that decrypts with the old key and re-encrypts with the new one in the same operation, or (b) accepting that all connected users must reauthorize. Neither is built yet — **this key has effectively never been rotatable in practice**, which is itself a gap worth fixing before it's ever needed under pressure.
- **`SUPABASE_SERVICE_ROLE_KEY`**: rotating this breaks every deployed Edge Function simultaneously until each is redeployed with the new value picked up. This should only ever be done under active-compromise conditions, with the incident-response runbook (`docs/incident-response.md`) driving the response, not as routine hygiene.
- **`EVAL_SECRET`**: has a specific, already-known, still-open action item — see `SECRET_INVENTORY.md`'s "Known open incident" section. This should be rotated on the next available opportunity regardless of the 180-day tier-2 schedule, since it's already known to have leaked.

## Ownership

Per `docs/enterprise/OWNERSHIP_MATRIX.md`: Guruprasath Annadurai is accountable for every secret in this inventory. There is currently no second person to enforce a rotation calendar independently — this policy exists, but its enforcement currently depends entirely on the same one person remembering to follow it. That's recorded honestly as a limitation (see `RISK-001` in the risk register), not hidden behind a policy document that implies more organizational maturity than exists.

## What this policy does NOT yet cover

- Automated rotation reminders/calendar entries — this document defines cadence, nothing currently enforces it.
- A rotation drill (actually rotating one real secret end-to-end to prove the procedure works) — not performed this phase.

**Status: Phase 1.5 (policy portion) — VERIFIED COMPLETE as a first version.** A policy now exists where none did before. Its *enforcement* is a separate, unstarted concern (Phase 14, operating cadence).

**Reviewer:** Guruprasath Annadurai (self-reviewed).
**Date:** 2026-08-06.
