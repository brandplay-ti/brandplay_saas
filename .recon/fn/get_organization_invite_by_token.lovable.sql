CREATE OR REPLACE FUNCTION public.get_organization_invite_by_token(p_token text)
 RETURNS TABLE(email text, status text, expires_at timestamp with time zone, organization_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT oi.email, oi.status::text, oi.expires_at, o.name AS organization_name, oi.role::text
  FROM public.organization_invites oi
  JOIN public.organizations o ON o.id = oi.organization_id
  WHERE oi.token = p_token
    AND oi.status = 'pendente'
    AND oi.expires_at > now()
  LIMIT 1;
$function$

