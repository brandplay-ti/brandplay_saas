CREATE OR REPLACE FUNCTION public.copy_proposal_items_to_contract(_contract_id uuid, _proposal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _contract record;
  _proposal record;
begin
  select id, organization_id into _contract from public.contracts where id = _contract_id;
  if not found then
    raise exception 'copy_proposal_items_to_contract: contrato % não encontrado', _contract_id;
  end if;

  select id, organization_id into _proposal from public.proposals where id = _proposal_id;
  if not found then
    raise exception 'copy_proposal_items_to_contract: proposta % não encontrada', _proposal_id;
  end if;

  if _contract.organization_id is distinct from _proposal.organization_id then
    raise exception 'copy_proposal_items_to_contract: contrato e proposta pertencem a organizações diferentes';
  end if;

  insert into public.contract_assets (organization_id, contract_id, asset_id, name, quantity, unit_value, notes)
  select _contract.organization_id, _contract_id, pi.asset_id, pi.name, pi.quantity, pi.unit_value, pi.notes
  from public.proposal_items pi
  where pi.proposal_id = _proposal_id;

  update public.proposals
  set converted_contract_id = _contract_id
  where id = _proposal_id
    and converted_contract_id is null;
end;
$function$

