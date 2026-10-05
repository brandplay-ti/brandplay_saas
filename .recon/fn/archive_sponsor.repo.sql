CREATE OR REPLACE FUNCTION public.archive_sponsor(_sponsor_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _org_id uuid;
  _old_lifecycle public.sponsor_lifecycle;
begin
  select organization_id, lifecycle into _org_id, _old_lifecycle
  from public.sponsors
  where id = _sponsor_id;

  if _org_id is null then
    raise exception 'archive_sponsor: patrocinador % não encontrado ou sem organização', _sponsor_id;
  end if;

  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'archive_sponsor: apenas owner/admin podem arquivar um patrocinador';
  end if;

  update public.sponsors
  set lifecycle = 'arquivado',
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = _reason,
      updated_at = now()
  where id = _sponsor_id;

  insert into public.sponsor_audit_logs (
    organization_id, actor_id, sponsor_id, entity_type, entity_id, action, old_value, new_value, source
  ) values (
    _org_id, auth.uid(), _sponsor_id, 'sponsor', _sponsor_id, 'archive',
    jsonb_build_object('lifecycle', _old_lifecycle),
    jsonb_build_object('lifecycle', 'arquivado', 'reason', _reason),
    'manual'
  );
end;
$function$

