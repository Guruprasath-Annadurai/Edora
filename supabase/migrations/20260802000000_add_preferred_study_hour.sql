-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes a live production bug found via on-device testing: usePushNotifications
-- writes { push_token, push_token_updated_at, preferred_study_hour } to
-- profiles on every push registration, but preferred_study_hour was never
-- added by any migration — every single push token save failed with
-- "Could not find the 'preferred_study_hour' column of 'profiles' in the
-- schema cache", retried once, failed again, and gave up — meaning push
-- notifications have not actually worked for any user.
--
-- This column backs a real, if currently half-wired, feature: the client
-- tracks which UTC hour the user opens the app most often (recordActivityHour/
-- preferredStudyHourUTC in usePushNotifications.ts) so server-side push send
-- logic could eventually time notifications for when a student is actually
-- active. Nothing server-side reads this column yet (novo-push/novo-insights
-- select push_token but not preferred_study_hour) — that's a separate,
-- follow-up feature-completion task, not part of this bug fix.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_study_hour SMALLINT
    CHECK (preferred_study_hour IS NULL OR preferred_study_hour BETWEEN 0 AND 23);
