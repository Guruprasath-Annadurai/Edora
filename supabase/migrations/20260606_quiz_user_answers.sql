-- Add user_answers column to quiz_sessions for MistakeJournal to read per-question answers
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS user_answers JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.quiz_sessions.user_answers IS
  'Array of chosen option indices (0-indexed), one per question. null = skipped.';
