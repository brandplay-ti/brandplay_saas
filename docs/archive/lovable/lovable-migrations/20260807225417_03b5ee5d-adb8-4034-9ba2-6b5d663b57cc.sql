-- 1) Restrict permissive-role policies to authenticated
ALTER POLICY "bt_brands_select" ON public.brandtrack_brands TO authenticated;
ALTER POLICY "bt_brands_update" ON public.brandtrack_brands TO authenticated;
ALTER POLICY "bt_brands_delete" ON public.brandtrack_brands TO authenticated;
ALTER POLICY "bt_events_select" ON public.brandtrack_events TO authenticated;
ALTER POLICY "bt_events_update" ON public.brandtrack_events TO authenticated;
ALTER POLICY "bt_events_delete" ON public.brandtrack_events TO authenticated;
ALTER POLICY "bt_media_select" ON public.brandtrack_media TO authenticated;
ALTER POLICY "bt_media_update" ON public.brandtrack_media TO authenticated;
ALTER POLICY "bt_media_delete" ON public.brandtrack_media TO authenticated;
ALTER POLICY "bt_det_select" ON public.brandtrack_detections TO authenticated;
ALTER POLICY "bt_det_insert" ON public.brandtrack_detections TO authenticated;
ALTER POLICY "bt_det_update" ON public.brandtrack_detections TO authenticated;
ALTER POLICY "bt_det_delete" ON public.brandtrack_detections TO authenticated;
ALTER POLICY "owners read sellout" ON public.sellout_reports TO authenticated;
ALTER POLICY "owners write sellout" ON public.sellout_reports TO authenticated;
ALTER POLICY "owners read churn" ON public.contract_churn_risk TO authenticated;
ALTER POLICY "owners write churn" ON public.contract_churn_risk TO authenticated;
ALTER POLICY "owners read summaries" ON public.sponsor_executive_summaries TO authenticated;
ALTER POLICY "owners write summaries" ON public.sponsor_executive_summaries TO authenticated;
ALTER POLICY "Org members read benchmarks" ON public.market_benchmarks TO authenticated;
ALTER POLICY "Org members write benchmarks" ON public.market_benchmarks TO authenticated;

-- 2) Validate parent organization on child records
CREATE OR REPLACE FUNCTION public.tg_validate_parent_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'contract_assets' OR TG_TABLE_NAME = 'contract_clauses' THEN
    SELECT organization_id INTO _parent_org FROM public.contracts WHERE id = NEW.contract_id;
  ELSIF TG_TABLE_NAME = 'proposal_items' THEN
    SELECT organization_id INTO _parent_org FROM public.proposals WHERE id = NEW.proposal_id;
  ELSIF TG_TABLE_NAME = 'tier_assets' THEN
    SELECT organization_id INTO _parent_org FROM public.sponsorship_tiers WHERE id = NEW.tier_id;
  ELSIF TG_TABLE_NAME = 'delivery_attachments' THEN
    SELECT organization_id INTO _parent_org FROM public.deliveries WHERE id = NEW.delivery_id;
  ELSIF TG_TABLE_NAME = 'opportunity_comment_attachments' THEN
    SELECT organization_id INTO _parent_org FROM public.opportunity_comments WHERE id = NEW.comment_id;
  END IF;

  IF _parent_org IS NULL THEN
    RAISE EXCEPTION 'Registro pai não encontrado ou sem organização definida';
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := _parent_org;
  ELSIF NEW.organization_id IS DISTINCT FROM _parent_org THEN
    RAISE EXCEPTION 'Registro pai pertence a outra organização';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_parent_org ON public.contract_assets;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.contract_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

DROP TRIGGER IF EXISTS validate_parent_org ON public.contract_clauses;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.contract_clauses
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

DROP TRIGGER IF EXISTS validate_parent_org ON public.proposal_items;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.proposal_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

DROP TRIGGER IF EXISTS validate_parent_org ON public.tier_assets;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.tier_assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

DROP TRIGGER IF EXISTS validate_parent_org ON public.delivery_attachments;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.delivery_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

DROP TRIGGER IF EXISTS validate_parent_org ON public.opportunity_comment_attachments;
CREATE TRIGGER validate_parent_org BEFORE INSERT OR UPDATE ON public.opportunity_comment_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_parent_organization();

-- 3) Contract storage: organization-based access
CREATE OR REPLACE FUNCTION public.can_access_contract_file(_user_id uuid, _path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.file_path = _path
      AND c.organization_id IS NOT NULL
      AND public.is_org_member(_user_id, c.organization_id)
  )
$$;

DROP POLICY IF EXISTS "Users view own contract files" ON storage.objects;
CREATE POLICY "Users view own contract files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.can_access_contract_file(auth.uid(), name)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users update own contract files" ON storage.objects;
CREATE POLICY "Users update own contract files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contracts' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.can_access_contract_file(auth.uid(), name)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users delete own contract files" ON storage.objects;
CREATE POLICY "Users delete own contract files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contracts' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.can_access_contract_file(auth.uid(), name)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );