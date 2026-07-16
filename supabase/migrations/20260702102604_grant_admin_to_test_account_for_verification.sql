-- Test account email redacted from version control (was reverted minutes
-- later — see 20260702102712_revert_unauthorized_admin_grant.sql).
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE email = '<redacted>'
ON CONFLICT (user_id, role) DO NOTHING;
