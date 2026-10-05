CREATE OR REPLACE FUNCTION public.has_sponsor_access(_sponsor_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.sponsor_portal_access spa
    where spa.sponsor_id = _sponsor_id
      and spa.user_id = _user_id
      and spa.status = 'ativo'
  );
$function$

