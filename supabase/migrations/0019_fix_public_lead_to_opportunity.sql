-- 0019_fix_public_lead_to_opportunity.sql
-- Corrige o envio de lead pelo media kit público (/p/:slug), que falhava para
-- visitantes anônimos com:
--   Usuário não autenticado para criar ou alterar negociação
--
-- Reproduzido também aplicando as migrations reais do Lovable num banco limpo
-- (ver docs/architecture/reconciliacao-schema-2026-10-02.md). Três problemas
-- no fluxo herdado (portado em 0016):
--
-- 1. handle_lead_to_opportunity() cria a oportunidade do lead, mas o trigger
--    tg_validate_opportunity_org_access() exige usuário autenticado e aborta o
--    insert do visitante anônimo.
-- 2. A oportunidade usava o owner_id ENVIADO PELO FORMULÁRIO público, e a
--    organização era deduzida desse usuário (get_user_org). Um visitante podia
--    escolher qualquer owner_id e injetar oportunidades em outra organização.
--    Agora owner_id e organization_id do lead e da oportunidade vêm da
--    propriedade, nunca do cliente; o tier só conta se for da propriedade.
-- 3. Triggers BEFORE disparam em ordem alfabética: trg_lead_to_opportunity
--    rodava antes de trg_validate_property_lead, que zera
--    created_opportunity_id em inserts anônimos, então o vínculo lead ->
--    oportunidade se perdia. O trigger passa a se chamar
--    trg_zz_lead_to_opportunity para rodar por último.
--
-- A dispensa de checagem em tg_validate_opportunity_org_access vale só para
-- o insert feito por handle_lead_to_opportunity, sinalizado por um setting
-- local da transação (brandplay.lead_insert). Clientes da API não conseguem
-- definir esse setting (pg_catalog não é exposto pelo PostgREST).

create or replace function public.handle_lead_to_opportunity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _prop record;
  _value numeric := 0;
  _opp_id uuid;
  _brand text;
begin
  select owner_id, organization_id into _prop
  from public.sports_properties
  where id = new.property_id;

  if not found or _prop.organization_id is null then
    raise exception 'Propriedade inválida para receber lead';
  end if;

  -- nunca confiar em owner_id/organization_id vindos do formulário público
  new.owner_id := _prop.owner_id;
  new.organization_id := _prop.organization_id;

  if new.tier_id is not null then
    select value into _value
    from public.sponsorship_tiers
    where id = new.tier_id and property_id = new.property_id;
  end if;

  _brand := coalesce(nullif(new.company, ''), new.contact_name);

  perform set_config('brandplay.lead_insert', 'on', true);
  insert into public.opportunities (owner_id, organization_id, brand, value, stage, property_id, notes)
  values (
    _prop.owner_id,
    _prop.organization_id,
    _brand,
    coalesce(_value, 0),
    'prospect'::opportunity_stage,
    new.property_id,
    'Lead recebido via media kit público.' || E'\n' ||
    'Contato: ' || new.contact_name || E'\n' ||
    'Email: ' || new.email || E'\n' ||
    coalesce('Telefone: ' || new.phone || E'\n', '') ||
    coalesce('Mensagem: ' || new.message, '')
  )
  returning id into _opp_id;
  perform set_config('brandplay.lead_insert', 'off', true);

  new.created_opportunity_id := _opp_id;
  return new;
end;
$function$;

revoke all on function public.handle_lead_to_opportunity() from public, anon, authenticated;
grant execute on function public.handle_lead_to_opportunity() to service_role;

create or replace function public.tg_validate_opportunity_org_access()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _actor uuid := auth.uid();
  _role text := auth.role();
  _resolved_org uuid;
begin
  -- insert feito por handle_lead_to_opportunity (lead do media kit público):
  -- owner e organização já vêm da propriedade
  if current_setting('brandplay.lead_insert', true) = 'on' then
    if new.organization_id is null then
      raise exception 'Organização obrigatória para oportunidade criada a partir de lead';
    end if;
    return new;
  end if;

  if _role = 'service_role' then
    if new.organization_id is null and new.owner_id is not null then
      new.organization_id := public.get_user_org(new.owner_id);
    end if;
    return new;
  end if;

  if _actor is null then
    raise exception 'Usuário não autenticado para criar ou alterar negociação';
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is null then
      new.owner_id := _actor;
    end if;

    if new.owner_id is distinct from _actor then
      raise exception 'Negociação deve ser criada pelo próprio usuário autenticado';
    end if;
  end if;

  _resolved_org := coalesce(new.organization_id, public.get_user_org(_actor));

  if _resolved_org is null then
    raise exception 'Nenhuma organização ativa encontrada para o usuário';
  end if;

  if not public.is_org_member(_actor, _resolved_org) then
    raise exception 'Usuário não pertence à organização da negociação';
  end if;

  if not public.can_access_module(_actor, _resolved_org, 'crm', true) then
    raise exception 'Usuário sem permissão de CRM para gerenciar negociações nesta organização';
  end if;

  new.organization_id := _resolved_org;
  return new;
end;
$function$;

revoke all on function public.tg_validate_opportunity_org_access() from public, anon, authenticated;
grant execute on function public.tg_validate_opportunity_org_access() to service_role;

drop trigger if exists trg_lead_to_opportunity on public.property_leads;
drop trigger if exists trg_zz_lead_to_opportunity on public.property_leads;
create trigger trg_zz_lead_to_opportunity
  before insert on public.property_leads
  for each row execute function public.handle_lead_to_opportunity();
