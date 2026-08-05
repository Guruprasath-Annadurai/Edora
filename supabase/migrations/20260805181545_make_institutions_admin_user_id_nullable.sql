-- §14 follow-up: the previous migration changed institutions_admin_user_id_fkey
-- to ON DELETE SET NULL, but admin_user_id was itself declared NOT NULL —
-- so the trigger's SET NULL attempt would still fail with a not-null
-- violation, just a more confusing one than the original RESTRICT error.
-- Caught by an actual end-to-end deletion test (throwaway test user, real
-- delete from auth.users), not by static analysis alone.
alter table public.institutions
  alter column admin_user_id drop not null;
