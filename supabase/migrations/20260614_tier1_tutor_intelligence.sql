-- ═══════════════════════════════════════════════════════════════
-- Edora — Tier 1 Core Tutor Intelligence
--
-- Tables:
--   1. tutoring_sessions     — structured 1-on-1 Novo sessions
--   2. session_messages      — per-message log (teaching, checkpoints, feedback)
--   3. concept_nodes         — knowledge graph nodes (Feature 2)
--   4. concept_edges         — directed edges between concept nodes
--   5. subtopic_mastery      — Bayesian mastery tracker per subtopic (Feature 4)
--   6. error_patterns        — recurring mistake patterns (Feature 5)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. tutoring_sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tutoring_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Session config
  subject              TEXT        NOT NULL,
  topic                TEXT        NOT NULL,
  study_level          TEXT        NOT NULL DEFAULT 'school'
                       CHECK (study_level IN ('school','college','competitive','professional')),
  mode                 TEXT        NOT NULL DEFAULT 'standard'
                       CHECK (mode IN ('standard','socratic','drill')),

  -- State machine
  status               TEXT        NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','complete')),
  phase                TEXT        NOT NULL DEFAULT 'intro'
                       CHECK (phase IN ('intro','teaching','checkpoint','complete')),
  current_concept_idx  INTEGER     NOT NULL DEFAULT 0,
  teaching_exchanges   INTEGER     NOT NULL DEFAULT 0, -- messages during current concept

  -- Session content (generated at start by Novo)
  objectives           JSONB       NOT NULL DEFAULT '[]',
  -- [{title, status: 'pending'|'teaching'|'mastered'|'retry', checkpoint_attempts: 0}]
  concepts             JSONB       NOT NULL DEFAULT '[]',

  -- Active checkpoint (server-side only — correct_idx never sent to client)
  -- {question, options[], correct_idx, explanation, subtopic}
  current_checkpoint   JSONB,

  -- Results
  score                INTEGER     NOT NULL DEFAULT 0,   -- correct checkpoint answers
  total_checkpoints    INTEGER     NOT NULL DEFAULT 0,
  xp_earned            INTEGER     NOT NULL DEFAULT 0,

  -- Drill context (for Feature 5 micro-drills)
  drill_pattern_id     UUID,                             -- references error_patterns.id

  -- Timestamps
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutoring_sessions_user_idx
  ON public.tutoring_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tutoring_sessions_status_idx
  ON public.tutoring_sessions(user_id, status)
  WHERE status = 'active';

-- ── 2. session_messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES public.tutoring_sessions(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL CHECK (role IN ('novo','student')),
  content       TEXT        NOT NULL,
  -- text | teaching | question | checkpoint_question | checkpoint_answer | feedback | objective | transition | complete
  message_type  TEXT        NOT NULL DEFAULT 'text',
  concept_idx   INTEGER,    -- which concept this message belongs to (null = general)
  is_correct    BOOLEAN,    -- for checkpoint_answer messages
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_messages_session_idx
  ON public.session_messages(session_id, created_at ASC);

-- ── 3. concept_nodes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_nodes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject          TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  mastery_pct      INTEGER     NOT NULL DEFAULT 0 CHECK (mastery_pct BETWEEN 0 AND 100),
  times_studied    INTEGER     NOT NULL DEFAULT 0,
  times_tested     INTEGER     NOT NULL DEFAULT 0,
  times_correct    INTEGER     NOT NULL DEFAULT 0,
  last_studied_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, title)
);

CREATE INDEX IF NOT EXISTS concept_nodes_user_subject_idx
  ON public.concept_nodes(user_id, subject);

-- ── 4. concept_edges ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_edges (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_node_id  UUID   NOT NULL REFERENCES public.concept_nodes(id) ON DELETE CASCADE,
  to_node_id    UUID   NOT NULL REFERENCES public.concept_nodes(id) ON DELETE CASCADE,
  -- 'leads_to' | 'requires' | 'related_to'
  relationship  TEXT   NOT NULL DEFAULT 'leads_to',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_node_id, to_node_id)
);

CREATE INDEX IF NOT EXISTS concept_edges_from_idx ON public.concept_edges(from_node_id);
CREATE INDEX IF NOT EXISTS concept_edges_to_idx   ON public.concept_edges(to_node_id);

