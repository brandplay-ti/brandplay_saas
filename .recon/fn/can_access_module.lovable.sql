CREATE OR REPLACE FUNCTION public.can_access_module(_user_id uuid, _org_id uuid, _module text, _write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = _user_id AND om.organization_id = _org_id AND om.status = 'ativo'
      AND (
        om.role IN ('owner','admin')
        OR (_module = 'crm' AND om.role = 'comercial')
        OR (_module = 'operacional' AND om.role = 'operacional')
        OR (_module = 'financeiro' AND om.role = 'financeiro')
        OR (NOT _write AND om.role IN ('comercial','operacional','financeiro'))
      )
  )
$function$

