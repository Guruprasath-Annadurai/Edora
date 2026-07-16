
-- ── Question quality audit (bad AI-generated question detection) ──────────
CREATE TABLE IF NOT EXISTS public.question_quality_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash    text NOT NULL,
  subject          text,
  topic            text,
  question_text    text NOT NULL,
  sample_options   jsonb,
  correct_rate     numeric,
  attempt_count    integer NOT NULL DEFAULT 0,
  report_count     integer NOT NULL DEFAULT 0,
  verdict          text CHECK (verdict IN ('genuinely_hard','miscalibrated','wrong_answer_key','ambiguous','needs_review')),
  reasoning        text,
  model_used       text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_qqf_status ON public.question_quality_flags(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qqf_hash ON public.question_quality_flags(question_hash);

ALTER TABLE public.question_quality_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY qqf_admin_all ON public.question_quality_flags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')));

-- ── Anomaly / cheating-pattern flags ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anomaly_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flag_type     text NOT NULL CHECK (flag_type IN ('battle_timing','xp_pattern','other')),
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity      text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  reasoning     text,
  model_used    text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_anomaly_user ON public.anomaly_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_status ON public.anomaly_flags(status);

ALTER TABLE public.anomaly_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_admin_all ON public.anomaly_flags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','moderator')));

-- ── Roadmap re-optimization audit trail ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roadmap_reoptimizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  roadmap_id      uuid,
  reasoning       text,
  changes_summary jsonb,
  model_used      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roadmap_reoptimizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reopt_own_read ON public.roadmap_reoptimizations FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY reopt_service_all ON public.roadmap_reoptimizations FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
