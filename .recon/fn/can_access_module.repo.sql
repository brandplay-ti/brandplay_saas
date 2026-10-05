CREATE OR REPLACE FUNCTION public.can_access_module(_org_id uuid, _user_id uuid, _module text, _write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select case
      when om.role in ('owner', 'admin') then true
      when _module = 'team' then false
      when _module = 'crm' then om.role = 'comercial'
      when _module = 'operacional' then om.role = 'operacional'
      when _module = 'financeiro' then om.role = 'financeiro'
      else false
    end
    from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = _user_id
      and om.status = 'ativo'
    limit 1
  ), false);
$function$

