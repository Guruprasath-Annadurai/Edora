-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4: Parent Mode + Full Offline Mode
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Mark profiles that are parents ────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN NOT NULL DEFAULT false;

-- ── 2. parent_invite_codes ────────────────────────────────────────────────────
-- Students generate a 6-char code that parents use to link their accounts.
-- Codes expire after 7 days and can only be used once.

CREATE TABLE IF NOT EXISTS public.parent_invite_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_invite_codes ENABLE ROW LEVEL SECURITY;

-- Students can see and generate their own codes
CREATE POLICY "invite_codes_student_own"
  ON public.parent_invite_codes FOR ALL
  USING  (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Service-role operations handled in edge function — no extra policy needed

CREATE INDEX IF NOT EXISTS idx_invite_codes_code
  ON public.parent_invite_codes (code)
  WHERE used_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_invite_codes_student
  ON public.parent_invite_codes (student_id, created_at DESC);

-- ── 3. parent_child_links ─────────────────────────────────────────────────────
-- Permanent link between a parent account and a child account.
-- Created when a parent successfully accepts an invite code.

CREATE TABLE IF NOT EXISTS public.parent_child_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, child_id)
);

ALTER TABLE public.parent_child_links ENABLE ROW LEVEL SECURITY;

-- Parents can see their own children links
CREATE POLICY "parent_links_parent_read"
  ON public.parent_child_links FOR SELECT
  USING (auth.uid() = parent_id);

-- Students can see who is linked as their parent
CREATE POLICY "parent_links_child_read"
  ON public.parent_child_links FOR SELECT
  USING (auth.uid() = child_id);

-- Inserts / deletes handled by the edge function (service role)

CREATE INDEX IF NOT EXISTS idx_parent_links_parent
  ON public.parent_child_links (parent_id);

CREATE INDEX IF NOT EXISTS idx_parent_links_child
  ON public.parent_child_links (child_id);

-- ── 4. Helper view: parent_child_summary ─────────────────────────────────────

CREATE OR REPLACE VIEW public.parent_child_summary AS
SELECT
  l.parent_id,
  l.child_id,
  l.linked_at,
  p.full_name   AS parent_name,
  c.full_name   AS child_name,
  c.xp          AS child_xp,
  c.level       AS child_level,
  c.streak_count AS child_streak
FROM public.parent_child_links l
JOIN public.profiles p ON p.id = l.parent_id
JOIN public.profiles c ON c.id = l.child_id;

-- ── 5. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.parent_invite_codes IS
  'One-time 6-char invite codes students share with parents — Phase 4.';

COMMENT ON TABLE public.parent_child_links IS
  'Permanent parent-to-student relationship after invite code acceptance — Phase 4.';
