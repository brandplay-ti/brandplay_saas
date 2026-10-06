
-- Add evidence metadata to deliveries
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS evidence_geo jsonb,
  ADD COLUMN IF NOT EXISTS evidence_taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_taken_by uuid;

-- Add evidence to checklist items
ALTER TABLE public.property_checklist_items
  ADD COLUMN IF NOT EXISTS evidence_path text,
  ADD COLUMN IF NOT EXISTS evidence_geo jsonb,
  ADD COLUMN IF NOT EXISTS evidence_taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_taken_by uuid;

-- Storage bucket for delivery evidence (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-evidence', 'delivery-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: org members can upload/read within their org folder.
-- Path convention: <organization_id>/<delivery_or_checklist_id>/<filename>

CREATE POLICY "Org members read delivery evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-evidence'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members upload delivery evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-evidence'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members update delivery evidence"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'delivery-evidence'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members delete delivery evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'delivery-evidence'
  AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
