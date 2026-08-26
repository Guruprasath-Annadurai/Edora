-- Backfill dpdp_consent_version for profiles that consented before v3.5.0
-- introduced version tracking. These users went through the DPDP modal but
-- the version column didn't exist yet, so it was never written.
--
-- Safety: WHERE guard ensures we only touch rows that genuinely have consent
-- recorded (dpdp_consent_at IS NOT NULL) but no version (legacy data).

UPDATE public.profiles
SET    dpdp_consent_version = 'v2026.06'
WHERE  dpdp_consent_at      IS NOT NULL
  AND  dpdp_consent_version IS NULL;

-- Index to speed up consent-version checks at auth guard evaluation
CREATE INDEX IF NOT EXISTS profiles_dpdp_consent_version_idx
  ON public.profiles (dpdp_consent_version)
  WHERE dpdp_consent_version IS NOT NULL;

-- Remind future engineers: bump CONSENT_VERSION constant in
-- src/components/consent/DPDPConsentModal.tsx whenever policy changes,
-- then add a new backfill migration for the new cohort.
COMMENT ON COLUMN public.profiles.dpdp_consent_version IS
  'DPDP Act 2023 consent version. Format: vYYYY.MM. Null = not yet consented. '
  'Bump in DPDPConsentModal.tsx + add backfill migration on policy update.';
