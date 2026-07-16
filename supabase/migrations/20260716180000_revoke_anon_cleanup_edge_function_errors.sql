-- cleanup_edge_function_errors() has no internal auth check and is meant to run
-- only via the monitoring-check cron job (service_role). It was left grantable to
-- anon/authenticated when added in add_observability_infra, letting any
-- unauthenticated caller trigger it via /rest/v1/rpc/cleanup_edge_function_errors.
revoke execute on function public.cleanup_edge_function_errors() from anon;
revoke execute on function public.cleanup_edge_function_errors() from authenticated;
