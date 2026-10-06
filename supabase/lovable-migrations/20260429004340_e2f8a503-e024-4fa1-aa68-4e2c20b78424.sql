CREATE TABLE IF NOT EXISTS public.error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  organization_id uuid,
  source text NOT NULL DEFAULT 'frontend',
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack text,
  component_stack text,
  route text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own error reports" ON public.error_reports;
DROP POLICY IF EXISTS "Org admins view organization error reports" ON public.error_reports;

CREATE POLICY "Users view own error reports"
ON public.error_reports
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Org admins view organization error reports"
ON public.error_reports
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role])
);

CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON public.error_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_org_created_at ON public.error_reports(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_user_created_at ON public.error_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_severity ON public.error_reports(severity);

REVOKE ALL ON public.error_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.error_reports TO authenticated;
GRANT ALL ON public.error_reports TO service_role;