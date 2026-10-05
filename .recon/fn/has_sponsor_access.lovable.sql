CREATE OR REPLACE FUNCTION public.has_sponsor_access(_user_id uuid, _sponsor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.sponsor_portal_access
    where user_id = _user_id
      and sponsor_id = _sponsor_id
      and status = 'ativo'
  )
$function$

