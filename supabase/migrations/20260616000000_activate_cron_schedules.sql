-- ═══════════════════════════════════════════════════════════════════════════
-- Activate Cron Schedules — novo-morning-brief + novo-push were fully built
-- but the cron.schedule(...) calls in 20260706_habit_architecture.sql were
-- left commented out, so neither has ever actually fired in production.
--
-- This migration schedules both for real, using Supabase Vault to hold the
-- cron secret (so the actual secret value never appears in a committed file —
-- only this constant *name* does, which is safe to commit).
--
-- ── ONE-TIME SETUP REQUIRED BEFORE THIS MIGRATION WORKS ──────────────────────
-- Run this once in the Supabase SQL Editor (NOT via a committed migration,
-- since it contains the actual secret value):
--
--   select vault.create_secret('<your CRON_SECRET value>', 'cron_secret');
--
-- Use the SAME value you already set via `supabase secrets set CRON_SECRET=...`
-- for the edge functions. If you haven't set one yet, generate one now:
--   openssl rand -hex 32
-- then run both:
--   supabase secrets set CRON_SECRET=<generated-value>
--   select vault.create_secret('<generated-value>', 'cron_secret');
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ── 1. Morning brief — 7:00 AM IST daily (01:30 UTC) ──────────────────────────
SELECT cron.unschedule('novo-morning-brief') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'novo-morning-brief');

SELECT cron.schedule(
  'novo-morning-brief',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-morning-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. Push dispatch — every 4 hours ──────────────────────────────────────────
-- novo-push internally rate-limits each user to 1 push / 4h (profiles.last_push_at)
-- and checks exam countdown, streak-at-risk, and weak-topic windows itself, so
-- running it more often than the cooldown just means faster delivery once a
-- user's window opens — it does not mean more pushes per user.
SELECT cron.unschedule('novo-push-dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'novo-push-dispatch');

SELECT cron.schedule(
  'novo-push-dispatch',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlkzabspcwfockbmkmzl.supabase.co/functions/v1/novo-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('novo-morning-brief', 'novo-push-dispatch');
