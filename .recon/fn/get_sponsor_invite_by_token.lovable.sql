CREATE OR REPLACE FUNCTION public.get_sponsor_invite_by_token(p_token text)
 RETURNS TABLE(email text, status text, expires_at timestamp with time zone, sponsor_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT si.email, si.status, si.expires_at, s.name AS sponsor_name
  FROM public.sponsor_invites si
  JOIN public.sponsors s ON s.id = si.sponsor_id
  WHERE si.token = p_token
    AND si.status = 'pendente'
    AND si.expires_at > now()
  LIMIT 1;
$function$

