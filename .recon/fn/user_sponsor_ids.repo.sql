CREATE OR REPLACE FUNCTION public.user_sponsor_ids(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(sponsor_id), '{}'::uuid[])
  from public.sponsor_portal_access
  where user_id = _user_id
    and status = 'ativo';
$function$

