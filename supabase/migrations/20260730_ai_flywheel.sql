-- ═══════════════════════════════════════════════════════════════════════════
-- AI Learning Flywheel — Interaction data capture for model improvement
--
-- Every student interaction with Novo is a training signal:
--   • Did the explanation work? (thumbs up/down)
--   • How long did they engage?
--   • Did they ask follow-up questions (confusion signal)?
--   • What format did they prefer (analogy, formula, example)?
--
-- This data feeds:
--   1. Prompt engineering (which context helps most for which topic)
--   2. Model fine-tuning (when we have enough labeled data)
--   3. Personalised retrieval (what works for THIS student)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. AI interaction log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_type    TEXT        NOT NULL, -- 'chat' | 'quiz_explain' | 'hint' | 'ncert' | 'doubt'
  subject         TEXT,
  topic           TEXT,
  class_num       INTEGER,
  -- The actual exchange
  user_query      TEXT        NOT NULL,
  ai_response     TEXT        NOT NULL,
  model_used      TEXT,       -- 'gemini-2.0-flash' | 'claude-sonnet-4-6'
  -- Quality signals
  thumbs          SMALLINT,   -- 1 = helpful, -1 = not helpful, NULL = no feedback
  follow_up_count INTEGER     NOT NULL DEFAULT 0, -- follow-up Qs after this response
  dwell_ms        INTEGER,    -- how long student read the response (ms)
  response_ms     INTEGER,    -- model latency (ms)
  -- Context used in prompt
  memory_snapshot JSONB,      -- what Novo knew about student at the time
  -- Metadata
  language        TEXT        NOT NULL DEFAULT 'en',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

-- Students can only see their own interactions
DROP POLICY IF EXISTS "ai_int_own" ON public.ai_interactions;
CREATE POLICY "ai_int_own" ON public.ai_interactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_int_user      ON public.ai_interactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_int_subject   ON public.ai_interactions (subject, topic, thumbs);
CREATE INDEX IF NOT EXISTS idx_ai_int_session   ON public.ai_interactions (session_type);

-- ── 2. Thumbs update (separate RPC so we don't expose full row write) ─────────
CREATE OR REPLACE FUNCTION public.rate_ai_interaction(
  p_interaction_id UUID,
  p_thumbs SMALLINT -- 1 or -1
) RETURNS void AS $$
BEGIN
  UPDATE public.ai_interactions
  SET thumbs = p_thumbs
  WHERE id = p_interaction_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Learning style signals aggregation ────────────────────────────────────
-- Derived weekly — which explanation styles work best per student
CREATE OR REPLACE VIEW public.student_learning_signals AS
SELECT
  user_id,
  subject,
  topic,
  COUNT(*)                                                          AS total_interactions,
  ROUND(AVG(CASE WHEN thumbs = 1 THEN 100 WHEN thumbs = -1 THEN 0 ELSE NULL END)) AS helpful_pct,
  ROUND(AVG(dwell_ms) / 1000.0, 1)                                 AS avg_read_seconds,
  ROUND(AVG(follow_up_count), 1)                                   AS avg_follow_ups,
  SUM(CASE WHEN thumbs = -1 THEN 1 ELSE 0 END)                     AS negative_signals,
  SUM(CASE WHEN thumbs = 1  THEN 1 ELSE 0 END)                     AS positive_signals
FROM public.ai_interactions
WHERE created_at > now() - INTERVAL '90 days'
GROUP BY user_id, subject, topic;

-- ── 4. Weak explanation topics (for model feedback loop) ─────────────────────
-- Topics where the model consistently gets thumbs down — feeds into prompt tuning
CREATE OR REPLACE VIEW public.model_weak_spots AS
SELECT
  subject,
  topic,
  COUNT(*)                                             AS rated_count,
  ROUND(AVG(CASE WHEN thumbs = 1 THEN 100 ELSE 0 END)) AS helpful_pct,
  SUM(CASE WHEN thumbs = -1 THEN 1 ELSE 0 END)         AS unhelpful_count
FROM public.ai_interactions
WHERE thumbs IS NOT NULL
  AND created_at > now() - INTERVAL '30 days'
GROUP BY subject, topic
HAVING COUNT(*) >= 5
ORDER BY helpful_pct ASC;

-- ── 5. User learning style profile (used to enrich Novo system prompt) ───────
-- Materialised per user — refreshed nightly
CREATE TABLE IF NOT EXISTS public.learning_style_profiles (
  user_id         UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  prefers_analogy BOOLEAN     NOT NULL DEFAULT false,
  prefers_visual  BOOLEAN     NOT NULL DEFAULT false,  -- uses diagrams/tables often
  prefers_brief   BOOLEAN     NOT NULL DEFAULT false,  -- avg dwell < 15s
  avg_helpful_pct SMALLINT    NOT NULL DEFAULT 0,
  strongest_subject TEXT,
  weakest_subject   TEXT,
  total_rated     INTEGER     NOT NULL DEFAULT 0,
  refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_style_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lsp_own" ON public.learning_style_profiles;
CREATE POLICY "lsp_own" ON public.learning_style_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- ── 6. Refresh learning style profile for a user ─────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_learning_style(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_helpful_pct SMALLINT;
  v_avg_dwell   NUMERIC;
  v_total       INTEGER;
  v_strongest   TEXT;
  v_weakest     TEXT;
BEGIN
  SELECT
    COALESCE(ROUND(AVG(CASE WHEN thumbs = 1 THEN 100 WHEN thumbs = -1 THEN 0 ELSE NULL END))::SMALLINT, 0),
    COALESCE(AVG(dwell_ms), 0),
    COUNT(*)
  INTO v_helpful_pct, v_avg_dwell, v_total
  FROM public.ai_interactions
  WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

  -- Strongest subject: most positive interactions
  SELECT subject INTO v_strongest
  FROM public.ai_interactions
  WHERE user_id = p_user_id AND thumbs = 1
  GROUP BY subject ORDER BY COUNT(*) DESC LIMIT 1;

  -- Weakest subject: most negative interactions
  SELECT subject INTO v_weakest
  FROM public.ai_interactions
  WHERE user_id = p_user_id AND thumbs = -1
  GROUP BY subject ORDER BY COUNT(*) DESC LIMIT 1;

  INSERT INTO public.learning_style_profiles
    (user_id, avg_helpful_pct, prefers_brief, total_rated, strongest_subject, weakest_subject, refreshed_at)
  VALUES
    (p_user_id, v_helpful_pct, v_avg_dwell < 15000, v_total, v_strongest, v_weakest, now())
  ON CONFLICT (user_id) DO UPDATE SET
    avg_helpful_pct   = EXCLUDED.avg_helpful_pct,
    prefers_brief     = EXCLUDED.prefers_brief,
    total_rated       = EXCLUDED.total_rated,
    strongest_subject = EXCLUDED.strongest_subject,
    weakest_subject   = EXCLUDED.weakest_subject,
    refreshed_at      = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
