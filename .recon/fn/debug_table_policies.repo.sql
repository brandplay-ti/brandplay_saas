CREATE OR REPLACE FUNCTION public.debug_table_policies(_table_name text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce(json_agg(row_to_json(p)), '[]'::json)
  from (
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = _table_name
  ) p;
$function$

