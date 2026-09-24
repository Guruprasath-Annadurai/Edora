-- One more layer of the same gap: unlike Supabase's hosted platform, a
-- fresh local/CI Postgres stack (`supabase test db`) does not grant
-- `service_role` default table privileges either -- confirmed live via a
-- failing CI run whose own error HINT said exactly
-- "GRANT INSERT ON public.pyq_content TO service_role". Production already
-- has full service_role access to both tables (the standard Supabase
-- default there), so this is CI/staging-parity only, not a production
-- change.
GRANT ALL ON public.pyq_content TO service_role;
GRANT ALL ON public.live_events TO service_role;
