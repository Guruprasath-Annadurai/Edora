-- ═══════════════════════════════════════════════════════════════════════════
-- Novo Memory v2 — Topic stats, decay scoring, mood sessions
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Per-topic struggle / win counters ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.topic_stats (
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject        TEXT        NOT NULL,
  topic          TEXT        NOT NULL,
  struggle_count INTEGER     NOT NULL DEFAULT 0,
  win_count      INTEGER     NOT NULL DEFAULT 0,
  last_active    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subject, topic)
);

ALTER TABLE public.topic_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ts_own" ON public.topic_stats;
CREATE POLICY "ts_own" ON public.topic_stats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RPC: upsert topic stat (called after quiz sessions)
CREATE OR REPLACE FUNCTION public.upsert_topic_stat(
  p_user_id UUID,
  p_subject TEXT,
  p_topic   TEXT,
  p_won     BOOLEAN
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.topic_stats (user_id, subject, topic, struggle_count, win_count, last_active)
  VALUES (
    p_user_id, p_subject, p_topic,
    CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    CASE WHEN p_won     THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, subject, topic) DO UPDATE SET
    struggle_count = topic_stats.struggle_count + CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    win_count      = topic_stats.win_count      + CASE WHEN p_won     THEN 1 ELSE 0 END,
    last_active    = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_topic_stat TO authenticated;

-- ── 2. Decayed-score view — 7-day half-life on memory importance ──────────────
-- decayed_score = importance × 0.5^(age_days / 7)
-- So a 7-day-old importance-8 memory scores the same as a fresh importance-4 memory.

CREATE OR REPLACE VIEW public.novo_memories_scored AS
  SELECT
    *,
    ROUND(
      (importance * POWER(0.5, EXTRACT(EPOCH FROM (now() - created_at)) / (7.0 * 86400)))::NUMERIC,
      2
    ) AS decayed_score
  FROM public.novo_memories;

GRANT SELECT ON public.novo_memories_scored TO authenticated;

-- ── 3. Auto-generated chat flashcards ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_flashcards (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id  TEXT        NOT NULL,          -- tutor_chats.id or temp client id
  front       TEXT        NOT NULL,           -- question / concept
  back        TEXT        NOT NULL,           -- Novo's explanation
  subject     TEXT,
  topic       TEXT,
  added_to_deck BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cf_own" ON public.chat_flashcards;
CREATE POLICY "cf_own" ON public.chat_flashcards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 4. Concept graph — topics explored via concept chain ─────────────────────

CREATE TABLE IF NOT EXISTS public.concept_explorations (
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  concept    TEXT        NOT NULL,
  subject    TEXT,
  visit_count INTEGER    NOT NULL DEFAULT 1,
  last_visited TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept)
);

ALTER TABLE public.concept_explorations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ce_own" ON public.concept_explorations;
CREATE POLICY "ce_own" ON public.concept_explorations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.track_concept_visit(
  p_user_id UUID, p_concept TEXT, p_subject TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.concept_explorations (user_id, concept, subject)
  VALUES (p_user_id, p_concept, p_subject)
  ON CONFLICT (user_id, concept) DO UPDATE SET
    visit_count  = concept_explorations.visit_count + 1,
    last_visited = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.track_concept_visit TO authenticated;
