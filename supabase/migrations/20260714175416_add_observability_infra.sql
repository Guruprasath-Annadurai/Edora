
create table if not exists public.edge_function_errors (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  error_message text not null,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_edge_function_errors_fn_time
  on public.edge_function_errors (function_name, created_at);

alter table public.edge_function_errors enable row level security;

create policy "edge_errors_service_all" on public.edge_function_errors as permissive for ALL to public
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

-- auto-prune old error logs so this table never grows unbounded
create or replace function public.cleanup_edge_function_errors()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.edge_function_errors where created_at < now() - interval '14 days';
$$;
revoke execute on function public.cleanup_edge_function_errors() from public;
grant execute on function public.cleanup_edge_function_errors() to service_role;

create or replace function public.get_connection_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'current_connections', (select count(*) from pg_stat_activity),
    'max_connections', (select setting::int from pg_settings where name = 'max_connections'),
    'active_queries', (select count(*) from pg_stat_activity where state = 'active')
  );
$$;
revoke execute on function public.get_connection_stats() from public;
grant execute on function public.get_connection_stats() to service_role;
