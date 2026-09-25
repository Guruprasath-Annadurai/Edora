-- ==============================================================================
-- Migration: 20260930000000_v5_get_today_plan.sql
-- Edora V5: Deterministic Today's Plan Engine (Day 7 Backend)
--
-- Contract:
--   public.get_today_plan()
--   Returns up to 3 deterministic plan items tailored strictly to auth.uid().
--   No random ranking, no AI calls, no client-supplied user_id, read-only.
--
-- Canonical Priority:
--   1. review_due   - Spaced repetition cards due today or earlier (from public.sr_cards)
--   2. fix_weak     - Weakest subtopic with attempts >= 3, mastery < 0.5 (from public.subtopic_mastery)
--   3. diagnostic   - 5-question check for learners with zero prior learning history
--   4. learn_next   - Next chapter in deterministic syllabus order (from public.ncert_chapters)
--   5. exam_push    - Exam drill if exam <= 14 days and trusted PYQs exist (from public.pyq_content)
--
-- Core Target Routes (V5 Allowlist):
--   review_due  -> /spaced-review
--   fix_weak    -> /practice
--   diagnostic  -> /practice
--   learn_next  -> /practice
--   exam_push   -> /pyq-bank
--
-- Security:
--   SECURITY DEFINER with pinned empty search_path
--   Fully qualified relation references
--   REVOKE ALL from public, anon, service_role; GRANT EXECUTE to authenticated
--   Rejects unauthenticated callers with 42501 (insufficient privilege)
-- ==============================================================================

-- ── 1. Supporting Index for Weak Subtopic Drill ──────────────────────────────
-- Supports fast deterministic selection of the weakest eligible subtopic
-- for the active learner: attempts >= 3, mastery_score < 0.5.
CREATE INDEX IF NOT EXISTS idx_subtopic_mastery_plan_weak
  ON public.subtopic_mastery (user_id, mastery_score ASC, attempts DESC, last_attempted_at ASC)
  WHERE attempts >= 3 AND mastery_score < 0.5;