-- ── 5. subtopic_mastery ───────────────────────────────────────────────────────
-- Bayesian mastery tracker per (user, subject, subtopic).
-- mastery_score: 0.0–1.0 (Wilson lower-bound estimate).
-- difficulty_level: 1=recall, 2=comprehension, 3=application, 4=analysis, 5=synthesis.
-- Auto-adjusted up when consecutive_correct ≥ 3 AND mastery ≥ 0.8.
-- Auto-adjusted down when consecutive_wrong ≥ 2 OR mastery < 0.35.
CREATE TABLE IF NOT EXISTS public.subtopic_mastery (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject              TEXT    NOT NULL,
  subtopic             TEXT    NOT NULL,
  difficulty_level     INTEGER NOT NULL DEFAULT 3 CHECK (difficulty_level BETWEEN 1 AND 5),
  attempts             INTEGER NOT NULL DEFAULT 0,
  correct              INTEGER NOT NULL DEFAULT 0,
  consecutive_correct  INTEGER NOT NULL DEFAULT 0,
  consecutive_wrong    INTEGER NOT NULL DEFAULT 0,
  mastery_score        FLOAT   NOT NULL DEFAULT 0.5 CHECK (mastery_score BETWEEN 0 AND 1),
  last_attempted_at    TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, subtopic)
);

CREATE INDEX IF NOT EXISTS subtopic_mastery_user_idx
  ON public.subtopic_mastery(user_id, subject);

-- ── 6. error_patterns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_patterns (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject           TEXT        NOT NULL,
  -- e.g. 'sign_error', 'unit_conversion', 'formula_recall', 'conceptual_gap'
  pattern_type      TEXT        NOT NULL,
  description       TEXT        NOT NULL, -- human-readable, Novo-generated
  occurrence_count  INTEGER     NOT NULL DEFAULT 1,
  is_resolved       BOOLEAN     NOT NULL DEFAULT false,
  -- [{question, student_answer, correct_answer}] — max 5 examples
  example_errors    JSONB       NOT NULL DEFAULT '[]',
  last_drill_at     TIMESTAMPTZ,
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, pattern_type)
);

CREATE INDEX IF NOT EXISTS error_patterns_user_idx
  ON public.error_patterns(user_id, is_resolved, last_detected_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.tutoring_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_nodes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_edges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopic_mastery   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_patterns     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  -- tutoring_sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tutoring_sessions' AND policyname='Users manage own sessions') THEN
    CREATE POLICY "Users manage own sessions"
      ON public.tutoring_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- session_messages: user reads via session ownership; edge function (service role) writes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_messages' AND policyname='Users read own session messages') THEN
    CREATE POLICY "Users read own session messages"
      ON public.session_messages FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.tutoring_sessions ts
        WHERE ts.id = session_messages.session_id AND ts.user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_messages' AND policyname='Users insert own session messages') THEN
    CREATE POLICY "Users insert own session messages"
      ON public.session_messages FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.tutoring_sessions ts
        WHERE ts.id = session_messages.session_id AND ts.user_id = auth.uid()
      ));
  END IF;

  -- concept_nodes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='concept_nodes' AND policyname='Users manage own nodes') THEN
    CREATE POLICY "Users manage own nodes"
      ON public.concept_nodes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- concept_edges
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='concept_edges' AND policyname='Users manage own edges') THEN
    CREATE POLICY "Users manage own edges"
      ON public.concept_edges FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- subtopic_mastery
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subtopic_mastery' AND policyname='Users manage own mastery') THEN
    CREATE POLICY "Users manage own mastery"
      ON public.subtopic_mastery FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  -- error_patterns
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='error_patterns' AND policyname='Users manage own patterns') THEN
    CREATE POLICY "Users manage own patterns"
      ON public.error_patterns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

END $$;

-- ── updated_at triggers ───────────────────────────────────────────────────────
-- Reuse the set_updated_at() function created in 20260612_ghost_room_cleanup.sql

DROP TRIGGER IF EXISTS concept_nodes_updated_at    ON public.concept_nodes;
DROP TRIGGER IF EXISTS subtopic_mastery_updated_at ON public.subtopic_mastery;
DROP TRIGGER IF EXISTS error_patterns_updated_at   ON public.error_patterns;

CREATE TRIGGER concept_nodes_updated_at
  BEFORE UPDATE ON public.concept_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER subtopic_mastery_updated_at
  BEFORE UPDATE ON public.subtopic_mastery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER error_patterns_updated_at
  BEFORE UPDATE ON public.error_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
