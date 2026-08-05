-- §13 (docs/enterprise-remediation-tracker.md): Novo memory safety mandate
-- requires users be able to view, correct, or disable their memories. View
-- and per-item delete already existed (ProfilePage's NovoMemoryViewer);
-- this adds the missing "disable" control — an opt-out flag that
-- novo-memory-extract checks before writing any new memory.
alter table public.profiles
  add column if not exists memory_opt_out boolean not null default false;

comment on column public.profiles.memory_opt_out is
  'When true, novo-memory-extract skips writing new memories for this user. Existing memories are untouched (users delete those individually or via "Clear All").';
