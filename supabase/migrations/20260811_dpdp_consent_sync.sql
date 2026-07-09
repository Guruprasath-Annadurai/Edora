-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: DPDP consent given at signup (stored in auth.users.raw_user_meta_data)
-- was never copied into public.profiles, so ProtectedRoute's
-- `!profile.dpdp_consent_at` check kept showing the consent modal again to
-- users who had already consented on the signup form.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, dpdp_consent_at, dpdp_consent_version)
  VALUES (
    NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name',
    (NEW.raw_user_meta_data->>'dpdp_consent_at')::timestamptz,
    NEW.raw_user_meta_data->>'dpdp_consent_version'
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill existing profiles whose consent only lives in auth metadata
UPDATE public.profiles p
SET dpdp_consent_at      = (u.raw_user_meta_data->>'dpdp_consent_at')::timestamptz,
    dpdp_consent_version = u.raw_user_meta_data->>'dpdp_consent_version'
FROM auth.users u
WHERE p.id = u.id
  AND p.dpdp_consent_at IS NULL
  AND u.raw_user_meta_data->>'dpdp_consent_at' IS NOT NULL;
