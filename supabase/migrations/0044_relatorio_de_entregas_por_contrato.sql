-- 0044_relatorio_de_entregas_por_contrato.sql
--
-- Relatório de entregas (PDF) a partir do contrato, sem oportunidade
-- (plano-visao-de-marca.md, seção 5.7). get_delivery_report_data (0030)
-- parte da oportunidade, e o botão só existia no funil: a marca, que não tem
-- funil e cria contrato direto, ficava sem a prestação de contas.
--
-- Mesmo conteúdo da 0030, recortado pelo contrato: entregas entregues ou
-- aprovadas do contrato e evidências do BrandTrack da marca do contrato (ou
-- do patrocinador dele). Só service_role executa; a Edge Function
-- generate-delivery-report confere antes, com o client do usuário, que ele lê
-- o contrato sob RLS.

create or replace function public.get_contract_delivery_report_data(_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  report_deliveries jsonb;
  report_evidence jsonb;
begin
  select id, organization_id, sponsor_id, brand, title, total_value, start_date, end_date into c
  from public.contracts
  where id = _contract_id;
  if not found then return null; end if;

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
  where d.contract_id = c.id
    and d.organization_id = c.organization_id
    and d.status in ('entregue', 'aprovada');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', bd.id,
      'media_url', coalesce(bm.external_url, bm.storage_path),
      'media_type', bm.media_type,
      'brand', coalesce(bd.corrected_brand_name, bd.brand_name),
      'detection_confidence', bd.confidence,
      'detected_at', bd.created_at,
      'event_name', be.name
    ) order by bd.created_at desc, bd.start_time
  ), '[]'::jsonb)
  into report_evidence
  from public.brandtrack_detections bd
  join public.brandtrack_media bm on bm.id = bd.media_id
  left join public.brandtrack_events be on be.id = bm.event_id
  left join public.brandtrack_brands bb on bb.id = bd.brand_id
  where bd.organization_id = c.organization_id
    and bd.review_status <> 'rejeitada'
    and bd.confidence >= 0.6
    and (
      lower(trim(coalesce(bd.corrected_brand_name, bd.brand_name))) = lower(trim(c.brand))
      or (c.sponsor_id is not null and bb.sponsor_id = c.sponsor_id)
    );

  return jsonb_build_object(
    'subject', jsonb_build_object('brand', c.brand, 'value', c.total_value),
    'contract', jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'total_value', c.total_value,
      'start_date', c.start_date,
      'end_date', c.end_date
    ),
    'deliveries', report_deliveries,
    'evidence', report_evidence
  );
end;
$function$;

comment on function public.get_contract_delivery_report_data(uuid) is
  'Dados do relatório de entregas a partir do contrato, sem oportunidade (0044). Só service_role; quem chama confere o acesso ao contrato.';

revoke all on function public.get_contract_delivery_report_data(uuid) from public, anon, authenticated;
grant execute on function public.get_contract_delivery_report_data(uuid) to service_role;
