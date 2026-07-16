
-- ── Pre-baked deep explanations cache ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_explanations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash     text NOT NULL UNIQUE,
  subject           text,
  topic             text,
  question_text     text NOT NULL,
  deep_explanation  text NOT NULL,
  model_used        text NOT NULL,
  hit_count         integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_served_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qexp_hash ON public.question_explanations(question_hash);

ALTER TABLE public.question_explanations ENABLE ROW LEVEL SECURITY;
-- Any authenticated user can read a cached explanation (it's not personal data,
-- it's shared content); only the service role (edge function) can write.
CREATE POLICY qexp_read_all ON public.question_explanations FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY qexp_service_write ON public.question_explanations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY qexp_service_update ON public.question_explanations FOR UPDATE
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Composed mock papers (reasoned selection over real pyq_content) ────────
CREATE TABLE IF NOT EXISTS public.composed_mock_papers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam             text NOT NULL,
  paper_key        text NOT NULL,   -- hash of (exam + section config) for cache reuse
  question_ids     jsonb NOT NULL,  -- ordered array of pyq_content.id per section
  composition_plan jsonb,           -- reasoning: weightage/difficulty-curve rationale
  model_used       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cmp_paper_key ON public.composed_mock_papers(paper_key);

ALTER TABLE public.composed_mock_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cmp_read_all ON public.composed_mock_papers FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY cmp_service_write ON public.composed_mock_papers FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── Self-healing: verified/corrected question bank ─────────────────────────
-- Questions Nemotron flagged as wrong_answer_key/miscalibrated get a
-- corrected version generated + stored here once a human approves it
-- (is_approved). Future quiz-gen can draw from here as a trusted supplement
-- to raw AI generation.
CREATE TABLE IF NOT EXISTS public.verified_question_bank (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_flag_id    uuid REFERENCES public.question_quality_flags(id) ON DELETE SET NULL,
  subject           text,
  topic             text,
  question_text     text NOT NULL,
  options           jsonb NOT NULL,
  correct_index     integer NOT NULL,
  explanation       text,
  model_used        text NOT NULL,
  is_approved       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  approved_at       timestamptz
);
ALTER TABLE public.verified_question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY vqb_read_approved ON public.verified_question_bank FOR SELECT
  USING (is_approved = true OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')));
CREATE POLICY vqb_admin_write ON public.verified_question_bank FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')) OR auth.role() = 'service_role')
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')) OR auth.role() = 'service_role');

-- Extend question_quality_flags with the generated correction, for review.
ALTER TABLE public.question_quality_flags
  ADD COLUMN IF NOT EXISTS corrected_question jsonb,
  ADD COLUMN IF NOT EXISTS correction_bank_id uuid REFERENCES public.verified_question_bank(id) ON DELETE SET NULL;
