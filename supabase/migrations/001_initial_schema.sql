-- ═══════════════════════════════════════════════════════════════
-- EDORA — Complete Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ── Enums ─────────────────────────────────────────────────────
CREATE TYPE app_role       AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE study_level    AS ENUM ('school', 'college', 'jee_neet', 'sat_act');
CREATE TYPE sprint_mode    AS ENUM ('solo', 'group');
CREATE TYPE tutor_mode     AS ENUM ('teacher', 'friend');
CREATE TYPE review_rating  AS ENUM ('again', 'hard', 'good', 'easy');

-- ── Helper: extract device-id from request header ─────────────
CREATE OR REPLACE FUNCTION public.current_device_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('request.headers', true)::json->>'x-device-id'
$$;

-- ════════════════════════════════════════════════════════════════
-- PROFILES
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  full_name           TEXT,
  avatar_url          TEXT,
  study_level         study_level DEFAULT 'school',
  xp                  INTEGER DEFAULT 0,
  level               INTEGER DEFAULT 0,
  streak_count        INTEGER DEFAULT 0,
  streak_freeze_count INTEGER DEFAULT 2,
  last_sprint_date    DATE,
  preferred_language  TEXT DEFAULT 'en',
  study_preferences   JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
GRANT ALL ON public.profiles TO authenticated;

-- ── Auto-create profile on signup ──────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Increment XP RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_xp(user_id UUID, amount INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET
    xp = xp + amount,
    level = FLOOR(SQRT((xp + amount)::FLOAT / 100))
  WHERE id = user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_xp TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- USER ROLES
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.user_roles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       app_role DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
GRANT SELECT ON public.user_roles TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- TUTOR CHATS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.tutor_chats (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  mode       tutor_mode DEFAULT 'teacher',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.tutor_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tutor_chats_own" ON public.tutor_chats
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.tutor_chats TO authenticated;
CREATE INDEX idx_tutor_chats_user ON public.tutor_chats(user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════
-- FLASHCARDS (SM-2)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.flashcards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  front         TEXT NOT NULL,
  back          TEXT NOT NULL,
  subject       TEXT DEFAULT '',
  topic         TEXT DEFAULT '',
  ease_factor   FLOAT DEFAULT 2.5,
  interval      INTEGER DEFAULT 1,
  repetitions   INTEGER DEFAULT 0,
  next_review   TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flashcards_own" ON public.flashcards
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.flashcards TO authenticated;
CREATE INDEX idx_flashcards_review ON public.flashcards(user_id, next_review);

-- ════════════════════════════════════════════════════════════════
-- QUIZ SESSIONS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.quiz_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  topic        TEXT NOT NULL,
  questions    JSONB NOT NULL DEFAULT '[]',
  score        INTEGER,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_own" ON public.quiz_sessions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.quiz_sessions TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- SPRINT SESSIONS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.sprint_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode       sprint_mode DEFAULT 'solo',
  subject    TEXT NOT NULL,
  topic      TEXT DEFAULT '',
  duration   INTEGER DEFAULT 600,
  completed  BOOLEAN DEFAULT FALSE,
  xp_earned  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sprint_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sprint_own" ON public.sprint_sessions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.sprint_sessions TO authenticated;

-- ── Update streak after sprint ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_streak_on_sprint()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.completed = TRUE THEN
    UPDATE public.profiles SET
      streak_count = CASE
        WHEN last_sprint_date = CURRENT_DATE - 1 THEN streak_count + 1
        WHEN last_sprint_date = CURRENT_DATE      THEN streak_count
        ELSE 1
      END,
      last_sprint_date = CURRENT_DATE
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_sprint_complete AFTER INSERT OR UPDATE ON public.sprint_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_streak_on_sprint();

-- ════════════════════════════════════════════════════════════════
-- STUDY NOTES
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.study_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT DEFAULT '',
  subject    TEXT DEFAULT '',
  ocr_text   TEXT,
  image_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_own" ON public.study_notes
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.study_notes TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- MNEMONICS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.mnemonics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,
  mnemonic   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mnemonics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mnemonics_own" ON public.mnemonics
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.mnemonics TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- MISTAKE JOURNAL
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.mistake_journal (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  topic       TEXT NOT NULL,
  description TEXT NOT NULL,
  correction  TEXT,
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.mistake_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_own" ON public.mistake_journal
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.mistake_journal TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- EXAM SESSIONS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.exam_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  duration     INTEGER NOT NULL,
  questions    JSONB NOT NULL DEFAULT '[]',
  score        INTEGER,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_own" ON public.exam_sessions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.exam_sessions TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- STUDY REMINDERS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.study_reminders (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  time_of_day TIME NOT NULL,
  days       TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  enabled    BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.study_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders_own" ON public.study_reminders
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.study_reminders TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- STREAK REWARDS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.streak_rewards (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streak_days  INTEGER NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT,
  reward_type  TEXT DEFAULT 'freeze',
  reward_value INTEGER DEFAULT 1
);
INSERT INTO public.streak_rewards (streak_days, title, description, reward_type, reward_value) VALUES
  (3,  '3-Day Warrior',   'You''re on fire!',           'freeze', 1),
  (7,  'Week Champion',   'One full week of learning!', 'freeze', 1),
  (14, 'Fortnight Hero',  'Two weeks strong!',          'xp_boost', 100),
  (30, 'Monthly Master',  'A whole month!',             'freeze', 2),
  (60, 'Elite Scholar',   'Two months of growth!',      'freeze', 3),
  (100,'Century Learner', 'Legendary dedication!',      'freeze', 5);

CREATE TABLE public.user_rewards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id   UUID NOT NULL REFERENCES public.streak_rewards(id),
  claimed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, reward_id)
);
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_rewards_own" ON public.user_rewards
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.user_rewards TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- SUBJECTS & TOPICS MASTER
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.subjects_master (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  study_level study_level[],
  icon        TEXT,
  color       TEXT
);

CREATE TABLE public.topics_master (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects_master(id),
  name       TEXT NOT NULL,
  chapter    TEXT,
  order_num  INTEGER DEFAULT 0
);
GRANT SELECT ON public.subjects_master TO authenticated;
GRANT SELECT ON public.topics_master TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- LEADERBOARD VIEW (anonymous)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.weekly_leaderboard AS
SELECT
  ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank,
  CASE WHEN id = auth.uid()
    THEN COALESCE(full_name, 'You')
    ELSE CONCAT(LEFT(COALESCE(full_name, 'Anonymous'), 1), repeat('*', 4))
  END AS display_name,
  xp,
  level,
  streak_count,
  (id = auth.uid()) AS is_current_user
FROM public.profiles
WHERE created_at > NOW() - INTERVAL '7 days' OR xp > 0
LIMIT 50;
GRANT SELECT ON public.weekly_leaderboard TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- HANDWRITING SCANS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.handwriting_scans (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  ocr_text   TEXT,
  subject    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.handwriting_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scans_own" ON public.handwriting_scans
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.handwriting_scans TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- APP REVIEWS
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.app_reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone    TEXT NOT NULL,
  prompted_at  TIMESTAMPTZ DEFAULT NOW(),
  reviewed     BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, milestone)
);
ALTER TABLE public.app_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_own" ON public.app_reviews
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.app_reviews TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- STORAGE — avatars bucket
-- ════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_own_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