-- ── 2. Deterministic Plan Function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_today_plan()
RETURNS TABLE (
  kind TEXT,
  priority INTEGER,
  title TEXT,
  duration_minutes INTEGER,
  target_path TEXT,
  target_params JSONB,
  subject TEXT,
  chapter TEXT,
  topic TEXT,
  reason JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_profile_exam TEXT;
  v_profile_exam_date DATE;
  v_profile_prefs JSONB;
  
  -- review_due
  v_due_count INTEGER := 0;
  
  -- fix_weak
  v_weak_subject TEXT;
  v_weak_subtopic TEXT;
  v_weak_mastery DOUBLE PRECISION;
  v_weak_attempts INTEGER;
  
  -- diagnostic
  v_has_history BOOLEAN := false;
  
  -- learn_next
  v_recent_chap_id UUID;
  v_recent_completed_at TIMESTAMPTZ;
  v_recent_class INTEGER;
  v_recent_subj TEXT;
  v_recent_chap_num INTEGER;
  v_recent_chap_title TEXT;

  v_next_class INTEGER;
  v_next_subj TEXT;
  v_next_chap_id UUID;
  v_next_chap_title TEXT;
  v_next_chap_num INTEGER;
  v_next_class_final INTEGER;
  v_next_subj_final TEXT;
  
  -- exam_push
  v_days_to_exam INTEGER;
  v_pyq_exam TEXT;
  v_pyq_class_level TEXT;
  v_has_trusted_pyq BOOLEAN := false;
  v_pyq_count INTEGER := 0;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'get_today_plan: caller must be authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Read user profile state
  SELECT
    COALESCE(p.exam_name, 'GENERAL'),
    p.exam_date,
    COALESCE(p.study_preferences, '{}'::JSONB)
  INTO
    v_profile_exam,
    v_profile_exam_date,
    v_profile_prefs
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF NOT FOUND THEN
    v_profile_exam := 'GENERAL';
    v_profile_exam_date := NULL;
    v_profile_prefs := '{}'::JSONB;
  END IF;

  -- ── CANDIDATE 1: review_due (Priority 1) ──────────────────────────────────
  SELECT count(*)::INTEGER
  INTO v_due_count
  FROM public.sr_cards c
  WHERE c.user_id = v_user_id
    AND c.next_review_date <= CURRENT_DATE;

  -- ── CANDIDATE 2: fix_weak (Priority 2) ────────────────────────────────────
  SELECT
    m.subject,
    m.subtopic,
    m.mastery_score,
    m.attempts
  INTO
    v_weak_subject,
    v_weak_subtopic,
    v_weak_mastery,
    v_weak_attempts
  FROM public.subtopic_mastery m
  WHERE m.user_id = v_user_id
    AND m.attempts >= 3
    AND m.mastery_score < 0.5
  ORDER BY
    m.mastery_score ASC,
    m.attempts DESC,
    m.last_attempted_at ASC NULLS FIRST,
    m.subtopic ASC,
    m.id ASC
  LIMIT 1;

  -- ── CANDIDATE 3: diagnostic (Priority 3) ──────────────────────────────────
  -- History defined across multi-table learner state
  SELECT (
    EXISTS (SELECT 1 FROM public.quiz_sessions qs WHERE qs.user_id = v_user_id LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.subtopic_mastery sm WHERE sm.user_id = v_user_id AND sm.attempts > 0 LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.topic_performance tp WHERE tp.user_id = v_user_id AND tp.total_q > 0 LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.ncert_chapter_progress ncp WHERE ncp.user_id = v_user_id AND (ncp.questions_attempted > 0 OR ncp.flashcards_reviewed > 0) LIMIT 1)
  ) INTO v_has_history;

  -- ── CANDIDATE 4: learn_next (Priority 4) ──────────────────────────────────
  -- Hierarchy A: Existing chapter progress
  SELECT
    cp.chapter_id,
    cp.completed_at,
    c.class_num,
    c.subject,
    c.chapter_num,
    c.chapter_title
  INTO
    v_recent_chap_id,
    v_recent_completed_at,
    v_recent_class,
    v_recent_subj,
    v_recent_chap_num,
    v_recent_chap_title
  FROM public.ncert_chapter_progress cp
  JOIN public.ncert_chapters c ON c.id = cp.chapter_id
  WHERE cp.user_id = v_user_id
  ORDER BY cp.updated_at DESC, cp.chapter_id ASC
  LIMIT 1;

  IF v_recent_chap_id IS NOT NULL THEN
    IF v_recent_completed_at IS NULL THEN
      -- Chapter in progress (not completed): recommend THAT current chapter
      v_next_chap_id := v_recent_chap_id;
      v_next_chap_title := v_recent_chap_title;
      v_next_chap_num := v_recent_chap_num;
      v_next_class_final := v_recent_class;
      v_next_subj_final := v_recent_subj;
    ELSE
      -- Chapter is completed: recommend the next chapter_num in the SAME class + subject
      SELECT
        c2.id,
        c2.subject,
        c2.class_num,
        c2.chapter_num,
        c2.chapter_title
      INTO
        v_next_chap_id,
        v_next_subj_final,
        v_next_class_final,
        v_next_chap_num,
        v_next_chap_title
      FROM public.ncert_chapters c2
      WHERE c2.class_num = v_recent_class
        AND c2.subject ILIKE v_recent_subj
        AND c2.chapter_num > v_recent_chap_num
      ORDER BY c2.chapter_num ASC, c2.id ASC
      LIMIT 1;
    END IF;
  ELSE
    -- Hierarchy B: Explicit profile preferences (no chapter progress)
    IF (v_profile_prefs->>'class') ~ '^[0-9]+$' THEN
      v_next_class := (v_profile_prefs->>'class')::INTEGER;
    ELSIF (v_profile_prefs->>'grade') ~ '^[0-9]+$' THEN
      v_next_class := (v_profile_prefs->>'grade')::INTEGER;
    ELSIF (v_profile_prefs->>'class_level') ~ '^[0-9]+$' THEN
      v_next_class := (v_profile_prefs->>'class_level')::INTEGER;
    END IF;

    IF jsonb_typeof(v_profile_prefs->'subjects') = 'array' AND jsonb_array_length(v_profile_prefs->'subjects') > 0 THEN
      v_next_subj := v_profile_prefs->'subjects'->>0;
    ELSIF v_profile_prefs->>'subject' IS NOT NULL AND length(trim(v_profile_prefs->>'subject')) > 0 THEN
      v_next_subj := trim(v_profile_prefs->>'subject');
    END IF;

    -- Only when both class and subject can be determined reliably from real data
    IF v_next_class IS NOT NULL AND v_next_subj IS NOT NULL THEN
      SELECT
        c3.id,
        c3.subject,
        c3.class_num,
        c3.chapter_num,
        c3.chapter_title
      INTO
        v_next_chap_id,
        v_next_subj_final,
        v_next_class_final,
        v_next_chap_num,
        v_next_chap_title
      FROM public.ncert_chapters c3
      WHERE c3.class_num = v_next_class
        AND c3.subject ILIKE v_next_subj
      ORDER BY c3.chapter_num ASC, c3.id ASC
      LIMIT 1;
    END IF;
    -- Hierarchy C: If class or subject cannot be determined, v_next_chap_id remains NULL (omit learn_next).
  END IF;

  -- ── CANDIDATE 5: exam_push (Priority 5) ───────────────────────────────────
  IF v_profile_exam IS NOT NULL
     AND v_profile_exam != 'GENERAL'
     AND v_profile_exam_date IS NOT NULL
     AND v_profile_exam_date >= CURRENT_DATE
     AND v_profile_exam_date <= (CURRENT_DATE + 14)
  THEN
    v_days_to_exam := (v_profile_exam_date - CURRENT_DATE);

    CASE v_profile_exam
      WHEN 'JEE Main'     THEN v_pyq_exam := 'JEE_MAIN'; v_pyq_class_level := NULL;
      WHEN 'JEE Advanced' THEN v_pyq_exam := 'JEE_ADV';  v_pyq_class_level := NULL;
      WHEN 'NEET'         THEN v_pyq_exam := 'NEET';     v_pyq_class_level := NULL;
      WHEN 'BITSAT'       THEN v_pyq_exam := 'BITSAT';   v_pyq_class_level := NULL;
      WHEN 'CBSE 10'      THEN v_pyq_exam := 'BOARDS';   v_pyq_class_level := '10';
      WHEN 'CBSE 12'      THEN v_pyq_exam := 'BOARDS';   v_pyq_class_level := '12';
      WHEN 'UPSC'         THEN v_pyq_exam := 'UPSC';     v_pyq_class_level := NULL;
      WHEN 'CAT'          THEN v_pyq_exam := 'CAT';      v_pyq_class_level := NULL;
      ELSE                     v_pyq_exam := NULL;       v_pyq_class_level := NULL;
    END CASE;

    IF v_pyq_exam IS NOT NULL THEN
      -- Strict V5 trust policy + tight class relevance (no class_level IS NULL fallback for BOARDS)
      SELECT count(*)::INTEGER
      INTO v_pyq_count
      FROM public.pyq_content pq
      WHERE pq.exam = v_pyq_exam
        AND (v_pyq_class_level IS NULL OR pq.class_level = v_pyq_class_level)
        AND pq.is_active = true
        AND pq.flagged_for_review = false
        AND pq.is_reviewed = true
        AND pq.validation_state IN ('ai_reviewed_ok', 'human_verified');

      IF v_pyq_count > 0 THEN
        v_has_trusted_pyq := true;
      END IF;
    END IF;
  END IF;

  -- ── ASSEMBLE CANDIDATE SET & RETURN TOP 3 IN CANONICAL PRIORITY ───────────
  RETURN QUERY
  WITH candidates AS (
    -- Priority 1: review_due
    SELECT
      'review_due'::TEXT AS c_kind,
      1::INTEGER AS c_priority,
      CASE
        WHEN v_due_count = 1 THEN 'Review 1 Due Card'
        ELSE 'Review ' || v_due_count || ' Due Cards'
      END::TEXT AS c_title,
      LEAST(GREATEST(v_due_count * 2, 5), 30)::INTEGER AS c_duration_minutes,
      '/spaced-review'::TEXT AS c_target_path,
      jsonb_build_object('due_count', v_due_count) AS c_target_params,
      NULL::TEXT AS c_subject,
      NULL::TEXT AS c_chapter,
      NULL::TEXT AS c_topic,
      jsonb_build_object('due_count', v_due_count, 'type', 'spaced_repetition') AS c_reason
    WHERE v_due_count > 0

    UNION ALL

    -- Priority 2: fix_weak
    SELECT
      'fix_weak'::TEXT AS c_kind,
      2::INTEGER AS c_priority,
      ('Strengthen ' || v_weak_subtopic)::TEXT AS c_title,
      15::INTEGER AS c_duration_minutes,
      '/practice'::TEXT AS c_target_path,
      jsonb_build_object('mode', 'weak_topic', 'subject', v_weak_subject, 'subtopic', v_weak_subtopic) AS c_target_params,
      v_weak_subject::TEXT AS c_subject,
      NULL::TEXT AS c_chapter,
      v_weak_subtopic::TEXT AS c_topic,
      jsonb_build_object(
        'mastery_score', round(v_weak_mastery::numeric, 2),
        'attempts', v_weak_attempts,
        'type', 'weak_topic_drill'
      ) AS c_reason
    WHERE v_weak_subtopic IS NOT NULL

    UNION ALL

    -- Priority 3: diagnostic
    SELECT
      'diagnostic'::TEXT AS c_kind,
      3::INTEGER AS c_priority,
      'Complete 5-Question Diagnostic'::TEXT AS c_title,
      10::INTEGER AS c_duration_minutes,
      '/practice'::TEXT AS c_target_path,
      jsonb_build_object('mode', 'diagnostic', 'questions_count', 5) AS c_target_params,
      NULL::TEXT AS c_subject,
      NULL::TEXT AS c_chapter,
      NULL::TEXT AS c_topic,
      jsonb_build_object('type', 'diagnostic_assessment', 'questions', 5, 'basis', 'no_prior_learning_history') AS c_reason
    WHERE NOT v_has_history

    UNION ALL

    -- Priority 4: learn_next
    SELECT
      'learn_next'::TEXT AS c_kind,
      4::INTEGER AS c_priority,
      ('Next Chapter: ' || v_next_chap_title)::TEXT AS c_title,
      20::INTEGER AS c_duration_minutes,
      '/practice'::TEXT AS c_target_path,
      jsonb_build_object(
        'mode', 'learn_next',
        'class', v_next_class_final,
        'subject', v_next_subj_final,
        'chapter_id', v_next_chap_id,
        'chapter', v_next_chap_title
      ) AS c_target_params,
      v_next_subj_final::TEXT AS c_subject,
      v_next_chap_title::TEXT AS c_chapter,
      NULL::TEXT AS c_topic,
      jsonb_build_object(
        'chapter_num', v_next_chap_num,
        'class_num', v_next_class_final,
        'type', 'syllabus_progression'
      ) AS c_reason
    WHERE v_next_chap_id IS NOT NULL

    UNION ALL

    -- Priority 5: exam_push
    SELECT
      'exam_push'::TEXT AS c_kind,
      5::INTEGER AS c_priority,
      (v_profile_exam || ' Countdown Practice')::TEXT AS c_title,
      25::INTEGER AS c_duration_minutes,
      '/pyq-bank'::TEXT AS c_target_path,
      jsonb_build_object('exam', v_pyq_exam, 'days_remaining', v_days_to_exam) AS c_target_params,
      NULL::TEXT AS c_subject,
      NULL::TEXT AS c_chapter,
      NULL::TEXT AS c_topic,
      jsonb_build_object(
        'exam', v_profile_exam,
        'exam_date', v_profile_exam_date,
        'days_remaining', v_days_to_exam,
        'trusted_questions', v_pyq_count
      ) AS c_reason
    WHERE v_has_trusted_pyq
  )
  SELECT
    cand.c_kind,
    cand.c_priority,
    cand.c_title,
    cand.c_duration_minutes,
    cand.c_target_path,
    cand.c_target_params,
    cand.c_subject,
    cand.c_chapter,
    cand.c_topic,
    cand.c_reason
  FROM candidates cand
  WHERE cand.c_target_path IN ('/spaced-review', '/practice', '/pyq-bank')
  ORDER BY cand.c_priority ASC, cand.c_title ASC
  LIMIT 3;
END;
$$;

-- Permissions: revoke from public, anon, service_role; grant only to authenticated
REVOKE ALL ON FUNCTION public.get_today_plan() FROM public, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_today_plan() TO authenticated;

COMMENT ON FUNCTION public.get_today_plan() IS
  'Edora V5 Deterministic Plan Engine (Day 7): Returns up to 3 bounded plan items strictly ordered by priority (review_due > fix_weak > diagnostic > learn_next > exam_push) and restricted to core V5 routes.';
