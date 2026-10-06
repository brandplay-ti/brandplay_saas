-- 1. asset-photos: restrict listing/reads to org members or publicly visible assets
DROP POLICY IF EXISTS "Public read asset photos" ON storage.objects;
CREATE POLICY "Asset photos readable by org or published assets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'asset-photos'
  AND EXISTS (
    SELECT 1
    FROM public.asset_photos ap
    JOIN public.assets a ON a.id = ap.asset_id
    WHERE ap.storage_path = storage.objects.name
      AND (
        public.is_asset_publicly_visible(a.id)
        OR (a.organization_id IS NOT NULL AND public.is_org_member(auth.uid(), a.organization_id))
      )
  )
);

-- 2. sponsor-logos: restrict listing/reads to org members of the owning sponsor/brand
DROP POLICY IF EXISTS "Public read sponsor logos" ON storage.objects;
CREATE POLICY "Sponsor logos readable by org members"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'sponsor-logos'
  AND (
    EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.logo_path = storage.objects.name
        AND s.organization_id IS NOT NULL
        AND public.is_org_member(auth.uid(), s.organization_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.brandtrack_brands b
      WHERE b.logo_path = storage.objects.name
        AND b.organization_id IS NOT NULL
        AND public.is_org_member(auth.uid(), b.organization_id)
    )
  )
);

-- 3. property-media: org read policy must require an authenticated user
DROP POLICY IF EXISTS "Org members read property-media of their org" ON storage.objects;
CREATE POLICY "Org members read property-media of their org"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'property-media'
  AND EXISTS (
    SELECT 1
    FROM public.property_media pm
    JOIN public.sports_properties sp ON sp.id = pm.property_id
    WHERE pm.storage_path = storage.objects.name
      AND public.is_org_member(auth.uid(), sp.organization_id)
  )
);

-- 4. opportunity-comments delete: uploader AND org CRM permission on the folder
DROP POLICY IF EXISTS "Uploaders delete opportunity comment files" ON storage.objects;
CREATE POLICY "Uploaders delete opportunity comment files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'opportunity-comments'
  AND owner = auth.uid()
  AND public.can_access_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'crm', true)
);

-- 5. property_leads: never expose collected PII to anonymous readers
REVOKE SELECT, UPDATE, DELETE ON public.property_leads FROM anon;
GRANT INSERT ON public.property_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_leads TO authenticated;

-- 6. sponsor_invites: token stays unreadable to anonymous clients (acceptance uses SECURITY DEFINER RPCs)
REVOKE ALL ON public.sponsor_invites FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_invites TO authenticated;
GRANT ALL ON public.sponsor_invites TO service_role;