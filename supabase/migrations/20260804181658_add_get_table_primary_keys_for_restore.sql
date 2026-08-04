-- Companion to get_public_table_names() (20260804161631_db_backup_export.sql),
-- needed by the db-backup-restore edge function to know each table's
-- onConflict target for upsert-based restore. Verified every public table
-- currently has a primary key (checked via anti-join against pg_tables) so
-- this doesn't need to handle a no-PK fallback path today, but the function
-- returns an empty array rather than erroring if one ever lacks one, so the
-- restore function can detect and skip it explicitly instead of crashing.
create or replace function get_table_primary_keys()
returns table (table_name text, pk_columns text[])
language sql
security definer
set search_path = public
as $$
  select
    t.tablename::text,
    coalesce(
      (select array_agg(kcu.column_name::text order by kcu.ordinal_position)
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
       where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public' and tc.table_name = t.tablename),
      array[]::text[]
    ) as pk_columns
  from pg_tables t
  where t.schemaname = 'public'
  order by t.tablename;
$$;

revoke all on function get_table_primary_keys() from public, anon, authenticated;
grant execute on function get_table_primary_keys() to service_role;
