-- novo_memories: ALL(own) + DELETE(own, exact duplicate) + INSERT(service_role only) + SELECT(own, exact duplicate)
-- ALL granted: select/insert/update/delete for own user. DELETE and SELECT already
-- separately duplicate that exact condition (redundant with ALL, safe to leave as-is
-- since dropping ALL doesn't remove any permission there). INSERT is different --
-- ALL's own-check also permitted self-insert alongside the existing service_role-only
-- INSERT policy; preserve that by merging own into the INSERT policy. UPDATE has no
-- other policy, so add an explicit own-only UPDATE to replace what ALL provided.
drop policy "users_own_memories" on "novo_memories";
create policy "novo_memories_update" on "novo_memories" for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy "novo_memories_service_insert" on "novo_memories";
create policy "novo_memories_insert" on "novo_memories" for insert with check (
  ((select auth.uid()) = user_id) or (auth.role() = 'service_role')
);
-- novo_memories_user_delete and novo_memories_user_select left untouched -- already
-- exactly match what ALL provided for those commands, no permission change.
