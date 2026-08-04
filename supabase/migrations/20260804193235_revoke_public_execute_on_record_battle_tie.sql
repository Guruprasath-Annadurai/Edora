-- The prior revoke (revoke_anon_execute_on_membership_check_functions) only
-- revoked FROM anon, but Postgres auto-grants EXECUTE on new functions TO
-- PUBLIC by default — a pseudo-role every actual role (including anon)
-- implicitly inherits from, separate from an explicit `anon` grant. The
-- security advisor still flagged record_battle_tie as anon-executable
-- after the previous migration specifically because of this — confirmed by
-- re-running the advisor. Revoking from PUBLIC explicitly, which is the
-- actual fix (matches this codebase's own established pattern, see
-- 20260714103557_tighten_security_definer_grants_v2_revoke_public.sql).
revoke execute on function public.record_battle_tie(uuid) from public;
grant execute on function public.record_battle_tie(uuid) to authenticated;
