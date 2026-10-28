-- ============= BrandTrack module =============

-- Events grouping (campeonatos, jogos, etc.)
CREATE TABLE public.brandtrack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  event_date date,
  property_id uuid REFERENCES public.sports_properties(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Brands tracked (independent of sponsors table; can link)
CREATE TABLE public.brandtrack_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL,
  color text DEFAULT '#3b82f6',
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Media uploads (image or video)
CREATE TABLE public.brandtrack_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_id uuid NOT NULL,
  event_id uuid REFERENCES public.brandtrack_events(id) ON DELETE SET NULL,
  title text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  storage_path text NOT NULL,
  thumbnail_path text,
  file_size bigint,
  duration_seconds numeric,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  progress int NOT NULL DEFAULT 0,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Detections (each appearance of a brand in a media)
CREATE TABLE public.brandtrack_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_id uuid NOT NULL,
  media_id uuid NOT NULL REFERENCES public.brandtrack_media(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brandtrack_brands(id) ON DELETE SET NULL,
  brand_name text NOT NULL,
  exposure_type text NOT NULL DEFAULT 'outro' CHECK (exposure_type IN ('uniforme','placa','backdrop','led','transmissao','outro')),
  start_time numeric NOT NULL DEFAULT 0,
  end_time numeric NOT NULL DEFAULT 0,
  duration numeric NOT NULL DEFAULT 0,
  screen_percentage numeric NOT NULL DEFAULT 0,
  position_x numeric,
  position_y numeric,
  width numeric,
  height numeric,
  confidence numeric NOT NULL DEFAULT 0,
  bes_score numeric NOT NULL DEFAULT 0,
  evidence_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brandtrack_media_event ON public.brandtrack_media(event_id);
CREATE INDEX idx_brandtrack_media_org ON public.brandtrack_media(organization_id);
CREATE INDEX idx_brandtrack_detections_media ON public.brandtrack_detections(media_id);
CREATE INDEX idx_brandtrack_detections_brand ON public.brandtrack_detections(brand_id);
CREATE INDEX idx_brandtrack_detections_org ON public.brandtrack_detections(organization_id);

-- Triggers updated_at
CREATE TRIGGER trg_brandtrack_events_updated BEFORE UPDATE ON public.brandtrack_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_brandtrack_brands_updated BEFORE UPDATE ON public.brandtrack_brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_brandtrack_media_updated BEFORE UPDATE ON public.brandtrack_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-fill organization_id
CREATE TRIGGER trg_brandtrack_events_org BEFORE INSERT ON public.brandtrack_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
CREATE TRIGGER trg_brandtrack_brands_org BEFORE INSERT ON public.brandtrack_brands
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
CREATE TRIGGER trg_brandtrack_media_org BEFORE INSERT ON public.brandtrack_media
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
CREATE TRIGGER trg_brandtrack_detections_org BEFORE INSERT ON public.brandtrack_detections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();

-- Enable RLS
ALTER TABLE public.brandtrack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brandtrack_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brandtrack_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brandtrack_detections ENABLE ROW LEVEL SECURITY;

-- Policies: members of the organization can read; owner or org admin/owner can write
-- Events
CREATE POLICY "bt_events_select" ON public.brandtrack_events FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "bt_events_insert" ON public.brandtrack_events FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "bt_events_update" ON public.brandtrack_events FOR UPDATE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));
CREATE POLICY "bt_events_delete" ON public.brandtrack_events FOR DELETE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));

-- Brands
CREATE POLICY "bt_brands_select" ON public.brandtrack_brands FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "bt_brands_insert" ON public.brandtrack_brands FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "bt_brands_update" ON public.brandtrack_brands FOR UPDATE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));
CREATE POLICY "bt_brands_delete" ON public.brandtrack_brands FOR DELETE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));

-- Media
CREATE POLICY "bt_media_select" ON public.brandtrack_media FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "bt_media_insert" ON public.brandtrack_media FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "bt_media_update" ON public.brandtrack_media FOR UPDATE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));
CREATE POLICY "bt_media_delete" ON public.brandtrack_media FOR DELETE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));

-- Detections
CREATE POLICY "bt_det_select" ON public.brandtrack_detections FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "bt_det_insert" ON public.brandtrack_detections FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "bt_det_update" ON public.brandtrack_detections FOR UPDATE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));
CREATE POLICY "bt_det_delete" ON public.brandtrack_detections FOR DELETE
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[])));

-- Storage bucket for BrandTrack media (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('brandtrack-media', 'brandtrack-media', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage files inside a folder named with their auth.uid()
CREATE POLICY "bt_storage_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'brandtrack-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "bt_storage_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brandtrack-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "bt_storage_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'brandtrack-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "bt_storage_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'brandtrack-media' AND auth.uid()::text = (storage.foldername(name))[1]);
