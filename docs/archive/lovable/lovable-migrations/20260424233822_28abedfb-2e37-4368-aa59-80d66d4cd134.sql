CREATE TABLE IF NOT EXISTS public.brandtrack_event_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.brandtrack_events(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brandtrack_brands(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  sponsor_status text NOT NULL DEFAULT 'patrocinador' CHECK (sponsor_status IN ('patrocinador','nao_patrocinador','concorrente','parceiro','prospect')),
  priority integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brandtrack_event_brands_unique_name
ON public.brandtrack_event_brands(event_id, lower(display_name));
CREATE INDEX IF NOT EXISTS idx_brandtrack_event_brands_event ON public.brandtrack_event_brands(event_id);
CREATE INDEX IF NOT EXISTS idx_brandtrack_event_brands_org ON public.brandtrack_event_brands(organization_id);
CREATE INDEX IF NOT EXISTS idx_brandtrack_event_brands_brand ON public.brandtrack_event_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_brandtrack_event_brands_sponsor ON public.brandtrack_event_brands(sponsor_id);

DROP TRIGGER IF EXISTS trg_brandtrack_event_brands_updated ON public.brandtrack_event_brands;
CREATE TRIGGER trg_brandtrack_event_brands_updated
BEFORE UPDATE ON public.brandtrack_event_brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_brandtrack_event_brands_org ON public.brandtrack_event_brands;
CREATE TRIGGER trg_brandtrack_event_brands_org
BEFORE INSERT ON public.brandtrack_event_brands
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();

ALTER TABLE public.brandtrack_event_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bt_event_brands_select" ON public.brandtrack_event_brands;
CREATE POLICY "bt_event_brands_select"
ON public.brandtrack_event_brands
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "bt_event_brands_insert" ON public.brandtrack_event_brands;
CREATE POLICY "bt_event_brands_insert"
ON public.brandtrack_event_brands
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND (
    organization_id IS NULL
    OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','comercial','operacional']::org_role[])
  )
);

DROP POLICY IF EXISTS "bt_event_brands_update" ON public.brandtrack_event_brands;
CREATE POLICY "bt_event_brands_update"
ON public.brandtrack_event_brands
FOR UPDATE
TO authenticated
USING (
  auth.uid() = owner_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','comercial','operacional']::org_role[])
  )
);

DROP POLICY IF EXISTS "bt_event_brands_delete" ON public.brandtrack_event_brands;
CREATE POLICY "bt_event_brands_delete"
ON public.brandtrack_event_brands
FOR DELETE
TO authenticated
USING (
  auth.uid() = owner_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','comercial','operacional']::org_role[])
  )
);