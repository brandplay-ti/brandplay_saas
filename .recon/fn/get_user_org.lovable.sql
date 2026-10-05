CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.organization_members
   WHERE user_id = _user_id AND status = 'ativo'
   ORDER BY created_at ASC LIMIT 1
$function$

