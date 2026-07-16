-- The self-referential EXISTS check in sgm_read (querying study_group_members
-- from within its own RLS policy) causes infinite recursion in Postgres --
-- this table's SELECT policy currently errors on any real authenticated query.
-- Standard fix: a SECURITY DEFINER function breaks the recursion chain because
-- its internal query runs under the function owner's privileges, not
-- re-entering the calling role's RLS evaluation for the same table.
create or replace function is_in_study_group(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from study_group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

revoke all on function is_in_study_group(uuid, uuid) from public;
grant execute on function is_in_study_group(uuid, uuid) to authenticated;

drop policy "sgm_read" on "study_group_members";
create policy "sgm_read" on "study_group_members" for select using (
  ((select auth.uid()) = user_id)
  or is_in_study_group(group_id, (select auth.uid()))
);
