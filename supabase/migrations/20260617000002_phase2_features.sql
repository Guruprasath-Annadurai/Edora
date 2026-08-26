-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Exam War Room, Boss Fights, Rank Predictor, Mock Postmortem, Study DNA
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. boss_fight_sessions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.boss_fight_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject              TEXT        NOT NULL,
  chapter              TEXT        NOT NULL,
  boss_name            TEXT        NOT NULL,
  result               TEXT        NOT NULL CHECK (result IN ('victory', 'defeat')),
  questions_answered   INTEGER     NOT NULL DEFAULT 0,
  xp_earned            INTEGER     NOT NULL DEFAULT 0,
  player_hp_remaining  INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.boss_fight_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_boss_fights"
  ON public.boss_fight_sessions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_boss_fights_user
  ON public.boss_fight_sessions (user_id, created_at DESC);

-- ── 2. exam_war_room_sessions ─────────────────────────────────────────────────
-- Tracks when students enter exam war room (analytics + engagement)

CREATE TABLE IF NOT EXISTS public.exam_war_room_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_name    TEXT,
  hours_before INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_war_room_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_war_room"
  ON public.exam_war_room_sessions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. study_dna_reports ──────────────────────────────────────────────────────
-- Weekly snapshot stored every Sunday by cron for shareable card generation

CREATE TABLE IF NOT EXISTS public.study_dna_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start            DATE        NOT NULL,
  xp_earned             INTEGER     NOT NULL DEFAULT 0,
  sessions_completed    INTEGER     NOT NULL DEFAULT 0,
  topics_studied        INTEGER     NOT NULL DEFAULT 0,
  quiz_accuracy         INTEGER     NOT NULL DEFAULT 0,
  strongest_subject     TEXT,
  weakest_subject       TEXT,
  total_minutes         INTEGER     NOT NULL DEFAULT 0,
  top_topics            JSONB,
  weak_topics           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.study_dna_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_dna_reports"
  ON public.study_dna_reports
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dna_reports_user_week
  ON public.study_dna_reports (user_id, week_start DESC);

-- ── 4. quiz_sessions columns check ───────────────────────────────────────────
-- Ensure quiz_sessions has questions_count for postmortem (may already exist)

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS questions_count INTEGER NOT NULL DEFAULT 0;

-- ── 5. Boss fight stats view ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.boss_fight_stats AS
SELECT
  user_id,
  COUNT(*)                                              AS total_fights,
  COUNT(*) FILTER (WHERE result = 'victory')            AS victories,
  COUNT(*) FILTER (WHERE result = 'defeat')             AS defeats,
  COALESCE(SUM(xp_earned), 0)                          AS total_xp_from_bosses,
  MAX(created_at)                                       AS last_fight_at
FROM public.boss_fight_sessions
GROUP BY user_id;

COMMENT ON TABLE public.boss_fight_sessions IS
  'Records each Chapter Boss Fight session — subject, chapter, boss, result, XP earned.';

COMMENT ON TABLE public.study_dna_reports IS
  'Weekly Study DNA snapshots — stored each Sunday for shareable report cards.';
