-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 6 — Independent AI Tutor Identity
-- Features: Memory Layer · Personality Modes · Lesson Plans
--           Novo Certifications · Proactive Chat Thread
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Personality mode on profiles ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS novo_personality TEXT NOT NULL DEFAULT 'teacher'
    CHECK (novo_personality IN ('teacher','friend','coach','examiner','mentor'));

-- ── 2. Novo Memory Layer ──────────────────────────────────────────────────────
-- Stores cross-session memories so Novo can reference past struggles & wins.
CREATE TABLE IF NOT EXISTS public.novo_memories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory_type  TEXT        NOT NULL
    CHECK (memory_type IN ('struggle','strength','preference','milestone','pattern','exam_context')),
  content      TEXT        NOT NULL,
  subject      TEXT,
  topic        TEXT,
  importance   INTEGER     NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  source       TEXT        CHECK (source IN ('chat','sprint','quiz','tutoring','debate','system')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ           -- NULL = never expires
);

CREATE INDEX IF NOT EXISTS nm_user_type_idx ON public.novo_memories (user_id, memory_type, created_at DESC);
CREATE INDEX IF NOT EXISTS nm_importance_idx ON public.novo_memories (user_id, importance DESC, created_at DESC);

ALTER TABLE public.novo_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_memories" ON public.novo_memories;
CREATE POLICY "users_own_memories" ON public.novo_memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Lesson Plans ───────────────────────────────────────────────────────────
-- Novo autonomously generates a full week's plan per subject.
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     TEXT        NOT NULL,
  week_start  DATE        NOT NULL,
  goal        TEXT,                      -- Novo's stated goal for the week
  plan_data   JSONB       NOT NULL,      -- full plan structure (see edge fn docs)
  status      TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','archived')),
  total_tasks INTEGER     NOT NULL DEFAULT 0,
  done_tasks  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, week_start)
);

CREATE INDEX IF NOT EXISTS lp_user_week_idx ON public.lesson_plans (user_id, week_start DESC);

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_lesson_plans" ON public.lesson_plans;
CREATE POLICY "users_own_lesson_plans" ON public.lesson_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 4. Lesson Plan Tasks ──────────────────────────────────────────────────────
-- Individual tasks inside a lesson plan, checked off as completed.
CREATE TABLE IF NOT EXISTS public.lesson_plan_tasks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID        NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_index    INTEGER     NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  task_index   INTEGER     NOT NULL,
  title        TEXT        NOT NULL,
  task_type    TEXT        NOT NULL
    CHECK (task_type IN ('study','practice','review','quiz','milestone_quiz')),
  topic        TEXT,
  duration_min INTEGER,
  description  TEXT,
  completed    BOOLEAN     NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_index, task_index)
);

CREATE INDEX IF NOT EXISTS lpt_plan_day_idx ON public.lesson_plan_tasks (plan_id, day_index, task_index);
CREATE INDEX IF NOT EXISTS lpt_user_idx ON public.lesson_plan_tasks (user_id, completed, created_at);

ALTER TABLE public.lesson_plan_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_lesson_tasks" ON public.lesson_plan_tasks;
CREATE POLICY "users_own_lesson_tasks" ON public.lesson_plan_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: keep done_tasks in sync on lesson_plans
CREATE OR REPLACE FUNCTION public.sync_plan_progress()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.lesson_plans
  SET done_tasks = (
    SELECT COUNT(*) FROM public.lesson_plan_tasks
    WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id) AND completed = true
  )
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_plan_progress ON public.lesson_plan_tasks;
CREATE TRIGGER trg_sync_plan_progress
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_plan_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_progress();

-- ── 5. Novo Certifications ────────────────────────────────────────────────────
-- Issued after Novo verifies mastery via structured assessment (≥80%).
CREATE TABLE IF NOT EXISTS public.novo_certifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject         TEXT        NOT NULL,
  topic           TEXT        NOT NULL,
  student_name    TEXT        NOT NULL,
  score           INTEGER     NOT NULL,             -- raw correct count
  questions_total INTEGER     NOT NULL DEFAULT 10,
  pct_score       INTEGER     NOT NULL,             -- 0-100
  share_code      TEXT        UNIQUE DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cert_user_idx ON public.novo_certifications (user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS cert_share_code_idx ON public.novo_certifications (share_code);

ALTER TABLE public.novo_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_certs" ON public.novo_certifications;
CREATE POLICY "users_own_certs" ON public.novo_certifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow public share-code lookups (read-only)
DROP POLICY IF EXISTS "cert_public_share" ON public.novo_certifications;
CREATE POLICY "cert_public_share" ON public.novo_certifications
  FOR SELECT USING (share_code IS NOT NULL);

-- ── 6. Certification Assessments ─────────────────────────────────────────────
-- In-progress or completed assessment sessions leading to a certificate.
CREATE TABLE IF NOT EXISTS public.certification_assessments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject       TEXT        NOT NULL,
  topic         TEXT        NOT NULL,
  questions     JSONB       NOT NULL,   -- array of {q, options:[4], correct_idx, explanation}
  answers       JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- array of user answer indices
  current_q     INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','passed','failed')),
  score         INTEGER,
  pct_score     INTEGER,
  cert_id       UUID        REFERENCES public.novo_certifications(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ca_user_status_idx ON public.certification_assessments (user_id, status, started_at DESC);

ALTER TABLE public.certification_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_assessments" ON public.certification_assessments;
CREATE POLICY "users_own_assessments" ON public.certification_assessments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 7. Novo Proactive Messages ────────────────────────────────────────────────
-- Novo initiates conversations — diagnostic nudges, exam reminders, etc.
CREATE TABLE IF NOT EXISTS public.novo_proactive_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message       TEXT        NOT NULL,
  message_type  TEXT        NOT NULL
    CHECK (message_type IN (
      'diagnostic','exam_reminder','streak_check','milestone',
      'lesson_nudge','memory_callback','welcome_back','goal_check'
    )),
  cta_label     TEXT,     -- button label e.g. "Start Diagnostic"
  cta_route     TEXT,     -- app route e.g. "/chat"
  context_data  JSONB,    -- optional structured context
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS npm_user_unread_idx ON public.novo_proactive_messages
  (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.novo_proactive_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_proactive" ON public.novo_proactive_messages;
CREATE POLICY "users_own_proactive" ON public.novo_proactive_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 8. tutor_chats: add personality column if not present ─────────────────────
-- Tracks which personality mode was active for each message.
ALTER TABLE public.tutor_chats
  ADD COLUMN IF NOT EXISTS personality TEXT DEFAULT 'teacher'
    CHECK (personality IN ('teacher','friend','coach','examiner','mentor'));
