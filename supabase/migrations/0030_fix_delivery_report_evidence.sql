-- 0030_fix_delivery_report_evidence.sql
-- Corrige get_delivery_report_data, usada pela Edge Function
-- generate-delivery-report (relatório de entrega em PDF).
--
-- A versão portada do Lovable em 0015 lê brandtrack_media.brand, media_url,
-- detection_confidence, detected_at e sponsor_id, colunas que não existem em
-- brandtrack_media (nem existiam no Lovable: o plpgsql só valida o corpo na
-- execução). Toda chamada falhava com "column m.media_url does not exist".
--
-- 1. Evidências passam a vir de brandtrack_detections, que é onde estão a
--    marca detectada, a confiança e a revisão. Regra (decidida com o usuário
--    em 2026-10-17, registrada em SCHEMA_NOTES.md):
--    - mesma organização da oportunidade;
--    - marca (corrigida, senão a detectada) igual à da oportunidade, sem
--      diferenciar maiúsculas, OU marca BrandTrack vinculada ao mesmo
--      patrocinador da oportunidade;
--    - confiança >= 0.6 (o limiar do Lovable; a escala é 0-1, como grava
--      brandtrack-detect-image);
--    - fora as detecções rejeitadas na revisão, como fazem as telas do
--      BrandTrack. Pendentes entram.
-- 2. O casamento por patrocinador só vale quando a oportunidade tem
--    patrocinador. Em 0015, `is not distinct from` com sponsor_id nulo casava
--    toda mídia sem patrocinador.
-- 3. _contract_id vem do body da Edge Function. Em 0015 qualquer contrato era
--    aceito, inclusive de outra organização (a função roda com service_role e
--    ignora RLS): título e valor dele iam parar no PDF. Agora o contrato tem
--    de ser desta oportunidade; se não for, a função devolve null.
--
-- Assinatura, retorno (jsonb), SECURITY DEFINER e permissões ficam como em
-- 0015: só service_role executa.

create or replace function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  opp record;
  c record;
  has_contract boolean;
  report_deliveries jsonb;
  report_evidence jsonb;
begin
  select id, organization_id, sponsor_id, brand, value into opp
  from public.opportunities
  where id = _opportunity_id;
  if not found then return null; end if;

  if _contract_id is not null then
    select id, title, total_value, start_date, end_date into c
    from public.contracts
    where id = _contract_id
      and opportunity_id = opp.id;
    if not found then return null; end if;
    has_contract := true;
  else
    select id, title, total_value, start_date, end_date into c
    from public.contracts
    where opportunity_id = opp.id
    order by created_at desc
    limit 1;
    has_contract := found;
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
  where d.opportunity_id = opp.id
    and d.organization_id = opp.organization_id
    and (not has_contract or d.contract_id is not distinct from c.id)
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
  where bd.organization_id = opp.organization_id
    and bd.review_status <> 'rejeitada'
    and bd.confidence >= 0.6
    and (
      lower(trim(coalesce(bd.corrected_brand_name, bd.brand_name))) = lower(trim(opp.brand))
      or (opp.sponsor_id is not null and bb.sponsor_id = opp.sponsor_id)
    );

  return jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', opp.id,
      'brand', opp.brand,
      'value', opp.value
    ),
    'contract', case when not has_contract then null else jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'total_value', c.total_value,
      'start_date', c.start_date,
      'end_date', c.end_date
    ) end,
    'deliveries', report_deliveries,
    'evidence', report_evidence
  );
end;
$function$;

revoke all on function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid) from public, anon, authenticated;
grant execute on function public.get_delivery_report_data(_opportunity_id uuid, _contract_id uuid) to service_role;
