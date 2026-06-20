-- ═══════════════════════════════════════════════════════════════════════════
-- Habit Architecture — Make opening the app feel mandatory
-- Morning Brief · Daily Power Session · Exam Engine · Streak Freeze Shop
-- Concept of Day · Sleep Review · Weekly XP Report · Widget Support
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Daily Power Sessions ──────────────────────────────────────────────────
-- Tracks the curated 10-min session: 3 flashcard reviews + 2 PYQ + 1 concept bite

CREATE TABLE IF NOT EXISTS public.daily_power_sessions (
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  flashcards_done INTEGER     NOT NULL DEFAULT 0,   -- 0-3
  pyq_done        INTEGER     NOT NULL DEFAULT 0,   -- 0-2
  concept_done    BOOLEAN     NOT NULL DEFAULT false, -- 0-1
  busy_mode       BOOLEAN     NOT NULL DEFAULT false, -- true = 5-min shortened session
  xp_awarded      INTEGER     NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_date)
);

ALTER TABLE public.daily_power_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dps_own" ON public.daily_power_sessions;
CREATE POLICY "dps_own" ON public.daily_power_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- progress = flashcards_done + pyq_done + concept_done (0-6)
CREATE OR REPLACE FUNCTION public.get_daily_session_progress(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row public.daily_power_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.daily_power_sessions
  WHERE user_id = p_user_id AND session_date = CURRENT_DATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  RETURN v_row.flashcards_done + v_row.pyq_done + CASE WHEN v_row.concept_done THEN 1 ELSE 0 END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_daily_session_progress TO authenticated;

-- Upsert progress + auto-award XP + mark complete at 6/6
CREATE OR REPLACE FUNCTION public.update_daily_session(
  p_user_id        UUID,
  p_flashcards     INTEGER  DEFAULT NULL,
  p_pyq            INTEGER  DEFAULT NULL,
  p_concept        BOOLEAN  DEFAULT NULL,
  p_busy_mode      BOOLEAN  DEFAULT false
) RETURNS TABLE(progress INTEGER, completed BOOLEAN, xp_earned INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fc  INTEGER;
  v_pyq INTEGER;
  v_con BOOLEAN;
  v_prog INTEGER;
  v_xp  INTEGER := 0;
  v_done BOOLEAN := false;
BEGIN
  INSERT INTO public.daily_power_sessions (user_id, session_date)
  VALUES (p_user_id, CURRENT_DATE)
  ON CONFLICT (user_id, session_date) DO NOTHING;

  UPDATE public.daily_power_sessions SET
    flashcards_done = COALESCE(p_flashcards, flashcards_done),
    pyq_done        = COALESCE(p_pyq, pyq_done),
    concept_done    = COALESCE(p_concept, concept_done),
    busy_mode       = p_busy_mode
  WHERE user_id = p_user_id AND session_date = CURRENT_DATE
  RETURNING flashcards_done, pyq_done, concept_done INTO v_fc, v_pyq, v_con;

  v_prog := v_fc + v_pyq + CASE WHEN v_con THEN 1 ELSE 0 END;

  -- Award XP on completion
  SELECT xp_awarded INTO v_xp FROM public.daily_power_sessions
  WHERE user_id = p_user_id AND session_date = CURRENT_DATE;

  IF v_prog >= 6 AND v_xp = 0 THEN
    v_xp := CASE WHEN p_busy_mode THEN 75 ELSE 150 END;
    UPDATE public.daily_power_sessions SET
      xp_awarded = v_xp, completed_at = now()
    WHERE user_id = p_user_id AND session_date = CURRENT_DATE;
    PERFORM public.increment_xp(p_user_id, v_xp);
    v_done := true;
  ELSIF v_prog >= 6 THEN
    v_done := true;
  END IF;

  RETURN QUERY SELECT v_prog, v_done, v_xp;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_daily_session TO authenticated;

-- ── 2. Concept of Day ────────────────────────────────────────────────────────
-- AI-generated daily concept card, personalised to weakest topic

CREATE TABLE IF NOT EXISTS public.concept_of_day (
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  concept_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  concept      TEXT        NOT NULL,
  subject      TEXT,
  description  TEXT        NOT NULL,
  example      TEXT,
  question     TEXT,
  answer       TEXT,
  shared_count INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept_date)
);

ALTER TABLE public.concept_of_day ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cod_own" ON public.concept_of_day;
CREATE POLICY "cod_own" ON public.concept_of_day
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Morning Brief Log ─────────────────────────────────────────────────────
-- Records each sent morning push to avoid duplicates + power the brief history

CREATE TABLE IF NOT EXISTS public.morning_brief_log (
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  brief_text  TEXT        NOT NULL,
  focus_topic TEXT,
  rival_name  TEXT,
  xp_delta    INTEGER,    -- rival's XP gain overnight
  exam_days   INTEGER,    -- days until exam at time of sending
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sent_date)
);

