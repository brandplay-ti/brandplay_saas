CREATE OR REPLACE FUNCTION public.sync_opportunity_contact_to_sponsor(_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _contact record;
begin
  select oc.id, oc.name, oc.role, oc.email, oc.phone, oc.is_primary, o.sponsor_id, o.organization_id
  into _contact
  from public.opportunity_contacts oc
  join public.opportunities o on o.id = oc.opportunity_id
  where oc.id = _contact_id;

  if not found then
    raise exception 'sync_opportunity_contact_to_sponsor: contato % não encontrado', _contact_id;
  end if;

  if _contact.sponsor_id is null then
    raise exception 'sync_opportunity_contact_to_sponsor: oportunidade do contato % ainda não tem patrocinador vinculado', _contact_id;
  end if;

  if exists (
    select 1 from public.sponsor_contacts sc
    where sc.sponsor_id = _contact.sponsor_id
      and (
        (sc.email is not null and _contact.email is not null and lower(sc.email) = lower(_contact.email))
        or (sc.email is null and _contact.email is null and lower(sc.name) = lower(_contact.name))
      )
  ) then
    return; -- idempotente: já existe um contato equivalente no patrocinador.
  end if;

  insert into public.sponsor_contacts (organization_id, sponsor_id, name, role, email, phone, is_primary)
  values (_contact.organization_id, _contact.sponsor_id, _contact.name, _contact.role, _contact.email, _contact.phone, _contact.is_primary);
end;
$function$

