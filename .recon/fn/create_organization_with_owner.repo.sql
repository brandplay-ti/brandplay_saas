CREATE OR REPLACE FUNCTION public.create_organization_with_owner(_owner_id uuid, _name text, _cnpj text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _org_id uuid;
begin
  if _owner_id is null then
    raise exception 'create_organization_with_owner: _owner_id não pode ser nulo';
  end if;
  if _name is null or btrim(_name) = '' then
    raise exception 'create_organization_with_owner: _name não pode ser vazio';
  end if;

  insert into public.organizations (owner_id, name, cnpj)
  values (_owner_id, btrim(_name), nullif(btrim(coalesce(_cnpj, '')), ''))
  returning id into _org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (_org_id, _owner_id, 'owner', 'ativo');

  return _org_id;
end;
$function$

