CREATE OR REPLACE FUNCTION public.sync_opportunity_contact_to_sponsor(_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c record; _sponsor uuid; _org uuid; _role text;
BEGIN
  SELECT * INTO _c FROM public.opportunity_contacts WHERE id = _contact_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT sponsor_id, organization_id INTO _sponsor, _org FROM public.opportunities WHERE id = _c.opportunity_id;
  IF _sponsor IS NULL THEN RETURN; END IF;

  _role := COALESCE(NULLIF(btrim(_c.role), ''),
    CASE _c.contact_type WHEN 'contrato' THEN 'Responsável pelo contrato'
                         WHEN 'financeiro' THEN 'Financeiro'
                         ELSE NULL END);

  IF EXISTS (
    SELECT 1 FROM public.sponsor_contacts sc
    WHERE sc.sponsor_id = _sponsor
      AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
           OR lower(sc.name) = lower(_c.name))
  ) THEN
    UPDATE public.sponsor_contacts sc
       SET role = COALESCE(_role, sc.role),
           email = COALESCE(NULLIF(_c.email,''), sc.email),
           phone = COALESCE(NULLIF(_c.phone,''), sc.phone)
     WHERE sc.sponsor_id = _sponsor
       AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
            OR lower(sc.name) = lower(_c.name));
  ELSE
    INSERT INTO public.sponsor_contacts (sponsor_id, organization_id, name, role, email, phone, is_primary)
    VALUES (_sponsor, COALESCE(_org, _c.organization_id), _c.name, _role, NULLIF(_c.email,''), NULLIF(_c.phone,''), _c.is_primary);
  END IF;
END $function$

