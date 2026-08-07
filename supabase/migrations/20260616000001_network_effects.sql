-- ═══════════════════════════════════════════════════════════════════════════
-- Network Effects Migration
-- 1. Friend System          — username, friendships, nudges
-- 2. Study Buddy Matching   — auto-paired accountability partners
-- 3. Circle Chat            — in-app messaging inside study circles
-- 4. Shareable Achievements — milestone tracking for card generation
-- 5. School Leaderboard     — public school ranking page
-- 6. Live Events            — synchronized national quiz
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Friend System ──────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS last_active  TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);

-- Backfill usernames for existing users (slug from full_name + short id)
UPDATE public.profiles
SET username = lower(regexp_replace(COALESCE(full_name, 'student'), '[^a-zA-Z0-9]', '', 'g')) || '_' || substr(id::text, 1, 5)
WHERE username IS NULL;

CREATE TABLE IF NOT EXISTS public.friendships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CHECK (user_id <> friend_id),
  UNIQUE (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS friendships_user_idx   ON public.friendships (user_id, status);
CREATE INDEX IF NOT EXISTS friendships_friend_idx ON public.friendships (friend_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friendships_participants" ON public.friendships;
CREATE POLICY "friendships_participants" ON public.friendships
  FOR ALL USING (auth.uid() = user_id OR auth.uid() = friend_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- RPC: accept a friend request (creates the reciprocal row implicitly via view)
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_friendship_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.friendships
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_friendship_id AND friend_id = auth.uid() AND status = 'pending';
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_friend_request TO authenticated;

-- View: bidirectional accepted friends (easy querying from either side)
CREATE OR REPLACE VIEW public.my_friends AS
  SELECT user_id AS me, friend_id AS friend_id FROM public.friendships WHERE status = 'accepted'
  UNION
  SELECT friend_id AS me, user_id AS friend_id FROM public.friendships WHERE status = 'accepted';

GRANT SELECT ON public.my_friends TO authenticated;

-- Nudges — "send a wake-up nudge" to an inactive friend
CREATE TABLE IF NOT EXISTS public.friend_nudges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     TEXT        NOT NULL DEFAULT 'Your friend nudged you to study! 🔥',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen        BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS nudges_to_user_idx ON public.friend_nudges (to_user, created_at DESC);

ALTER TABLE public.friend_nudges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nudges_participants" ON public.friend_nudges;
CREATE POLICY "nudges_participants" ON public.friend_nudges
  FOR ALL USING (auth.uid() = from_user OR auth.uid() = to_user)
  WITH CHECK (auth.uid() = from_user);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_nudges;

-- Rate-limit nudges: max 1 nudge per friend per 24h
CREATE OR REPLACE FUNCTION public.send_nudge(p_to_user UUID, p_message TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_recent INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_recent FROM public.friend_nudges
  WHERE from_user = auth.uid() AND to_user = p_to_user AND created_at > now() - INTERVAL '24 hours';

  IF v_recent > 0 THEN
    RAISE EXCEPTION 'already_nudged_today';
  END IF;

  INSERT INTO public.friend_nudges (from_user, to_user, message)
  VALUES (auth.uid(), p_to_user, COALESCE(p_message, 'Your friend nudged you to study! 🔥'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_nudge TO authenticated;

-- ── 2. Study Buddy Matching ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.study_buddies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buddy_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  matched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  pair_streak     INTEGER     NOT NULL DEFAULT 0,
  last_both_studied DATE,
  active          BOOLEAN     NOT NULL DEFAULT true,
  CHECK (user_id <> buddy_id),
  UNIQUE (user_id, buddy_id)
);

CREATE INDEX IF NOT EXISTS study_buddies_user_idx ON public.study_buddies (user_id, active);

ALTER TABLE public.study_buddies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buddies_participants" ON public.study_buddies;
CREATE POLICY "buddies_participants" ON public.study_buddies
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = buddy_id);
DROP POLICY IF EXISTS "buddies_service_write" ON public.study_buddies;
CREATE POLICY "buddies_service_write" ON public.study_buddies
  FOR ALL USING (auth.role() = 'service_role');

-- Daily check-ins per buddy pair
CREATE TABLE IF NOT EXISTS public.buddy_checkins (
  buddy_pair_id   UUID        NOT NULL REFERENCES public.study_buddies(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkin_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  studied         BOOLEAN     NOT NULL DEFAULT true,
  PRIMARY KEY (buddy_pair_id, user_id, checkin_date)
);

ALTER TABLE public.buddy_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkins_own" ON public.buddy_checkins;
CREATE POLICY "checkins_own" ON public.buddy_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "checkins_pair_read" ON public.buddy_checkins;
CREATE POLICY "checkins_pair_read" ON public.buddy_checkins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_buddies sb
      WHERE sb.id = buddy_checkins.buddy_pair_id
        AND (sb.user_id = auth.uid() OR sb.buddy_id = auth.uid())
    )
  );

-- RPC: record today's check-in, award bonus XP if both studied
CREATE OR REPLACE FUNCTION public.buddy_checkin(p_pair_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pair RECORD;
  v_other_id UUID;
  v_other_checked BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT * INTO v_pair FROM public.study_buddies WHERE id = p_pair_id;
  IF v_pair IS NULL THEN RAISE EXCEPTION 'pair_not_found'; END IF;

  v_other_id := CASE WHEN v_pair.user_id = auth.uid() THEN v_pair.buddy_id ELSE v_pair.user_id END;

  INSERT INTO public.buddy_checkins (buddy_pair_id, user_id, checkin_date)
  VALUES (p_pair_id, auth.uid(), CURRENT_DATE)
  ON CONFLICT (buddy_pair_id, user_id, checkin_date) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.buddy_checkins
    WHERE buddy_pair_id = p_pair_id AND user_id = v_other_id AND checkin_date = CURRENT_DATE
  ) INTO v_other_checked;

  IF v_other_checked THEN
    -- Both studied today — award bonus XP + bump pair streak
    PERFORM public.increment_xp(v_pair.user_id, 50);
    PERFORM public.increment_xp(v_pair.buddy_id, 50);
    UPDATE public.study_buddies SET
      pair_streak = CASE
        WHEN last_both_studied = CURRENT_DATE - 1 THEN pair_streak + 1
        WHEN last_both_studied = CURRENT_DATE THEN pair_streak
        ELSE 1
      END,
      last_both_studied = CURRENT_DATE
    WHERE id = p_pair_id;
    v_result := jsonb_build_object('both_studied', true, 'bonus_xp', 50);
  ELSE
    v_result := jsonb_build_object('both_studied', false, 'bonus_xp', 0);
  END IF;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.buddy_checkin TO authenticated;

-- RPC: auto-match a study buddy based on study_level + weak subjects
CREATE OR REPLACE FUNCTION public.match_study_buddy()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_candidate UUID;
  v_pair_id UUID;
  v_my_level study_level;
BEGIN
  -- Already has an active buddy — return existing pair
  SELECT id INTO v_pair_id FROM public.study_buddies
  WHERE (user_id = auth.uid() OR buddy_id = auth.uid()) AND active = true
  LIMIT 1;
  IF v_pair_id IS NOT NULL THEN RETURN v_pair_id; END IF;

  SELECT study_level INTO v_my_level FROM public.profiles WHERE id = auth.uid();

  -- Find a candidate with the same study_level, not already buddied, not self
  SELECT p.id INTO v_candidate
  FROM public.profiles p
  WHERE p.study_level = v_my_level
    AND p.id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.study_buddies sb
      WHERE (sb.user_id = p.id OR sb.buddy_id = p.id) AND sb.active = true
    )
  ORDER BY p.last_active DESC
  LIMIT 1;

  IF v_candidate IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.study_buddies (user_id, buddy_id)
  VALUES (auth.uid(), v_candidate)
  RETURNING id INTO v_pair_id;

  RETURN v_pair_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.match_study_buddy TO authenticated;

-- ── 3. Circle Chat ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.circle_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID        NOT NULL REFERENCES public.study_circles(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     TEXT        CHECK (length(message) <= 1000),
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circle_messages_circle_idx ON public.circle_messages (circle_id, created_at DESC);

ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "circle_messages_members" ON public.circle_messages;
CREATE POLICY "circle_messages_members" ON public.circle_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_circle_members
      WHERE circle_id = circle_messages.circle_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;

-- Emoji reactions on circle messages
CREATE TABLE IF NOT EXISTS public.circle_message_reactions (
  message_id  UUID NOT NULL REFERENCES public.circle_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL DEFAULT '🔥',
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.circle_message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmr_members" ON public.circle_message_reactions;
CREATE POLICY "cmr_members" ON public.circle_message_reactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.circle_messages cm
      JOIN public.study_circle_members scm ON scm.circle_id = cm.circle_id
      WHERE cm.id = circle_message_reactions.message_id AND scm.user_id = auth.uid()
    )
  )
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_message_reactions;

-- ── 4. Shareable Achievement Cards — milestone metadata ──────────────────────
-- Reuses achievement_feed (already exists). Add a "card_generated" flag so we
-- don't regenerate the same milestone twice, plus a milestone type check.

ALTER TABLE public.achievement_feed
  ADD COLUMN IF NOT EXISTS card_shared BOOLEAN NOT NULL DEFAULT false;

-- ── 5. School Leaderboard — public read access ────────────────────────────────
-- profiles.school_name / school_id already exist (added in social_competitive migration)

-- Public RPC: school leaderboard (no auth required, safe subset of fields)
CREATE OR REPLACE FUNCTION public.get_school_leaderboard(p_school_name TEXT)
RETURNS TABLE (
  rank_pos    INTEGER,
  full_name   TEXT,
  avatar_url  TEXT,
  xp          INTEGER,
  streak_count INTEGER
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY xp DESC)::INTEGER AS rank_pos,
    full_name, avatar_url, xp, streak_count
  FROM public.profiles
  WHERE school_name = p_school_name
  ORDER BY xp DESC
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.get_school_leaderboard TO anon, authenticated;

-- Public RPC: school weekly total XP + rank among all schools
CREATE OR REPLACE FUNCTION public.get_school_summary(p_school_name TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_xp INTEGER;
  v_student_count INTEGER;
  v_school_rank INTEGER;
BEGIN
  SELECT COALESCE(SUM(xp), 0), COUNT(*) INTO v_total_xp, v_student_count
  FROM public.profiles WHERE school_name = p_school_name;

  SELECT COUNT(*) + 1 INTO v_school_rank
  FROM (
    SELECT school_name, SUM(xp) AS school_xp
    FROM public.profiles
    WHERE school_name IS NOT NULL
    GROUP BY school_name
    HAVING SUM(xp) > v_total_xp
  ) t;

  RETURN jsonb_build_object(
    'school_name', p_school_name,
    'total_xp', v_total_xp,
    'student_count', v_student_count,
    'school_rank', v_school_rank
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_school_summary TO anon, authenticated;

-- ── 6. Live Events — synchronized national quiz ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  description     TEXT,
  subject         TEXT        NOT NULL DEFAULT 'Mixed',
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER     NOT NULL DEFAULT 20,
  question_ids    UUID[]      NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','cancelled')),
  winner_id       UUID        REFERENCES public.profiles(id),
  reward_badge    TEXT        NOT NULL DEFAULT '🏆 National Champion',
  reward_pro_days INTEGER     NOT NULL DEFAULT 30,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_events_scheduled_idx ON public.live_events (scheduled_at, status);

ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_events_read_all" ON public.live_events;
CREATE POLICY "live_events_read_all" ON public.live_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "live_events_service_write" ON public.live_events;
CREATE POLICY "live_events_service_write" ON public.live_events
  FOR ALL USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_events;

GRANT SELECT ON public.live_events TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.live_event_participants (
  event_id      UUID        NOT NULL REFERENCES public.live_events(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score         INTEGER     NOT NULL DEFAULT 0,
  time_secs     INTEGER,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_event_participants_score_idx ON public.live_event_participants (event_id, score DESC);

ALTER TABLE public.live_event_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lep_own_write" ON public.live_event_participants;
CREATE POLICY "lep_own_write" ON public.live_event_participants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "lep_read_all" ON public.live_event_participants;
CREATE POLICY "lep_read_all" ON public.live_event_participants FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_event_participants;

GRANT SELECT ON public.live_event_participants TO anon, authenticated;

-- RPC: submit live event score, auto-crown winner when event ends
CREATE OR REPLACE FUNCTION public.submit_live_event_score(
  p_event_id UUID, p_score INTEGER, p_time_secs INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.live_event_participants (event_id, user_id, score, time_secs, completed_at)
  VALUES (p_event_id, auth.uid(), p_score, p_time_secs, now())
  ON CONFLICT (event_id, user_id) DO UPDATE SET
    score = EXCLUDED.score, time_secs = EXCLUDED.time_secs, completed_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_live_event_score TO authenticated;

-- RPC: finalize event — pick winner (highest score, fastest time as tiebreak), award rewards
CREATE OR REPLACE FUNCTION public.finalize_live_event(p_event_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_winner UUID;
BEGIN
  SELECT user_id INTO v_winner
  FROM public.live_event_participants
  WHERE event_id = p_event_id
  ORDER BY score DESC, time_secs ASC
  LIMIT 1;

  UPDATE public.live_events SET status = 'completed', winner_id = v_winner WHERE id = p_event_id;

  IF v_winner IS NOT NULL THEN
    PERFORM public.increment_xp(v_winner, 500);
    PERFORM public.post_achievement(
      v_winner, 'achievement_unlocked', 'National Champion! 🏆',
      'Won the live event', '🏆', jsonb_build_object('event_id', p_event_id)
    );
  END IF;

  RETURN v_winner;
END;
$$;
GRANT EXECUTE ON FUNCTION public.finalize_live_event TO service_role;

-- ── 7. Storage — public-media bucket for circle photos + achievement cards ───

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('public-media', 'public-media', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public_media_authenticated_upload') THEN
    CREATE POLICY "public_media_authenticated_upload" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'public-media' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public_media_read_all') THEN
    CREATE POLICY "public_media_read_all" ON storage.objects FOR SELECT
      USING (bucket_id = 'public-media');
  END IF;
END $$;
