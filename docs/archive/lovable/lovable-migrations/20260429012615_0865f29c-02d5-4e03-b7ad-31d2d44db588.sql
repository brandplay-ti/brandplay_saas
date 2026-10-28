-- Restrict sponsor invite visibility and token acceptance
DROP POLICY IF EXISTS "Public can read invite by token" ON public.sponsor_invites;

CREATE OR REPLACE FUNCTION public.get_sponsor_invite_by_token(p_token text)
RETURNS TABLE (
  email text,
  status text,
  expires_at timestamp with time zone,
  sponsor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT si.email, si.status, si.expires_at, s.name AS sponsor_name
  FROM public.sponsor_invites si
  JOIN public.sponsors s ON s.id = si.sponsor_id
  WHERE si.token = p_token
    AND si.status = 'pendente'
    AND si.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_sponsor_invite_by_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT email INTO _user_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO _invite
  FROM public.sponsor_invites
  WHERE token = p_token
    AND status = 'pendente'
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido ou expirado';
  END IF;

  IF lower(_invite.email) <> lower(coalesce(_user_email, '')) THEN
    RAISE EXCEPTION 'Este convite pertence a outro e-mail';
  END IF;

  INSERT INTO public.sponsor_portal_access (user_id, sponsor_id, status, granted_by)
  VALUES (auth.uid(), _invite.sponsor_id, 'ativo', _invite.invited_by)
  ON CONFLICT DO NOTHING;

  UPDATE public.sponsor_invites
  SET status = 'aceito', accepted_user_id = auth.uid(), accepted_at = now()
  WHERE id = _invite.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sponsor_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsor_invite_by_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.accept_sponsor_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_sponsor_invite_by_token(text) TO authenticated;

-- Restrict property-media storage object reads to published properties or authenticated owners/admins
DROP POLICY IF EXISTS "Public can read property-media" ON storage.objects;

CREATE POLICY "Published property media can be read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'property-media'
  AND EXISTS (
    SELECT 1
    FROM public.property_media pm
    JOIN public.sports_properties sp ON sp.id = pm.property_id
    WHERE pm.storage_path = storage.objects.name
      AND sp.is_published = true
  )
);

CREATE POLICY "Owners can read own property-media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-media'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Disable realtime publication for notifications to avoid cross-channel subscription exposure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
  END IF;
END $$;