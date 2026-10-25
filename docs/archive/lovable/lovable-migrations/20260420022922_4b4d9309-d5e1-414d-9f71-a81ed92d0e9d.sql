INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsor-interactions', 'sponsor-interactions', false)
ON CONFLICT (id) DO NOTHING;

-- Estrutura de path: {sponsor_id}/{filename}
CREATE POLICY "Owner uploads sponsor interaction files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sponsor-interactions'
    AND EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Owner views sponsor interaction files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sponsor-interactions'
    AND (
      EXISTS (SELECT 1 FROM public.sponsors s
              WHERE s.id::text = (storage.foldername(name))[1]
                AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)))
      OR public.has_sponsor_access(
           auth.uid(),
           ((storage.foldername(name))[1])::uuid
         )
    )
  );

CREATE POLICY "Owner deletes sponsor interaction files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sponsor-interactions'
    AND EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );