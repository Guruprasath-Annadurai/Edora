-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 4 — Gamified & Social
-- Features: Novo Challenges · Debate Mode · Tournament Mode
--           Novo Story Mode · Streak Challenges
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. NOVO CHALLENGES ───────────────────────────────────────────────────────
-- One boss-level challenge per (date × subject). Shared across users.

CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date    date        NOT NULL,
  subject           text        NOT NULL,
  topic             text        NOT NULL,
  difficulty        text        NOT NULL DEFAULT 'boss',
  problem           text        NOT NULL,
  solution          text        NOT NULL,         -- never sent to client
  hints             jsonb       NOT NULL DEFAULT '[]',
  xp_reward         integer     NOT NULL DEFAULT 150,
  xp_multiplier     numeric(4,2) NOT NULL DEFAULT 2.0,
  time_limit_secs   integer     NOT NULL DEFAULT 300,
  answer_type       text        NOT NULL DEFAULT 'text', -- text | mcq
  options           jsonb       DEFAULT NULL,            -- MCQ options array
  correct_idx       integer     DEFAULT NULL,            -- MCQ correct — never client
  created_at        timestamptz DEFAULT now(),
  UNIQUE (challenge_date, subject)
);

-- Service role only — clients never read solution/correct_idx
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read challenge metadata"
  ON public.daily_challenges FOR SELECT
  USING (auth.role() = 'authenticated');

-- User attempts — one per (user × challenge)
CREATE TABLE IF NOT EXISTS public.user_challenge_attempts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  challenge_id     uuid        NOT NULL REFERENCES public.daily_challenges ON DELETE CASCADE,
  challenge_date   date        NOT NULL,
  subject          text        NOT NULL,
  started_at       timestamptz DEFAULT now(),
  completed_at     timestamptz,
  time_taken_secs  integer,
  answer           text,
  score            integer     DEFAULT 0,  -- 0-100
  xp_earned        integer     DEFAULT 0,
  hint_count       integer     DEFAULT 0,
  status           text        NOT NULL DEFAULT 'started',
    -- started | completed | timed_out
  UNIQUE (user_id, challenge_id)
);

ALTER TABLE public.user_challenge_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attempts"
  ON public.user_challenge_attempts FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS uca_user_date_idx
  ON public.user_challenge_attempts (user_id, challenge_date DESC);
CREATE INDEX IF NOT EXISTS uca_challenge_leaderboard_idx
  ON public.user_challenge_attempts (challenge_id, score DESC, time_taken_secs ASC);

-- ── 2. DEBATE MODE ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.debate_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject         text,
  topic           text        NOT NULL,
  novo_position   text        NOT NULL,
  user_position   text        NOT NULL,
  messages        jsonb       NOT NULL DEFAULT '[]',
  status          text        NOT NULL DEFAULT 'active',  -- active | completed
  score           integer,         -- 0-100
  score_breakdown jsonb,           -- { clarity, evidence, logic, rebuttal }
  feedback        text,
  turn_count      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.debate_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own debate sessions"
  ON public.debate_sessions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ds_user_idx ON public.debate_sessions (user_id, created_at DESC);

-- ── 3. TOURNAMENT MODE ────────────────────────────────────────────────────────
-- Weekly tournaments — shared questions, async submission, leaderboard.

CREATE TABLE IF NOT EXISTS public.tournaments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  subject          text        NOT NULL,
  week_start       date        NOT NULL,
  week_end         date        NOT NULL,
  status           text        NOT NULL DEFAULT 'open',
    -- open | active | completed
  questions        jsonb       NOT NULL DEFAULT '[]',
    -- [{question, options:[4], correct_idx, explanation, points}] — correct_idx server-only
  question_count   integer     NOT NULL DEFAULT 10,
  time_limit_secs  integer     NOT NULL DEFAULT 600,  -- total time for all Qs
  xp_1st           integer     NOT NULL DEFAULT 500,
  xp_2nd           integer     NOT NULL DEFAULT 300,
  xp_3rd           integer     NOT NULL DEFAULT 150,
  participant_count integer    NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (subject, week_start)
);

