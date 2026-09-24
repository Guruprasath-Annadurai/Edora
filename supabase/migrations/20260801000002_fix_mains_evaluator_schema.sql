-- ═══════════════════════════════════════════════════════════════════════════
-- Correction: 20260801_admin_qa_pipelines.sql assumed no UPSC/CBSE Mains
-- content or grading schema existed and added schema-only mains_questions/
-- mains_submissions/mains_band_overrides tables + a mains_band_stats view.
--
-- That assumption was wrong. Real content and a real submissions table have
-- existed since 20260708054118_add_upsc_support.sql / seed migrations the
-- same day: mains_questions (25 UPSC + CBSE questions, model answers, key
-- points) and mains_answer_submissions (student answers + band feedback).
-- What was actually missing was only the mains-answer-evaluator edge
-- function itself — never written, hence the 404 UPSCMainsPage.tsx hit.
--
-- mains_questions already existed, so the earlier CREATE TABLE IF NOT EXISTS
-- was a harmless no-op. mains_submissions/mains_band_overrides/mains_band_stats
-- were genuinely new, unused, empty objects pointing at the wrong schema —
-- drop them and rebuild the override plumbing against the real
-- mains_answer_submissions table.
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.mains_band_stats;
DROP TABLE IF EXISTS public.mains_band_overrides;
DROP TABLE IF EXISTS public.mains_submissions;

CREATE TABLE IF NOT EXISTS public.mains_band_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL REFERENCES public.mains_answer_submissions(id) ON DELETE CASCADE,
  override_band   TEXT        NOT NULL CHECK (override_band IN ('needs_work','developing','good','excellent')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mains_band_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mains_band_overrides_service_only" ON public.mains_band_overrides;
CREATE POLICY "mains_band_overrides_service_only" ON public.mains_band_overrides FOR ALL TO service_role USING (true);

CREATE OR REPLACE VIEW public.mains_band_stats AS
SELECT
  (SELECT COUNT(*) FROM public.mains_band_overrides)      AS total_overrides,
  (SELECT COUNT(*) FROM public.mains_answer_submissions)   AS total_submissions,
  CASE WHEN (SELECT COUNT(*) FROM public.mains_answer_submissions) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM public.mains_band_overrides)::NUMERIC * 100.0
      / (SELECT COUNT(*) FROM public.mains_answer_submissions), 1)
    ELSE NULL
  END AS override_rate_pct;
