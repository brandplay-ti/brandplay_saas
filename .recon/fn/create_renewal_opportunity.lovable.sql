CREATE OR REPLACE FUNCTION public.create_renewal_opportunity(_contract_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c record; _opp uuid;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF NOT public.can_access_module(auth.uid(), c.organization_id, 'crm', true) THEN
    RAISE EXCEPTION 'Usuário sem permissão de CRM nesta organização';
  END IF;

  INSERT INTO public.opportunities (owner_id, organization_id, brand, value, stage, property_id, sponsor_id, notes)
  VALUES (auth.uid(), c.organization_id, c.brand, c.total_value, 'prospect'::opportunity_stage, c.property_id, c.sponsor_id,
          'Renovação gerada a partir do contrato ' || c.title || ' (término em ' || COALESCE(c.end_date::text, 'sem data') || ').')
  RETURNING id INTO _opp;

  INSERT INTO public.sponsor_audit_logs (organization_id, sponsor_id, actor_id, entity_type, entity_id, action, new_value, source)
  VALUES (c.organization_id, c.sponsor_id, auth.uid(), 'opportunity', _opp, 'renewal_created',
          jsonb_build_object('contract_id', c.id), 'manual');

  RETURN _opp;
END $function$

