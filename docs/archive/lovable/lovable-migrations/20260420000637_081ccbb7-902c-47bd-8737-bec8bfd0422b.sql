-- =========================
-- GALERIA DE MÍDIA
-- =========================
CREATE TABLE public.property_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  media_type text NOT NULL DEFAULT 'photo', -- 'photo' | 'video' | 'link'
  storage_path text,        -- para uploads no bucket property-media
  external_url text,        -- para links YouTube/Drive
  thumbnail_url text,
  caption text,
  position integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view property_media"
ON public.property_media FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own property_media"
ON public.property_media FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners or admins update property_media"
ON public.property_media FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners or admins delete property_media"
ON public.property_media FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view media of published properties"
ON public.property_media FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.sports_properties p
  WHERE p.id = property_media.property_id AND p.is_published = true
));

CREATE TRIGGER trg_property_media_updated_at
BEFORE UPDATE ON public.property_media
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_property_media_property ON public.property_media(property_id, position);

-- =========================
-- CHECKLIST OPERACIONAL
-- =========================
CREATE TABLE public.property_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  event_id uuid REFERENCES public.property_events(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assignee text,
  due_date date,
  status text NOT NULL DEFAULT 'pendente', -- 'pendente' | 'em_andamento' | 'concluido'
  position integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view checklist"
ON public.property_checklist_items FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own checklist"
ON public.property_checklist_items FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners or admins update checklist"
ON public.property_checklist_items FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners or admins delete checklist"
ON public.property_checklist_items FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_property_checklist_updated_at
BEFORE UPDATE ON public.property_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_property_checklist_property ON public.property_checklist_items(property_id, position);

-- Trigger: ao concluir checklist vinculado a uma delivery, marcar delivery como entregue
CREATE OR REPLACE FUNCTION public.handle_checklist_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    NEW.completed_at := now();
    IF NEW.delivery_id IS NOT NULL THEN
      UPDATE public.deliveries
        SET status = 'entregue'::delivery_status,
            delivered_at = COALESCE(delivered_at, current_date)
        WHERE id = NEW.delivery_id;
    END IF;
  ELSIF NEW.status <> 'concluido' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checklist_completion
BEFORE INSERT OR UPDATE ON public.property_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.handle_checklist_completion();

-- =========================
-- STORAGE BUCKET para galeria
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-media', 'property-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read property-media"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'property-media');

CREATE POLICY "Authenticated upload property-media in own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Authenticated update own property-media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Authenticated delete own property-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);