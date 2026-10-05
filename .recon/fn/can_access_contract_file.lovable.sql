CREATE OR REPLACE FUNCTION public.can_access_contract_file(_user_id uuid, _path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.file_path = _path
      AND c.organization_id IS NOT NULL
      AND public.is_org_member(_user_id, c.organization_id)
  )
$function$

