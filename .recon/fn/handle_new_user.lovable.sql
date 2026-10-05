CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org_id uuid; _invite record;
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'comercial');

  -- accept pending org invite if any
  SELECT * INTO _invite FROM public.organization_invites
   WHERE lower(email) = lower(NEW.email) AND status = 'pendente' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_invite.organization_id, NEW.id, _invite.role, 'ativo')
    ON CONFLICT DO NOTHING;
    UPDATE public.organization_invites
       SET status = 'aceito', accepted_at = now(), accepted_user_id = NEW.id
     WHERE id = _invite.id;
  ELSE
    -- create personal organization
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company',''), 'Minha empresa'), NEW.id)
    RETURNING id INTO _org_id;
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_org_id, NEW.id, 'owner', 'ativo');
  END IF;
  RETURN NEW;
END $function$

