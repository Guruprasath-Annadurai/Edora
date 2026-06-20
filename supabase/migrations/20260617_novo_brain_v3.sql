-- ─────────────────────────────────────────────────────────────────────────────
-- Novo Brain v3.0 — Schema Updates
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add last_used_at to novo_memories ─────────────────────────────────────

ALTER TABLE public.novo_memories
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

ALTER TABLE public.novo_memories
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'chat';

-- ── 2. Update memory_type CHECK to include new types ─────────────────────────

-- Drop the old constraint (name may vary — use IF EXISTS pattern)
DO $$
BEGIN
  ALTER TABLE public.novo_memories
    DROP CONSTRAINT IF EXISTS novo_memories_memory_type_check;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.novo_memories
  ADD CONSTRAINT novo_memories_memory_type_check
  CHECK (memory_type IN (
    'learning_pattern',
    'academic_goal',
    'personal_fact',
    'emotion',
    'achievement',
    'fact'
  ));

-- ── 3. Indexes for efficient memory retrieval ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_novo_memories_user_importance
  ON public.novo_memories (user_id, importance DESC, last_used_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_novo_memories_user_type
  ON public.novo_memories (user_id, memory_type);

CREATE INDEX IF NOT EXISTS idx_novo_memories_subject
  ON public.novo_memories (user_id, subject)
  WHERE subject IS NOT NULL;

-- ── 4. Auto-prune: keep only top 200 memories per user ───────────────────────
-- Called by a trigger on INSERT to prevent unbounded growth

CREATE OR REPLACE FUNCTION public.prune_novo_memories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.novo_memories
  WHERE id IN (
    SELECT id FROM public.novo_memories
    WHERE user_id = NEW.user_id
    ORDER BY importance ASC, last_used_at ASC NULLS FIRST, created_at ASC
    OFFSET 200
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_novo_memories ON public.novo_memories;

CREATE TRIGGER trg_prune_novo_memories
  AFTER INSERT ON public.novo_memories
  FOR EACH ROW EXECUTE FUNCTION public.prune_novo_memories();

-- ── 5. RLS: ensure novo_memories has proper policies ─────────────────────────

ALTER TABLE public.novo_memories ENABLE ROW LEVEL SECURITY;

-- Users can read their own memories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'novo_memories' AND policyname = 'novo_memories_user_select'
  ) THEN
    CREATE POLICY "novo_memories_user_select"
      ON public.novo_memories FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Users can delete their own memories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'novo_memories' AND policyname = 'novo_memories_user_delete'
  ) THEN
    CREATE POLICY "novo_memories_user_delete"
      ON public.novo_memories FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role handles inserts (via edge functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'novo_memories' AND policyname = 'novo_memories_service_insert'
  ) THEN
    CREATE POLICY "novo_memories_service_insert"
      ON public.novo_memories FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 6. Comments ───────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.novo_memories.last_used_at IS
  'Timestamp when this memory was last injected into a chat prompt — used for relevance scoring.';

COMMENT ON COLUMN public.novo_memories.source IS
  'Origin of the memory: chat | manual | achievement | onboarding.';
