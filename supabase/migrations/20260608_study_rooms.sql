-- ═══════════════════════════════════════════════════════════════
-- Edora — Real-Time Study Rooms
-- Powers the Group Sprint / Study Room feature.
-- Realtime: channel broadcast + presence (no Postgres Changes needed)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. study_rooms ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT        NOT NULL UNIQUE,
  host_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject           TEXT        NOT NULL DEFAULT '',
  topic             TEXT        NOT NULL DEFAULT '',
  status            TEXT        NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','studying','quiz','complete')),
  questions         JSONB       NOT NULL DEFAULT '[]',
  study_duration    INTEGER     NOT NULL DEFAULT 300,   -- seconds (default 5 min)
  question_duration INTEGER     NOT NULL DEFAULT 20,    -- seconds per question
  quiz_started_at   BIGINT,                             -- JS Date.now() ms when quiz started
  max_members       INTEGER     NOT NULL DEFAULT 5,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_rooms_code_length CHECK (char_length(code) = 6)
);

CREATE INDEX IF NOT EXISTS study_rooms_code_idx    ON public.study_rooms(code);
CREATE INDEX IF NOT EXISTS study_rooms_host_idx    ON public.study_rooms(host_id);
CREATE INDEX IF NOT EXISTS study_rooms_created_idx ON public.study_rooms(created_at DESC);

-- ── 2. study_room_members ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_room_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID        NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  avatar_url TEXT,
  score      INTEGER     NOT NULL DEFAULT 0,
  answers    JSONB       NOT NULL DEFAULT '[]', -- [{question_idx,answer_idx,is_correct}]
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS study_room_members_room_idx ON public.study_room_members(room_id);
CREATE INDEX IF NOT EXISTS study_room_members_user_idx ON public.study_room_members(user_id);

-- ── 3. RLS — study_rooms ──────────────────────────────────────────────────────
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Anyone authenticated can read rooms (code is the access gate)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_rooms' AND policyname='Authenticated users read rooms') THEN
    CREATE POLICY "Authenticated users read rooms"
      ON public.study_rooms FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  -- Anyone authenticated can create a room
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_rooms' AND policyname='Users create rooms') THEN
    CREATE POLICY "Users create rooms"
      ON public.study_rooms FOR INSERT
      WITH CHECK (auth.uid() = host_id);
  END IF;
  -- Only host can update/delete
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_rooms' AND policyname='Host updates room') THEN
    CREATE POLICY "Host updates room"
      ON public.study_rooms FOR UPDATE
      USING (auth.uid() = host_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_rooms' AND policyname='Host deletes room') THEN
    CREATE POLICY "Host deletes room"
      ON public.study_rooms FOR DELETE
      USING (auth.uid() = host_id);
  END IF;
END $$;

-- ── 4. RLS — study_room_members ───────────────────────────────────────────────
ALTER TABLE public.study_room_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Any authenticated user can read members (room code is the access gate)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_room_members' AND policyname='Authenticated users read members') THEN
    CREATE POLICY "Authenticated users read members"
      ON public.study_room_members FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  -- Anyone authenticated can join a room (app layer enforces max_members)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_room_members' AND policyname='Users join rooms') THEN
    CREATE POLICY "Users join rooms"
      ON public.study_room_members FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  -- Only the member can update their own record (scores, answers)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_room_members' AND policyname='Members update own record') THEN
    CREATE POLICY "Members update own record"
      ON public.study_room_members FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  -- Members can leave (delete own row)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='study_room_members' AND policyname='Members leave room') THEN
    CREATE POLICY "Members leave room"
      ON public.study_room_members FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
