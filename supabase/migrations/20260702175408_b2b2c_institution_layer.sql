-- ── Institution profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.institutions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  city            TEXT,
  state           TEXT,
  board           TEXT        CHECK (board IN ('CBSE','ICSE','State Board','IB','IGCSE','Other')),
  tier            TEXT        NOT NULL DEFAULT 'free'
                  CHECK (tier IN ('free','starter','pro','enterprise')),
  max_students    INTEGER     NOT NULL DEFAULT 50,
  join_code       TEXT        UNIQUE NOT NULL,
  join_link_token TEXT        UNIQUE NOT NULL,
  admin_user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  logo_url        TEXT,
  is_verified     BOOLEAN     NOT NULL DEFAULT false,
  student_count   INTEGER     NOT NULL DEFAULT 0,
  pro_expires_at  TIMESTAMPTZ,
  contact_email   TEXT,
  phone           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inst_admin_all" ON public.institutions;
CREATE POLICY "inst_admin_all" ON public.institutions
  FOR ALL USING (auth.uid() = admin_user_id) WITH CHECK (auth.uid() = admin_user_id);

CREATE INDEX IF NOT EXISTS idx_institutions_admin ON public.institutions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_institutions_join_code ON public.institutions (join_code);

-- ── Institution members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.institution_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'student'
                  CHECK (role IN ('admin','teacher','student')),
  class_section   TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);

ALTER TABLE public.institution_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inst_mem_own" ON public.institution_members;
CREATE POLICY "inst_mem_own" ON public.institution_members
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = institution_id AND i.admin_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "inst_mem_admin_write" ON public.institution_members;
CREATE POLICY "inst_mem_admin_write" ON public.institution_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = institution_id AND i.admin_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = institution_id AND i.admin_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "inst_mem_self_join" ON public.institution_members;
CREATE POLICY "inst_mem_self_join" ON public.institution_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_inst_members_inst ON public.institution_members (institution_id);
CREATE INDEX IF NOT EXISTS idx_inst_members_user ON public.institution_members (user_id);

DROP POLICY IF EXISTS "inst_member_read" ON public.institutions;
CREATE POLICY "inst_member_read" ON public.institutions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.institution_members m WHERE m.institution_id = id AND m.user_id = auth.uid())
  );

