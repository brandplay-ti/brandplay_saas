CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'ativo'
      and om.role::text = any(allowed_roles)
  );
$function$

-----
CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _roles org_role[], _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = _org_id
      and om.user_id = _user_id
      and om.status = 'ativo'
      and om.role = any(_roles)
  );
$function$

