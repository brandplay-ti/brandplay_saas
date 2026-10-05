CREATE OR REPLACE FUNCTION public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  opp record;
  c record;
  result jsonb;
  report_deliveries jsonb;
  report_evidence jsonb;
begin
  select * into opp from public.opportunities where id = _opportunity_id;
  if not found then return null; end if;

  if _contract_id is not null then
    select * into c from public.contracts where id = _contract_id;
  else
    select * into c from public.contracts
    where opportunity_id = _opportunity_id
    order by created_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'title', d.title,
      'description', d.description,
      'quantity', d.quantity,
      'due_date', d.due_date,
      'status', d.status,
      'approval', d.approval
    ) order by d.position, d.due_date
  ), '[]'::jsonb)
  into report_deliveries
  from public.deliveries d
  where d.opportunity_id = _opportunity_id
    and (c is null or d.contract_id is not distinct from c.id)
    and d.status in ('entregue', 'aprovada');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'media_url', m.media_url,
      'media_type', m.media_type,
      'brand', m.brand,
      'detection_confidence', m.detection_confidence,
      'detected_at', m.detected_at,
      'event_name', e.name
    ) order by m.detected_at desc
  ), '[]'::jsonb)
  into report_evidence
  from public.brandtrack_media m
  left join public.brandtrack_events e on e.id = m.event_id
  where m.organization_id = opp.organization_id
    and (m.brand ilike opp.brand or m.sponsor_id is not distinct from opp.sponsor_id)
    and m.detection_confidence >= 0.6;

  result := jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', opp.id,
      'brand', opp.brand,
      'value', opp.value
    ),
    'contract', case when c is null then null else jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'total_value', c.total_value,
      'start_date', c.start_date,
      'end_date', c.end_date
    ) end,
    'deliveries', report_deliveries,
    'evidence', report_evidence
  );

  return result;
end;
$function$

