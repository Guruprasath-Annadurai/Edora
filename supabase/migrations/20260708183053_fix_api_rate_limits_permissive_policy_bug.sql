-- Real bug found while investigating multiple_permissive_policies advisory:
-- "service_insert_rate_limits" had with_check = true (anyone can insert),
-- coexisting with "rate_limits_service_insert" (service_role only).
-- Permissive policies OR together, so the loose one silently overrode the
-- strict one -- any client could insert arbitrary rows into api_rate_limits,
-- bypassing rate limiting entirely (insert fake rows to dodge your own
-- limit, or spam the table). Drop the loose one, keep the strict one.
drop policy "service_insert_rate_limits" on "api_rate_limits";

-- Also true accidental duplicate (identical qual, two policies, likely two
-- different sessions adding the same SELECT policy without checking first).
drop policy "Users read own rate limits" on "api_rate_limits";
-- kept: rate_limits_own_read (identical logic)
