-- ═══════════════════════════════════════════════════════════════════════════
-- Social & Competitive Features
-- Scoped Leaderboard · 1v1 Battles · Study Circles+ · Achievement Feed · Teacher Mode
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Leaderboard Scopes — user location for tiered ranking ─────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS state_name     TEXT,
  ADD COLUMN IF NOT EXISTS city_name      TEXT,
  ADD COLUMN IF NOT EXISTS school_name    TEXT,
  ADD COLUMN IF NOT EXISTS school_id      UUID;   -- optional, for school-verified accounts

-- Daily XP snapshot for rank velocity ("↑12 positions today")
CREATE TABLE IF NOT EXISTS public.xp_snapshots (
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snapshot_at DATE        NOT NULL DEFAULT CURRENT_DATE,
  xp_value    INTEGER     NOT NULL DEFAULT 0,
  global_rank INTEGER,
  PRIMARY KEY (user_id, snapshot_at)
);

ALTER TABLE public.xp_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xp_snapshots_own" ON public.xp_snapshots;
CREATE POLICY "xp_snapshots_own" ON public.xp_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function: upsert today's snapshot for a user
CREATE OR REPLACE FUNCTION public.upsert_xp_snapshot(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_xp INTEGER; v_rank INTEGER;
BEGIN
  SELECT xp INTO v_xp FROM public.profiles WHERE id = p_user_id;
  SELECT COUNT(*)::INTEGER + 1 INTO v_rank FROM public.profiles WHERE xp > v_xp;
  INSERT INTO public.xp_snapshots (user_id, xp_value, global_rank)
  VALUES (p_user_id, v_xp, v_rank)
  ON CONFLICT (user_id, snapshot_at) DO UPDATE
    SET xp_value = EXCLUDED.xp_value, global_rank = EXCLUDED.global_rank;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_xp_snapshot TO authenticated;

-- Hall of Fame — weekly top 3 per scope
CREATE TABLE IF NOT EXISTS public.hall_of_fame (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  DATE        NOT NULL,
  scope       TEXT        NOT NULL CHECK (scope IN ('global','state','city','school','friends')),
  scope_value TEXT,             -- state name, city name, school id, etc.
  rank_pos    SMALLINT    NOT NULL CHECK (rank_pos BETWEEN 1 AND 3),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp_earned   INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, scope, scope_value, rank_pos)
);

ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hof_public_read" ON public.hall_of_fame;
CREATE POLICY "hof_public_read" ON public.hall_of_fame FOR SELECT USING (true);

