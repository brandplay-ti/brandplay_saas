CREATE TABLE IF NOT EXISTS public.pipeline_funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_funnels_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_funnels_default_unique
  ON public.pipeline_funnels (organization_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS pipeline_funnels_org_position_idx
  ON public.pipeline_funnels (organization_id, position, name);

ALTER TABLE public.pipeline_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization members can view pipeline funnels" ON public.pipeline_funnels;
CREATE POLICY "Organization members can view pipeline funnels"
ON public.pipeline_funnels
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins can create pipeline funnels" ON public.pipeline_funnels;
CREATE POLICY "Organization owners and admins can create pipeline funnels"
ON public.pipeline_funnels
FOR INSERT
TO authenticated
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "Organization owners and admins can update pipeline funnels" ON public.pipeline_funnels;
CREATE POLICY "Organization owners and admins can update pipeline funnels"
ON public.pipeline_funnels
FOR UPDATE
TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "Organization owners and admins can delete pipeline funnels" ON public.pipeline_funnels;
CREATE POLICY "Organization owners and admins can delete pipeline funnels"
ON public.pipeline_funnels
FOR DELETE
TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]) AND is_default = false);

DROP TRIGGER IF EXISTS update_pipeline_funnels_updated_at ON public.pipeline_funnels;
CREATE TRIGGER update_pipeline_funnels_updated_at
BEFORE UPDATE ON public.pipeline_funnels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS pipeline_funnel_id UUID REFERENCES public.pipeline_funnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS opportunities_pipeline_funnel_idx
  ON public.opportunities (organization_id, pipeline_funnel_id);

INSERT INTO public.pipeline_funnels (organization_id, name, description, position, is_default, is_active)
SELECT o.id, 'Pipeline principal', 'Funil padrão criado para oportunidades existentes.', 0, true, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_funnels pf
  WHERE pf.organization_id = o.id AND pf.is_default = true
);

ALTER TABLE public.opportunities DISABLE TRIGGER USER;

UPDATE public.opportunities opp
SET pipeline_funnel_id = pf.id
FROM public.pipeline_funnels pf
WHERE pf.organization_id = opp.organization_id
  AND pf.is_default = true
  AND opp.pipeline_funnel_id IS NULL;

ALTER TABLE public.opportunities ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.tg_set_default_pipeline_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _funnel_id uuid;
BEGIN
  IF NEW.pipeline_funnel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    NEW.organization_id := public.get_user_org(NEW.owner_id);
  END IF;

  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _funnel_id
  FROM public.pipeline_funnels
  WHERE organization_id = NEW.organization_id AND is_default = true
  LIMIT 1;

  IF _funnel_id IS NULL THEN
    INSERT INTO public.pipeline_funnels (organization_id, name, description, position, is_default, is_active)
    VALUES (NEW.organization_id, 'Pipeline principal', 'Funil padrão criado automaticamente.', 0, true, true)
    RETURNING id INTO _funnel_id;
  END IF;

  NEW.pipeline_funnel_id := _funnel_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_default_pipeline_funnel ON public.opportunities;
CREATE TRIGGER set_default_pipeline_funnel
BEFORE INSERT OR UPDATE OF organization_id, owner_id, pipeline_funnel_id ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_default_pipeline_funnel();