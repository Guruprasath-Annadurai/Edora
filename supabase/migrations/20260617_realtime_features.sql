-- ═══════════════════════════════════════════════════════════════════════════
-- Real-time Features — Leaderboard · Study Circles · Teacher Broadcast · 1v1
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enable Realtime on key tables ─────────────────────────────────────────
-- profiles.xp changes drive the live leaderboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_members;

-- ── 2. Study circles (lightweight group presence) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_circles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id UUID       REFERENCES public.classrooms(id) ON DELETE SET NULL,
  invite_code TEXT        UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  max_members INTEGER     NOT NULL DEFAULT 8,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_circle_members (
  circle_id   UUID NOT NULL REFERENCES public.study_circles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

ALTER TABLE public.study_circles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_members_read" ON public.study_circles;
CREATE POLICY "circle_members_read" ON public.study_circles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_circle_members
      WHERE circle_id = study_circles.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "circle_members_self" ON public.study_circle_members;
CREATE POLICY "circle_members_self" ON public.study_circle_members
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. 1v1 Battles table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.battles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player2_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic         TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled')),
  player1_score INTEGER     NOT NULL DEFAULT 0,
  player2_score INTEGER     NOT NULL DEFAULT 0,
  winner_id     UUID        REFERENCES public.profiles(id),
  question_ids  UUID[]      NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS battles_players_idx ON public.battles (player1_id, player2_id, status);

ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "battle_participants" ON public.battles;
CREATE POLICY "battle_participants" ON public.battles
  FOR ALL USING (auth.uid() = player1_id OR auth.uid() = player2_id)
  WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Enable Realtime on battles so scores sync instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.battles;

-- ── 4. Teacher broadcast log (optional persistence) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_broadcasts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID        NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message       TEXT        NOT NULL,
  message_type  TEXT        NOT NULL DEFAULT 'info' CHECK (message_type IN ('info','warning','quiz_start')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classroom_members_read_broadcasts" ON public.teacher_broadcasts;
CREATE POLICY "classroom_members_read_broadcasts" ON public.teacher_broadcasts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members
      WHERE classroom_id = teacher_broadcasts.classroom_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teachers_insert_broadcasts" ON public.teacher_broadcasts;
CREATE POLICY "teachers_insert_broadcasts" ON public.teacher_broadcasts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classrooms
      WHERE id = teacher_broadcasts.classroom_id AND teacher_id = auth.uid()
    )
  );

-- ── 5. Leaderboard view (materialized-friendly) ───────────────────────────────
CREATE OR REPLACE VIEW public.classroom_leaderboard AS
  SELECT
    cm.classroom_id,
    p.id          AS user_id,
    p.full_name,
    p.avatar_url,
    p.xp,
    RANK() OVER (PARTITION BY cm.classroom_id ORDER BY p.xp DESC) AS rank
  FROM public.classroom_members cm
  JOIN public.profiles           p ON p.id = cm.user_id;

-- Grant authenticated users read access
GRANT SELECT ON public.classroom_leaderboard TO authenticated;
