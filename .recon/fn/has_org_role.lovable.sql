CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _roles org_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
      AND status = 'ativo' AND role = ANY(_roles)
  )
$function$

