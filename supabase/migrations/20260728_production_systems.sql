-- ═══════════════════════════════════════════════════════════════════════════
-- Production Systems: AI Safety Columns + Referral System + Push Triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. AI Question Safety Columns ────────────────────────────────────────────

ALTER TABLE public.ai_questions
  ADD COLUMN IF NOT EXISTS confidence          NUMERIC(4,3) DEFAULT 0.85 CHECK (confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS verify_in_textbook  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ncert_reference     TEXT,
  ADD COLUMN IF NOT EXISTS flags               TEXT[]       NOT NULL DEFAULT '{}';

-- Index: lets the app quickly fetch only high-confidence questions for exam mode
CREATE INDEX IF NOT EXISTS idx_ai_questions_confidence
  ON public.ai_questions (confidence DESC, subject, difficulty);

-- ── 2. Referral System ───────────────────────────────────────────────────────

-- Add referral_code to profiles (generated at signup, unique per user)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_xp_earned INTEGER NOT NULL DEFAULT 0;

-- Backfill referral codes for existing users (8-char uppercase alphanumeric)
UPDATE public.profiles
SET referral_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Ensure new users always get a code via trigger
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON public.profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();

-- Referral tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'signed_up'
                  CHECK (status IN ('signed_up','study_milestone','pro_converted')),
  xp_awarded      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at    TIMESTAMPTZ,
  UNIQUE (referrer_id, referee_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals_own" ON public.referrals;
CREATE POLICY "referrals_own" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- XP rewards by referral stage (editable by ops without code deploy)
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  status          TEXT PRIMARY KEY,
  referrer_xp     INTEGER NOT NULL DEFAULT 0,
  referee_xp      INTEGER NOT NULL DEFAULT 0,
  description     TEXT
);

INSERT INTO public.referral_rewards (status, referrer_xp, referee_xp, description) VALUES
  ('signed_up',       100,  50,  'Friend joined Edora'),
  ('study_milestone', 200, 100,  'Friend completed 10 study sessions'),
  ('pro_converted',   500, 250,  'Friend upgraded to Pro')
ON CONFLICT (status) DO NOTHING;

-- Function: process referral when a new user signs up with a referral code
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referee_id   UUID,
  p_referral_code TEXT
) RETURNS JSONB AS $$
DECLARE
  v_referrer_id  UUID;
  v_reward       public.referral_rewards%ROWTYPE;
