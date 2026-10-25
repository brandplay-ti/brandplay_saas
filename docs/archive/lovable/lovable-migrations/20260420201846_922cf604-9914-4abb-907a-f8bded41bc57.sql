
-- Corrige recursão infinita nas policies de assets/asset_allocations/asset_photos
-- causada por policies "Public can view ... of published" que fazem joins cruzados.

CREATE OR REPLACE FUNCTION public.is_asset_publicly_visible(_asset_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.asset_allocations aa
    JOIN public.sports_properties p ON p.id = aa.property_id
    WHERE aa.asset_id = _asset_id AND p.is_published = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_property_published(_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sports_properties WHERE id = _property_id AND is_published = true
  )
$$;

-- Substitui policies recursivas
DROP POLICY IF EXISTS "Public can view assets of published properties" ON public.assets;
CREATE POLICY "Public can view assets of published properties"
ON public.assets FOR SELECT
TO anon, authenticated
USING (public.is_asset_publicly_visible(id));

DROP POLICY IF EXISTS "Public can view asset_allocations of published" ON public.asset_allocations;
CREATE POLICY "Public can view asset_allocations of published"
ON public.asset_allocations FOR SELECT
TO anon, authenticated
USING (public.is_property_published(property_id));

DROP POLICY IF EXISTS "Public can view asset_photos of published" ON public.asset_photos;
CREATE POLICY "Public can view asset_photos of published"
ON public.asset_photos FOR SELECT
TO anon, authenticated
USING (public.is_asset_publicly_visible(asset_id));