-- Authenticated users see public tournament info (no correct_idx — that's in questions jsonb)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read tournaments"
  ON public.tournaments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid        NOT NULL REFERENCES public.tournaments ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  score           integer     NOT NULL DEFAULT 0,
  max_score       integer     NOT NULL DEFAULT 0,
  time_taken_ms   bigint,
  rank            integer,
  answers         jsonb       NOT NULL DEFAULT '[]',  -- [{q_idx, chosen_idx, correct, ms}]
  completed_at    timestamptz,
  joined_at       timestamptz DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own participation"
  ON public.tournament_participants FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- Allow reading others for leaderboard
CREATE POLICY "Authenticated read all participants"
  ON public.tournament_participants FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS tp_tournament_rank_idx
  ON public.tournament_participants (tournament_id, score DESC, time_taken_ms ASC);
CREATE INDEX IF NOT EXISTS tp_user_idx
  ON public.tournament_participants (user_id, joined_at DESC);

-- Bump participant_count when a new participant joins
CREATE OR REPLACE FUNCTION public.increment_tournament_participants()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.tournaments
  SET participant_count = participant_count + 1
  WHERE id = NEW.tournament_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tournament_participant_count
  AFTER INSERT ON public.tournament_participants
  FOR EACH ROW EXECUTE FUNCTION public.increment_tournament_participants();

-- ── 4. STORY MODE ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.story_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject             text        NOT NULL,
  topic               text        NOT NULL,
  scenario_id         text        NOT NULL,  -- e.g. "archaeologist_base12"
  scenario_title      text        NOT NULL,
  scenario_hook       text        NOT NULL,  -- opening narrative paragraph
  messages            jsonb       NOT NULL DEFAULT '[]',
  status              text        NOT NULL DEFAULT 'active', -- active | completed
  concepts_covered    jsonb       NOT NULL DEFAULT '[]',
  xp_earned           integer     DEFAULT 0,
  checkpoints_passed  integer     DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  completed_at        timestamptz,
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.story_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own story sessions"
  ON public.story_sessions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ss_user_idx ON public.story_sessions (user_id, created_at DESC);

-- ── 5. STREAK CHALLENGES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.streak_challenges (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject          text        NOT NULL,
  topic            text        NOT NULL,
  title            text        NOT NULL,
  description      text        NOT NULL,
  target_days      integer     NOT NULL DEFAULT 7,
  daily_task       text        NOT NULL,
  daily_xp         integer     NOT NULL DEFAULT 50,
  bonus_xp         integer     NOT NULL DEFAULT 200,  -- for completing all days
  status           text        NOT NULL DEFAULT 'active',
    -- active | completed | failed | abandoned
  current_streak   integer     NOT NULL DEFAULT 0,
  longest_streak   integer     NOT NULL DEFAULT 0,
  last_completed_date date,
  started_at       timestamptz DEFAULT now(),
  target_end_date  date        NOT NULL,
  completed_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.streak_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own streak challenges"
  ON public.streak_challenges FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.streak_challenge_days (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    uuid        NOT NULL REFERENCES public.streak_challenges ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day_number      integer     NOT NULL,
  task_date       date        NOT NULL DEFAULT CURRENT_DATE,
  answer          text,
  xp_earned       integer     DEFAULT 0,
  completed_at    timestamptz DEFAULT now(),
  UNIQUE (challenge_id, day_number)
);

ALTER TABLE public.streak_challenge_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own streak days"
  ON public.streak_challenge_days FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS scd_challenge_idx ON public.streak_challenge_days (challenge_id, day_number);
CREATE INDEX IF NOT EXISTS sc_user_status_idx ON public.streak_challenges (user_id, status);

-- ── Shared updated_at triggers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_debate_updated_at') THEN
    CREATE TRIGGER trg_debate_updated_at
      BEFORE UPDATE ON public.debate_sessions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_story_updated_at') THEN
    CREATE TRIGGER trg_story_updated_at
      BEFORE UPDATE ON public.story_sessions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
