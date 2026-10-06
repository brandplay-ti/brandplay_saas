CREATE TABLE IF NOT EXISTS public.backend_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_email text,
  organization_id uuid,
  table_name text NOT NULL,
  action text NOT NULL,
  client_file text,
  client_line integer,
  attempted_row_keys text[] NOT NULL DEFAULT '{}',
  error_code text,
  error_message text,
  error_details text,
  error_hint text,
  matching_policies jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.backend_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own backend error logs" ON public.backend_error_logs;
DROP POLICY IF EXISTS "Org admins view organization backend error logs" ON public.backend_error_logs;

CREATE POLICY "Users view own backend error logs"
ON public.backend_error_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Org admins view organization backend error logs"
ON public.backend_error_logs
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
);

CREATE INDEX IF NOT EXISTS idx_backend_error_logs_created_at ON public.backend_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_error_logs_org_created_at ON public.backend_error_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_error_logs_user_created_at ON public.backend_error_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backend_error_logs_table_action ON public.backend_error_logs(table_name, action);

REVOKE ALL ON public.backend_error_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.backend_error_logs TO authenticated;
GRANT ALL ON public.backend_error_logs TO service_role;