-- ── Update student_count on member change ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_institution_student_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.institutions
  SET student_count = (
    SELECT COUNT(*) FROM public.institution_members
    WHERE institution_id = COALESCE(NEW.institution_id, OLD.institution_id)
      AND role = 'student'
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.institution_id, OLD.institution_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_student_count ON public.institution_members;
CREATE TRIGGER trg_sync_student_count
  AFTER INSERT OR DELETE OR UPDATE OF role ON public.institution_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_institution_student_count();

-- ── Institution link on profiles ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_institution ON public.profiles (institution_id);

-- ── Join institution via code ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_institution(p_join_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_inst        public.institutions%ROWTYPE;
  v_user_id     UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_inst FROM public.institutions WHERE join_code = upper(p_join_code);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid join code');
  END IF;

  IF v_inst.student_count >= v_inst.max_students THEN
    RETURN jsonb_build_object('success', false, 'error', 'This institution has reached its student limit');
  END IF;

  IF EXISTS (SELECT 1 FROM public.institution_members WHERE institution_id = v_inst.id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', true, 'institution_name', v_inst.name, 'already_member', true);
  END IF;

  INSERT INTO public.institution_members (institution_id, user_id, role)
  VALUES (v_inst.id, v_user_id, 'student');

  UPDATE public.profiles SET institution_id = v_inst.id, school_name = v_inst.name
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'institution_id',   v_inst.id,
    'institution_name', v_inst.name,
    'already_member',   false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Create institution (admin self-service) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_institution(
  p_name  TEXT,
  p_city  TEXT,
  p_state TEXT,
  p_board TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_inst_id  UUID;
  v_code     TEXT;
  v_token    TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM public.institutions WHERE admin_user_id = v_user_id) THEN
    SELECT id INTO v_inst_id FROM public.institutions WHERE admin_user_id = v_user_id LIMIT 1;
    RETURN jsonb_build_object('success', true, 'institution_id', v_inst_id, 'already_exists', true);
  END IF;

  v_code  := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := gen_random_uuid()::text;

  INSERT INTO public.institutions
    (name, city, state, board, join_code, join_link_token, admin_user_id)
  VALUES
    (p_name, p_city, p_state, p_board, v_code, v_token, v_user_id)
  RETURNING id INTO v_inst_id;

  INSERT INTO public.institution_members (institution_id, user_id, role)
  VALUES (v_inst_id, v_user_id, 'admin');

  UPDATE public.profiles SET institution_id = v_inst_id, school_name = p_name
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',        true,
    'institution_id', v_inst_id,
    'join_code',      v_code,
    'join_token',     v_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── School analytics aggregation view ─────────────────────────────────────
CREATE OR REPLACE VIEW public.institution_analytics AS
SELECT
  im.institution_id,
  COUNT(DISTINCT im.user_id)                                      AS total_students,
  COUNT(DISTINCT im.user_id) FILTER (WHERE p.streak_count > 0)   AS students_with_streak,
  ROUND(AVG(p.xp))                                                AS avg_xp,
  MAX(p.xp)                                                       AS top_xp,
  ROUND(AVG(p.streak_count))                                      AS avg_streak,
  SUM(p.xp)                                                       AS total_xp,
  COUNT(DISTINCT im.user_id) FILTER (WHERE p.is_pro)              AS pro_students,
  COUNT(DISTINCT im.user_id) FILTER (
    WHERE p.updated_at > now() - INTERVAL '7 days'
  )                                                               AS active_last_7d
FROM public.institution_members im
JOIN public.profiles p ON p.id = im.user_id
WHERE im.role = 'student'
GROUP BY im.institution_id;

-- ── Per-student analytics for principal dashboard ─────────────────────────
CREATE OR REPLACE VIEW public.institution_student_analytics AS
SELECT
  im.institution_id,
  im.user_id,
  im.class_section,
  im.joined_at,
  p.full_name,
  p.avatar_url,
  p.xp,
  p.streak_count,
  p.is_pro,
  p.exam_name,
  p.updated_at                   AS last_active,
  COALESCE(ts.total_sessions, 0) AS total_sessions,
  COALESCE(ts.correct_pct, 0)    AS accuracy_pct
FROM public.institution_members im
JOIN public.profiles p ON p.id = im.user_id
LEFT JOIN (
  SELECT
    user_id,
    COUNT(*) AS total_sessions,
    ROUND(AVG(CASE WHEN questions_count > 0 THEN (score::numeric / questions_count) * 100 ELSE NULL END))::INTEGER AS correct_pct
  FROM public.quiz_sessions
  GROUP BY user_id
) ts ON ts.user_id = im.user_id
WHERE im.role = 'student';

-- ── Weak-topic class summary (for teacher/admin) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_institution_weak_topics(p_institution_id UUID)
RETURNS TABLE (
  subject       TEXT,
  topic         TEXT,
  avg_struggle  NUMERIC,
  student_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.subject,
    ts.topic,
    ROUND(AVG(ts.struggle_count)::NUMERIC, 1) AS avg_struggle,
    COUNT(DISTINCT ts.user_id)               AS student_count
  FROM public.topic_stats ts
  JOIN public.institution_members im ON im.user_id = ts.user_id
  WHERE im.institution_id = p_institution_id
    AND im.role = 'student'
    AND ts.struggle_count > 2
  GROUP BY ts.subject, ts.topic
  ORDER BY avg_struggle DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Referral reward: streak freeze on successful referral ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freeze_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS referrer_streak_freezes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referee_streak_freezes  INTEGER NOT NULL DEFAULT 0;

UPDATE public.referral_rewards SET
  referrer_streak_freezes = CASE status
    WHEN 'signed_up'       THEN 0
    WHEN 'study_milestone' THEN 1
    WHEN 'pro_converted'   THEN 2
  END,
  referee_streak_freezes = CASE status
    WHEN 'signed_up'       THEN 0
    WHEN 'study_milestone' THEN 0
    WHEN 'pro_converted'   THEN 1
  END;

CREATE OR REPLACE FUNCTION public.process_referral(
  p_referee_id   UUID,
  p_referral_code TEXT
) RETURNS JSONB AS $$
DECLARE
  v_referrer_id  UUID;
  v_reward       public.referral_rewards%ROWTYPE;
BEGIN
  SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = p_referral_code;
  IF v_referrer_id IS NULL OR v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = p_referee_id;

  SELECT * INTO v_reward FROM public.referral_rewards WHERE status = 'signed_up';

  INSERT INTO public.referrals (referrer_id, referee_id, status, xp_awarded)
  VALUES (v_referrer_id, p_referee_id, 'signed_up', v_reward.referrer_xp)
  ON CONFLICT (referrer_id, referee_id) DO NOTHING;

  UPDATE public.profiles SET
    xp                   = xp + v_reward.referrer_xp,
    referral_xp_earned   = referral_xp_earned + v_reward.referrer_xp,
    streak_freeze_count  = streak_freeze_count + v_reward.referrer_streak_freezes
  WHERE id = v_referrer_id;

  UPDATE public.profiles SET
    xp                  = xp + v_reward.referee_xp,
    streak_freeze_count = streak_freeze_count + v_reward.referee_streak_freezes
  WHERE id = p_referee_id;

  RETURN jsonb_build_object(
    'success',       true,
    'referrer_id',   v_referrer_id,
    'referrer_xp',   v_reward.referrer_xp,
    'referee_xp',    v_reward.referee_xp,
    'streak_freezes', v_reward.referrer_streak_freezes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Rank snapshots for push notifications ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.snapshot_leaderboard_ranks() RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  INSERT INTO public.rank_snapshots (user_id, rank_pos, xp)
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank_pos,
    xp
  FROM public.profiles
  WHERE xp > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ── Push notification tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_type    TEXT        NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB
);

CREATE INDEX IF NOT EXISTS idx_push_log_user_type_time
  ON public.push_log (user_id, push_type, sent_at DESC);

CREATE OR REPLACE FUNCTION public.cleanup_push_log() RETURNS void AS $$
BEGIN
  DELETE FROM public.push_log WHERE sent_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
