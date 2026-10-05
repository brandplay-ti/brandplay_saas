CREATE OR REPLACE FUNCTION public.log_sponsor_interaction(_contract_id uuid, _delivery_id uuid, _description text, _installment_id uuid, _metadata json, _opportunity_id uuid, _owner_id uuid, _proposal_id uuid, _sponsor_id uuid, _title text, _type sponsor_interaction_type)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _org_id uuid;
begin
  select organization_id into _org_id
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'log_sponsor_interaction: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  insert into public.sponsor_interactions (
    organization_id, owner_id, created_by, sponsor_id, title, type, source,
    description, related_contract_id, related_delivery_id, related_installment_id,
    related_opportunity_id, related_proposal_id, metadata
  ) values (
    _org_id, coalesce(_owner_id, auth.uid()), auth.uid(), _sponsor_id, _title, _type, 'manual',
    _description, _contract_id, _delivery_id, _installment_id,
    _opportunity_id, _proposal_id, coalesce(_metadata::jsonb, '{}'::jsonb)
  );
end;
$function$

