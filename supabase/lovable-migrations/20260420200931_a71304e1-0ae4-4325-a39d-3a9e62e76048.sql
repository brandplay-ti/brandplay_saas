
-- Anexos múltiplos por entrega (fotos da galeria/câmera + PDF/DOC)
CREATE TABLE IF NOT EXISTS public.delivery_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  organization_id uuid,
  owner_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'image', -- image | pdf | doc | other
  geo jsonb,
  taken_at timestamptz,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_attachments_delivery ON public.delivery_attachments(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_attachments_org ON public.delivery_attachments(organization_id);

ALTER TABLE public.delivery_attachments ENABLE ROW LEVEL SECURITY;

-- Preenche organization_id automaticamente
DROP TRIGGER IF EXISTS trg_delivery_attachments_org ON public.delivery_attachments;
CREATE TRIGGER trg_delivery_attachments_org
BEFORE INSERT ON public.delivery_attachments
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();

-- Limite máximo de 10 anexos por entrega
CREATE OR REPLACE FUNCTION public.enforce_delivery_attachment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count int;
BEGIN
  SELECT count(*) INTO _count FROM public.delivery_attachments WHERE delivery_id = NEW.delivery_id;
  IF _count >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 anexos por entrega atingido';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_delivery_attachments_limit ON public.delivery_attachments;
CREATE TRIGGER trg_delivery_attachments_limit
BEFORE INSERT ON public.delivery_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_attachment_limit();

-- Policies
CREATE POLICY "view delivery attachments in org"
ON public.delivery_attachments FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

CREATE POLICY "insert delivery attachments"
ON public.delivery_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    owner_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
  )
);

CREATE POLICY "update delivery attachments"
ON public.delivery_attachments FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','operacional']::org_role[]))
);

CREATE POLICY "delete delivery attachments"
ON public.delivery_attachments FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','operacional']::org_role[]))
);

-- Storage policies para o bucket existente delivery-evidence aceitarem PDFs/DOCs também
-- (As policies já existem para imagens; aqui apenas garantimos acesso amplo a membros da org via prefixo {org_id}/{delivery_id}/...)
