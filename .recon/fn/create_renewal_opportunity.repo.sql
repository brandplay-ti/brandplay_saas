CREATE OR REPLACE FUNCTION public.create_renewal_opportunity(_contract_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _c record;
  _new_id uuid;
begin
  select id, organization_id, owner_id, sponsor_id, property_id, brand, total_value, contract_number, title
  into _c
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'create_renewal_opportunity: contrato % não encontrado', _contract_id;
  end if;

  insert into public.opportunities (organization_id, owner_id, sponsor_id, property_id, brand, stage, value, notes)
  values (
    _c.organization_id, coalesce(auth.uid(), _c.owner_id), _c.sponsor_id, _c.property_id, _c.brand,
    'prospect', coalesce(_c.total_value, 0),
    'Renovação do contrato ' || coalesce(_c.contract_number, _c.title)
  )
  returning id into _new_id;

  if _c.sponsor_id is not null then
    perform public.log_sponsor_interaction(
      _contract_id := _c.id,
      _delivery_id := null,
      _description := 'Nova oportunidade de renovação criada a partir deste contrato.',
      _installment_id := null,
      _metadata := json_build_object('opportunity_id', _new_id),
      _opportunity_id := _new_id,
      _owner_id := coalesce(auth.uid(), _c.owner_id),
      _proposal_id := null,
      _sponsor_id := _c.sponsor_id,
      _title := 'Renovação criada',
      _type := 'oportunidade'
    );
  end if;

  return _new_id;
end;
$function$

