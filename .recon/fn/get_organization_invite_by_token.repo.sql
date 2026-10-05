CREATE OR REPLACE FUNCTION public.get_organization_invite_by_token(p_token text)
 RETURNS TABLE(email text, expires_at timestamp with time zone, organization_name text, role text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select oi.email, oi.expires_at, o.name as organization_name, oi.role::text, oi.status
  from public.organization_invites oi
  join public.organizations o on o.id = oi.organization_id
  where oi.token = p_token;
$function$