-- Rival system — auto-assigned rival (user 2 ranks above in same scope)
CREATE TABLE IF NOT EXISTS public.rivals (
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rival_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL DEFAULT 'global',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

ALTER TABLE public.rivals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rivals_own" ON public.rivals;
CREATE POLICY "rivals_own" ON public.rivals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. 1v1 Battle enhancements ───────────────────────────────────────────────

-- Battle invites (challenge specific user or random matchmaking queue)
CREATE TABLE IF NOT EXISTS public.battle_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenged_id   UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,  -- NULL = random
  subject         TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','matched')),
  battle_id       UUID        REFERENCES public.battles(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bi_challenged_idx ON public.battle_invites (challenged_id, status);
CREATE INDEX IF NOT EXISTS bi_challenger_idx ON public.battle_invites (challenger_id, status);

ALTER TABLE public.battle_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bi_participants" ON public.battle_invites;
CREATE POLICY "bi_participants" ON public.battle_invites
  FOR ALL USING (auth.uid() = challenger_id OR auth.uid() = challenged_id)
  WITH CHECK (auth.uid() = challenger_id);

-- Realtime on battle_invites so challenged user gets instant notification
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_invites;

-- Battle pass weekly progress (5 wins/week = trophy badge)
CREATE TABLE IF NOT EXISTS public.battle_pass (
  user_id         UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start      DATE    NOT NULL,
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  trophy_earned   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE public.battle_pass ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bp_own" ON public.battle_pass;
CREATE POLICY "bp_own" ON public.battle_pass
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RPC: record battle result, award XP, update battle pass
CREATE OR REPLACE FUNCTION public.record_battle_result(
  p_battle_id UUID,
  p_winner_id UUID,
  p_loser_id  UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_week DATE := date_trunc('week', now())::DATE;
  v_wins INTEGER;
BEGIN
  -- Update battle
  UPDATE public.battles SET
    winner_id    = p_winner_id,
    status       = 'completed',
    completed_at = now()
  WHERE id = p_battle_id;

  -- Award XP to winner
  PERFORM public.increment_xp(p_winner_id, 150);

  -- Update battle pass
  INSERT INTO public.battle_pass (user_id, week_start, wins)
  VALUES (p_winner_id, v_week, 1)
  ON CONFLICT (user_id, week_start) DO UPDATE SET wins = battle_pass.wins + 1;

  INSERT INTO public.battle_pass (user_id, week_start, losses)
  VALUES (p_loser_id, v_week, 1)
  ON CONFLICT (user_id, week_start) DO UPDATE SET losses = battle_pass.losses + 1;

  -- Grant trophy if 5+ wins this week
  SELECT wins INTO v_wins FROM public.battle_pass WHERE user_id = p_winner_id AND week_start = v_week;
  IF v_wins >= 5 THEN
    UPDATE public.battle_pass SET trophy_earned = true
    WHERE user_id = p_winner_id AND week_start = v_week;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_battle_result TO authenticated;

-- ── 3. Study Circles enhancements ────────────────────────────────────────────

-- Group streak tracking (whole group must study daily)
ALTER TABLE public.study_circles
  ADD COLUMN IF NOT EXISTS group_streak    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_at  DATE,
  ADD COLUMN IF NOT EXISTS total_xp        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_classroom    BOOLEAN NOT NULL DEFAULT false;  -- teacher-created

-- Sync sprint sessions (group studies together)
CREATE TABLE IF NOT EXISTS public.circle_sprints (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID        NOT NULL REFERENCES public.study_circles(id) ON DELETE CASCADE,
  started_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     TEXT        NOT NULL,
  duration_mins INTEGER   NOT NULL DEFAULT 25,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

ALTER TABLE public.circle_sprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_circle_members" ON public.circle_sprints;
CREATE POLICY "cs_circle_members" ON public.circle_sprints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_circle_members
      WHERE circle_id = circle_sprints.circle_id AND user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_sprints;

-- ── 4. Achievement Feed ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.achievement_feed (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL CHECK (event_type IN (
    'chapter_completed','quiz_aced','streak_milestone','level_up',
    'battle_won','circle_joined','mock_test','pyq_session','achievement_unlocked'
  )),
  title       TEXT        NOT NULL,
  subtitle    TEXT,
  emoji       TEXT        NOT NULL DEFAULT '🎉',
  metadata    JSONB,
  is_public   BOOLEAN     NOT NULL DEFAULT true,
  reaction_count INTEGER  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS af_user_idx    ON public.achievement_feed (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS af_public_idx  ON public.achievement_feed (is_public, created_at DESC);

ALTER TABLE public.achievement_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "af_public_read" ON public.achievement_feed;
CREATE POLICY "af_public_read" ON public.achievement_feed
  FOR SELECT USING (is_public OR auth.uid() = user_id);
DROP POLICY IF EXISTS "af_own_insert" ON public.achievement_feed;
CREATE POLICY "af_own_insert" ON public.achievement_feed
  FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.achievement_feed;

-- Feed reactions (emoji cheers)
CREATE TABLE IF NOT EXISTS public.feed_reactions (
  feed_id     UUID NOT NULL REFERENCES public.achievement_feed(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL DEFAULT '👏',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_id, user_id)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fr_own" ON public.feed_reactions;
CREATE POLICY "fr_own" ON public.feed_reactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fr_read" ON public.feed_reactions;
CREATE POLICY "fr_read" ON public.feed_reactions FOR SELECT USING (true);

-- Trigger: bump reaction_count on achievement_feed
CREATE OR REPLACE FUNCTION public.handle_feed_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.achievement_feed SET reaction_count = reaction_count + 1 WHERE id = NEW.feed_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.achievement_feed SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = OLD.feed_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_feed_reaction ON public.feed_reactions;
CREATE TRIGGER on_feed_reaction
  AFTER INSERT OR DELETE ON public.feed_reactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_feed_reaction();

-- Helper: post an achievement feed item (called from app or edge functions)
CREATE OR REPLACE FUNCTION public.post_achievement(
  p_user_id   UUID,
  p_event_type TEXT,
  p_title     TEXT,
  p_subtitle  TEXT DEFAULT NULL,
  p_emoji     TEXT DEFAULT '🎉',
  p_metadata  JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.achievement_feed (user_id, event_type, title, subtitle, emoji, metadata)
  VALUES (p_user_id, p_event_type, p_title, p_subtitle, p_emoji, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.post_achievement TO authenticated;

-- ── 5. Teacher Mode enhancements ─────────────────────────────────────────────

-- School licenses (per-seat billing)
CREATE TABLE IF NOT EXISTS public.school_licenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name     TEXT        NOT NULL,
  school_id       TEXT        UNIQUE NOT NULL,  -- slug e.g. "delhi-public-school-rk-puram"
  admin_user_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  seat_limit      INTEGER     NOT NULL DEFAULT 30,
  seats_used      INTEGER     NOT NULL DEFAULT 0,
  plan            TEXT        NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','standard','premium')),
  price_per_seat  INTEGER     NOT NULL DEFAULT 299,  -- INR/month
  valid_until     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sl_admin_only" ON public.school_licenses;
CREATE POLICY "sl_admin_only" ON public.school_licenses
  FOR ALL USING (auth.uid() = admin_user_id);

-- Teacher-created classroom study circles with assignment scheduling
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id    UUID        REFERENCES public.classrooms(id) ON DELETE CASCADE,
  circle_id       UUID        REFERENCES public.study_circles(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  topic           TEXT        NOT NULL,
  activity_type   TEXT        NOT NULL CHECK (activity_type IN ('quiz','sprint','flashcard','mock_test','pyq_practice')),
  due_date        DATE,
  question_ids    UUID[]      DEFAULT '{}',
  config          JSONB       DEFAULT '{}',
  xp_bonus        INTEGER     NOT NULL DEFAULT 50,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ta_teacher_idx ON public.teacher_assignments (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ta_classroom_idx ON public.teacher_assignments (classroom_id, due_date);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ta_teacher_manage" ON public.teacher_assignments;
CREATE POLICY "ta_teacher_manage" ON public.teacher_assignments
  FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "ta_student_read" ON public.teacher_assignments;
CREATE POLICY "ta_student_read" ON public.teacher_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members
      WHERE classroom_id = teacher_assignments.classroom_id AND user_id = auth.uid()
    )
  );

-- Student assignment completion
CREATE TABLE IF NOT EXISTS public.assignment_completions (
  assignment_id   UUID NOT NULL REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score           INTEGER,
  time_secs       INTEGER,
  xp_awarded      INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);

ALTER TABLE public.assignment_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ac_student_own" ON public.assignment_completions;
CREATE POLICY "ac_student_own" ON public.assignment_completions
  FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "ac_teacher_read" ON public.assignment_completions;
CREATE POLICY "ac_teacher_read" ON public.assignment_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      WHERE ta.id = assignment_completions.assignment_id AND ta.teacher_id = auth.uid()
    )
  );

-- At-risk student view (low XP in last 7 days)
CREATE OR REPLACE VIEW public.at_risk_students AS
  SELECT
    cm.classroom_id,
    p.id            AS student_id,
    p.full_name,
    p.avatar_url,
    p.xp,
    p.streak_count,
    CASE
      WHEN p.streak_count = 0 THEN 'no_streak'
      WHEN p.xp < 100         THEN 'low_xp'
      ELSE 'ok'
    END             AS risk_level
  FROM public.classroom_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE p.streak_count = 0 OR p.xp < 200;

GRANT SELECT ON public.at_risk_students TO authenticated;
