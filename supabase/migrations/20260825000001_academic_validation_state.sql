-- ═══════════════════════════════════════════════════════════════════════════
-- Academic validation-state labeling (enterprise remediation mandate §12:
-- "no academic-validation-state labeling exists on generated content").
--
-- One shared enum, applied consistently across every table that holds
-- AI-generated or AI-graded academic content, so "what's actually been
-- checked" is a single queryable column shape everywhere instead of several
-- different ad-hoc schemes.
--
-- IMPORTANT correction from this migration's first draft (never applied):
-- the original version targeted public.ai_questions and referenced
-- question_flags/question_corrections as the audit pipeline's tables.
-- Direct production inspection (information_schema + list_migrations) found
-- ALL THREE of those are fictional in production -- they come from
-- 20260702000002_ncert_pyq_mock_videos.sql and
-- 20260801000000_admin_qa_pipelines.sql, neither of which was ever actually
-- applied there. The real, live tables are public.question_quality_flags
-- and public.verified_question_bank (20260704101715_ai_quality_and_anomaly_
-- flags.sql, 20260704103815_explanation_cache_and_paper_composer.sql) --
-- this same session found and fixed question-quality-audit/index.ts's
-- identical mistake (it had been silently writing nothing to production for
-- every audit run). This migration targets the real tables.
--
-- Full survey findings:
--   - pyq_content already has a real, actively-used review scheme
--     (is_reviewed/flagged_for_review/is_active/review_notes/reviewed_by,
--     from 20260708062200_pyq_content_review_pipeline.sql) with live admin
--     UI and pyq-content-audit wired to it. NOT replacing this -- it works
--     and ripping it out to swap in a new column would be pure churn and
--     real regression risk for zero benefit. Instead: a generated column
--     derives validation_state FROM the existing booleans, so uniform
--     cross-table querying works without touching working code.
--   - There is a second, DEAD parallel scheme on the same table
--     (pyq_content.reviewed, pyq_content_flags from
--     20260801000000_admin_qa_pipelines.sql /
--     20260808010003_risk032_pyq_content_flags_production_deploy.sql) --
--     confirmed via that migration's own header comment and a full
--     code-path search that nothing live reads or writes it. Left alone
--     (dropping unused-but-deployed schema is its own separate, riskier
--     decision than this migration's scope), not extended.
--   - ncert_content has ZERO validation-state columns. Real gap, closed
--     here with a plain (non-generated) column, defaulting to unreviewed.
--   - question_quality_flags: every row already carries an AI verdict (it's
--     only ever created by question-quality-audit's run_audit after an LLM
--     call), so there's no "unreviewed" state possible here -- a generated
--     column derives validation_state from this table's own `status` and
--     `verdict` columns.
--   - mains_answer_submissions (the real, populated mains-grading table --
--     NOT the mains_questions/mains_submissions pair from
--     20260801000000_admin_qa_pipelines.sql, which that file's own header
--     documents as an unused placeholder) has score_band but no
--     validation-state column at all. Real gap, closed here.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.academic_validation_state AS ENUM (
    'unreviewed',            -- generated/ingested, never checked
    'ai_reviewed_ok',        -- an automated pass looked at it and found no issue
    'ai_flagged',            -- an automated pass found a likely issue, or an ambiguous case that needs a human
    'pending_human_review',  -- explicitly queued for a human (student report count threshold, etc.)
    'human_verified',        -- a human confirmed it's correct
    'rejected'               -- confirmed wrong/superseded; should not be served
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── ncert_content: real gap, plain column ───────────────────────────────────
ALTER TABLE public.ncert_content
  ADD COLUMN IF NOT EXISTS validation_state public.academic_validation_state NOT NULL DEFAULT 'unreviewed';

CREATE INDEX IF NOT EXISTS ncert_content_validation_state_idx ON public.ncert_content (validation_state);

-- ── mains_answer_submissions: real gap, plain column ─────────────────────────
ALTER TABLE public.mains_answer_submissions
  ADD COLUMN IF NOT EXISTS validation_state public.academic_validation_state NOT NULL DEFAULT 'unreviewed';

CREATE INDEX IF NOT EXISTS mains_answer_submissions_validation_state_idx ON public.mains_answer_submissions (validation_state);

-- ── question_quality_flags: derived from this table's own status/verdict.
--    'dismissed' means a human (admin) looked at the flag and decided the
--    original question is fine -> human_verified. 'actioned' means a human
--    approved/actioned a correction, superseding the original -> rejected.
--    Still 'open' rows fall back to the AI's own verdict.
ALTER TABLE public.question_quality_flags
  ADD COLUMN IF NOT EXISTS validation_state public.academic_validation_state
  GENERATED ALWAYS AS (
    CASE
      WHEN status = 'dismissed' THEN 'human_verified'::public.academic_validation_state
      WHEN status = 'actioned' THEN 'rejected'::public.academic_validation_state
      WHEN verdict = 'genuinely_hard' THEN 'ai_reviewed_ok'::public.academic_validation_state
      ELSE 'ai_flagged'::public.academic_validation_state
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS question_quality_flags_validation_state_idx ON public.question_quality_flags (validation_state);

-- ── pyq_content: derived, not authoritative -- a generated column computed
--    from the existing, actively-used boolean flags, so this table is
--    queryable with the same shape as the others above without touching its
--    real (working) review pipeline at all.
ALTER TABLE public.pyq_content
  ADD COLUMN IF NOT EXISTS validation_state public.academic_validation_state
  GENERATED ALWAYS AS (
    CASE
      WHEN is_active = false THEN 'rejected'::public.academic_validation_state
      WHEN flagged_for_review = true THEN 'ai_flagged'::public.academic_validation_state
      WHEN is_reviewed = true AND reviewed_by LIKE 'human:%' THEN 'human_verified'::public.academic_validation_state
      WHEN is_reviewed = true THEN 'ai_reviewed_ok'::public.academic_validation_state
      ELSE 'unreviewed'::public.academic_validation_state
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS pyq_content_validation_state_idx ON public.pyq_content (validation_state);

COMMENT ON COLUMN public.pyq_content.validation_state IS
  'Derived from is_active/flagged_for_review/is_reviewed/reviewed_by -- read-only, for uniform cross-table querying. The real review pipeline is still is_reviewed/flagged_for_review/review_notes/reviewed_by; do not write to this column directly (it is a generated column and will reject writes).';

COMMENT ON COLUMN public.question_quality_flags.validation_state IS
  'Derived from status/verdict -- read-only, for uniform cross-table querying. The real workflow is still status/verdict/correction_bank_id; do not write to this column directly (it is a generated column and will reject writes).';
