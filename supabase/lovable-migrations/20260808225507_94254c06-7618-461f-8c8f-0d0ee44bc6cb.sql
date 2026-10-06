
DROP POLICY IF EXISTS "owners write churn" ON public.contract_churn_risk;
CREATE POLICY "owners write churn" ON public.contract_churn_risk
FOR ALL TO authenticated
USING (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
WITH CHECK (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  AND (contract_id IS NULL OR EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND c.organization_id = contract_churn_risk.organization_id)));

DROP POLICY IF EXISTS "owners write sellout" ON public.sellout_reports;
CREATE POLICY "owners write sellout" ON public.sellout_reports
FOR ALL TO authenticated
USING (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
WITH CHECK (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  AND (property_id IS NULL OR EXISTS (SELECT 1 FROM public.sports_properties p WHERE p.id = property_id AND p.organization_id = sellout_reports.organization_id)));

DROP POLICY IF EXISTS "owners write summaries" ON public.sponsor_executive_summaries;
CREATE POLICY "owners write summaries" ON public.sponsor_executive_summaries
FOR ALL TO authenticated
USING (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
WITH CHECK (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  AND (sponsor_id IS NULL OR EXISTS (SELECT 1 FROM public.sponsors s WHERE s.id = sponsor_id AND s.organization_id = sponsor_executive_summaries.organization_id)));

DROP POLICY IF EXISTS "Users create own tier sales" ON public.tier_sales;
CREATE POLICY "Users create own tier sales" ON public.tier_sales
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id AND organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  AND EXISTS (SELECT 1 FROM public.sponsorship_tiers t WHERE t.id = tier_id AND t.organization_id = tier_sales.organization_id));
