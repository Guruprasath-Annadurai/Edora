-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 7 — Engagement, Social & Monetization
-- Features: Push Notifications · Study Groups · Voice Mode ·
--           Advanced Analytics · Novo Pro (Razorpay)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Pro subscription columns on profiles ───────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_push_at    TIMESTAMPTZ;

-- ── 2. Track when FCM was sent for each proactive message ─────────────────────
ALTER TABLE public.novo_proactive_messages
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

-- ── 3. Study Groups ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_groups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  -- 8-char invite code derived from UUID — no pgcrypto needed
  invite_code  TEXT        UNIQUE NOT NULL DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  avatar_emoji TEXT        NOT NULL DEFAULT '📚',
  is_public    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sg_invite_idx ON public.study_groups (invite_code);

ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;

-- Basic insert/update/delete policies that don't depend on study_group_members
DROP POLICY IF EXISTS "sg_insert" ON public.study_groups;
CREATE POLICY "sg_insert" ON public.study_groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "sg_update" ON public.study_groups;
CREATE POLICY "sg_update" ON public.study_groups
  FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "sg_delete" ON public.study_groups;
CREATE POLICY "sg_delete" ON public.study_groups
  FOR DELETE USING (auth.uid() = created_by);

-- ── 4. Study Group Members ────────────────────────────────────────────────────
-- Must be created BEFORE the sg_read policy that references it
CREATE TABLE IF NOT EXISTS public.study_group_members (
  group_id  UUID        NOT NULL REFERENCES public.study_groups(id)  ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  role      TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS sgm_user_idx ON public.study_group_members (user_id);

ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sgm_all" ON public.study_group_members;
CREATE POLICY "sgm_all" ON public.study_group_members
  FOR ALL USING (auth.uid() = user_id);

-- Members can see other members in shared groups
DROP POLICY IF EXISTS "sgm_read_peers" ON public.study_group_members;
CREATE POLICY "sgm_read_peers" ON public.study_group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_group_members me
      WHERE me.group_id = group_id AND me.user_id = auth.uid()
    )
  );

-- ── 5. study_groups SELECT policy (after study_group_members exists) ──────────
DROP POLICY IF EXISTS "sg_read" ON public.study_groups;
CREATE POLICY "sg_read" ON public.study_groups
  FOR SELECT USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.study_group_members m
      WHERE m.group_id = id AND m.user_id = auth.uid()
    )
    OR is_public = true
  );

-- ── 6. Subscriptions — Razorpay payment records ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan                     TEXT        NOT NULL CHECK (plan IN ('monthly','annual')),
  status                   TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cancelled','expired')),
  razorpay_order_id        TEXT,
  razorpay_payment_id      TEXT,
  razorpay_signature       TEXT,
  amount_paise             INTEGER     NOT NULL,   -- e.g. 9900 = ₹99
  currency                 TEXT        NOT NULL DEFAULT 'INR',
  starts_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_user_idx ON public.subscriptions (user_id, status, expires_at DESC);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_own" ON public.subscriptions;
CREATE POLICY "sub_own" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 7. Expire Pro automatically via trigger ───────────────────────────────────
-- When a subscription row is updated to 'expired' or 'cancelled',
-- set profiles.is_pro = false if no other active sub exists.
CREATE OR REPLACE FUNCTION public.sync_pro_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status IN ('expired','cancelled') THEN
    -- Check if any other active sub exists
    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = NEW.user_id AND status = 'active' AND expires_at > now()
        AND id <> NEW.id
    ) THEN
      UPDATE public.profiles SET is_pro = false, pro_expires_at = NULL
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pro_status ON public.subscriptions;
CREATE TRIGGER trg_sync_pro_status
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_pro_status();
