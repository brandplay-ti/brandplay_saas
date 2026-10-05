CREATE OR REPLACE FUNCTION public.generate_contract_deliveries(_contract_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _contract record;
  _n integer;
begin
  select id, organization_id, owner_id, brand, opportunity_id, sponsor_id, property_id, start_date, end_date
  into _contract
  from public.contracts
  where id = _contract_id;

  if not found then
    raise exception 'generate_contract_deliveries: contrato % não encontrado', _contract_id;
  end if;

  if exists (select 1 from public.deliveries where contract_id = _contract_id) then
    return; -- idempotente: não duplica entregas já geradas para este contrato.
  end if;

  select count(*) into _n from public.contract_assets where contract_id = _contract_id;
  if _n = 0 then
    return;
  end if;

  insert into public.deliveries (
    organization_id, owner_id, contract_id, opportunity_id, sponsor_id, property_id,
    title, brand, quantity, position, due_date, status, approval
  )
  select
    _contract.organization_id, _contract.owner_id, _contract.id, _contract.opportunity_id,
    _contract.sponsor_id, _contract.property_id,
    ca.name, _contract.brand, ca.quantity,
    (row_number() over (order by ca.created_at))::integer - 1,
    case
      when _contract.start_date is null or _contract.end_date is null then null
      when _n <= 1 then _contract.end_date
      else _contract.start_date + round(
        (_contract.end_date - _contract.start_date)::numeric
        * ((row_number() over (order by ca.created_at)) - 1)
        / (_n - 1)
      )::integer
    end,
    'pendente', 'pendente'
  from public.contract_assets ca
  where ca.contract_id = _contract_id;
end;
$function$

