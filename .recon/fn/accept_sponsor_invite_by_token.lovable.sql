CREATE OR REPLACE FUNCTION public.accept_sponsor_invite_by_token(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

