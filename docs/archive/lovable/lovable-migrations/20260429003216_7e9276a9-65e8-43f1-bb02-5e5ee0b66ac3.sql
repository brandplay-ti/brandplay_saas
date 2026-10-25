DROP POLICY IF EXISTS "CRM users update opportunities" ON public.opportunities;
CREATE POLICY "CRM users update opportunities"
ON public.opportunities
FOR UPDATE
TO authenticated
USING (public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Owner/Admin update organization" ON public.organizations;
CREATE POLICY "Owner/Admin update organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (public.has_org_role(auth.uid(), id, ARRAY['owner'::org_role, 'admin'::org_role]))
WITH CHECK (public.has_org_role(auth.uid(), id, ARRAY['owner'::org_role, 'admin'::org_role]));