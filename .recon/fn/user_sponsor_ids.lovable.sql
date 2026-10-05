CREATE OR REPLACE FUNCTION public.user_sponsor_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sponsor_id from public.sponsor_portal_access
  where user_id = _user_id and status = 'ativo'
$function$

