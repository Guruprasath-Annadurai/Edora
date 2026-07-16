
alter table public.api_rate_limits add column if not exists tenant_key text;

create index if not exists idx_api_rate_limits_tenant_endpoint_created
  on public.api_rate_limits (tenant_key, endpoint, created_at)
  where tenant_key is not null;

create or replace function public.enforce_rate_limit(
  p_user_id uuid,
  p_tenant_key text,
  p_endpoint text,
  p_user_max int,
  p_tenant_max int,
  p_window_minutes int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - (p_window_minutes || ' minutes')::interval;
  v_user_count int;
  v_tenant_count int;
begin
  select count(*) into v_user_count
  from public.api_rate_limits
  where user_id = p_user_id and endpoint = p_endpoint and created_at >= v_window_start;

  if v_user_count >= p_user_max then
    raise exception 'rate_limit_exceeded: user % exceeded % calls to % in % minutes', p_user_id, p_user_max, p_endpoint, p_window_minutes
      using errcode = 'P0001';
  end if;

  if p_tenant_key is not null then
    select count(*) into v_tenant_count
    from public.api_rate_limits
    where tenant_key = p_tenant_key and endpoint = p_endpoint and created_at >= v_window_start;

    if v_tenant_count >= p_tenant_max then
      raise exception 'rate_limit_exceeded: tenant % exceeded % aggregate calls to % in % minutes', p_tenant_key, p_tenant_max, p_endpoint, p_window_minutes
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.api_rate_limits (user_id, endpoint, tenant_key) values (p_user_id, p_endpoint, p_tenant_key);
end;
$$;

revoke execute on function public.enforce_rate_limit(uuid, text, text, int, int, int) from public;
grant execute on function public.enforce_rate_limit(uuid, text, text, int, int, int) to authenticated, service_role;
