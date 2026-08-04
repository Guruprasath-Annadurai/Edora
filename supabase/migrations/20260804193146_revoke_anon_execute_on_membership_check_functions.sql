-- RBAC audit finding: Supabase's security advisor flags is_institution_admin,
-- is_institution_member, is_in_study_group, and record_battle_tie as directly
-- callable by anon via /rest/v1/rpc/<fn>. Checked their actual RLS usage
-- (pg_policies) and table grants: the tables that reference these helpers
-- (institutions, institution_members, study_group_members) key every policy
-- off auth.uid(), which is NULL for anon — so anon already gets zero rows
-- either way. Revoking anon's direct EXECUTE closes an information-
-- disclosure/enumeration vector (an unauthenticated caller probing
-- /rest/v1/rpc/is_institution_admin with guessed UUIDs to map org
-- membership) without changing legitimate authenticated behavior, and
-- matches this codebase's own established pattern for exactly this class
-- of finding (see revoke_anon_get_rag_cache, revoke_anon_rag_cache_write_access,
-- tighten_security_definer_grants_v2_revoke_public).
revoke execute on function public.is_institution_admin(uuid, uuid) from anon;
revoke execute on function public.is_institution_member(uuid, uuid) from anon;
revoke execute on function public.is_in_study_group(uuid, uuid) from anon;
revoke execute on function public.record_battle_tie(uuid) from anon;

grant execute on function public.is_institution_admin(uuid, uuid) to authenticated;
grant execute on function public.is_institution_member(uuid, uuid) to authenticated;
grant execute on function public.is_in_study_group(uuid, uuid) to authenticated;
grant execute on function public.record_battle_tie(uuid) to authenticated;
