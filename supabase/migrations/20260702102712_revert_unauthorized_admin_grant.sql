-- Test account email redacted from version control (see the paired grant in
-- 20260702102604_grant_admin_to_test_account_for_verification.sql).
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id = (SELECT id FROM public.profiles WHERE email = '<redacted>');
