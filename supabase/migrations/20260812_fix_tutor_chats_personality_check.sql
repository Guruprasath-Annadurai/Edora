-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: tutor_chats.personality CHECK constraint still lists the legacy
-- personas (teacher/friend/coach/examiner/mentor). The UI was rebranded to
-- Novo Dominie / Novo Preceptor ('dominie'/'preceptor') but the constraint
-- was never updated, so every chat message insert has been silently failing
-- (caught client-side, chat still "works" via direct Gemini call, but no
-- message ever gets saved to history).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tutor_chats DROP CONSTRAINT IF EXISTS tutor_chats_personality_check;

ALTER TABLE public.tutor_chats
  ADD CONSTRAINT tutor_chats_personality_check
  CHECK (personality IN ('teacher','friend','coach','examiner','mentor','dominie','preceptor'));
