CREATE OR REPLACE FUNCTION public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  _opp record;
  _contract record;
  _result json;
begin
  select id, brand, value, sponsor_id, property_id, organization_id
  into _opp
  from public.opportunities
  where id = _opportunity_id;

  if not found then
    raise exception 'get_delivery_report_data: oportunidade % não encontrada', _opportunity_id;
  end if;

  if _contract_id is not null then
    select id, title, total_value, start_date, end_date
    into _contract
    from public.contracts
    where id = _contract_id
      and opportunity_id = _opp.id;
  else
    select id, title, total_value, start_date, end_date
    into _contract
    from public.contracts
    where opportunity_id = _opp.id
    order by created_at desc
    limit 1;
  end if;

  select json_build_object(
    'opportunity', json_build_object('id', _opp.id, 'brand', _opp.brand, 'value', _opp.value),
    'contract', case when _contract.id is null then null else
      json_build_object(
        'id', _contract.id, 'title', _contract.title, 'total_value', _contract.total_value,
        'start_date', _contract.start_date, 'end_date', _contract.end_date
      )
    end,
    'deliveries', coalesce((
      select json_agg(json_build_object(
        'id', d.id, 'title', d.title, 'description', d.description, 'quantity', d.quantity,
        'due_date', d.due_date, 'status', d.status, 'approval', d.approval
      ) order by d.position, d.due_date)
      from public.deliveries d
      where d.opportunity_id = _opp.id
        and d.status in ('aprovada', 'entregue')
    ), '[]'::json),
    'evidence', coalesce((
      select json_agg(json_build_object(
        'id', bd.id,
        'media_url', coalesce(bm.external_url, bm.storage_path),
        'media_type', bm.media_type,
        'brand', coalesce(bd.corrected_brand_name, bd.brand_name),
        'detection_confidence', round(bd.confidence / 100.0, 4),
        'detected_at', bd.created_at,
        'event_name', be.name
      ) order by bd.created_at desc)
      from public.brandtrack_detections bd
      join public.brandtrack_media bm on bm.id = bd.media_id
      left join public.brandtrack_events be on be.id = bm.event_id
      left join public.brandtrack_brands bb on bb.id = bd.brand_id
      where bd.organization_id = _opp.organization_id
        and (
          (_opp.sponsor_id is not null and bb.sponsor_id = _opp.sponsor_id)
          or lower(coalesce(bd.corrected_brand_name, bd.brand_name)) = lower(_opp.brand)
        )
      limit 50
    ), '[]'::json)
  ) into _result;

  return _result;
end;
$function$

