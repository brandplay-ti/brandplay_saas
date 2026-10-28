
-- 1) Fix sponsor-interactions storage policies (s.name -> objects.name)
DROP POLICY IF EXISTS "Owner views sponsor interaction files" ON storage.objects;
DROP POLICY IF EXISTS "Owner uploads sponsor interaction files" ON storage.objects;
DROP POLICY IF EXISTS "Owner deletes sponsor interaction files" ON storage.objects;

CREATE POLICY "Owner views sponsor interaction files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'sponsor-interactions'
  AND (
    EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE (s.id)::text = (storage.foldername(objects.name))[1]
        AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
    OR public.has_sponsor_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Owner uploads sponsor interaction files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'sponsor-interactions'
  AND EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE (s.id)::text = (storage.foldername(objects.name))[1]
      AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Owner deletes sponsor interaction files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'sponsor-interactions'
  AND EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE (s.id)::text = (storage.foldername(objects.name))[1]
      AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

-- 2) Remove public read on organization_invites + secure RPC by token
DROP POLICY IF EXISTS "Public can read invite by token" ON public.organization_invites;

CREATE OR REPLACE FUNCTION public.get_organization_invite_by_token(p_token text)
RETURNS TABLE(email text, status text, expires_at timestamptz, organization_name text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT oi.email, oi.status::text, oi.expires_at, o.name AS organization_name, oi.role::text
  FROM public.organization_invites oi
  JOIN public.organizations o ON o.id = oi.organization_id
  WHERE oi.token = p_token
    AND oi.status = 'pendente'
    AND oi.expires_at > now()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_organization_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_invite_by_token(text) TO anon, authenticated;

-- 3) Allow org members to read private property-media files of their org
CREATE POLICY "Org members read property-media of their org"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'property-media'
  AND EXISTS (
    SELECT 1
    FROM public.property_media pm
    JOIN public.sports_properties sp ON sp.id = pm.property_id
    WHERE pm.storage_path = objects.name
      AND public.is_org_member(auth.uid(), sp.organization_id)
  )
);
