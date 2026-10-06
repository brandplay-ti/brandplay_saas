ALTER TABLE public.asset_allocations ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.asset_photos ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.contract_assets ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.contract_clauses ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.delivery_approval_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.opportunity_activities ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.asset_allocations aa
SET organization_id = a.organization_id
FROM public.assets a
WHERE aa.asset_id = a.id AND aa.organization_id IS NULL;

UPDATE public.asset_photos ap
SET organization_id = a.organization_id
FROM public.assets a
WHERE ap.asset_id = a.id AND ap.organization_id IS NULL;

UPDATE public.contract_assets ca
SET organization_id = c.organization_id
FROM public.contracts c
WHERE ca.contract_id = c.id AND ca.organization_id IS NULL;

UPDATE public.contract_clauses cc
SET organization_id = c.organization_id
FROM public.contracts c
WHERE cc.contract_id = c.id AND cc.organization_id IS NULL;

UPDATE public.delivery_approval_log dal
SET organization_id = d.organization_id
FROM public.deliveries d
WHERE dal.delivery_id = d.id AND dal.organization_id IS NULL;

UPDATE public.opportunity_activities oa
SET organization_id = o.organization_id
FROM public.opportunities o
WHERE oa.opportunity_id = o.id AND oa.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_allocations_org ON public.asset_allocations (organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_photos_org ON public.asset_photos (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_assets_org ON public.contract_assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_clauses_org ON public.contract_clauses (organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_approval_log_org ON public.delivery_approval_log (organization_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_activities_org ON public.opportunity_activities (organization_id);

CREATE OR REPLACE FUNCTION public.tg_set_asset_child_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'asset_allocations' THEN
    SELECT organization_id INTO NEW.organization_id FROM public.assets WHERE id = NEW.asset_id;
  ELSIF TG_TABLE_NAME = 'asset_photos' THEN
    SELECT organization_id INTO NEW.organization_id FROM public.assets WHERE id = NEW.asset_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o ativo';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_contract_child_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.contracts WHERE id = NEW.contract_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para o contrato';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_delivery_approval_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.deliveries WHERE id = NEW.delivery_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para a entrega';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_opportunity_activity_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada para a oportunidade';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_asset_allocations_organization_id ON public.asset_allocations;
CREATE TRIGGER set_asset_allocations_organization_id
BEFORE INSERT OR UPDATE OF asset_id ON public.asset_allocations
FOR EACH ROW EXECUTE FUNCTION public.tg_set_asset_child_organization_id();

DROP TRIGGER IF EXISTS set_asset_photos_organization_id ON public.asset_photos;
CREATE TRIGGER set_asset_photos_organization_id
BEFORE INSERT OR UPDATE OF asset_id ON public.asset_photos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_asset_child_organization_id();

DROP TRIGGER IF EXISTS set_contract_assets_organization_id ON public.contract_assets;
CREATE TRIGGER set_contract_assets_organization_id
BEFORE INSERT OR UPDATE OF contract_id ON public.contract_assets
FOR EACH ROW EXECUTE FUNCTION public.tg_set_contract_child_organization_id();

DROP TRIGGER IF EXISTS set_contract_clauses_organization_id ON public.contract_clauses;
CREATE TRIGGER set_contract_clauses_organization_id
BEFORE INSERT OR UPDATE OF contract_id ON public.contract_clauses
FOR EACH ROW EXECUTE FUNCTION public.tg_set_contract_child_organization_id();

DROP TRIGGER IF EXISTS set_delivery_approval_log_organization_id ON public.delivery_approval_log;
CREATE TRIGGER set_delivery_approval_log_organization_id
BEFORE INSERT OR UPDATE OF delivery_id ON public.delivery_approval_log
FOR EACH ROW EXECUTE FUNCTION public.tg_set_delivery_approval_organization_id();

DROP TRIGGER IF EXISTS set_opportunity_activities_organization_id ON public.opportunity_activities;
CREATE TRIGGER set_opportunity_activities_organization_id
BEFORE INSERT OR UPDATE OF opportunity_id ON public.opportunity_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_set_opportunity_activity_organization_id();

DROP POLICY IF EXISTS "Manage allocations of own assets" ON public.asset_allocations;
DROP POLICY IF EXISTS "Org members view asset allocations" ON public.asset_allocations;
DROP POLICY IF EXISTS "CRM or ops users manage asset allocations" ON public.asset_allocations;
CREATE POLICY "Org members view asset allocations"
ON public.asset_allocations FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM or ops users manage asset allocations"
ON public.asset_allocations FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)))
WITH CHECK (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));

DROP POLICY IF EXISTS "Manage photos of own assets" ON public.asset_photos;
DROP POLICY IF EXISTS "Org members view asset photos" ON public.asset_photos;
DROP POLICY IF EXISTS "CRM or ops users manage asset photos" ON public.asset_photos;
CREATE POLICY "Org members view asset photos"
ON public.asset_photos FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM or ops users manage asset photos"
ON public.asset_photos FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)))
WITH CHECK (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));

DROP POLICY IF EXISTS "Manage assets of own contracts" ON public.contract_assets;
DROP POLICY IF EXISTS "View assets of accessible contracts" ON public.contract_assets;
DROP POLICY IF EXISTS "Org members view contract assets" ON public.contract_assets;
DROP POLICY IF EXISTS "CRM or finance users manage contract assets" ON public.contract_assets;
CREATE POLICY "Org members view contract assets"
ON public.contract_assets FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM or finance users manage contract assets"
ON public.contract_assets FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)))
WITH CHECK (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)));

DROP POLICY IF EXISTS "Manage clauses of own contracts" ON public.contract_clauses;
DROP POLICY IF EXISTS "View clauses of accessible contracts" ON public.contract_clauses;
DROP POLICY IF EXISTS "Org members view contract clauses" ON public.contract_clauses;
DROP POLICY IF EXISTS "CRM or finance users manage contract clauses" ON public.contract_clauses;
CREATE POLICY "Org members view contract clauses"
ON public.contract_clauses FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM or finance users manage contract clauses"
ON public.contract_clauses FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)))
WITH CHECK (organization_id IS NOT NULL AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)));

DROP POLICY IF EXISTS "Owner views approval log" ON public.delivery_approval_log;
DROP POLICY IF EXISTS "Org members view approval log" ON public.delivery_approval_log;
CREATE POLICY "Org members view approval log"
ON public.delivery_approval_log FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Owners or admins view activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "Users create own activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "Owners or admins update activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "Owners or admins delete activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "Org members view opportunity activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "CRM users create opportunity activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "CRM users update opportunity activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "CRM users delete opportunity activities" ON public.opportunity_activities;
CREATE POLICY "Org members view opportunity activities"
ON public.opportunity_activities FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users create opportunity activities"
ON public.opportunity_activities FOR INSERT TO authenticated
WITH CHECK (organization_id IS NOT NULL AND owner_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users update opportunity activities"
ON public.opportunity_activities FOR UPDATE TO authenticated
USING (organization_id IS NOT NULL AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK (organization_id IS NOT NULL AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete opportunity activities"
ON public.opportunity_activities FOR DELETE TO authenticated
USING (organization_id IS NOT NULL AND public.can_access_module(auth.uid(), organization_id, 'crm', true));