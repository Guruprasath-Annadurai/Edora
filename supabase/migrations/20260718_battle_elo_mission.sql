-- ── Battle ELO rating column ───────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS battle_elo INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS battle_elo_updated_at TIMESTAMPTZ;

-- ── Today's Mission completion tracking ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_mission_completions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quiz_done   BOOLEAN NOT NULL DEFAULT FALSE,
  cards_done  BOOLEAN NOT NULL DEFAULT FALSE,
  chat_done   BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_xp_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mission_date)
);

-- RLS
ALTER TABLE daily_mission_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own mission completions" ON daily_mission_completions
  FOR ALL USING (auth.uid() = user_id);

-- ── Streak freeze gifting log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freeze_gifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_cost      INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE freeze_gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own gifts" ON freeze_gifts
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users create gifts" ON freeze_gifts
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- ── RPC: gift a streak freeze ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gift_streak_freeze(
  p_from_user_id UUID,
  p_to_user_id   UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_xp    INTEGER;
  v_to_freezes INTEGER;
  v_xp_cost    INTEGER := 100;
BEGIN
  -- Check gifter has enough XP
  SELECT xp INTO v_from_xp FROM profiles WHERE id = p_from_user_id;
  IF v_from_xp < v_xp_cost THEN
    RETURN jsonb_build_object('error', 'Not enough XP. You need 100 XP to gift a freeze.');
  END IF;

  -- Check recipient freeze cap
  SELECT streak_freeze_count INTO v_to_freezes FROM profiles WHERE id = p_to_user_id;
  IF v_to_freezes >= 10 THEN
    RETURN jsonb_build_object('error', 'Friend already has the maximum 10 freezes.');
  END IF;

  -- Deduct XP from gifter
  UPDATE profiles SET xp = xp - v_xp_cost WHERE id = p_from_user_id;

  -- Add freeze to recipient
  UPDATE profiles SET streak_freeze_count = LEAST(10, streak_freeze_count + 1) WHERE id = p_to_user_id;

  -- Log the gift
  INSERT INTO freeze_gifts (from_user_id, to_user_id, xp_cost)
  VALUES (p_from_user_id, p_to_user_id, v_xp_cost);

  RETURN jsonb_build_object('success', true, 'xp_deducted', v_xp_cost);
END;
$$;
