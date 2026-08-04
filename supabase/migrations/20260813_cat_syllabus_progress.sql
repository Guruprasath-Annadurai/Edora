-- ═══════════════════════════════════════════════════════════════════════════
-- CAT syllabus progress — persistent "covered vs. remaining" checklist.
--
-- CAT student feedback: topics feel scattered across the app and there's no
-- single place to see what's been covered vs. what's left. RoadmapPage
-- already generates an AI week-by-week plan, but it's regenerated per
-- request and isn't a stable checklist. This table backs a static, curated
-- QA/DILR/VARC topic tree (src/lib/catSyllabus.ts) with per-user completion
-- state that survives across sessions.
--
-- item_id is a stable string key into the curated syllabus data file (e.g.
-- "qa.arithmetic.ratio_proportion"), not a DB foreign key — the syllabus
-- itself is static app content, not user data, so there's nothing to join
-- against. This mirrors how topic_stats/sr_cards already track per-user
-- state against content that lives in code/PYQ tables rather than a rigid
-- syllabus-definition table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cat_syllabus_progress (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.cat_syllabus_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csp_own" ON public.cat_syllabus_progress;
CREATE POLICY "csp_own" ON public.cat_syllabus_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cat_syllabus_progress_user ON public.cat_syllabus_progress(user_id);
