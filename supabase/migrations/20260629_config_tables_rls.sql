-- ═══════════════════════════════════════════════════════════════════════════
-- Enable RLS on read-only seed / config tables
--
-- subjects_master, topics_master, streak_rewards were created without RLS.
-- They are append-only seed data — only the service role (migrations) should
-- ever write to them. Authenticated app users may read all rows.
--
-- Defense-in-depth rationale:
--   Without RLS, a misconfigured policy elsewhere or a future GRANT mistake
--   could allow unexpected writes. Enabling RLS + SELECT-only policy ensures
--   the row-level gate is always checked regardless of column-level grants.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── subjects_master ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subjects_master'
  ) THEN
    ALTER TABLE public.subjects_master ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'subjects_master' AND policyname = 'subjects_read_authenticated'
    ) THEN
      CREATE POLICY "subjects_read_authenticated"
        ON public.subjects_master
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    REVOKE INSERT, UPDATE, DELETE ON public.subjects_master FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.subjects_master FROM anon;
  END IF;
END $$;

-- ── topics_master ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'topics_master'
  ) THEN
    ALTER TABLE public.topics_master ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'topics_master' AND policyname = 'topics_read_authenticated'
    ) THEN
      CREATE POLICY "topics_read_authenticated"
        ON public.topics_master
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    REVOKE INSERT, UPDATE, DELETE ON public.topics_master FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.topics_master FROM anon;
  END IF;
END $$;

-- ── streak_rewards ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streak_rewards'
  ) THEN
    ALTER TABLE public.streak_rewards ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'streak_rewards' AND policyname = 'streak_rewards_read_authenticated'
    ) THEN
      CREATE POLICY "streak_rewards_read_authenticated"
        ON public.streak_rewards
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    REVOKE INSERT, UPDATE, DELETE ON public.streak_rewards FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.streak_rewards FROM anon;
  END IF;
END $$;
