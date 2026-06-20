-- ─────────────────────────────────────────────────────────────────────────────
-- Edora — add study_level to study_roadmaps
-- Needed so recalibration uses the student's actual level, not a hardcoded default.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.study_roadmaps
  ADD COLUMN IF NOT EXISTS study_level TEXT NOT NULL DEFAULT 'school';
