-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Live Study Rooms, Peer Explanation Engine,
--          Collaborative Doubt Room, Formula AR
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. live_study_rooms ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_study_rooms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  subject    TEXT,
  host_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_study_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_rooms_read_all"
  ON public.live_study_rooms FOR SELECT
  USING (true);

CREATE POLICY "live_rooms_host_write"
  ON public.live_study_rooms FOR ALL
  USING  (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE INDEX IF NOT EXISTS idx_live_rooms_active
  ON public.live_study_rooms (is_active, created_at DESC);

-- ── 2. live_room_messages ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_room_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID        NOT NULL REFERENCES public.live_study_rooms(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name  TEXT        NOT NULL DEFAULT 'AI Librarian',
  message_type TEXT        NOT NULL CHECK (message_type IN ('chat', 'ai_answer', 'question', 'system')),
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_room_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_messages_read_all"
  ON public.live_room_messages FOR SELECT
  USING (true);

CREATE POLICY "live_messages_insert_auth"
  ON public.live_room_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_live_messages_room
  ON public.live_room_messages (room_id, created_at ASC);

-- ── 3. peer_explanations ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.peer_explanations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject          TEXT        NOT NULL,
  topic            TEXT        NOT NULL,
  explanation_text TEXT        NOT NULL,
  novo_score       INTEGER     NOT NULL DEFAULT 0 CHECK (novo_score >= 0 AND novo_score <= 100),
  novo_feedback    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.peer_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peer_explanations_own"
  ON public.peer_explanations FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_peer_explanations_user
  ON public.peer_explanations (user_id, created_at DESC);

-- ── 4. doubt_room_posts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doubt_room_posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  subject    TEXT        NOT NULL,
  chapter    TEXT,
  tags       TEXT[]      NOT NULL DEFAULT '{}',
  views      INTEGER     NOT NULL DEFAULT 0,
  is_solved  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.doubt_room_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doubt_posts_read_all"
  ON public.doubt_room_posts FOR SELECT
  USING (true);

CREATE POLICY "doubt_posts_own_write"
  ON public.doubt_room_posts FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "doubt_posts_update_views"
  ON public.doubt_room_posts FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_doubt_posts_subject
  ON public.doubt_room_posts (subject, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doubt_posts_recent
  ON public.doubt_room_posts (created_at DESC);

-- ── 5. doubt_room_answers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doubt_room_answers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES public.doubt_room_posts(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        TEXT        NOT NULL,
  is_accepted BOOLEAN     NOT NULL DEFAULT false,
  is_ai       BOOLEAN     NOT NULL DEFAULT false,
  upvotes     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.doubt_room_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doubt_answers_read_all"
  ON public.doubt_room_answers FOR SELECT
  USING (true);

CREATE POLICY "doubt_answers_insert_auth"
  ON public.doubt_room_answers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "doubt_answers_update_all"
  ON public.doubt_room_answers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_doubt_answers_post
  ON public.doubt_room_answers (post_id, is_accepted DESC, upvotes DESC);

-- ── 6. doubt_room_votes ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doubt_room_votes (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID        NOT NULL REFERENCES public.doubt_room_answers(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (answer_id, user_id)
);

ALTER TABLE public.doubt_room_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doubt_votes_own"
  ON public.doubt_room_votes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 7. Answer count view ──────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.doubt_post_stats AS
SELECT
  p.id                                        AS post_id,
  COUNT(a.id)                                 AS answer_count,
  COALESCE(SUM(a.upvotes), 0)                 AS total_upvotes,
  bool_or(a.is_accepted)                      AS has_accepted_answer
FROM public.doubt_room_posts p
LEFT JOIN public.doubt_room_answers a ON a.post_id = p.id
GROUP BY p.id;

-- ── 8. Realtime: enable broadcast + presence for live rooms ───────────────────
-- (These are enabled via Supabase Dashboard — Realtime > Tables)
-- Ensuring live_room_messages is in the publication:

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'live_room_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_room_messages;
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- publication may not exist in all envs
END $$;

COMMENT ON TABLE public.live_study_rooms IS
  'Multi-user live study rooms with AI Librarian — Phase 3.';

COMMENT ON TABLE public.peer_explanations IS
  'Feynman Technique engine — student explanations evaluated by Novo AI.';

COMMENT ON TABLE public.doubt_room_posts IS
  'Community doubt board — Stack Overflow style for JEE/NEET.';