ALTER TABLE public.morning_brief_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mbl_own" ON public.morning_brief_log;
CREATE POLICY "mbl_own" ON public.morning_brief_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 4. Streak Freeze Transactions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.streak_freeze_transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  txn_type     TEXT        NOT NULL CHECK (txn_type IN ('purchase','earn','use')),
  quantity     INTEGER     NOT NULL DEFAULT 1,
  amount_paise INTEGER,    -- purchase cost in paise (₹1 = 100 paise)
  source       TEXT,       -- 'milestone_7day', 'milestone_30day', 'iap_single', 'iap_bundle', 'streak_break'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sft_user_idx ON public.streak_freeze_transactions (user_id, created_at DESC);

ALTER TABLE public.streak_freeze_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sft_own" ON public.streak_freeze_transactions;
CREATE POLICY "sft_own" ON public.streak_freeze_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add freeze (purchase or earned milestone)
CREATE OR REPLACE FUNCTION public.add_streak_freeze(
  p_user_id UUID, p_quantity INTEGER, p_source TEXT, p_amount_paise INTEGER DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET streak_freeze_count = LEAST(10, streak_freeze_count + p_quantity)
  WHERE id = p_user_id;
  INSERT INTO public.streak_freeze_transactions (user_id, txn_type, quantity, source, amount_paise)
  VALUES (p_user_id, CASE WHEN p_source LIKE 'iap%' THEN 'purchase' ELSE 'earn' END, p_quantity, p_source, p_amount_paise);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_streak_freeze TO authenticated;

-- Auto-apply freeze if user missed yesterday (called by cron at midnight)
CREATE OR REPLACE FUNCTION public.apply_streak_freeze_if_needed(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_streak    INTEGER;
  v_freezes   INTEGER;
  v_last_date DATE;
BEGIN
  SELECT streak_count, streak_freeze_count INTO v_streak, v_freezes
  FROM public.profiles WHERE id = p_user_id;

  -- Check if user studied yesterday
  SELECT MAX(session_date) INTO v_last_date
  FROM public.daily_power_sessions WHERE user_id = p_user_id;

  -- Only apply freeze if streak > 0, has freezes, and missed yesterday
  IF v_streak > 0 AND v_freezes > 0 AND (v_last_date IS NULL OR v_last_date < CURRENT_DATE - 1) THEN
    UPDATE public.profiles SET streak_freeze_count = streak_freeze_count - 1 WHERE id = p_user_id;
    INSERT INTO public.streak_freeze_transactions (user_id, txn_type, quantity, source)
    VALUES (p_user_id, 'use', 1, 'streak_break');
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_streak_freeze_if_needed TO authenticated;

-- ── 5. Weekly XP Report Schedule ────────────────────────────────────────────
-- Preferences for when/how to receive the weekly report

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_brief_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_brief_sent_at    DATE;

-- ── 6. pg_cron Scheduled Jobs ────────────────────────────────────────────────
-- Requires: SELECT cron.schedule(...) — run after enabling pg_cron extension
-- Enable with: CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- 7 AM IST daily morning brief (IST = UTC+5:30 → 01:30 UTC):
-- SELECT cron.schedule(
--   'novo-morning-brief',
--   '30 1 * * *',
--   $$SELECT net.http_post(
--     url    := current_setting('app.supabase_url') || '/functions/v1/novo-morning-brief',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--                                   'Content-Type', 'application/json'),
--     body   := '{}'::jsonb
--   )$$
-- );
--
-- 8 PM IST streak-at-risk push (IST → 14:30 UTC):
-- SELECT cron.schedule(
--   'streak-at-risk-push',
--   '30 14 * * *',
--   $$SELECT net.http_post(
--     url    := current_setting('app.supabase_url') || '/functions/v1/novo-push',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--                                   'Content-Type', 'application/json',
--                                   'x-cron-secret', current_setting('app.cron_secret')),
--     body   := '{"action":"streak_at_risk"}'::jsonb
--   )$$
-- );
--
-- 6 PM IST Friday weekly report (IST → 12:30 UTC Friday = day 5):
-- SELECT cron.schedule(
--   'weekly-xp-report',
--   '30 12 * * 5',
--   $$SELECT net.http_post(
--     url    := current_setting('app.supabase_url') || '/functions/v1/weekly-report',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--                                   'Content-Type', 'application/json'),
--     body   := '{"action":"send_all"}'::jsonb
--   )$$
-- );
