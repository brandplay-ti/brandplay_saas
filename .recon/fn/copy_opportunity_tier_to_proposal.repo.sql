CREATE OR REPLACE FUNCTION public.copy_opportunity_tier_to_proposal(_opportunity_id uuid, _proposal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _opp record;
begin
  select id, organization_id, tier_id
  into _opp
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'copy_opportunity_tier_to_proposal: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _opp.tier_id is null then
    raise exception 'copy_opportunity_tier_to_proposal: oportunidade % não possui tier vinculado', _opportunity_id;
  end if;

  if not exists (select 1 from public.proposals where id = _proposal_id and organization_id = _opp.organization_id) then
    raise exception 'copy_opportunity_tier_to_proposal: proposta % não encontrada na mesma organização da oportunidade', _proposal_id;
  end if;

  insert into public.proposal_items (organization_id, proposal_id, asset_id, name, description, quantity, unit_value, position, notes)
  select
    _opp.organization_id, _proposal_id, a.id, a.name, null, ta.quantity, a.unit_value,
    (row_number() over (order by ta.created_at))::integer - 1,
    null
  from public.tier_assets ta
  join public.assets a on a.id = ta.asset_id
  where ta.tier_id = _opp.tier_id;
end;
$function$