BEGIN
  -- Find referrer
  SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = p_referral_code;
  IF v_referrer_id IS NULL OR v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Record on profiles
  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = p_referee_id;

  -- Insert referral record (ignore if already exists)
  INSERT INTO public.referrals (referrer_id, referee_id, status, xp_awarded)
  SELECT v_referrer_id, p_referee_id, 'signed_up', rr.referrer_xp
  FROM   public.referral_rewards rr WHERE rr.status = 'signed_up'
  ON CONFLICT (referrer_id, referee_id) DO NOTHING;

  -- Award XP to referrer
  SELECT * INTO v_reward FROM public.referral_rewards WHERE status = 'signed_up';
  UPDATE public.profiles SET
    xp              = xp + v_reward.referrer_xp,
    referral_xp_earned = referral_xp_earned + v_reward.referrer_xp
  WHERE id = v_referrer_id;

  -- Award bonus XP to referee
  UPDATE public.profiles SET xp = xp + v_reward.referee_xp WHERE id = p_referee_id;

  RETURN jsonb_build_object(
    'success',       true,
    'referrer_id',   v_referrer_id,
    'referrer_xp',   v_reward.referrer_xp,
    'referee_xp',    v_reward.referee_xp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View: referral leaderboard for ProfilePage
CREATE OR REPLACE VIEW public.my_referrals AS
SELECT
  r.referrer_id,
  r.referee_id,
  p.full_name   AS referee_name,
  p.avatar_url  AS referee_avatar,
  r.status,
  r.xp_awarded,
  r.created_at
FROM public.referrals r
JOIN public.profiles p ON p.id = r.referee_id;

-- ── 3. Push Notification Triggers ────────────────────────────────────────────

-- Track when a user last had a rank-drop notification
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_rank_push_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_referral_push_at TIMESTAMPTZ;

-- Leaderboard rank snapshot for detecting rank drops
CREATE TABLE IF NOT EXISTS public.rank_snapshots (
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rank_pos    INTEGER     NOT NULL,
  xp          INTEGER     NOT NULL,
  PRIMARY KEY (user_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_user_time
  ON public.rank_snapshots (user_id, snapshot_at DESC);

-- Cleanup old snapshots (keep last 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_rank_snapshots() RETURNS void AS $$
BEGIN
  DELETE FROM public.rank_snapshots WHERE snapshot_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ── 4. Content Report System (student-reported bad questions) ─────────────────

CREATE TABLE IF NOT EXISTS public.question_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id     UUID,                   -- NULL if not from ai_questions table
  question_text   TEXT        NOT NULL,   -- store question verbatim for audit trail
  report_type     TEXT        NOT NULL CHECK (report_type IN ('wrong_answer','ambiguous','outdated','inappropriate','other')),
  details         TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','fixed','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_own" ON public.question_reports;
CREATE POLICY "reports_own" ON public.question_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow service role to read all reports for moderation
DROP POLICY IF EXISTS "reports_service_read" ON public.question_reports;
CREATE POLICY "reports_service_read" ON public.question_reports
  FOR SELECT TO service_role USING (true);

-- Index for ops dashboard
CREATE INDEX IF NOT EXISTS idx_question_reports_status
  ON public.question_reports (status, created_at DESC);

-- ── 5. Session Analytics for A/B Testing ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT    NOT NULL UNIQUE,
  description   TEXT,
  variants      TEXT[]  NOT NULL,   -- e.g. ['control','variant_a','variant_b']
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  user_id       UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  experiment_id UUID    NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant       TEXT    NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_id)
);

ALTER TABLE public.ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ab_exp_public_read" ON public.ab_experiments;
CREATE POLICY "ab_exp_public_read" ON public.ab_experiments FOR SELECT USING (true);

DROP POLICY IF EXISTS "ab_assign_own" ON public.ab_assignments;
CREATE POLICY "ab_assign_own" ON public.ab_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed initial experiments
INSERT INTO public.ab_experiments (name, description, variants) VALUES
  ('paywall_cta',     'Test CTA button copy on ProSubscriptionPage',     ARRAY['control','variant_a']),
  ('onboarding_flow', 'Test 4-step vs 6-step onboarding',                ARRAY['short','full']),
  ('daily_goal',      'Show vs hide daily XP goal on HomePage',          ARRAY['control','goal_shown'])
ON CONFLICT (name) DO NOTHING;

-- Function: assign user to experiment variant (deterministic hash-based)
CREATE OR REPLACE FUNCTION public.get_ab_variant(
  p_user_id       UUID,
  p_experiment    TEXT
) RETURNS TEXT AS $$
DECLARE
  v_exp     public.ab_experiments%ROWTYPE;
  v_assign  public.ab_assignments%ROWTYPE;
  v_idx     INTEGER;
  v_variant TEXT;
BEGIN
  SELECT * INTO v_exp FROM public.ab_experiments WHERE name = p_experiment AND is_active;
  IF NOT FOUND THEN RETURN 'control'; END IF;

  SELECT * INTO v_assign FROM public.ab_assignments
  WHERE user_id = p_user_id AND experiment_id = v_exp.id;
  IF FOUND THEN RETURN v_assign.variant; END IF;

  -- Deterministic: hash(user_id || experiment name) mod variant count
  v_idx     := abs(hashtext(p_user_id::text || p_experiment)) % array_length(v_exp.variants, 1);
  v_variant := v_exp.variants[v_idx + 1];

  INSERT INTO public.ab_assignments (user_id, experiment_id, variant)
  VALUES (p_user_id, v_exp.id, v_variant)
  ON CONFLICT (user_id, experiment_id) DO NOTHING;

  RETURN v_variant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
