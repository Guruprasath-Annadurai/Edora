-- institutions.inst_read and institution_members.inst_mem_own cross-reference
-- each other via EXISTS subqueries -- mutual recursion, infinite loop on any
-- real query. Never triggered because these features have zero real usage.
-- Fix: SECURITY DEFINER helpers break the recursion chain the same way as
-- the study_group_members fix.
create or replace function is_institution_admin(p_institution_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from institutions where id = p_institution_id and admin_user_id = p_user_id);
$$;
revoke all on function is_institution_admin(uuid, uuid) from public;
grant execute on function is_institution_admin(uuid, uuid) to authenticated;

create or replace function is_institution_member(p_institution_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from institution_members where institution_id = p_institution_id and user_id = p_user_id);
$$;
revoke all on function is_institution_member(uuid, uuid) from public;
grant execute on function is_institution_member(uuid, uuid) to authenticated;

drop policy "inst_read" on "institutions";
create policy "inst_read" on "institutions" for select using (
  ((select auth.uid()) = admin_user_id)
  or is_institution_member(id, (select auth.uid()))
);

drop policy "inst_mem_own" on "institution_members";
create policy "inst_mem_own" on "institution_members" for select using (
  (auth.uid() = user_id)
  or is_institution_admin(institution_id, auth.uid())
);

-- inst_mem_insert/inst_mem_admin_update/inst_mem_admin_delete also reference
-- institutions directly via EXISTS -- same recursion risk for those commands.
drop policy "inst_mem_insert" on "institution_members";
create policy "inst_mem_insert" on "institution_members" for insert with check (
  ((select auth.uid()) = user_id) or is_institution_admin(institution_id, (select auth.uid()))
);
drop policy "inst_mem_admin_update" on "institution_members";
create policy "inst_mem_admin_update" on "institution_members" for update using (
  is_institution_admin(institution_id, (select auth.uid()))
) with check (
  is_institution_admin(institution_id, (select auth.uid()))
);
drop policy "inst_mem_admin_delete" on "institution_members";
create policy "inst_mem_admin_delete" on "institution_members" for delete using (
  is_institution_admin(institution_id, (select auth.uid()))
);
