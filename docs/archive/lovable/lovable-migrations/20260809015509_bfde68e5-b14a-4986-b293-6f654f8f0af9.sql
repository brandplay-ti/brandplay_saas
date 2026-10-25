ALTER TABLE public.proposal_items ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.copy_proposal_items_to_contract(_contract_id uuid, _proposal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  it record;
begin
  for it in
    select * from public.proposal_items where proposal_id = _proposal_id order by position, id
  loop
    insert into public.contract_assets (
      contract_id, asset_id, name, quantity, unit_value, notes
    ) values (
      _contract_id, it.asset_id, it.name, greatest(it.quantity, 1), coalesce(it.unit_value, 0),
      nullif(concat_ws(E'\n', nullif(it.description, ''), nullif(it.notes, '')), '')
    )
    on conflict do nothing;
  end loop;
end;
$function$;