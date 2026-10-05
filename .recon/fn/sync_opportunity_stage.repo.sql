CREATE OR REPLACE FUNCTION public.sync_opportunity_stage(_opportunity_id uuid, _target opportunity_stage)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _old public.opportunity_stage;
  _org_id uuid;
begin
  select stage, organization_id into _old, _org_id
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'sync_opportunity_stage: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _old = _target then
    return;
  end if;

  update public.opportunities
  set stage = _target,
      last_stage_change_at = now(),
      updated_at = now()
  where id = _opportunity_id;

  insert into public.opportunity_audit_logs (organization_id, opportunity_id, actor_id, event_type, from_stage, to_stage)
  values (_org_id, _opportunity_id, auth.uid(), 'stage_changed', _old, _target);
end;
$function$

