CREATE OR REPLACE FUNCTION public.copy_opportunity_tier_to_proposal(_proposal_id uuid, _opportunity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  opp record;
  ta record;
  pos integer := 0;
begin
  select * into opp from public.opportunities where id = _opportunity_id;
  if not found then return; end if;

  if opp.tier_id is null then
    return;
  end if;

  for ta in
    select ta.*, a.name as asset_name, a.unit_value as asset_value
    from public.tier_assets ta
    join public.assets a on a.id = ta.asset_id
    where ta.tier_id = opp.tier_id
    order by ta.created_at, ta.id
  loop
    insert into public.proposal_items (
      proposal_id, asset_id, name, quantity, unit_value, position
    ) values (
      _proposal_id, ta.asset_id, ta.asset_name, greatest(ta.quantity, 1), coalesce(ta.asset_value, 0), pos
    )
    on conflict do nothing;
    pos := pos + 1;
  end loop;
end;
$function$

