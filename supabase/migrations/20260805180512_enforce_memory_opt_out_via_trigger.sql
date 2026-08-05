-- §13 (docs/enterprise-remediation-tracker.md): application-level opt-out
-- checks were added to novo-memory-extract and novo-memory's
-- save_from_session, but a repo-wide grep found 9+ edge functions
-- (novo-certifications, novo-subscription, tutoring-engine, lesson-planner,
-- adaptive-curriculum, gemini-chat, ...) independently insert into
-- novo_memories. Patching each call site is fragile — the next new function
-- that writes a memory would silently forget the check. A trigger is the one
-- enforcement point that can't be bypassed or missed by future code.
--
-- Silently skips the insert (returns null) rather than raising, since none
-- of these call sites expect memory writes to be able to fail — an
-- exception here would surface as an unrelated 500 in whatever feature
-- triggered it (certificate issuance, subscription events, etc.).
create or replace function public.check_memory_opt_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles
    where id = new.user_id and memory_opt_out = true
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_memory_opt_out on public.novo_memories;
create trigger enforce_memory_opt_out
  before insert on public.novo_memories
  for each row
  execute function public.check_memory_opt_out();
