-- ─────────────────────────────────────────────────────────────────────────────
-- Fix cross-tenant PII leak: teacher_profiles had a "read all" policy that let
-- ANY authenticated user (including students) read every teacher's Google
-- email, subjects, and class numbers across every school. Only the teacher's
-- own row (or service role) should be readable — nothing in the frontend or
-- edge functions ever reads another teacher's row.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teacher_read_all" ON public.teacher_profiles;
-- "teacher_own" (USING (id = auth.uid())) already covers SELECT for the
-- teacher's own row; service-role edge functions (classroom-auth) bypass RLS.
