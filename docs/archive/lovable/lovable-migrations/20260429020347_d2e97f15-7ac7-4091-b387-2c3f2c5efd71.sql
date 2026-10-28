CREATE TABLE IF NOT EXISTS public.opportunity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'comentario',
  content text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_comment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_comment_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_opportunity_comments_opportunity_created
  ON public.opportunity_comments (opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_comment_attachments_comment
  ON public.opportunity_comment_attachments (comment_id);

DROP TRIGGER IF EXISTS update_opportunity_comments_updated_at ON public.opportunity_comments;
CREATE TRIGGER update_opportunity_comments_updated_at
BEFORE UPDATE ON public.opportunity_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Org members view opportunity comments" ON public.opportunity_comments;
CREATE POLICY "Org members view opportunity comments"
ON public.opportunity_comments
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "CRM users create opportunity comments" ON public.opportunity_comments;
CREATE POLICY "CRM users create opportunity comments"
ON public.opportunity_comments
FOR INSERT
TO authenticated
WITH CHECK (author_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Authors update opportunity comments" ON public.opportunity_comments;
CREATE POLICY "Authors update opportunity comments"
ON public.opportunity_comments
FOR UPDATE
TO authenticated
USING (author_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK (author_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Authors delete opportunity comments" ON public.opportunity_comments;
CREATE POLICY "Authors delete opportunity comments"
ON public.opportunity_comments
FOR DELETE
TO authenticated
USING (author_id = auth.uid() OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

DROP POLICY IF EXISTS "Org members view opportunity comment attachments" ON public.opportunity_comment_attachments;
CREATE POLICY "Org members view opportunity comment attachments"
ON public.opportunity_comment_attachments
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "CRM users create opportunity comment attachments" ON public.opportunity_comment_attachments;
CREATE POLICY "CRM users create opportunity comment attachments"
ON public.opportunity_comment_attachments
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Uploaders delete opportunity comment attachments" ON public.opportunity_comment_attachments;
CREATE POLICY "Uploaders delete opportunity comment attachments"
ON public.opportunity_comment_attachments
FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid() OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

INSERT INTO storage.buckets (id, name, public)
VALUES ('opportunity-comments', 'opportunity-comments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "CRM users upload opportunity comment files" ON storage.objects;
CREATE POLICY "CRM users upload opportunity comment files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'opportunity-comments'
  AND public.can_access_module(auth.uid(), (storage.foldername(name))[1]::uuid, 'crm', true)
);

DROP POLICY IF EXISTS "Org members read opportunity comment files" ON storage.objects;
CREATE POLICY "Org members read opportunity comment files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'opportunity-comments'
  AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

DROP POLICY IF EXISTS "Uploaders delete opportunity comment files" ON storage.objects;
CREATE POLICY "Uploaders delete opportunity comment files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'opportunity-comments'
  AND owner = auth.uid()
);