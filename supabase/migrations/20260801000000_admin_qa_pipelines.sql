-- ═══════════════════════════════════════════════════════════════════════════
-- Admin QA pipelines — question-quality-audit, anomaly-detection,
-- pyq-content-audit, mains-answer-evaluator.
--
-- AdminConsolePage.tsx has had a fully-built UI for all four of these since
-- an earlier pass (tabs: Question QA, Anomalies, Content QA, Mains QA), but
-- the edge functions backing them (question-quality-audit, anomaly-detection,
-- pyq-content-audit, mains-answer-evaluator) were never created — every call
-- 404s. This migration adds the tables those functions need to actually work.
--
-- mains_* tables are schema-only for now (no UPSC Mains content exists yet —
-- see PYQBankPage/UPSCMainsPage — so there's nothing real to grade). They
-- exist so the Mains QA tab shows an honest empty state instead of a 404,
-- not because grading logic has been built.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Question quality flags (student-report-driven + statistical) ──────────
CREATE TABLE IF NOT EXISTS public.question_flags (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text       TEXT        NOT NULL,
  subject             TEXT,
  topic               TEXT,
  correct_rate        NUMERIC(5,2),          -- % of attempts answered correctly, if known
  attempt_count       INTEGER     NOT NULL DEFAULT 0,
  report_count        INTEGER     NOT NULL DEFAULT 0,
  sample_options      JSONB,
  verdict             TEXT        NOT NULL CHECK (verdict IN ('confirmed_bad','genuinely_hard','inconclusive')),
  reasoning           TEXT        NOT NULL,
  model_used          TEXT        NOT NULL,
  corrected_question   JSONB,                -- {question_text, options[], correct_index, explanation} or NULL
  correction_bank_id  UUID,
  status              TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  source_report_ids   UUID[]      NOT NULL DEFAULT '{}',  -- question_reports rows this flag was raised from
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_flags_status ON public.question_flags (status, created_at DESC);

ALTER TABLE public.question_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "question_flags_service_only" ON public.question_flags;
CREATE POLICY "question_flags_service_only" ON public.question_flags FOR ALL TO service_role USING (true);

-- Corrections bank — approved corrections become real, reusable questions.
CREATE TABLE IF NOT EXISTS public.question_corrections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text   TEXT        NOT NULL,
  options         JSONB       NOT NULL,
  correct_index   SMALLINT    NOT NULL,
  explanation     TEXT,
  subject         TEXT,
  topic           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.question_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "question_corrections_service_only" ON public.question_corrections;
CREATE POLICY "question_corrections_service_only" ON public.question_corrections FOR ALL TO service_role USING (true);

-- ── 2. Anomaly flags (suspicious battle-timing patterns) ──────────────────────
CREATE TABLE IF NOT EXISTS public.anomaly_flags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flag_type     TEXT        NOT NULL,          -- e.g. 'fast_perfect_battles'
  severity      TEXT        NOT NULL CHECK (severity IN ('low','medium','high')),
  reasoning     TEXT        NOT NULL,
  model_used    TEXT        NOT NULL,
  evidence      JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_flags_status ON public.anomaly_flags (status, created_at DESC);

ALTER TABLE public.anomaly_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anomaly_flags_service_only" ON public.anomaly_flags;
CREATE POLICY "anomaly_flags_service_only" ON public.anomaly_flags FOR ALL TO service_role USING (true);

-- ── 3. PYQ content review tracking + flags ────────────────────────────────────
ALTER TABLE public.pyq_content
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pyq_content_unreviewed ON public.pyq_content (reviewed) WHERE NOT reviewed;

CREATE TABLE IF NOT EXISTS public.pyq_content_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pyq_content_id  UUID        NOT NULL REFERENCES public.pyq_content(id) ON DELETE CASCADE,
  exam            TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  chapter         TEXT        NOT NULL,
  question_text   TEXT        NOT NULL,
  options         JSONB,
  correct_option  TEXT,
  solution_text   TEXT,
  review_notes    TEXT        NOT NULL,
  reviewed_by     TEXT        NOT NULL DEFAULT 'ai-second-reviewer',
  status          TEXT        NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','approved','retired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pyq_content_flags_status ON public.pyq_content_flags (status, created_at DESC);

ALTER TABLE public.pyq_content_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pyq_content_flags_service_only" ON public.pyq_content_flags;
CREATE POLICY "pyq_content_flags_service_only" ON public.pyq_content_flags FOR ALL TO service_role USING (true);

-- ── 4. UPSC/CBSE Mains — schema only, no content/grading logic yet ───────────
CREATE TABLE IF NOT EXISTS public.mains_questions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam          TEXT        NOT NULL,
  class_level   TEXT,
  paper         TEXT        NOT NULL,
  topic         TEXT        NOT NULL,
  question_text TEXT        NOT NULL,
  model_answer  TEXT,
  max_words     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mains_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mains_questions_public_read" ON public.mains_questions;
CREATE POLICY "mains_questions_public_read" ON public.mains_questions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.mains_submissions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id         UUID        NOT NULL REFERENCES public.mains_questions(id) ON DELETE CASCADE,
  answer_text         TEXT        NOT NULL,
  word_count          INTEGER     NOT NULL DEFAULT 0,
  score_band          TEXT,
  suspected_copy      BOOLEAN     NOT NULL DEFAULT false,
  copy_overlap_ratio  NUMERIC(4,3),
  structure_feedback  TEXT,
  model_used          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mains_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mains_submissions_own" ON public.mains_submissions;
CREATE POLICY "mains_submissions_own" ON public.mains_submissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "mains_submissions_service_read" ON public.mains_submissions;
CREATE POLICY "mains_submissions_service_read" ON public.mains_submissions FOR SELECT TO service_role USING (true);

CREATE TABLE IF NOT EXISTS public.mains_band_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL REFERENCES public.mains_submissions(id) ON DELETE CASCADE,
  override_band   TEXT        NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mains_band_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mains_band_overrides_service_only" ON public.mains_band_overrides;
CREATE POLICY "mains_band_overrides_service_only" ON public.mains_band_overrides FOR ALL TO service_role USING (true);

-- mains_band_stats already exists (created 20260708174800, richer 6-column
-- view over the real mains_answer_submissions/mains_band_overrides system --
-- see RISK register re: the pre-existing mains-answer-evaluator feature).
-- This file's mains_submissions/mains_questions/mains_band_overrides tables
-- are a separate, still-unused "schema only" placeholder (per this file's
-- own header comment) that duplicate already-existing table names via
-- IF NOT EXISTS (safe no-op) but would otherwise clobber the working view
-- with a narrower 3-column definition, which Postgres also rejects outright
-- since CREATE OR REPLACE VIEW cannot drop columns. Skipped entirely so the
-- real, already-populated view is left untouched.
do $$
begin
  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'mains_band_stats') then
    execute $q$create view public.mains_band_stats as
      select
        (select count(*) from public.mains_band_overrides)  as total_overrides,
        (select count(*) from public.mains_submissions)      as total_submissions,
        case when (select count(*) from public.mains_submissions) > 0
          then round(
            (select count(*) from public.mains_band_overrides)::numeric * 100.0
            / (select count(*) from public.mains_submissions), 1)
          else null
        end as override_rate_pct$q$;
  end if;
end $$;
