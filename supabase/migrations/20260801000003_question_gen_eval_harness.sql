-- ── Question-gen evaluation harness ─────────────────────────────────────────
-- novo_eval_cases/novo_eval_runs only ever exercised gemini-chat (RAG/tool-use
-- quality). ai-question-gen — the actual quiz/question content-generation
-- pipeline — was never tested by anything. This adds the same pattern
-- (cases table + runs table) scoped to ai-question-gen, judged by an LLM for
-- whether each generated question is factually correct, unambiguous, and
-- matches its target difficulty — not just structurally valid.

CREATE TABLE IF NOT EXISTS public.question_gen_eval_cases (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  chapter         TEXT,
  class_num       SMALLINT,
  ability_score   NUMERIC(4,2) NOT NULL DEFAULT 0,  -- drives easy/medium/hard, see ai-question-gen
  count           SMALLINT    NOT NULL DEFAULT 5,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_gen_eval_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID        NOT NULL,
  eval_case_id     UUID        NOT NULL REFERENCES public.question_gen_eval_cases(id),
  question_index   SMALLINT    NOT NULL,
  question_text    TEXT,
  options          JSONB,
  correct_idx      SMALLINT,
  explanation      TEXT,
  model_confidence NUMERIC(3,2),
  judge_verdict    TEXT        CHECK (judge_verdict IN ('correct','incorrect','ambiguous')),
  judge_reasoning  TEXT,
  pass             BOOLEAN     NOT NULL DEFAULT false,
  score            NUMERIC(4,2),
  latency_ms       INTEGER,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qgen_eval_runs_run_id_idx  ON public.question_gen_eval_runs (run_id);
CREATE INDEX IF NOT EXISTS qgen_eval_runs_case_idx    ON public.question_gen_eval_runs (eval_case_id);
CREATE INDEX IF NOT EXISTS qgen_eval_runs_created_idx ON public.question_gen_eval_runs (created_at DESC);

ALTER TABLE public.question_gen_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_gen_eval_runs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_qgen_cases" ON public.question_gen_eval_cases;
CREATE POLICY "service_all_qgen_cases" ON public.question_gen_eval_cases FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_all_qgen_runs" ON public.question_gen_eval_runs;
CREATE POLICY "service_all_qgen_runs" ON public.question_gen_eval_runs FOR ALL USING (auth.role() = 'service_role');
-- Authenticated read, matching novo_eval_cases/runs (dashboard-readable, no PII)
DROP POLICY IF EXISTS "auth_read_qgen_cases" ON public.question_gen_eval_cases;
CREATE POLICY "auth_read_qgen_cases" ON public.question_gen_eval_cases FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth_read_qgen_runs" ON public.question_gen_eval_runs;
CREATE POLICY "auth_read_qgen_runs" ON public.question_gen_eval_runs FOR SELECT USING (auth.role() = 'authenticated');

-- ── Seed: cases spanning subjects, chapters, class levels, and difficulty ──
INSERT INTO public.question_gen_eval_cases (name, subject, chapter, class_num, ability_score, count) VALUES
  ('Physics easy — Laws of Motion',        'Physics',   'Laws of Motion',              11, -1.0, 5),
  ('Physics hard — Electromagnetic Induction', 'Physics', 'Electromagnetic Induction', 12,  1.0, 5),
  ('Chemistry medium — Chemical Bonding',  'Chemistry', 'Chemical Bonding',            11,  0.0, 5),
  ('Chemistry hard — Organic Reaction Mechanisms', 'Chemistry', 'Organic Chemistry — Mechanisms', 12, 1.0, 5),
  ('Mathematics easy — Quadratic Equations', 'Mathematics', 'Quadratic Equations',      10, -1.0, 5),
  ('Mathematics hard — Definite Integrals', 'Mathematics', 'Integral Calculus',         12,  1.0, 5),
  ('Biology medium — Genetics',            'Biology',   'Principles of Inheritance',   12,  0.0, 5),
  ('Biology easy — Cell Structure',        'Biology',   'Cell — The Unit of Life',      11, -1.0, 5),
  ('Physics medium — no chapter pin (weak-topic bias path)', 'Physics', NULL, 11, 0.0, 5)
ON CONFLICT DO NOTHING;
