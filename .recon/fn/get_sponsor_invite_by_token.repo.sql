CREATE OR REPLACE FUNCTION public.get_sponsor_invite_by_token(p_token text)
 RETURNS TABLE(email text, expires_at timestamp with time zone, sponsor_name text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select si.email, si.expires_at, s.name as sponsor_name, si.status
  from public.sponsor_invites si
  join public.sponsors s on s.id = si.sponsor_id
  where si.token = p_token;
$function$

