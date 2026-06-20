-- ═══════════════════════════════════════════════════════════════
-- Edora — Ghost Room Cleanup
--
-- Problem: if a client closes the browser tab / gets killed before
-- calling leaveRoom(), the DB room row stays in 'waiting'/'studying'/
-- 'quiz' forever and other users see a dead room in the lobby.
--
-- Fix (two layers):
--   1. updated_at column + trigger on study_rooms so we know the last
--      time any DB write touched a room.
--   2. pg_cron job every 30 min marks stale rooms 'complete'.
--      Works alongside the client-side keepalive-fetch cleanup added in
--      StudyRoomPage; cron is the server-side safety net that catches
--      whatever the client misses.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Add updated_at to study_rooms ─────────────────────────────────────────
ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Back-fill existing rows (updated_at = created_at is a safe starting point)
UPDATE public.study_rooms SET updated_at = created_at WHERE updated_at = now();

-- Index for the cron query so it never does a seq-scan
CREATE INDEX IF NOT EXISTS study_rooms_updated_at_idx
  ON public.study_rooms(updated_at)
  WHERE status IN ('waiting', 'studying', 'quiz');

-- ── 2. Trigger: auto-update updated_at on every UPDATE ────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop trigger first so this migration is re-runnable (idempotent)
DROP TRIGGER IF EXISTS study_rooms_set_updated_at ON public.study_rooms;

CREATE TRIGGER study_rooms_set_updated_at
  BEFORE UPDATE ON public.study_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. pg_cron: mark ghost rooms complete every 30 minutes ───────────────────
-- A room is "ghost" if it has been stuck in a transient status for >30 min
-- with no DB activity (updated_at not refreshed).
-- Timeline: study(5 min) + quiz(≤2.5 min) = ~8 min max for a real session.
-- 30 min is very conservative — only catches truly dead rooms.
--
-- pg_cron runs as the Postgres superuser → bypasses RLS → safe for maintenance.

-- Remove existing job (idempotent re-run guard)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ghost-rooms');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet, ignore
END $$;

SELECT cron.schedule(
  'cleanup-ghost-rooms',      -- job name
  '*/30 * * * *',             -- every 30 minutes
  $cron$
    UPDATE public.study_rooms
    SET    status     = 'complete',
           updated_at = now()
    WHERE  status IN ('waiting', 'studying', 'quiz')
      AND  updated_at < now() - INTERVAL '30 minutes';
  $cron$
);
