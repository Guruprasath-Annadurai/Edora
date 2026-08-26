-- ═══════════════════════════════════════════════════════════════════════════
-- Ensure seed / config tables exist in production
--
-- These tables are defined in 001_initial_schema.sql but may be missing from
-- production if that migration was recorded as applied before it fully ran.
-- All statements use IF NOT EXISTS so re-running is safe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── streak_rewards ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.streak_rewards (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streak_days  INTEGER NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT,
  reward_type  TEXT DEFAULT 'freeze',
  reward_value INTEGER DEFAULT 1
);

-- Seed rows — ON CONFLICT DO NOTHING so re-runs are safe
INSERT INTO public.streak_rewards (streak_days, title, description, reward_type, reward_value) VALUES
  (3,   '3-Day Warrior',   'You''re on fire!',           'freeze',   1),
  (7,   'Week Champion',   'One full week of learning!', 'freeze',   1),
  (14,  'Fortnight Hero',  'Two weeks strong!',          'xp_boost', 100),
  (30,  'Monthly Master',  'A whole month!',             'freeze',   2),
  (60,  'Elite Scholar',   'Two months of growth!',      'freeze',   3),
  (100, 'Century Learner', 'Legendary dedication!',      'freeze',   5)
ON CONFLICT (streak_days) DO NOTHING;

-- ── user_rewards ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_rewards (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id  UUID NOT NULL REFERENCES public.streak_rewards(id),
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, reward_id)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_rewards' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_rewards' AND policyname = 'user_rewards_own'
  ) THEN
    CREATE POLICY "user_rewards_own" ON public.user_rewards
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

GRANT ALL ON public.user_rewards TO authenticated;

-- ── subjects_master ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects_master (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  study_level study_level[],
  icon        TEXT,
  color       TEXT
);

GRANT SELECT ON public.subjects_master TO authenticated;

-- ── topics_master ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.topics_master (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects_master(id),
  name       TEXT NOT NULL,
  chapter    TEXT,
  order_num  INTEGER DEFAULT 0
);

GRANT SELECT ON public.topics_master TO authenticated;

-- ── RLS on seed tables (subjects_master, topics_master, streak_rewards) ───────
ALTER TABLE public.subjects_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_rewards  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='subjects_master' AND policyname='subjects_read_authenticated') THEN
    CREATE POLICY "subjects_read_authenticated" ON public.subjects_master FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='topics_master' AND policyname='topics_read_authenticated') THEN
    CREATE POLICY "topics_read_authenticated" ON public.topics_master FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='streak_rewards' AND policyname='streak_rewards_read_authenticated') THEN
    CREATE POLICY "streak_rewards_read_authenticated" ON public.streak_rewards FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.subjects_master FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subjects_master FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.topics_master   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.topics_master   FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.streak_rewards  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.streak_rewards  FROM anon;
