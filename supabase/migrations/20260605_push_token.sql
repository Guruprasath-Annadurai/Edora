-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add push notification token columns to profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token             text,
  ADD COLUMN IF NOT EXISTS push_token_updated_at  timestamptz;

-- Index for quick lookups when sending server-side push notifications
CREATE INDEX IF NOT EXISTS profiles_push_token_idx
  ON public.profiles(push_token)
  WHERE push_token IS NOT NULL;
