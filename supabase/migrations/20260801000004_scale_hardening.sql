-- ═══════════════════════════════════════════════════════════════════════════
-- Scale hardening pass, driven by a production-readiness audit for 10k
-- concurrent users:
--
-- 1. recompute_tournament_ranks() — tournament/index.ts's `submit` action
--    was re-ranking participants with ONE sequential UPDATE per participant
--    inside the request (O(N) writes per submit × N submits = O(N²) total).
--    At a few thousand concurrent tournament participants this risks edge
--    function timeouts and interleaved-write races on `rank`. Replaced with
--    a single set-based UPDATE using a window function — one statement,
--    computed and applied atomically by Postgres.
--
-- 2. Missing index on quiz_sessions, confirmed hot in query patterns across
--    src/hooks, src/pages and supabase/functions but never indexed.
--    (study_circle_members was also flagged, but its PRIMARY KEY is already
--    (circle_id, user_id) — already the index that query pattern needs.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recompute_tournament_ranks(p_tournament_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tournament_participants tp
  SET rank = ranked.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC, time_taken_ms ASC) AS new_rank
    FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id AND completed_at IS NOT NULL
  ) ranked
  WHERE tp.id = ranked.id;
$$;

REVOKE ALL ON FUNCTION public.recompute_tournament_ranks(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_tournament_ranks(UUID) TO service_role;

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_created
  ON public.quiz_sessions (user_id, created_at DESC);
