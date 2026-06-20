-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2 — Learning Analytics Event Buffer
-- Events are stored in Postgres first, then streamed to BigQuery async.
-- This ensures zero data loss even if BigQuery is unavailable.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name     TEXT        NOT NULL,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id     TEXT,
  platform       TEXT        NOT NULL DEFAULT 'web',
  app_version    TEXT,
  properties     JSONB       NOT NULL DEFAULT '{}',
  bq_synced      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for BigQuery sync job (only fetch unsynced rows)
CREATE INDEX IF NOT EXISTS analytics_events_bq_sync_idx
  ON public.analytics_events (bq_synced, created_at)
  WHERE bq_synced = FALSE;

-- Index for per-user queries
CREATE INDEX IF NOT EXISTS analytics_events_user_idx
  ON public.analytics_events (user_id, event_name, created_at);

-- Users can insert their own events; no read (analytics is server-side only)
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_insert" ON public.analytics_events;
CREATE POLICY "events_insert" ON public.analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service role can update bq_synced flag
DROP POLICY IF EXISTS "events_service_update" ON public.analytics_events;
CREATE POLICY "events_service_update" ON public.analytics_events
  FOR UPDATE USING (true);

-- ── BigQuery dataset + table creation is done via novo-events 'setup_bq' ──────
-- Schema reference (create in BQ console or via API):
-- Dataset: edora_analytics
-- Table: events
-- Fields:
--   event_id       STRING    REQUIRED
--   event_name     STRING    REQUIRED
--   user_id        STRING
--   session_id     STRING
--   platform       STRING
--   app_version    STRING
--   properties     JSON
--   created_at     TIMESTAMP REQUIRED
