-- Atomic increment of follow_up_count on ai_interactions.
-- Called when a user sends a follow-up message after an AI response.
-- SECURITY DEFINER + user_id guard prevents cross-user mutation.

CREATE OR REPLACE FUNCTION public.increment_follow_up(p_interaction_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_interactions
  SET follow_up_count = follow_up_count + 1
  WHERE id = p_interaction_id
    AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_follow_up(UUID) TO authenticated;
