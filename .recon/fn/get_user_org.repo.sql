CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select organization_id
  from public.organization_members
  where user_id = _user_id
    and status = 'ativo'
  order by created_at asc
  limit 1;
$function$

