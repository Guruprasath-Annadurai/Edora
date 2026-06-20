-- ═══════════════════════════════════════════════════════════════════════════
-- Novo Memory v2 — Session Summaries · Explanation Style · Weakness Map
-- Run: Supabase Dashboard → SQL Editor (or `supabase db push` with DB password)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Explanation style preference on profiles ───────────────────────────────
-- simple | balanced | deep | socratic
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS explanation_style TEXT NOT NULL DEFAULT 'balanced'
    CHECK (explanation_style IN ('simple', 'balanced', 'deep', 'socratic'));

-- ── 2. Session summaries ──────────────────────────────────────────────────────
-- One row per study session (chat, quiz, tutoring, sprint).
-- Gives Novo rich "last time we…" recall without storing raw message history.
CREATE TABLE IF NOT EXISTS public.novo_session_summaries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source        TEXT        NOT NULL CHECK (source IN ('chat','quiz','tutoring','sprint')),
  subject       TEXT,
  topic         TEXT,
  summary       TEXT        NOT NULL,
  struggles     TEXT[],       -- specific questions/concepts the student missed
  wins          TEXT[],       -- concepts the student nailed
  duration_mins INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nss_user_created_idx
  ON public.novo_session_summaries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS nss_user_source_idx
  ON public.novo_session_summaries (user_id, source, created_at DESC);

ALTER TABLE public.novo_session_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_session_summaries" ON public.novo_session_summaries;
CREATE POLICY "users_own_session_summaries" ON public.novo_session_summaries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Compound index on novo_memories for weakness-map queries ───────────────
-- Speeds up "top struggles sorted by importance" lookups done on every chat open
CREATE INDEX IF NOT EXISTS nm_user_type_importance_idx
  ON public.novo_memories (user_id, memory_type, importance DESC, created_at DESC);
