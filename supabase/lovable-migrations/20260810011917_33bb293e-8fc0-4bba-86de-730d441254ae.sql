
CREATE TABLE public.sponsor_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outro',
  description TEXT,
  journey_stage TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_summary TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sponsor_documents_org_sponsor ON public.sponsor_documents(organization_id, sponsor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_documents TO authenticated;
GRANT ALL ON public.sponsor_documents TO service_role;

ALTER TABLE public.sponsor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsor_documents_select" ON public.sponsor_documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "sponsor_documents_insert" ON public.sponsor_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE POLICY "sponsor_documents_update" ON public.sponsor_documents
  FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true))
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE POLICY "sponsor_documents_delete" ON public.sponsor_documents
  FOR DELETE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE TRIGGER update_sponsor_documents_updated_at
  BEFORE UPDATE ON public.sponsor_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies: path = {organization_id}/{sponsor_id}/{file}
CREATE POLICY "sponsor_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sponsor-documents'
     AND public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY "sponsor_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sponsor-documents'
     AND public.can_access_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'crm', true));

CREATE POLICY "sponsor_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'sponsor-documents'
     AND public.can_access_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'crm', true));

CREATE POLICY "sponsor_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sponsor-documents'
     AND public.can_access_module(auth.uid(), ((storage.foldername(name))[1])::uuid, 'crm', true));
