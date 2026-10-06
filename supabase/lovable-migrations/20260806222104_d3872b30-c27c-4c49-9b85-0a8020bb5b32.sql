-- BrandTrack inserts must belong to an org the user is a member of
DROP POLICY IF EXISTS bt_brands_insert ON public.brandtrack_brands;
CREATE POLICY bt_brands_insert ON public.brandtrack_brands FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id AND (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id)));

DROP POLICY IF EXISTS bt_events_insert ON public.brandtrack_events;
CREATE POLICY bt_events_insert ON public.brandtrack_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id AND (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id)));

DROP POLICY IF EXISTS bt_media_insert ON public.brandtrack_media;
CREATE POLICY bt_media_insert ON public.brandtrack_media FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id AND (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id)));

-- Delivery approval log inserts must be org members (or sponsors with access to the delivery)
DROP POLICY IF EXISTS "Authenticated insert approval log" ON public.delivery_approval_log;
CREATE POLICY "Authenticated insert approval log" ON public.delivery_approval_log FOR INSERT TO authenticated
WITH CHECK (
  decided_by = auth.uid()
  AND (
    (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
    OR EXISTS (
      SELECT 1
      FROM public.deliveries d
      JOIN public.contracts c ON (c.opportunity_id = d.opportunity_id OR c.id = d.opportunity_id)
      WHERE d.id = delivery_approval_log.delivery_id
        AND c.sponsor_id IS NOT NULL
        AND public.has_sponsor_access(auth.uid(), c.sponsor_id)
    )
  )
);

-- Profiles readable only by self or users sharing an organization
DROP POLICY IF EXISTS "Authenticated users view profiles" ON public.profiles;
CREATE POLICY "Users view profiles in their organizations" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members other ON other.organization_id = me.organization_id
    WHERE me.user_id = auth.uid() AND other.user_id = profiles.id
  )
);