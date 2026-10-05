CREATE OR REPLACE FUNCTION public.can_access_contract_file(_path text, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.contracts c
    where c.id = public.safe_uuid(left((string_to_array(_path, '/'))[2], 36))
      and (
        public.is_org_member(c.organization_id, _user_id)
        or (c.sponsor_id is not null and public.has_sponsor_access(c.sponsor_id, _user_id))
      )
  );
$function$

