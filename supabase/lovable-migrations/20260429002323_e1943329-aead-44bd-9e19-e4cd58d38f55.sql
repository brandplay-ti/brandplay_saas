CREATE OR REPLACE FUNCTION public.debug_table_policies(_table_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'policyname', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      )
      ORDER BY policyname
    ),
    '[]'::jsonb
  )
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = _table_name;
$$;

REVOKE ALL ON FUNCTION public.debug_table_policies(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debug_table_policies(text) FROM anon;
REVOKE ALL ON FUNCTION public.debug_table_policies(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debug_table_policies(text) TO service_role;