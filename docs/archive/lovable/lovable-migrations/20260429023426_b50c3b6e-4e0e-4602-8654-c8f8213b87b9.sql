CREATE TABLE IF NOT EXISTS public.pipeline_stage_slas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_funnel_id UUID REFERENCES public.pipeline_funnels(id) ON DELETE CASCADE,
  stage opportunity_stage NOT NULL,
  sla_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_stage_slas_days_non_negative CHECK (sla_days IS NULL OR sla_days >= 0),
  CONSTRAINT pipeline_stage_slas_unique UNIQUE (organization_id, pipeline_funnel_id, stage)
);

CREATE INDEX IF NOT EXISTS pipeline_stage_slas_org_funnel_idx
  ON public.pipeline_stage_slas (organization_id, pipeline_funnel_id, stage);

ALTER TABLE public.pipeline_stage_slas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization members can view pipeline stage SLAs" ON public.pipeline_stage_slas;
CREATE POLICY "Organization members can view pipeline stage SLAs"
ON public.pipeline_stage_slas
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins can create pipeline stage SLAs" ON public.pipeline_stage_slas;
CREATE POLICY "Organization owners and admins can create pipeline stage SLAs"
ON public.pipeline_stage_slas
FOR INSERT
TO authenticated
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "Organization owners and admins can update pipeline stage SLAs" ON public.pipeline_stage_slas;
CREATE POLICY "Organization owners and admins can update pipeline stage SLAs"
ON public.pipeline_stage_slas
FOR UPDATE
TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "Organization owners and admins can delete pipeline stage SLAs" ON public.pipeline_stage_slas;
CREATE POLICY "Organization owners and admins can delete pipeline stage SLAs"
ON public.pipeline_stage_slas
FOR DELETE
TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP TRIGGER IF EXISTS update_pipeline_stage_slas_updated_at ON public.pipeline_stage_slas;
CREATE TRIGGER update_pipeline_stage_slas_updated_at
BEFORE UPDATE ON public.pipeline_stage_slas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pipeline_stage_slas (organization_id, pipeline_funnel_id, stage, sla_days, is_active)
SELECT pf.organization_id, pf.id, defaults.stage::opportunity_stage, defaults.sla_days, true
FROM public.pipeline_funnels pf
CROSS JOIN (VALUES
  ('prospect', 7),
  ('reuniao', 5),
  ('proposta_enviada', 10),
  ('negociacao', 14),
  ('fechado', NULL),
  ('perdido', NULL)
) AS defaults(stage, sla_days)
ON CONFLICT (organization_id, pipeline_funnel_id, stage) DO NOTHING;