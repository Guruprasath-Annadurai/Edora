-- ==============================================================================
-- Verification SQL: Assert that student/anon roles cannot access operational views
-- Run against Staging Database after migration application.
-- ==============================================================================

DO $$
DECLARE
  v_view text;
  v_role text;
  v_views text[] := ARRAY[
    'v_ai_gateway_hourly_metrics',
    'v_ai_provider_fallback_summary',
    'v_quiz_session_health',
    'v_database_table_sizes'
  ];
  v_forbidden_roles text[] := ARRAY['anon', 'authenticated', 'public'];
BEGIN
  FOREACH v_view IN ARRAY v_views LOOP
    FOREACH v_role IN ARRAY v_forbidden_roles LOOP
      IF has_table_privilege(v_role, 'public.' || v_view, 'SELECT') THEN
        RAISE EXCEPTION 'SECURITY BREACH: Role % has SELECT permission on operational view %', v_role, v_view;
      END IF;
    END LOOP;

    -- Assert that service_role retains access
    IF NOT has_table_privilege('service_role', 'public.' || v_view, 'SELECT') THEN
      RAISE EXCEPTION 'CONFIG ERROR: service_role lacks SELECT permission on %', v_view;
    END IF;
  END LOOP;

  RAISE NOTICE 'SUCCESS: All operational views are strictly sealed from client roles (anon/authenticated).';
END $$;
