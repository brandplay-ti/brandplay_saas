CREATE OR REPLACE FUNCTION public.unarchive_sponsor(_sponsor_id uuid, _lifecycle sponsor_lifecycle DEFAULT NULL::sponsor_lifecycle)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _org_id uuid;
  _new_lifecycle public.sponsor_lifecycle := coalesce(_lifecycle, 'prospect');
begin
  select organization_id into _org_id
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'unarchive_sponsor: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'unarchive_sponsor: apenas owner/admin podem reativar um patrocinador arquivado';
  end if;

  update public.sponsors
  set lifecycle = _new_lifecycle,
      archived_at = null,
      archived_by = null,
      archive_reason = null,
      updated_at = now()
  where id = _sponsor_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _org_id, auth.uid(), _sponsor_id, 'sponsor', _sponsor_id, 'unarchive',
    jsonb_build_object('lifecycle', 'arquivado'),
    jsonb_build_object('lifecycle', _new_lifecycle),
    'manual'
  );
end;
$function$

