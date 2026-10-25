-- 1) Melhora geração automática de entregas a partir de contratos ativos
-- Calcula prazos proporcionais entre start_date e end_date e copia organization_id do contrato

create or replace function public.generate_contract_deliveries(_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  ca record;
  exists_count integer;
  total_assets integer;
  idx integer := 0;
  base_date date;
  end_date date;
  span_days integer;
  proportional_due date;
begin
  select * into c from public.contracts where id = _contract_id;
  if not found then return; end if;

  base_date := coalesce(c.start_date, current_date);
  end_date := coalesce(c.end_date, base_date);
  span_days := greatest(end_date - base_date, 0);

  select count(*) into total_assets from public.contract_assets where contract_id = _contract_id;

  for ca in select * from public.contract_assets where contract_id = _contract_id order by created_at, id loop
    -- evita duplicar: pula se já existe entrega vinculada a este contrato com mesmo título e oportunidade
    select count(*) into exists_count
      from public.deliveries
      where opportunity_id is not distinct from c.opportunity_id
        and contract_id is not distinct from c.id
        and title = ca.name;

    if exists_count = 0 then
      if total_assets > 1 then
        proportional_due := base_date + ((span_days * idx) / (total_assets - 1))::integer;
      else
        proportional_due := end_date;
      end if;

      insert into public.deliveries (
        owner_id, organization_id, brand, property_id, opportunity_id, contract_id,
        title, description, asset_type, quantity,
        due_date, status, approval, position
      ) values (
        c.owner_id, c.organization_id, c.brand, c.property_id, c.opportunity_id, c.id,
        ca.name, ca.notes, 'ativo_contratado', greatest(coalesce(ca.quantity, 1), 1),
        proportional_due, 'pendente'::delivery_status, 'pendente'::delivery_approval, idx
      );
    end if;
    idx := idx + 1;
  end loop;
end;
$$;

-- 2) Copia ativos da cota da oportunidade para itens da proposta

create or replace function public.copy_opportunity_tier_to_proposal(
  _proposal_id uuid,
  _opportunity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  opp record;
  ta record;
  pos integer := 0;
begin
  select * into opp from public.opportunities where id = _opportunity_id;
  if not found then return; end if;

  if opp.tier_id is null then
    return;
  end if;

  for ta in
    select ta.*, a.name as asset_name, a.unit_value as asset_value
    from public.tier_assets ta
    join public.assets a on a.id = ta.asset_id
    where ta.tier_id = opp.tier_id
    order by ta.created_at, ta.id
  loop
    insert into public.proposal_items (
      proposal_id, asset_id, name, quantity, unit_value, position
    ) values (
      _proposal_id, ta.asset_id, ta.asset_name, greatest(ta.quantity, 1), coalesce(ta.asset_value, 0), pos
    )
    on conflict do nothing;
    pos := pos + 1;
  end loop;
end;
$$;

-- 3) Copia itens da proposta para ativos do contrato

create or replace function public.copy_proposal_items_to_contract(
  _contract_id uuid,
  _proposal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  pos integer := 0;
begin
  for it in
    select * from public.proposal_items where proposal_id = _proposal_id order by position, id
  loop
    insert into public.contract_assets (
      contract_id, asset_id, name, quantity, unit_value, notes
    ) values (
      _contract_id, it.asset_id, it.name, greatest(it.quantity, 1), coalesce(it.unit_value, 0), it.description
    )
    on conflict do nothing;
    pos := pos + 1;
  end loop;
end;
$$;

-- 4) Consolida dados para relatório de entrega (ativas e aprovadas + evidências BrandTrack)

create or replace function public.get_delivery_report_data(
  _opportunity_id uuid,
  _contract_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.generate_contract_deliveries(uuid) to service_role;
grant execute on function public.copy_opportunity_tier_to_proposal(uuid, uuid) to service_role;
grant execute on function public.copy_proposal_items_to_contract(uuid, uuid) to service_role;
grant execute on function public.get_delivery_report_data(uuid, uuid) to service_role;